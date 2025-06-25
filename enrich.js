const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const cheerio = require('cheerio');

const prisma = new PrismaClient();

// --- IMPORTANT ---
// 1. Paste the cookie string you copied from your browser here.
const COOKIE_HEADER = "_gid=GA1.2.1166070797.1750582415; _gcl_au=1.1.1477722083.1750582415; intercom-id-g7f8bcxn=90252ae8-4aac-4cf1-96f3-8f0867ed9cc1; intercom-device-id-g7f8bcxn=2ad9fbd7-df9c-4365-9845-5a644351722f; __stripe_mid=e334ba51-b30e-4710-a8eb-a6b6aad8ea442480b1; __stripe_sid=d66fca82-16de-4045-bbb6-f25c6172257d630ad9; _ga=GA1.2.599863128.1750582415; intercom-session-g7f8bcxn=emt1enRaUnFYM3NWT1R1WGZJUzVINkVKYkFUTVQzdldVVEFoYXBocjRmZkdrVkNXYmcyYVlWK2NRT0NuVXhvQlN1K252TEF2Y0xjempxWldTNFZqKzJ6RWd0TWQzUzlCT2xVZzBNcldSK289LS14NUhSRHlSdkJJK2NSanNMQ1VacUZRPT0=--940b7859c236ddfd2ca23ce89aa55feb9076ab6a; _ga_7WGEYVG2J2=GS2.1.s1750652284$o2$g1$t1750653992$j24$l0$h0; AWSALB=mi6OBnqaLsniyrDKYj1LX/mK3zGLUI70gPVCaExlKoGJA8Pp4Q+f5mxZ/LMYs/ywfLPQ3WUIeTE34N1rODx8iukyAVnJhxljzbjBbLxdlvwdUniyl3GyXs0ZhK1+; AWSALBCORS=mi6OBnqaLsniyrDKYj1LX/mK3zGLUI70gPVCaExlKoGJA8Pp4Q+f5mxZ/LMYs/ywfLPQ3WUIeTE34N1rODx8iukyAVnJhxljzbjBbLxdlvwdUniyl3GyXs0ZhK1+";

// 2. We will need to find the CSS selectors for the email and MOQ on a manufacturer's page.
const EMAIL_SELECTOR = "body > ui-view > div.container-fluid.profile.ng-scope > div > div.col-md-8 > div.card.default.card-about.ng-scope > div";
const MOQ_SELECTOR = "body > ui-view > div.container-fluid.profile.ng-scope > div > div.col-md-8 > div:nth-child(3) > div > div > table > tbody > tr";


async function enrichManufacturers() {
  if (COOKIE_HEADER === "PASTE_YOUR_COOKIE_STRING_HERE") {
    console.error("Please paste your session cookie into the `enrich.js` file.");
    return;
  }

  const manufacturersToEnrich = await prisma.manufacturer.findMany({
    where: {
      email: null,
    },
  });

  console.log(`Found ${manufacturersToEnrich.length} manufacturers to enrich.`);

  for (const manufacturer of manufacturersToEnrich) {
    if (!manufacturer.website) {
      console.log(`Skipping ${manufacturer.name} because it has no website URL.`);
      continue;
    }

    try {
      console.log(`Enriching details for: ${manufacturer.name}`);
      const response = await axios.get(manufacturer.website, {
        headers: {
          'Cookie': COOKIE_HEADER,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        },
      });

      const $ = cheerio.load(response.data);

      const email = $(EMAIL_SELECTOR).text().trim();
      const moq = $(MOQ_SELECTOR).text().trim();

      if (!email && !moq) {
        console.warn(`Could not find email or MOQ for ${manufacturer.name} at ${manufacturer.website}. The page structure may have changed or the selectors might be incorrect.`);
        continue;
      }
      
      console.log(`  - Found Email: ${email || 'Not found'}`);
      console.log(`  - Found MOQ: ${moq || 'Not found'}`);

      await prisma.manufacturer.update({
        where: { id: manufacturer.id },
        data: {
          email: email || null,
          moq: moq || null,
        },
      });

      console.log(`  -> Successfully updated ${manufacturer.name} in the database.`);

    } catch (error) {
      console.error(`Failed to enrich ${manufacturer.name}. URL: ${manufacturer.website}. Error: ${error.message}`);
    }
  }
}

enrichManufacturers()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log("Enrichment process finished.");
  }); 