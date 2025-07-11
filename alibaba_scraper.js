const puppeteer = require('puppeteer');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

const ALIBABA_URL = 'https://buyeragent.alibaba.com/factorySearch?spm=a2700.buyeragent_factory.pageModule_buyeragent_factory-search-bar.buyeragent&SearchText=clothing';

// Selectors (update if needed)
const CARD_SELECTOR = 'div.container--trx3WzbM';
const NAME_SELECTOR = 'div.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-stretch.ant-flex-vertical > div:nth-child(1) > div.base--B6exc_Xz.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-center > div.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-stretch.ant-flex-vertical > div:nth-child(1)';
const MOQ_SELECTOR = 'div.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-stretch.ant-flex-vertical > div:nth-child(1) > div:nth-child(3) > div.product--Tn3mnGJO > div.detail--x78byOjI > div.ellipsis-1.moq--y0_JFbXz > span:nth-child(2)';
const ABOUT_SELECTOR = 'div.ant-flex.css-12yb9q6.css-var-r1.ant-flex-align-stretch.ant-flex-vertical > div:nth-child(2)';
const STORE_LINK_SELECTOR = 'a[href*="/supplier_detail.htm"]';
const LOAD_MORE_SELECTOR = 'div.container--TtBcEaqW > div.left--SPD9N3Q1 > div > span:nth-child(1)';

// Create exports directory if it doesn't exist
const EXPORTS_DIR = path.join('D:/KNXv1 Clone/manu-scraper/exports/company_profilehtml');
if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
}

async function navigateWithRetry(page, url, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting to navigate to ${url} (attempt ${attempt}/${maxRetries})`);
            
            await page.goto(url, { 
                waitUntil: 'domcontentloaded', 
                timeout: 180000 
            });
            
            // Wait for dynamic content to load
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

async function scrapeManufacturerPage(page, manufacturerName, storeLink) {
    console.log(`\n🔍 Scraping manufacturer page: ${manufacturerName}`);
    console.log(`📍 URL: ${storeLink}`);
    
    try {
        // Navigate to the manufacturer's page
        await navigateWithRetry(page, storeLink);
        
        // Wait for page to fully load
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Get page HTML
        const html = await page.content();
        
        // Get page title
        const title = await page.title();
        
        // Get all images on the page
        const images = await page.evaluate(() => {
            const imgElements = document.querySelectorAll('img');
            return Array.from(imgElements).map(img => ({
                src: img.src,
                alt: img.alt,
                width: img.width,
                height: img.height
            }));
        });
        
        // Get all links on the page
        const links = await page.evaluate(() => {
            const linkElements = document.querySelectorAll('a');
            return Array.from(linkElements).map(link => ({
                href: link.href,
                text: link.textContent.trim(),
                title: link.title
            }));
        });
        
        // Get company information (try to find common elements)
        const companyInfo = await page.evaluate(() => {
            const info = {};
            // Try to find company name
            const nameSelectors = [
                'h1', 'h2', '.company-name', '.supplier-name', '[class*="name"]',
                '[class*="title"]', '.title', '.company-title'
            ];
            for (const selector of nameSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    info.name = element.textContent.trim();
                    break;
                }
            }
            // Try to find contact information
            const contactSelectors = [
                '.contact', '.contact-info', '[class*="contact"]',
                '.phone', '.email', '.address'
            ];
            for (const selector of contactSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    info.contact = Array.from(elements).map(el => el.textContent.trim()).join(' ');
                    break;
                }
            }
            // Try to find description
            const descSelectors = [
                '.description', '.about', '[class*="desc"]',
                '[class*="about"]', '.company-desc'
            ];
            for (const selector of descSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    info.description = element.textContent.trim();
                    break;
                }
            }
            return info;
        });
        // --- NEW: Create a unique folder for each seller ---
        // Use company name if available, else fallback to URL part
        let baseName = (companyInfo && companyInfo.name) ? companyInfo.name : manufacturerName;
        if (!baseName || baseName.length < 2) {
            // fallback: extract from URL
            try {
                const urlObj = new URL(storeLink);
                baseName = urlObj.hostname.split('.')[0];
            } catch {
                baseName = 'unknown_seller';
            }
        }
        const safeName = baseName.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').substring(0, 50);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sellerFolder = path.join(EXPORTS_DIR, `${safeName}_${timestamp}`);
        console.log('[DEBUG] Creating seller folder:', sellerFolder);
        try {
            if (!fs.existsSync(sellerFolder)) {
                fs.mkdirSync(sellerFolder, { recursive: true });
                console.log('[DEBUG] Seller folder created:', sellerFolder);
            } else {
                console.log('[DEBUG] Seller folder already exists:', sellerFolder);
            }
        } catch (err) {
            console.error('[ERROR] Failed to create seller folder:', sellerFolder, err);
        }
        // --- END NEW ---
        // Save HTML
        const htmlPath = path.join(sellerFolder, 'page.html');
        console.log('[DEBUG] Writing file:', htmlPath);
        try {
            fs.writeFileSync(htmlPath, html);
            console.log('[DEBUG] File written:', htmlPath);
        } catch (err) {
            console.error('[ERROR] Failed to write file:', htmlPath, err);
        }
        // Save page data as JSON
        const pageData = {
            manufacturerName,
            storeLink,
            title,
            scrapedAt: new Date().toISOString(),
            companyInfo,
            images: images.slice(0, 50), // Limit to first 50 images
            links: links.slice(0, 100), // Limit to first 100 links
            totalImages: images.length,
            totalLinks: links.length
        };
        const jsonPath = path.join(sellerFolder, 'page_data.json');
        console.log('[DEBUG] Writing file:', jsonPath);
        try {
            fs.writeFileSync(jsonPath, JSON.stringify(pageData, null, 2));
            console.log('[DEBUG] File written:', jsonPath);
        } catch (err) {
            console.error('[ERROR] Failed to write file:', jsonPath, err);
        }
        // Download images (limit to first 3 relevant product images)
        const imagesDir = path.join(sellerFolder, 'images');
        console.log('[DEBUG] Creating images directory:', imagesDir);
        try {
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
                console.log('[DEBUG] Images directory created:', imagesDir);
            } else {
                console.log('[DEBUG] Images directory already exists:', imagesDir);
            }
        } catch (err) {
            console.error('[ERROR] Failed to create images directory:', imagesDir, err);
        }
        // Try to select 3 relevant product images (heuristic: width/height > 100, src does not contain logo/avatar/icon)
        const productImages = images.filter(img => {
            const src = img.src.toLowerCase();
            return (
                img.width > 100 && img.height > 100 &&
                !src.includes('logo') && !src.includes('avatar') && !src.includes('icon') && !src.includes('blank') && !src.includes('default')
            );
        }).slice(0, 3);
        console.log(`📥 Downloading product images... (${productImages.length} of 3)`);
        let downloadedImages = 0;
        for (let i = 0; i < productImages.length; i++) {
            try {
                const image = productImages[i];
                if (image.src && image.src.startsWith('http')) {
                    const response = await page.goto(image.src, { waitUntil: 'domcontentloaded' });
                    const buffer = await response.buffer();
                    const imageName = `product_image_${i + 1}.jpg`;
                    const imagePath = path.join(imagesDir, imageName);
                    console.log('[DEBUG] Writing product image:', imagePath);
                    fs.writeFileSync(imagePath, buffer);
                    console.log('[DEBUG] Product image written:', imagePath);
                    downloadedImages++;
                }
            } catch (imageError) {
                console.warn(`[WARN] Failed to download product image ${i + 1}: ${imageError.message}`);
            }
        }
        // --------- Scrape subpages (contact, product, etc.) ---------
        async function scrapeSubpagesFromProfile(browser, profilePage, sellerFolder) {
            const subpageLinks = await profilePage.evaluate(() => {
                return Array.from(document.querySelectorAll('a'))
                    .map(a => a.href)
                    .filter(href =>
                        href &&
                        (href.includes('contact') || href.includes('product') || href.includes('msgsend'))
                    );
            });
            for (const subpageUrl of subpageLinks) {
                try {
                    const subpage = await profilePage.browser().newPage();
                    await subpage.goto(subpageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await subpage.waitForTimeout(5000);
                    // Save HTML
                    const safeSubName = subpageUrl.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
                    const subHtmlPath = path.join(sellerFolder, `${safeSubName}.html`);
                    console.log('[DEBUG] Writing subpage HTML:', subHtmlPath);
                    try {
                        const subHtml = await subpage.content();
                        fs.writeFileSync(subHtmlPath, subHtml);
                        console.log('[DEBUG] Subpage HTML written:', subHtmlPath);
                    } catch (err) {
                        console.error('[ERROR] Failed to write subpage HTML:', subHtmlPath, err);
                    }
                    // Download images (limit to 10)
                    const subImages = await subpage.evaluate(() =>
                        Array.from(document.querySelectorAll('img')).map(img => img.src)
                    );
                    const subImagesDir = path.join(sellerFolder, `${safeSubName}_images`);
                    console.log('[DEBUG] Creating subpage images directory:', subImagesDir);
                    try {
                        if (!fs.existsSync(subImagesDir)) fs.mkdirSync(subImagesDir, { recursive: true });
                        console.log('[DEBUG] Subpage images directory created:', subImagesDir);
                    } catch (err) {
                        console.error('[ERROR] Failed to create subpage images directory:', subImagesDir, err);
                    }
                    for (let i = 0; i < Math.min(subImages.length, 10); i++) {
                        try {
                            const view = await subpage.goto(subImages[i]);
                            const buffer = await view.buffer();
                            const subImagePath = path.join(subImagesDir, `image_${i + 1}.jpg`);
                            console.log('[DEBUG] Writing subpage image:', subImagePath);
                            fs.writeFileSync(subImagePath, buffer);
                            console.log('[DEBUG] Subpage image written:', subImagePath);
                        } catch {}
                    }
                    await subpage.close(); // Close the tab
                    await profilePage.bringToFront(); // Return focus to the original profile page
                } catch (err) {
                    console.warn(`[WARN] Failed to scrape subpage ${subpageUrl}: ${err.message}`);
                }
            }
        }
        // Call the subpage scraping logic
        await scrapeSubpagesFromProfile(page.browser(), page, sellerFolder);
        // -----------------------------------------------------------------------
        console.log(`✅ Successfully scraped ${manufacturerName}`);
        console.log(`   📄 HTML saved: ${htmlPath}`);
        console.log(`   📊 Data saved: ${jsonPath}`);
        console.log(`   🖼️  Images downloaded: ${downloadedImages}/${productImages.length}`);
        return {
            success: true,
            htmlPath,
            jsonPath,
            imagesDownloaded: downloadedImages,
            totalImages: productImages.length,
            companyInfo
        };
    } catch (error) {
        console.error(`❌ Failed to scrape manufacturer page ${manufacturerName}: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
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
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
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
        
        // Navigate to the main Alibaba page
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
                        
                        // Extract basic information from the card
                        const name = await card.$eval(NAME_SELECTOR, el => el.innerText.trim());
                        let moq = null;
                        try {
                            moq = await card.$eval(MOQ_SELECTOR, el => el.innerText.trim());
                        } catch {}
                        let about = null;
                        try {
                            about = await card.$eval(ABOUT_SELECTOR, el => el.innerText.trim());
                        } catch {}
                        
                        // Find the store link
                        const storeLinkElem = await card.$('a');
                        let storeLink = null;
                        
                        if (storeLinkElem) {
                            try {
                                // Get the href attribute directly
                                storeLink = await storeLinkElem.evaluate(el => el.href);
                                
                                // If no href, try to get it by clicking
                                if (!storeLink) {
                                    const [newPage] = await Promise.all([
                                        new Promise(resolve => browser.once('targetcreated', target => resolve(target.page()))),
                                        storeLinkElem.click({ button: 'middle' })
                                    ]);
                                    await newPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 });
                                    storeLink = newPage.url();
                                    await newPage.close();
                                }
                            } catch (linkError) {
                                console.warn(`Failed to get store link for ${name}: ${linkError.message}`);
                            }
                        }
                        
                        if (!storeLink || scrapedLinks.has(storeLink)) {
                            console.log(`Skipping ${name} - already scraped or no link`);
                            continue;
                        }
                        
                        scrapedLinks.add(storeLink);
                        
                        // Save basic info to DB
                        await prisma.alibabaManu.create({
                            data: {
                                name,
                                moq,
                                about,
                                storeLink,
                            },
                        });
                        
                        console.log(`✅ Saved basic info: ${name} | MOQ: ${moq || 'N/A'} | Store: ${storeLink}`);
                        
                        // Now scrape the manufacturer's page
                        const scrapeResult = await scrapeManufacturerPage(page, name, storeLink);
                        
                        if (scrapeResult.success) {
                            console.log(`✅ Successfully scraped manufacturer page for: ${name}`);
                        } else {
                            console.warn(`⚠️ Failed to scrape manufacturer page for: ${name}`);
                        }
                        
                        // Reset consecutive errors on success
                        consecutiveErrors = 0;
                        
                        // Small delay between cards
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
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