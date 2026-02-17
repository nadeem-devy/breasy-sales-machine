// ============================================
// Yellow Pages Scraper
// Web scraping via axios + cheerio
// ============================================
const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.yellowpages.com';

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

/**
 * Scrape Yellow Pages for businesses
 * @param {object} params - { query, location, maxResults }
 * @returns {Promise<Array>} Array of scraped leads
 */
async function scrape({ query, location, maxResults = 50 }) {
  if (!query || !location) throw new Error('Both query and location are required for Yellow Pages search.');

  const leads = [];
  let page = 1;
  const maxPages = Math.ceil(maxResults / 30);

  while (leads.length < maxResults && page <= maxPages) {
    const url = `${BASE_URL}/search?search_terms=${encodeURIComponent(query)}&geo_location_terms=${encodeURIComponent(location)}&page=${page}`;
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"macOS"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 20000,
        maxRedirects: 5,
      });

      const $ = cheerio.load(res.data);

      // Try multiple selectors for results
      let results = $('.result');
      if (results.length === 0) results = $('.search-results .srp-listing');
      if (results.length === 0) results = $('[class*="result"]').filter((_, el) => $(el).find('[class*="business-name"]').length > 0);

      if (results.length === 0) break;

      results.each((i, el) => {
        if (leads.length >= maxResults) return false;

        const $el = $(el);
        const name = $el.find('.business-name span').text().trim()
          || $el.find('a.business-name').text().trim()
          || $el.find('[class*="business-name"]').text().trim();
        const phone = $el.find('.phones.phone.primary').text().trim()
          || $el.find('[class*="phone"]').first().text().trim();
        const street = $el.find('.street-address').text().trim()
          || $el.find('[class*="street"]').text().trim();
        const locality = $el.find('.locality').text().trim();
        const categories = $el.find('.categories a').map((_, a) => $(a).text().trim()).get().join(', ');
        const detailLink = $el.find('a.business-name').attr('href') || $el.find('[class*="business-name"] a').attr('href');
        const website = $el.find('a.track-visit-website').attr('href')
          || $el.find('a[href*="website"]').attr('href') || '';

        let city = '', state = '';
        if (locality) {
          const parts = locality.split(',');
          city = parts[0]?.trim() || '';
          const stZip = parts[1]?.trim() || '';
          state = stZip.split(' ')[0] || '';
        }

        if (name) {
          leads.push({
            first_name: '',
            last_name: '',
            company_name: name,
            phone: phone,
            email: '',
            website: website,
            industry: categories,
            city: city,
            state: state,
            address: [street, locality].filter(Boolean).join(', '),
            rating: null,
            review_count: 0,
            source: 'yellow_pages',
            source_url: detailLink ? `${BASE_URL}${detailLink}` : url,
          });
        }
      });

      page++;
      await sleep(2000 + Math.random() * 2000); // Random delay 2-4s
    } catch (e) {
      if (e.response?.status === 403 || e.response?.status === 429) {
        if (leads.length > 0) {
          // Return what we have so far
          break;
        }
        throw new Error('Yellow Pages blocked the request. Try again in a few minutes or use Google Maps / Yelp instead.');
      }
      if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
        throw new Error('Yellow Pages request timed out. Try again or use a different source.');
      }
      throw new Error(`Yellow Pages error: ${e.message}`);
    }
  }

  return leads;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scrape };
