const puppeteer = require('puppeteer');
const readline = require('readline');

// Paste your cookie string here
const COOKIE_HEADER = '__itrace_wid=ae6c6ec3-690e-4179-3709-02fdf4788c0f; __wpkreporterwid_=8bdae96b-0131-49fc-0f45-e6ebfa61f10f; _ga=GA1.1.1868323931.1750799002; _ga=GA1.1.1733316257.1750798956; _ga_3L5VDLSZZZ=GS2.1.s1750798956$o1$g0$t1750798970$j46$l0$h0; _ga_RVSKK1KF5N=GS2.1.s1750799002$o1$g0$t1750799002$j60$l0$h0; _gcl_au=1.1.54086185.1750799002; _lang=en_US:ISO-8859-1; _m_h5_tk=10ff70f3e0f923fe2e8d7428b6e17b4c_1750827974944; _m_h5_tk_enc=2691634d9f377a58e497dc3a35aa40eb; _samesite_flag_=true; _tb_token_=3b3980865a835; _ym_d=1750799021; _ym_isadl=1; _ym_uid=1750799021256760382; ac_inner_id=ccb96a329c3a7c5865e8a89c8f49c2c5; acs_usuc_t=acs_rt=8bbdfcec94304be7b7bbd442299ead67; ali_apache_id=33.1.197.195.1750798858260.780190.1; ali_apache_track=ms=|mt=1|mid=us29204879864eqiu; ali_apache_tracktmp=W_signed=Y; atpsida=6485a8a9d5d839f451adf0c0_1750825538_3; banThirdCookie=flag; buyer_ship_to_info=local_country=US; cna=DgDiIBiEYwUCAWgjHlaNyxIa; cookie2=a237c8483069c8156ee6a26f9c1e4aba; havana_lgc2_4=c5eabaf1bbef8bf65fddc930590199d5eba5a003e4acc39fafc05530f78a091fe2b5edb707ae2605a8effc444090ed3e3a3d8e78c480034cbf71a0b3db66c1ba; icbu_s_tag=10_11; intl_common_forever=Y3SndyAediUBcuj3Pqg61MqExFISk/jxVuPmWN91XEoy3vk8jzcB4Q==; intl_locale=en_US; isg=BFpa87aC5g76MWqihigEqhj8qwB8i95l4b0rY2TS6-1L1_0RThuMdT03oLvLIVb9; JSESSIONID=42532DB659E18A9B9A7B5D03C7EF57C3; NetWorkGrade=NormalNetWork; NWG=NNW; recommend_login=email; sc_g_cfg_f=sc_b_currency=USD&sc_b_locale=en_US&sc_b_site=US; sca=979440b3; seo_f=trafc_i=seo; sgcookie=E100ova0H0GytF+VU3j7Tv8zdc2U+/yv2Vo1rgUh27JmDNZQyUKPAU618xwspTpcz8qixtmmDhRW42PvI3CZS17psLtUorDPEcH9mnV9llZQp8LAQdKQqRM1g3q07LeQdYFm; t=7d0061c16d9e928634b185e4cc825358; tfstk=gm1sgGqljcmsEcAxld4EOyGEgGAjGyPrGqTArZhZkCdtDmQJYPAVQ-AXhi-F_h7w6VXh4ahN_RAqGCADMurza7zGSIAxZpO2rhbd-EUeWNPOscRDMurFGD1ncIjTsq7ckwUBuEctHiptJBLWvEH9MiKppULrXIIADHhpuUktWFH99DKHkIKADIUCJHY2MnhvokT3ChQ_7gTxBtNRRNKIMjC_Idx5RxlxM6T6Cg79AELAOF962KQr3P1OYZCNsp2sBIbFFi6A2kkwXTT5ALW_Vfs5jEQXkGNoPHC1l69GLcH9PCt6e1pszbQWH91B_1EmEw7BXLOFLJqw3Cs1E3vTKkjfRhSA1pn_YnWP81pC2klCmK6A_BCTv7sP3b-WGGkjRLcXR3zQRxD0fW1R9ec0O9v9-e5zRyisndLHR3zQRxDDBeYeUyaIfxf..; ug_se_c=organic_1750825821661; xlly_s=1; xman_f=/htR1qnzVBPxJepOZp6cP3YkxRFmm9mNDBqvR+Ru5oVSycBZrXmyKKVvLbqfo/3eDjsA6knwam/x/Po9FEBTRsQNP0I9+s4tlCxU5WBkqYNBLQP7iTtDzF9o5iJaFwzs7CX1b3aibUT+3KmByHOE9W9tCJ42aHe4aeMzI2Q+P2gxOZhTSIbaX2iEXLEnA/yvV9MSGsnHVZFmUTB0XQGYX7BDU1s6ggM9OtEOj+D8q2emkcVcqz2KEWfRUCx9RI/wil23kZ0Cu5mT3DFPXV9smsP1Rft50Uih93YiukJg0Olqnqq3OkFOeDbjBtFVJW9GKUjXLKAKC83RSiYgVkYPhmwBjbazG1kPGK3Cv5z6dE2xurJ14WLPi1SM5hSQCmfj; xman_i=aid=4500019450030; xman_t=PfQmiZyWsZ1gw2AchAfjl5WcbmCBFETMi5wRQntjywy1Jh37gHpYPy2nMQizZD/BzCtfjnDFH9g91sI/9YO/gKeR7sJlys2iZM4l2S5ldHwIWMsTLJaqSclz9LnRxaA8Yo86EWjj6GRXWi7jN/24N2YSGkzBxHTM4q1TkIMDBLbq6Mr/LiBrwAAgVCli0Ll3/8j9ujDa978uCwGcbjxI5u/fWqi/Lh2Pfq6Ajd0EGubHTjtLJhbENdKRWWSkb+e5uQYqyZ92pwNCGYaOvVLl3ydP+68h13OUQ2xUDXuVc9eRM8jsFHPRyMiamNA9Te82gDqnHuE7jrJ4ahc/CUw5qmXQpF+lWEe+XC2sCFaboeWsssdCpsI6+irRXUXPUshMUdGphvW7wSm32k1gLtoGmWlBWQVT1YOOtNHlQutPkLR4JJiEh57upjKJp6XqVNzkKFoG1F1fbUGzwpkf5lHgjIOAe9DbfD5HwXTfQAOJw644a9VL4JXbDjOj1qNEhk5tSw1ytdu1sZDhHJRUePscvUG3tpC4e/EqGHcx+5NktTL5HmTWqXneHUvHdcR2FXgZAvRVH4R+U2/oUsNcaLUVZIeq4zjaORZDaikRDaSVlGyBShPbc0LXn2MOx1mRbOoA66IAYtl6NQMzQTE47n079VfSHgcsa5bVRsUJTsC7ItFO7G9Xfpkn+19xz60rXjLHtuAUT7qrNifwTkpMQID1GA==; xman_us_f=x_locale=en_US&last_popup_time=1750804075937&x_l=0&x_user=US|Rah|Rah|ifm|1698414300&no_popup_today=n; xman_us_t=l_source=alibaba&sign=y&need_popup=y&x_user=jffVeO8YhpqsZ/57j+OwqAYXVKL9xegD3PMZ2xDUuD4=&ctoken=15ou6y5rl828k&x_lid=us29204879864eqiu; XSRF-TOKEN=2016d6e5-4958-4315-b22c-2a64a20ed3ab';

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  // Set cookies before navigating
  if (COOKIE_HEADER === 'PASTE_YOUR_COOKIE_STRING_HERE') {
    console.error('Please paste your session cookie into COOKIE_HEADER at the top of puppeteer_alibaba_test.js');
    await browser.close();
    return;
  }
  const cookies = COOKIE_HEADER.split(';').map(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    return { name, value: rest.join('='), domain: '.alibaba.com', path: '/' };
  });
  await page.setCookie(...cookies);

  await page.goto('https://www.alibaba.com', { waitUntil: 'domcontentloaded' });
  console.log('✅ Loaded Alibaba homepage with cookies');

  // Try to click the manufacturer section and debug if not found
  const manuSelector = '#header_root > div.header-and-searchbar.fy25-uni-tab.manufacturers > div.content-container > div > div.new-header-search-tab > div';
  try {
    const manuExists = await page.$(manuSelector);
    if (manuExists) {
      await manuExists.click();
      console.log('✅ Clicked manufacturer section');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.error('❌ Manufacturer selector not found. Printing header_root outer HTML for debugging:');
      const headerHtml = await page.evaluate(() => {
        const el = document.querySelector('#header_root');
        return el ? el.outerHTML : 'header_root not found';
      });
      console.log(headerHtml);
      // TODO: Update manuSelector to match the actual element after login.
    }
  } catch (err) {
    console.error('❌ Error while trying to click manufacturer section:', err.message);
  }

  // Wait for user to continue
  console.log('\n--- ACTION REQUIRED ---');
  console.log('1. In the browser window that just opened, you should already be logged in.');
  console.log('2. The script will now continue to the clothing section.');
  console.log('3. Come back to THIS terminal window.');
  await askQuestion('4. Press the [ENTER] key now to continue the script.');
  console.log('--- THANK YOU ---\n');

  // Click the clothing section
  const clothingSelector = '#factory-tab > li:nth-child(2) > div';
  try {
    await page.waitForSelector(clothingSelector, { timeout: 20000 });
    const clothingElem = await page.$(clothingSelector);
    if (clothingElem) {
      await clothingElem.click();
      console.log('✅ Clicked clothing section');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.error('❌ Clothing selector not found.');
    }
  } catch (err) {
    console.error('❌ Could not click clothing section:', err.message);
  }

  // SCRAPE DATA FROM THE FIRST MANUFACTURER CARD
  try {
    // Name selector
    const nameSelector = '#cdn-pc-recommend_factory__recommend > div > div.waterfall-container > div:nth-child(1) > div.card-title > a > div.detail-info > h3';
    await page.waitForSelector(nameSelector, { timeout: 15000 });
    const name = await page.$eval(nameSelector, el => el.innerText.trim());
    console.log('Name:', name);

    // MOQ selector (example, update if you have the exact selector)
    let moq = null;
    try {
      const moqSelector = '#cdn-pc-recommend_factory__recommend > div > div.waterfall-container > div:nth-child(1) .moq';
      moq = await page.$eval(moqSelector, el => el.innerText.trim());
      console.log('MOQ:', moq);
    } catch (moqErr) {
      console.warn('MOQ not found or selector needs update.');
    }

    // Profile link
    let profileLink = null;
    try {
      const linkSelector = '#cdn-pc-recommend_factory__recommend > div > div.waterfall-container > div:nth-child(1) > div.card-title > a';
      profileLink = await page.$eval(linkSelector, el => el.href);
      console.log('Profile Link:', profileLink);
    } catch (linkErr) {
      console.warn('Profile link not found or selector needs update.');
    }
  } catch (scrapeErr) {
    console.error('❌ Error scraping manufacturer card:', scrapeErr.message);
  }

  await browser.close();
})(); 