// ============================================
// Yelp Fusion API Scraper
// Uses Yelp Fusion API (Business Search + Details)
// ============================================
const axios = require('axios');
const db = require('../database/db');

const BASE_URL = 'https://api.yelp.com/v3';

function getApiKey() {
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'yelp_api_key'").get();
  return row?.value || '';
}

/**
 * Search Yelp for businesses
 * @param {object} params - { term, location, categories, maxResults }
 * @returns {Promise<Array>} Array of scraped leads
 */
async function scrape({ term, location, categories = '', maxResults = 50 }) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Yelp API key not configured. Add it in Settings → API Integrations.');

  const leads = [];
  let offset = 0;
  const limit = 50; // Yelp max per request

  while (leads.length < maxResults) {
    const params = {
      term,
      location,
      limit: Math.min(limit, maxResults - leads.length),
      offset,
      sort_by: 'best_match',
    };
    if (categories) params.categories = categories;

    const res = await axios.get(`${BASE_URL}/businesses/search`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      params,
    });

    const data = res.data;
    if (!data.businesses || data.businesses.length === 0) break;

    for (const biz of data.businesses) {
      if (leads.length >= maxResults) break;

      // Get phone from detail endpoint if missing
      let phone = biz.display_phone || biz.phone || '';
      let website = '';

      if (!phone || phone === '') {
        const detail = await getBusinessDetails(biz.id, apiKey);
        phone = detail.phone || '';
        website = detail.website || '';
      }

      leads.push({
        first_name: '',
        last_name: '',
        company_name: biz.name || '',
        phone: phone,
        email: '',
        website: website,
        industry: biz.categories?.map(c => c.title).join(', ') || '',
        city: biz.location?.city || '',
        state: biz.location?.state || '',
        address: [biz.location?.address1, biz.location?.city, biz.location?.state].filter(Boolean).join(', '),
        rating: biz.rating || null,
        review_count: biz.review_count || 0,
        source: 'yelp',
        source_url: biz.url || '',
      });
    }

    offset += data.businesses.length;
    if (offset >= (data.total || 0)) break;

    await sleep(300); // Rate limiting
  }

  return leads;
}

/**
 * Get detailed business info
 */
async function getBusinessDetails(bizId, apiKey) {
  try {
    const res = await axios.get(`${BASE_URL}/businesses/${bizId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return {
      phone: res.data.display_phone || res.data.phone || '',
      website: res.data.url || '',
    };
  } catch (e) {
    return { phone: '', website: '' };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scrape };
