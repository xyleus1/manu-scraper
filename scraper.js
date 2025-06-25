const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
const readline = require('readline');
const prisma = new PrismaClient();

const MANUFACTURERS_LIST_URL = 'https://app.sewport.com/manufacturers';
const CARD_SELECTOR = 'div.product-box_inner';
const NAME_SELECTOR = 'div.m_t_a';
const SHOW_PROFILE_SELECTOR = 'div.content-border_top.p_t_2.m_t_a.width_100-percents a';
const EMAIL_SELECTOR = "body > ui-view > div.container-fluid.profile.ng-scope > div > div.col-md-8 > div.card.default.card-about.ng-scope > div";
const MOQ_SELECTOR = "body > ui-view > div.container-fluid.profile.ng-scope > div > div.col-md-8 > div:nth-child(3) > div > div > table > tbody > tr";
// Multiple possible selectors for Load More button
const LOAD_MORE_SELECTORS = [
    'body > ui-view > div.design_v3.ng-scope > div > div > div.content__container_extra-extra-large > div > div > div.p_t_1.p_t_2_xmd.p_l_1.p_l_2_xmd.p_r_1.p_r_1_xmd.width_100-percents.width_100-320_xmd.max-width_100-percents > div > div.row.m_t_3 > div > button',
    'button:contains("Load More")',
    '[data-testid="load-more"]',
    'button.load-more',
    '.load-more-button',
    'button:has-text("Load More")'
];

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

async function scrapeProfileAndReturn(page) {
    await new Promise(r => setTimeout(r, 2000));
    const data = await page.evaluate((EMAIL_SELECTOR, MOQ_SELECTOR) => {
        const emailSection = document.querySelector(EMAIL_SELECTOR);
        const emailText = emailSection ? emailSection.innerText : '';
        // Try to extract an email address, but also return the full text
        const emailMatch = emailText.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/);
        const email = emailMatch ? emailMatch[0] : null;
        let moq = null;
        const moqRow = document.querySelector(MOQ_SELECTOR);
        if (moqRow) {
            const moqText = moqRow.innerText;
            const moqMatch = moqText.match(/\d+\s*\w*/);
            if (moqMatch) moq = moqMatch[0];
        }
        return { email, emailText, moq };
    }, EMAIL_SELECTOR, MOQ_SELECTOR);
    return data;
}

async function navigateWithRetry(page, action, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 90000 }),
                action()
            ]);
            return true;
        } catch (error) {
            console.warn(`Navigation attempt ${attempt} failed: ${error.message}`);
            if (attempt === maxRetries) {
                throw error;
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

async function findLoadMoreButton(page) {
    for (const selector of LOAD_MORE_SELECTORS) {
        try {
            const button = await page.$(selector);
            if (button) {
                const isVisible = await button.evaluate(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && 
                           window.getComputedStyle(el).visibility !== 'hidden' &&
                           window.getComputedStyle(el).display !== 'none';
                });
                if (isVisible) {
                    return button;
                }
            }
        } catch (e) {
            // Continue to next selector
        }
    }
    return null;
}

async function waitForCardsWithRetry(page, maxRetries = 10) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.waitForSelector(CARD_SELECTOR, { timeout: 40000 });
            // Extra: scroll to bottom to trigger lazy loading if needed
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Confirm cards are present
            const cardCount = await page.$$eval(CARD_SELECTOR, cards => cards.length);
            if (cardCount > 0) return true;
            else throw new Error('No cards found after scroll');
        } catch (error) {
            console.warn(`Attempt ${attempt} to find cards failed: ${error.message}`);
            if (attempt === maxRetries) {
                throw error;
            }
            // Try scrolling to bottom and refreshing the page
            try {
                console.log('🔄 Scrolling to bottom and refreshing page to recover...');
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(resolve => setTimeout(resolve, 3000));
                await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
                await new Promise(resolve => setTimeout(resolve, 4000));
            } catch (refreshError) {
                console.error(`Failed to refresh page: ${refreshError.message}`);
            }
        }
    }
}

async function scrapeInitialData() {
    console.log('🚀 Launching browser...');
    const browser = await puppeteer.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: false,
        protocolTimeout: 300000, // 5 minutes
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    try {
        console.log(`Navigating to ${MANUFACTURERS_LIST_URL}...`);
        await page.goto(MANUFACTURERS_LIST_URL, { waitUntil: 'networkidle2', timeout: 120000 });

        console.log('\n--- ACTION REQUIRED ---');
        console.log('1. In the browser window that just opened, please log in.');
        console.log('2. Make sure you can see the list of manufacturers.');
        console.log('3. Come back to THIS terminal window.');
        await askQuestion('4. Press the [ENTER] key now to start scraping.');
        console.log('--- THANK YOU ---\n');

        // Fetch all already-scraped profile URLs from the database
        const existingManufacturers = await prisma.manufacturer.findMany({
            select: { website: true }
        });
        let scrapedUrls = new Set(
            existingManufacturers
                .map(m => m.website)
                .filter(Boolean)
        );
        let manufacturerCount = scrapedUrls.size;
        let hardReloads = 0;
        let keepScraping = true;
        while (keepScraping) {
            try {
                await waitForCardsWithRetry(page);
            } catch (error) {
                console.error('❌ Could not find manufacturer cards after multiple attempts. The page structure may have changed.');
                throw error;
            }

            // Always re-query the DOM for cards/buttons after any DOM update
            let cardsData = await page.evaluate((CARD_SELECTOR, NAME_SELECTOR, SHOW_PROFILE_SELECTOR) => {
                const cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
                return cards.map((card, idx) => {
                    let name = '';
                    let location = '';
                    let profileUrl = '';
                    try {
                        name = card.querySelector(NAME_SELECTOR)?.innerText.trim() || '';
                    } catch {}
                    try {
                        location = card.querySelector('p')?.innerText.trim() || '';
                    } catch {}
                    // Find the Show Profile button
                    const showProfileBtn = card.querySelector(SHOW_PROFILE_SELECTOR);
                    if (showProfileBtn) {
                        profileUrl = showProfileBtn.getAttribute('href') || '';
                    }
                    return { idx, name, location, hasProfileBtn: !!showProfileBtn, profileUrl };
                });
            }, CARD_SELECTOR, NAME_SELECTOR, SHOW_PROFILE_SELECTOR);

            let foundNew = false;
            for (let i = 0; i < cardsData.length; i++) {
                const { idx, name, location, hasProfileBtn, profileUrl } = cardsData[i];
                if (!hasProfileBtn || !profileUrl) {
                    console.warn(`No Show Profile button or profile URL found for card ${i + 1}`);
                    continue;
                }
                // Skip if already scraped
                if (scrapedUrls.has(profileUrl)) continue;
                foundNew = true;

                // Get all visible cards and find the one with this profileUrl
                const allCards = await page.$$(CARD_SELECTOR);
                let card = null;
                let showProfileBtn = null;
                for (const c of allCards) {
                    const btn = await c.$(SHOW_PROFILE_SELECTOR);
                    if (btn) {
                        const href = await btn.evaluate(el => el.getAttribute('href'));
                        if (href === profileUrl) {
                            card = c;
                            showProfileBtn = btn;
                            break;
                        }
                    }
                }
                if (!card || !showProfileBtn) {
                    console.warn(`Could not find card for profile URL: ${profileUrl} (skipping)`);
                    continue;
                }

                try {
                    // Navigate to profile with retry logic
                    await navigateWithRetry(page, () => showProfileBtn.click());
                    // Scrape profile
                    const { email, emailText, moq } = await scrapeProfileAndReturn(page);
                    // Save to DB
                    await prisma.manufacturer.create({
                        data: {
                            name,
                            location,
                            website: page.url(),
                            categories: [],
                            email,
                            moq,
                            emailText,
                        },
                    });
                    scrapedUrls.add(profileUrl); // Add to set after successful save
                    manufacturerCount++;
                    console.log(`✅ Saved: ${name} | Email: ${email || 'N/A'} | MOQ: ${moq || 'N/A'} | EmailText: ${emailText ? emailText.replace(/\n/g, ' | ') : 'N/A'}`);
                    // Go back to list with retry logic
                    await navigateWithRetry(page, () => page.goBack());
                    await waitForCardsWithRetry(page);
                    // After goBack, break to outer loop to re-query visible cards
                    break;
                } catch (error) {
                    console.error(`❌ Failed to scrape ${name} (${profileUrl}): ${error.message}`);
                    // Try to go back to the list if we're stuck on a profile page
                    try {
                        await page.goBack();
                        await waitForCardsWithRetry(page);
                    } catch (backError) {
                        console.error(`❌ Failed to go back to list: ${backError.message}`);
                        // If we can't go back, try to reload the page
                        try {
                            await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
                            await waitForCardsWithRetry(page);
                        } catch (reloadError) {
                            console.error(`❌ Failed to reload page: ${reloadError.message}`);
                            hardReloads++;
                            if (hardReloads > 10) throw reloadError; // Only give up after 10 hard reloads
                        }
                    }
                    // After error, break to outer loop to re-query visible cards
                    break;
                }
            }

            if (!foundNew) {
                // Try Load More, else break
                let loadMoreClicked = false;
                let loadMoreRetries = 0;
                let maxLoadMoreRetries = 10; // Try up to 10 times if button is still present
                while (loadMoreRetries < maxLoadMoreRetries) {
                    try {
                        const loadMoreBtn = await findLoadMoreButton(page);
                        if (loadMoreBtn) {
                            await loadMoreBtn.evaluate(btn => btn.scrollIntoView());
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            const prevCardCount = (await page.$$(CARD_SELECTOR)).length;
                            console.log(`👉 Clicking "Load More"... (Attempt ${loadMoreRetries + 1})`);
                            await loadMoreBtn.click();
                            // Wait for more cards to appear
                            let retries = 0;
                            let newCardCount = prevCardCount;
                            while (newCardCount <= prevCardCount && retries < 30) { // Wait up to 30 seconds
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                newCardCount = (await page.$$(CARD_SELECTOR)).length;
                                retries++;
                            }
                            if (newCardCount > prevCardCount) {
                                console.log(`✅ Loaded more manufacturers: now ${newCardCount} cards.`);
                                loadMoreClicked = true;
                                break; // Exit the Load More retry loop and continue scraping
                            } else {
                                console.warn(`⚠️ No new cards appeared after clicking Load More (Attempt ${loadMoreRetries + 1}). Retrying...`);
                                loadMoreRetries++;
                                // Try scrolling and reloading
                                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                await page.reload({ waitUntil: 'networkidle2', timeout: 120000 });
                                await new Promise(resolve => setTimeout(resolve, 4000));
                            }
                        } else {
                            // No Load More button found
                            break;
                        }
                    } catch (e) {
                        console.warn('Error during Load More check:', e.message);
                        loadMoreRetries++;
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
                if (!loadMoreClicked) {
                    // Log the current card count for debugging
                    const currentCardCount = (await page.$$(CARD_SELECTOR)).length;
                    console.log(`No new cards found and no Load More button. Current card count: ${currentCardCount}`);
                    keepScraping = false;
                }
            }
        }
        console.log('✅ Scraping complete. No more manufacturers or Load More buttons found.');
        console.log(`✅ All ${manufacturerCount} manufacturers have been scraped and saved.`);
    } catch (error) {
        console.error('\n❌ A FATAL ERROR OCCURRED:');
        console.error(error.message);
        console.error('Please copy this entire error message and send it to me.');
    } finally {
        await browser.close();
        await prisma.$disconnect();
        console.log('\nBrowser and database connection closed.');
    }
}

scrapeInitialData();