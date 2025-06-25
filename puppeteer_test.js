const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
  await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
  await browser.close();
})();