// ============================================
// Google Search Scraper via Apify
// Uses apify/google-search-scraper actor
// Searches a phone number to find business/person info
// ============================================
const axios = require('axios');
const db = require('../database/db');

const APIFY_ACTOR = 'apify~google-search-scraper';
const APIFY_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;

function getApifyToken() {
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'apify_api_token'").get();
  return row?.value || '';
}

/**
 * Search Google for a phone number to find associated business/person info.
 * @param {string} phoneNumber - The phone number to search (E.164 format)
 * @returns {Promise<object>} Parsed results
 */
async function searchPhone(phoneNumber) {
  const token = getApifyToken();
  if (!token) throw new Error('Apify API token not configured.');

  const response = await axios.post(
    APIFY_URL,
    {
      queries: `"${phoneNumber}"`,
      maxPagesPerQuery: 1,
      resultsPerPage: 10,
      languageCode: 'en',
      countryCode: 'us',
      mobileResults: false,
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );

  const results = response.data || [];
  return parseSearchResults(results);
}

/**
 * Parse Google search results to extract business/person info.
 * Skips directory sites that just echo back the phone number.
 */
function parseSearchResults(results) {
  const parsed = {
    company_name: '',
    website: '',
    address: '',
    city: '',
    state: '',
    email: '',
    snippets: [],
    raw_results: [],
  };

  const skipDomains = [
    'whitepages.com', 'yellowpages.com', 'truecaller.com',
    'calleridtest.com', 'whocalledme.com', 'spokeo.com',
    'zabasearch.com', 'anywho.com', 'reversephonelookup.com',
    '800notes.com', 'numverify.com', 'phonevalidator.com',
  ];

  for (const item of results) {
    const organicResults = item.organicResults || [];

    for (const result of organicResults) {
      const title = result.title || '';
      const url = result.url || '';
      const description = result.description || '';

      parsed.raw_results.push({ title, url, description });
      if (description) parsed.snippets.push(description);

      const isDirectorySite = skipDomains.some(d => url.includes(d));
      const isGenericSite = ['google.com', 'facebook.com', 'yelp.com', 'bbb.org', 'linkedin.com'].some(d => url.includes(d));

      // Extract business website (prefer real business sites)
      if (!isDirectorySite && !isGenericSite && !parsed.website && url) {
        parsed.website = url;
      }

      // Extract company name from first relevant result title
      if (!parsed.company_name && !isDirectorySite && title) {
        let name = title
          .replace(/\s*[-|]\s*(Home|Official Site|Contact Us|About|Phone|Reviews).*/i, '')
          .replace(/\s*[-|]\s*$/, '')
          .trim();
        if (name.length > 2 && name.length < 80) {
          parsed.company_name = name;
        }
      }

      // Extract address from snippets
      if (!parsed.address) {
        const addrMatch = description.match(
          /(\d+\s+[\w\s]+(?:St|Ave|Blvd|Rd|Dr|Ln|Way|Ct|Pl|Circle|Drive|Road|Street|Avenue|Boulevard)[\w\s,]*,?\s*[A-Z]{2}\s*\d{5})/i
        );
        if (addrMatch) {
          parsed.address = addrMatch[1].trim();
          const stateMatch = parsed.address.match(/,\s*([A-Z]{2})\s+\d{5}/);
          if (stateMatch) parsed.state = stateMatch[1];
        }
      }

      // Extract email from snippets
      if (!parsed.email) {
        const emailMatch = description.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
        if (emailMatch) {
          parsed.email = emailMatch[0].toLowerCase();
        }
      }
    }
  }

  return parsed;
}

module.exports = { searchPhone };
