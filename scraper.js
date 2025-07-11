// Alibaba Manufacturer Scraper (Enhanced, Debug Mode)
// Requirements: puppeteer-extra, puppeteer-extra-plugin-stealth, puppeteer, axios, sharp, tesseract.js, mkdirp
// npm install puppeteer-extra puppeteer-extra-plugin-stealth puppeteer axios sharp tesseract.js mkdirp

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const SEARCH_URL = 'https://www.alibaba.com/search/page?spm=a2700.factory_home.home_login_first_screen_search_bar_home.keydown__Enter&SearchScene=suppliers&SearchText=mens+clothes&verifiedManufactory=true';
const EXPORTS_DIR = path.join(__dirname, 'exports');
const MAX_RETRIES = 3;
const MAX_PRODUCT_IMAGES = 3;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const MANUFACTURER_TIMEOUT = 120000; // 2 minutes per manufacturer

const sleep = ms => new Promise(res => setTimeout(res, ms));
function sanitize(str) { return str.replace(/[^a-zA-Z0-9_-]/g, ''); }
async function downloadImage(url, dest) {
  const response = await axios({ url, responseType: 'arraybuffer', timeout: 20000 });
  fs.writeFileSync(dest, response.data);
}
async function ocrImage(imgPath) {
  const processedPath = imgPath + '.gray.png';
  await sharp(imgPath).grayscale().normalize().toFile(processedPath);
  const { data: { text } } = await Tesseract.recognize(processedPath, 'eng');
  fs.unlinkSync(processedPath);
  return text;
}
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}
async function clickAllSubmenus(page) {
  const selectors = [
    '[role=tab]', '[data-spm-click]', 'button', 'a', '.tab', '.expand', '.submenu', '.profile-menu', '.profile-tab', '.company-profile-tab', '.company-profile-menu',
  ];
  for (const sel of selectors) {
    const elements = await page.$$(sel);
    for (const el of elements) {
      try { await el.click({ delay: 100 }); await sleep(300); } catch (e) { /* ignore */ }
    }
  }
}

function isValidManufacturerUrl(url) {
  return url &&
    /supplier|company_profile|shop/.test(url) &&
    !url.includes('alibaba.com/product-detail') &&
    !url.includes('feedback.html') &&
    !url.includes('error') &&
    !url.includes('login') &&
    !url.includes('register');
}

// --- USER COOKIES ---
const cookies = [
  { name: "JSESSIONID", value: "4B0FB42CDFD331E080D361DF711CA26F", domain: ".alibaba.com", path: "/" },
  { name: "NWG", value: "NNW", domain: ".alibaba.com", path: "/" },
  { name: "XSRF-TOKEN", value: "f6119855-48ee-438f-b62b-c6646d03409c", domain: ".alibaba.com", path: "/" },
  { name: "__itrace_wid", value: "94354355-4263-46b6-9bd2-64a188b2c894", domain: ".alibaba.com", path: "/" },
  { name: "__wpkreporterwid_", value: "9a916d00-7406-47a8-886c-d92959a7031d", domain: ".alibaba.com", path: "/" },
  { name: "_m_h5_tk", value: "3b985df497a9bdd1e19f808095cf6d20_1752212268855", domain: ".alibaba.com", path: "/" },
  { name: "_m_h5_tk_enc", value: "e8f16353e7a058ef2f0ec39ad0814ea3", domain: ".alibaba.com", path: "/" },
  { name: "_tb_token_", value: "eb7de8761eb0e", domain: ".alibaba.com", path: "/" },
  { name: "_ym_d", value: "1750526068", domain: ".alibaba.com", path: "/" },
  { name: "_ym_isad", value: "1", domain: ".alibaba.com", path: "/" },
  { name: "_ym_uid", value: "1750526068796853350", domain: ".alibaba.com", path: "/" },
  { name: "acs_usuc_t", value: "acs_rt=ded4521a01664c1584a6660d3f21d11d", domain: ".alibaba.com", path: "/" },
  { name: "ali_apache_id", value: "33.1.217.71.1750526057752.593964.6", domain: ".alibaba.com", path: "/" },
  { name: "ali_apache_track", value: "mt=1|mid=us29204879864eqiu", domain: ".alibaba.com", path: "/" },
  { name: "ali_apache_tracktmp", value: "W_signed=Y", domain: ".alibaba.com", path: "/" },
  { name: "atpsida", value: "2c589bcb3726ee21cdc79155_1750526060_1", domain: ".alibaba.com", path: "/" },
  { name: "buyer_ship_to_info", value: "local_country=US", domain: ".alibaba.com", path: "/" },
  { name: "cna", value: "atbdICsaaWsCAS/2gNXQAwm2", domain: ".alibaba.com", path: "/" },
  { name: "cookie2", value: "ae3340ff2c9fa90453dff2fd43d16330", domain: ".alibaba.com", path: "/" },
  { name: "havana_lgc2_4", value: "c5eabaf1bbef8bf65fddc930590199d5eba5a003e4acc39fafc05530f78a091f57210b713d7a038aa7d2e1b0624acce2b1b25d4036c6902eaac687b00e74751a", domain: ".alibaba.com", path: "/" },
  { name: "icbu_s_tag", value: "9_11", domain: ".alibaba.com", path: "/" },
  { name: "intl_common_forever", value: "UIFlZh6VvekPy61D0UeewlwD0leMAImRWzxZecEy4y1SKqqJWcBWRw==", domain: ".alibaba.com", path: "/" },
  { name: "intl_locale", value: "en_US", domain: ".alibaba.com", path: "/" },
  { name: "isg", value: "BNbWa5SfotEAkJZTmN2iOmysN4zYdxqxx2kvvUA7mrhUA3KduAXyweuwn4fvqxLJ", domain: ".alibaba.com", path: "/" },
  { name: "recommend_login", value: "sns_google", domain: ".alibaba.com", path: "/" },
  { name: "sc_g_cfg_f", value: "sc_b_currency=USD&sc_b_locale=en_US&sc_b_site=US", domain: ".alibaba.com", path: "/" },
  { name: "sca", value: "bdeef8a6", domain: ".alibaba.com", path: "/" },
  { name: "sca", value: "d8421f7d", domain: ".alibaba.com", path: "/" },
  { name: "sgcookie", value: "E100cP3U5RLQNsG2kKciG+WlnaH/4yowzMBRNiwTdInXqmUaW+0iVIzZHrRoJdmzWQS1T/YJzQpFOdYWGJxtoNURWANlj7BDyF5pF6s3l1nInsQ=", domain: ".alibaba.com", path: "/" },
  { name: "tfstk", value: "g7NIYjDhEHxCrXcJPvbw1CRpz5k50N5qJUg8ozdeyXhKV8ZgcQrET9b7CorZewqzLYG7VuM8TXzUf0ZTf073zprayzZgUyrP-RT7olGzVzbny0E8V0yFQsz3-bcR0u1VgymRHVA7ObKzWX0zKg14csz3-FhR0i5VgUaRqhHK2uHKBh3xX3dKeuHtBqn994dKyhQsjc3ppDhJXd3xR3d82bQ_Wc0-w0E-pNatp-8jP9i3RwuDZKavDczKfQd869DIcypywQFsRvN8JcwQd5gIdmk8CuC39lz8TWDGcnhu7-Z7ekSMwDybWXnapGdmX-mKTWckypHa_zFr6PSpODwTxuH_KMOEvYNUFvyccKmre4MxwATJwPaEAu3sMHOjQ5z8afUNvBiQBkV-TSQ2EVD8QWD0TGdIM-4ET8EFjQnUhPh143dqctJ9FFMDNViV5N9kEax_B1ooqHVtpV0IQN_6v8DKSViV5N9kEv3iRc715Hel.", domain: ".alibaba.com", path: "/" },
  { name: "ug_se_c", value: "free_1752211691615", domain: ".alibaba.com", path: "/" },
  { name: "ug_se_c_tag", value: "ts=1752211691527", domain: ".alibaba.com", path: "/" },
  { name: "xman_f", value: "5rLw/2dTx1ZAQLUSHceuqErgxZZRZDtXI0L6Gbch4bJ0/jvFkfbHITDdXSXmZqzypJXaoA204wzjAsNLH9K17TLEty8LDcRYkL08HDiCmzNuE/gnfbakhrIVO50klhq+B26zQOs6ApMxrjaEKiGkjfuisiCA0iEfDpkWifL7hDIdQ6WjVtk4t+1eDEeVLbiPYv/9GCbJZtFZxi3taJWGvEEtTWvlx1anSjwOlYvxTt7kQgLgpnOXVjalGhuT8xuDPTSaMEnCfE4fzXpGe0vB8A0+XwOR/DcPEJ8c16cV3aDwXvF95Tn+pRg/lz+IitPCGxG/DL9TXITMWFeCJtXCU+kkRbA1fMt9kTWaB2dPXQIS31UosaX8oDnLIUaoS04h", domain: ".alibaba.com", path: "/" },
  { name: "xman_i", value: "aid=4500019450030", domain: ".alibaba.com", path: "/" },
  { name: "xman_t", value: "eXfXPw3dMX2J8Ju68Gb5361mXENP7IsuB3mGPvq5Es4ECqJhrVfGRUQbN8DmBcx1", domain: ".alibaba.com", path: "/" },
  { name: "xman_us_f", value: "x_locale=en_US&last_popup_time=1750526088037&x_l=0&x_user=US|Rah|Rah|ifm|1698414300&no_popup_today=n", domain: ".alibaba.com", path: "/" }
];
// --- END USER COOKIES ---

async function scrape() {
  if (!fs.existsSync(EXPORTS_DIR)) mkdirp.sync(EXPORTS_DIR);
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  // Set cookies before navigation
  await page.setCookie(...cookies);
  console.log('Cookies set. Navigating to search page...');
  await page.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 120000 });
  await autoScroll(page);
  await sleep(2000);

  // Get manufacturer links, log original and rewritten links
  const manufacturerLinks = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'));
    return anchors
      .map(a => a.href)
      .filter(href => href && href.includes('/company_profile'));
  });
  console.log('Original extracted links:', manufacturerLinks);

  // Always rewrite to main profile page
  const rewrittenLinks = manufacturerLinks.map(href => {
    const match = href.match(/^(https:\/\/[^/]+\.alibaba\.com)\/company_profile/);
    return match ? `${match[1]}/company_profile.html` : null;
  }).filter(Boolean);
  console.log('Rewritten links (should all be .../company_profile.html):', rewrittenLinks);

  let uniqueLinks = Array.from(new Set(rewrittenLinks));
  console.log('Unique links:', uniqueLinks);

  console.log(`Found ${uniqueLinks.length} manufacturer profile links.`);

  let count = 0;
  for (const manuUrl of uniqueLinks) {
    count++;
    if (!isValidManufacturerUrl(manuUrl)) {
      console.log(`[${count}/${uniqueLinks.length}] Skipping invalid or feedback page: ${manuUrl}`);
      continue;
    }
    let retries = 0;
    let success = false;
    while (retries < MAX_RETRIES && !success) {
      try {
        console.log(`\n[${count}/${uniqueLinks.length}] Processing: ${manuUrl}`);
        await runWithTimeout(() => processManufacturer(browser, manuUrl), MANUFACTURER_TIMEOUT);
        success = true;
      } catch (err) {
        retries++;
        console.error(`Error processing ${manuUrl} (attempt ${retries}):`, err.message);
        if (retries < MAX_RETRIES) await sleep(3000);
      }
    }
  }
  await browser.close();
  console.log('Scraping complete.');
}

async function processManufacturer(browser, manuUrl) {
  const manuId = sanitize(manuUrl.split('/').filter(Boolean).pop() || 'unknown');
  const manuDir = path.join(EXPORTS_DIR, manuId);
  mkdirp.sync(manuDir);
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  let retries = 0;
  let loaded = false;
  while (retries < MAX_RETRIES && !loaded) {
    try {
      console.log(`  Navigating to manufacturer page: ${manuUrl}`);
      await page.goto(manuUrl, { waitUntil: 'networkidle2', timeout: 120000 });
      await autoScroll(page);
      await sleep(2000);
      await clickAllSubmenus(page);
      await sleep(2000);
      loaded = true;
    } catch (e) {
      retries++;
      console.error(`  Navigation error for ${manuUrl} (attempt ${retries}):`, e.message);
      if (retries >= MAX_RETRIES) throw e;
      await sleep(3000);
    }
  }
  // Check for feedback/error page after navigation
  const url = page.url();
  if (!isValidManufacturerUrl(url)) {
    console.log(`  Skipping non-manufacturer or error page after navigation: ${url}`);
    await page.close();
    return;
  }
  // Save full HTML
  console.log('  Saving full HTML...');
  const html = await page.content();
  fs.writeFileSync(path.join(manuDir, 'full_page.html'), html, 'utf8');
  // Save visible text
  console.log('  Saving visible text...');
  const text = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(path.join(manuDir, 'full_text.txt'), text, 'utf8');
  // Download and OCR contact images
  console.log('  Extracting images for OCR and products...');
  const imgInfos = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map(img => ({ src: img.src, alt: img.alt || '', url: img.src }));
  });
  const contactImgs = imgInfos.filter(img =>
    /contact|email|phone|whatsapp/i.test(img.src + ' ' + img.alt)
  );
  let ocrCount = 0;
  for (const img of contactImgs) {
    try {
      ocrCount++;
      const imgPath = path.join(manuDir, `contact_${ocrCount}.jpg`);
      await downloadImage(img.url, imgPath);
      const ocrText = await ocrImage(imgPath);
      fs.writeFileSync(path.join(manuDir, `contact_ocr_${ocrCount}.txt`), ocrText, 'utf8');
    } catch (e) {
      console.error('  OCR image failed:', img.url, e.message);
    }
  }
  // Download up to 3 product images
  const productImgs = imgInfos.filter(img =>
    /product|clothing|garment|factory/i.test(img.src + ' ' + img.alt)
  ).slice(0, MAX_PRODUCT_IMAGES);
  let imgNum = 0;
  for (const img of productImgs) {
    try {
      imgNum++;
      const imgPath = path.join(manuDir, `img${imgNum}.jpg`);
      await downloadImage(img.url, imgPath);
    } catch (e) {
      console.error('  Product image download failed:', img.url, e.message);
    }
  }
  await page.close();
}

// Helper: Timeout wrapper for async functions
function runWithTimeout(fn, ms) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timed out')), ms))
  ]);
}

scrape().catch(err => {
  console.error('Fatal error:', err);
}); 