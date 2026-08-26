import axios from 'axios';
import https from 'https';
import * as cheerio from 'cheerio';

async function fetchMP() {
  try {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const { data } = await axios.get('https://esb.mp.gov.in/Old_Question_Papers.html', { httpsAgent: agent });
    const $ = cheerio.load(data);
    
    console.log("TITLE:", $('title').text());
    
    // Find links containing 'Police'
    $('a').each((i, el) => {
      const text = $(el).text().toLowerCase();
      if (text.includes('police')) {
        console.log(`Found MP Police link: ${$(el).text()} - href: ${$(el).attr('href')}`);
      }
    });
  } catch (e) {
    console.error("Error:", e.message);
  }
}

fetchMP();
