// ============================================
// Google Maps Scraper via Apify
// Uses compass/crawler-google-places actor
// Sync API — returns results in one call
// ============================================
const axios = require('axios');
const db = require('../database/db');

const APIFY_ACTOR = 'compass~crawler-google-places';
const APIFY_URL = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items`;

function getApifyToken() {
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'apify_api_token'").get();
  return row?.value || '';
}

/**
 * Search Google Maps for businesses via Apify
 * @param {object} params - { query, location, maxResults }
 * @returns {Promise<Array>} Array of scraped leads
 */
async function scrape({ query, location, maxResults = 20, maxReviewCount }) {
  const token = getApifyToken();
  if (!token) throw new Error('Apify API token not configured. Add it in Settings → API Integrations.');

  const searchQuery = location ? `${query} in ${location}` : query;

  const response = await axios.post(
    APIFY_URL,
    {
      searchStringsArray: [searchQuery],
      maxCrawledPlacesPerSearch: maxResults,
      language: 'en',
      maxReviews: 0,
      maxImages: 0,
      proxyConfig: { useApifyProxy: true },
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000, // 2 min timeout for sync runs
    }
  );

  const places = response.data || [];

  return places
    .filter(p => !p.permanentlyClosed)
    .filter(p => {
      if (maxReviewCount != null && (p.reviewsCount || 0) > maxReviewCount) return false;
      return true;
    })
    .map(place => ({
      first_name: '',
      last_name: '',
      company_name: place.title || '',
      phone: place.phone || '',
      email: '',
      website: place.website || '',
      industry: place.categoryName || '',
      city: place.city || '',
      state: extractState(place.address),
      address: place.address || '',
      rating: place.totalScore || null,
      review_count: place.reviewsCount || 0,
      source: 'google_maps',
      source_url: place.url || '',
      place_id: place.placeId || '',
    }));
}

/**
 * Extract US state abbreviation from a full address string.
 * e.g. "123 Main St, Phoenix, AZ 85001" → "AZ"
 */
function extractState(address) {
  if (!address) return '';
  const match = address.match(/,\s*([A-Z]{2})\s+\d{5}/);
  return match ? match[1] : '';
}

module.exports = { scrape };
