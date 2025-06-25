const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ALIBABA_URL = 'https://buyeragent.alibaba.com/factorySearch?spm=a2700.buyeragent_factory.pageModule_buyeragent_factory-search-bar.buyeragent&SearchText=clothing';

// Selectors (update if needed)
const CARD_SELECTOR = 'div.container--trx3WzbM';
const NAME_SELECTOR = 'div.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-stretch.ant-flex-vertical > div:nth-child(1) > div.base--B6exc_Xz.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-center > div.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-stretch.ant-flex-vertical > div:nth-child(1)';
const MOQ_SELECTOR = 'div.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-stretch.ant-flex-vertical > div:nth-child(1) > div:nth-child(3) > div.product--Tn3mnGJO > div.detail--x78byOjI > div.ellipsis-1.moq--y0_JFbXz > span:nth-child(2)';
const ABOUT_SELECTOR = 'div.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-stretch.ant-flex-vertical > div:nth-child(2)'; // Example, update if needed
const STORE_LINK_SELECTOR = 'a[href*="/supplier_detail.htm"]'; // Example, update if needed
const LOAD_MORE_SELECTOR = 'div.container--TtBcEaqW > div.left--SPD9N3Q1 > div > span:nth-child(1)';

async function navigateWithRetry(page, url, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting to navigate to ${url} (attempt ${attempt}/${maxRetries})`);
            
            // Set longer timeout and more conservative wait strategy
            await page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 180000 
            });
            
            // Wait a bit more for dynamic content
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            console.log('✅ Navigation successful');
            return true;
        } catch (error) {
            console.warn(`Navigation attempt ${attempt} failed: ${error.message}`);
            
            if (error.message.includes('ECONNRESET') || error.message.includes('net::ERR_CONNECTION_RESET')) {
                console.log('Connection reset detected, waiting longer before retry...');
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else if (attempt === maxRetries) {
                throw error;
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
}

async function waitForSelectorWithRetry(page, selector, maxRetries = 10) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.waitForSelector(selector, { timeout: 90000 });
            return true;
        } catch (error) {
            console.warn(`Selector wait attempt ${attempt} failed for ${selector}: ${error.message}`);
            if (attempt === maxRetries) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function scrapeAlibaba() {
    let browser;
    try {
        console.log('🚀 Launching browser...');
        browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });
        
        const page = await browser.newPage();
        
        // Set user agent to avoid detection
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        });
        
        // Intercept and handle failed requests
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
                request.abort();
            } else {
                request.continue();
            }
        });
        
        page.on('error', (error) => {
            console.warn('Page error:', error.message);
        });
        
        page.on('pageerror', (error) => {
            console.warn('Page error:', error.message);
        });
        
        // Navigate with retry logic
        await navigateWithRetry(page, ALIBABA_URL);
        console.log('✅ Successfully navigated to Alibaba page');

        let scrapedLinks = new Set();
        let keepScraping = true;
        let pageNumber = 1;
        let consecutiveErrors = 0;
        const maxConsecutiveErrors = 3;
        
        while (keepScraping) {
            try {
                console.log(`\n--- Processing page ${pageNumber} ---`);
                
                // Wait for cards with retry logic
                await waitForSelectorWithRetry(page, CARD_SELECTOR);
                
                // Wait a bit more for dynamic content
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const cards = await page.$$(CARD_SELECTOR);
                console.log(`Found ${cards.length} manufacturer cards`);
                
                if (cards.length === 0) {
                    console.log('No cards found, stopping scraping');
                    keepScraping = false;
                    break;
                }
                
                for (let i = 0; i < cards.length; i++) {
                    try {
                        const card = cards[i];
                        console.log(`Processing card ${i + 1}/${cards.length}`);
                        
                        // Extract name, moq, about, and store link
                        const name = await card.$eval(NAME_SELECTOR, el => el.innerText.trim());
                        let moq = null;
                        try {
                            moq = await card.$eval(MOQ_SELECTOR, el => el.innerText.trim());
                        } catch {}
                        let about = null;
                        try {
                            about = await card.$eval(ABOUT_SELECTOR, el => el.innerText.trim());
                        } catch {}
                        
                        // Find the store link (click to get the real link)
                        const storeLinkElem = await card.$('a');
                        let storeLink = null;
                        if (storeLinkElem) {
                            try {
                                // Open in new tab to get the link
                                const [newPage] = await Promise.all([
                                    new Promise(resolve => browser.once('targetcreated', target => resolve(target.page()))),
                                    storeLinkElem.click({ button: 'middle' }) // Open in new tab
                                ]);
                                await newPage.bringToFront();
                                await newPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 });
                                storeLink = newPage.url();
                                await newPage.close();
                            } catch (linkError) {
                                console.warn(`Failed to get store link for ${name}: ${linkError.message}`);
                            }
                        }
                        
                        if (!storeLink || scrapedLinks.has(storeLink)) {
                            console.log(`Skipping ${name} - already scraped or no link`);
                            continue;
                        }
                        
                        scrapedLinks.add(storeLink);
                        
                        // Save to DB
                        await prisma.alibabaManu.create({
                            data: {
                                name,
                                moq,
                                about,
                                storeLink,
                            },
                        });
                        console.log(`✅ Saved: ${name} | MOQ: ${moq || 'N/A'} | Store: ${storeLink}`);
                        
                        // Reset consecutive errors on success
                        consecutiveErrors = 0;
                        
                        // Small delay between cards
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                    } catch (err) {
                        console.warn(`❌ Failed to scrape card ${i + 1}: ${err.message}`);
                        consecutiveErrors++;
                    }
                }
                
                // Check if we've had too many consecutive errors
                if (consecutiveErrors >= maxConsecutiveErrors) {
                    console.log(`Too many consecutive errors (${consecutiveErrors}), stopping scraping`);
                    keepScraping = false;
                    break;
                }
                
                // Try to click Load More
                try {
                    console.log('Looking for Load More button...');
                    const loadMoreBtn = await page.$(LOAD_MORE_SELECTOR);
                    if (loadMoreBtn) {
                        await loadMoreBtn.evaluate(btn => btn.scrollIntoView());
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        await loadMoreBtn.click();
                        console.log('Clicked Load More button');
                        await new Promise(resolve => setTimeout(resolve, 8000));
                        pageNumber++;
                    } else {
                        console.log('No Load More button found, stopping scraping');
                        keepScraping = false;
                    }
                } catch (e) {
                    console.warn('No Load More button or failed to click:', e.message);
                    keepScraping = false;
                }
                
            } catch (error) {
                console.error(`❌ Error during scraping loop on page ${pageNumber}:`, error.message);
                consecutiveErrors++;
                
                if (consecutiveErrors >= maxConsecutiveErrors) {
                    console.log(`Too many consecutive errors (${consecutiveErrors}), stopping scraping`);
                    keepScraping = false;
                    break;
                }
                
                // Try to recover by refreshing the page
                try {
                    console.log('Attempting to recover by refreshing page...');
                    await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
                    await new Promise(resolve => setTimeout(resolve, 8000));
                } catch (refreshError) {
                    console.error('Failed to refresh page:', refreshError.message);
                    keepScraping = false;
                }
            }
        }
        console.log('✅ Alibaba scraping complete.');
    } catch (error) {
        console.error('❌ Fatal error during Alibaba scraping:', error.message);
        console.error('Full error:', error);
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.warn('Error closing browser:', closeError.message);
            }
        }
        try {
            await prisma.$disconnect();
        } catch (disconnectError) {
            console.warn('Error disconnecting from database:', disconnectError.message);
        }
        console.log('Browser and database connection closed.');
    }
}

// Add proper error handling to the main function call
scrapeAlibaba().catch(error => {
    console.error('❌ Unhandled error in scrapeAlibaba:', error.message);
    console.error('Full error:', error);
    process.exit(1);
}); 