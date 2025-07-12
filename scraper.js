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
const EXPORTS_DIR = path.join(__dirname, 'exports', 'company_profilehtml');
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
  { name: "__itrace_wid", value: "ae6c6ec3-690e-4179-3709-02fdf4788c0f", domain: ".alibaba.com", path: "/" },
  { name: "__wpkreporterwid_", value: "8bdae96b-0131-49fc-0f45-e6ebfa61f10f", domain: ".alibaba.com", path: "/" },
  { name: "_ga", value: "GA1.1.1868323931.1750799002", domain: ".alibaba.com", path: "/" },
  { name: "_ga", value: "GA1.1.1733316257.1750798956", domain: ".alibaba.com", path: "/" },
  { name: "_ga_3L5VDLSZZZ", value: "GS2.1.s1750798956$o1$g0$t1750798970$j46$l0$h0", domain: ".alibaba.com", path: "/" },
  { name: "_ga_RVSKK1KF5N", value: "GS2.1.s1750827965$o2$g0$t1750827965$j60$l0$h0", domain: ".alibaba.com", path: "/" },
  { name: "_gcl_au", value: "1.1.54086185.1750799002", domain: ".alibaba.com", path: "/" },
  { name: "_lang", value: "en_US:ISO-8859-1", domain: ".alibaba.com", path: "/" },
  { name: "_m_h5_tk", value: "94e22daa78cb6ad4eaee364b00376378_1752363173443", domain: ".alibaba.com", path: "/" },
  { name: "_m_h5_tk_enc", value: "bd7a886cf2e46e27cdbce85ce8a5d2ca", domain: ".alibaba.com", path: "/" },
  { name: "_samesite_flag_", value: "true", domain: ".alibaba.com", path: "/" },
  { name: "_tb_token_", value: "3b3980865a835", domain: ".alibaba.com", path: "/" },
  { name: "_ym_d", value: "1750799021", domain: ".alibaba.com", path: "/" },
  { name: "_ym_isad", value: "1", domain: ".alibaba.com", path: "/" },
  { name: "_ym_uid", value: "1750799021256760382", domain: ".alibaba.com", path: "/" },
  { name: "ac_inner_id", value: "ccb96a329c3a7c5865e8a89c8f49c2c5", domain: ".alibaba.com", path: "/" },
  { name: "acs_usuc_t", value: "acs_rt=8bbdfcec94304be7b7bbd442299ead67", domain: ".alibaba.com", path: "/" },
  { name: "ali_apache_id", value: "33.1.197.195.1750798858260.780190.1", domain: ".alibaba.com", path: "/" },
  { name: "ali_apache_track", value: "mt=1|mid=us29204879864eqiu", domain: ".alibaba.com", path: "/" },
  { name: "ali_apache_tracktmp", value: "W_signed=Y", domain: ".alibaba.com", path: "/" },
  { name: "atpsida", value: "512aa0428636c62ecc807c39_1752361287_5", domain: ".alibaba.com", path: "/" },
  { name: "banThirdCookie", value: "flag", domain: ".alibaba.com", path: "/" },
  { name: "buyer_ship_to_info", value: "local_country=US", domain: ".alibaba.com", path: "/" },
  { name: "cna", value: "DgDiIBiEYwUCAWgjHlaNyxIa", domain: ".alibaba.com", path: "/" },
  { name: "cookie2", value: "a237c8483069c8156ee6a26f9c1e4aba", domain: ".alibaba.com", path: "/" },
  { name: "havana_lgc2_4", value: "c5eabaf1bbef8bf65fddc930590199d5eba5a003e4acc39fafc05530f78a091fe2b5edb707ae2605a8effc444090ed3e3a3d8e78c480034cbf71a0b3db66c1ba", domain: ".alibaba.com", path: "/" },
  { name: "icbu_s_tag", value: "10_11", domain: ".alibaba.com", path: "/" },
  { name: "intl_common_forever", value: "Y3SndyAediUBcuj3Pqg61MqExFISk/jxVuPmWN91XEoy3vk8jzcB4Q==", domain: ".alibaba.com", path: "/" },
  { name: "intl_locale", value: "en_US", domain: ".alibaba.com", path: "/" },
  { name: "isg", value: "BFhY98-mhEknyqjkUFJm9AamKYbqQbzLrxfpJZJJpBNGLfgXO1GMW24fY30dJnSj", domain: ".alibaba.com", path: "/" },
  { name: "JSESSIONID", value: "47851FAEEDD8A5AA67497BA245D68748", domain: ".alibaba.com", path: "/" },
  { name: "NetWorkGrade", value: "SlowNetWork", domain: ".alibaba.com", path: "/" },
  { name: "NWG", value: "SNW", domain: ".alibaba.com", path: "/" },
  { name: "recommend_login", value: "email", domain: ".alibaba.com", path: "/" },
  { name: "sc_g_cfg_f", value: "sc_b_currency=USD&sc_b_locale=en_US&sc_b_site=US", domain: ".alibaba.com", path: "/" },
  { name: "sca", value: "979440b3", domain: ".alibaba.com", path: "/" },
  { name: "seo_f", value: "trafc_i=seo", domain: ".alibaba.com", path: "/" },
  { name: "sgcookie", value: "E100ova0H0GytF+VU3j7Tv8zdc2U+/yv2Vo1rgUh27JmDNZQyUKPAU618xwspTpcz8qixtmmDhRW42PvI3CZS17psLtUorDPEcH9mnV9llZQp8LAQdKQqRM1g3q07LeQdYFm", domain: ".alibaba.com", path: "/" },
  { name: "t", value: "7d0061c16d9e928634b185e4cc825358", domain: ".alibaba.com", path: "/" },
  { name: "tfstk", value: "g88mLSb0FnSfskkR2U_jcNkSC6nJcZ_1LdUOBNBZ4TW7H-Uv_NcMHdhj1mONIdvRFPCtcAaMECJnG1HXWStWpBzvkm_TSZ_17vHKJ2hXGN_NXCm5htOyN1lRgR6Bp0_17vHRGLXBkN9V6QBX_Qll611a0dSqz75AU1rV7dWP465L3NJwQ_7PO1Ca0tSwa_W5_NWwQNlkaT1G7OlYDmWX7U8rIiVf0otMzUfcm9RrPPzMryIcLIWu7yLdiV6egT4aS9vOlUOkMx4BwZTwK6pxzrvH_BtNqF2rKOTkaE-wN-cP-QxJvixo3PXJk1jF7gVa7QblFMLN82ylN3RvbE90sP5XkeIGdgca5GQyJM-en5GBaZ5wCMTtdr62_BTBvw00dsxytajP7urE03a1afLzflsVN_XdzbKvrmU1AnhoZkl10_1fpbcuflsVN_XKZbqE5i55G9C..", domain: ".alibaba.com", path: "/" },
  { name: "ug_se_c", value: "organic_1752361318736", domain: ".alibaba.com", path: "/" },
  { name: "ug_se_c_tag", value: "ts=1752361318736", domain: ".alibaba.com", path: "/" },
  { name: "xlly_s", value: "1", domain: ".alibaba.com", path: "/" },
  { name: "xman_f", value: "/htR1qnzVBPxJepOZp6cP3YkxRFmm9mNDBqvR+Ru5oVSycBZrXmyKKVvLbqfo/3eDjsA6knwam/x/Po9FEBTRsQNP0I9+s4tlCxU5WBkqYNBLQP7iTtDzF9o5iJaFwzs7CX1b3aibUT+3KmByHOE9W9tCJ42aHe4aeMzI2Q+P2gxOZhTSIbaX2iEXLEnA/yvV9MSGsnHVZFmUTB0XQGYX7BDU1s6ggM9OtEOj+D8q2emkcVcqz2KEWfRUCx9RI/wil23kZ0Cu5mT3DFPXV9smsP1Rft50Uih93YiukJg0Olqnqq3OkFOeDbjBtFVJW9GKUjXLKAKC83RSiYgVkYPhmwBjbazG1kPGK3Cv5z6dE2xurJ14WLPi1SM5hSQCmfj", domain: ".alibaba.com", path: "/" },
  { name: "xman_i", value: "aid=4500019450030", domain: ".alibaba.com", path: "/" },
  { name: "xman_t", value: "PfQmiZyWsZ1gw2AchAfjl5WcbmCBFETMi5wRQntjywy1Jh37gHpYPy2nMQizZD/BzCtfjnDFH9g91sI/9YO/gKeR7sJlys2iZM4l2S5ldHwIWMsTLJaqSclz9LnRxaA8Yo86EWjj6GRXWi7jN/24N2YSGkzBxHTM4q1TkIMDBLbq6Mr/LiBrwAAgVCli0Ll3/8j9ujDa978uCwGcbjxI5u/fWqi/Lh2Pfq6Ajd0EGubHTjtLJhbENdKRWWSkb+e5uQYqyZ92pwNCGYaOvVLl3ydP+68h13OUQ2xUDXuVc9eRM8jsFHPRyMiamNA9Te82gDqnHuE7jrJ4ahc/CUw5qmXQpF+lWEe+XC2sCFaboeWsssdCpsI6+irRXUXPUshMUdGphvW7wSm32k1gLtoGmWlBWQVT1YOOtNHlQutPkLR4JJiEh57upjKJp6XqVNzkKFoG1F1fbUGzwpkf5lHgjIOAe9DbfD5HwXTfQAOJw644a9VL4JXbDjOj1qNEhk5tSw1ytdu1sZDhHJRUePscvUG3tpC4e/EqGHcx+5NktTL5HmTWqXneHUvHdcR2FXgZAvRVH4R+U2/oUsNcaLUVZIeq4zjaORZDaikRDaSVlGyBShPbc0LXn2MOx1mRbOoA66IAYtl6NQMzQTE47n079VfSHgcsa5bVRsUJTsC7ItFO7G9Xfpkn+19xz60rXjLHtuAUT7qrNifwTkpMQID1GA==", domain: ".alibaba.com", path: "/" },
  { name: "xman_us_f", value: "x_locale=en_US&last_popup_time=1750804075937&x_l=0&x_user=US|Rah|Rah|ifm|1698414300&no_popup_today=n", domain: ".alibaba.com", path: "/" },
  { name: "xman_us_t", value: "l_source=alibaba&sign=y&need_popup=y&x_user=jffVeO8YhpqsZ/57j+OwqAYXVKL9xegD3PMZ2xDUuD4=&ctoken=15ou6y5rl828k&x_lid=us29204879864eqiu", domain: ".alibaba.com", path: "/" },
  { name: "XSRF-TOKEN", value: "2016d6e5-4958-4315-b22c-2a64a20ed3ab", domain: ".alibaba.com", path: "/" }
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
  // Extract manufacturerId from subdomain (e.g., fzyqclothing from https://fzyqclothing.en.alibaba.com/company_profile.html)
  const manuIdMatch = manuUrl.match(/^https:\/\/(.*?)\.en\.alibaba\.com/);
  const manuId = manuIdMatch ? sanitize(manuIdMatch[1]) : 'unknown';
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
  ).slice(0, 2); // Only up to 2 contact images
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
    !(/contact|email|phone|whatsapp/i.test(img.src + ' ' + img.alt)) // Exclude contact images
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