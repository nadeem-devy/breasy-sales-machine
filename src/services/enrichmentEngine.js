// ============================================
// Waterfall Enrichment Engine
// Cross-source scraping + fuzzy merge + dedup
// Queries Google Maps, Yelp, Yellow Pages in parallel
// ============================================
const googleMaps = require('../scrapers/googleMaps');
const yelp = require('../scrapers/yelp');
const yellowPages = require('../scrapers/yellowPages');

// Priority order for each field (index 0 = highest priority)
const FIELD_PRIORITY = {
  phone:   ['google_maps', 'yelp', 'yellow_pages'],
  website: ['google_maps', 'yelp', 'yellow_pages'],
  address: ['google_maps', 'yelp', 'yellow_pages'],
  city:    ['google_maps', 'yelp', 'yellow_pages'],
  state:   ['google_maps', 'yelp', 'yellow_pages'],
  email:   ['google_maps', 'yelp', 'yellow_pages'],
};

const SCRAPERS = {
  google_maps: googleMaps,
  yelp: yelp,
  yellow_pages: yellowPages,
};

// Terms stripped during name normalization for fuzzy matching
const STRIP_TERMS = /\b(llc|inc|co|corp|ltd|company|companies|services|service|enterprises?|group|solutions)\b/gi;

/**
 * Enrich leads by querying all 3 sources in parallel, then merging.
 * @param {object} params - { query, location, maxResults }
 * @returns {Promise<Array<object>>} Array of enriched, deduplicated leads
 */
async function waterfallEnrich(params) {
  // 1. Scrape all sources in parallel
  const sourceResults = await scrapeAllSources(params);

  // 2. Tag each result with its source
  const allLeads = [];
  for (const [source, leads] of Object.entries(sourceResults)) {
    for (const lead of leads) {
      allLeads.push({ ...lead, _source: source });
    }
  }

  // 3. Group by company (fuzzy match + phone match)
  const groups = groupByCompany(allLeads);

  // 4. Merge each group into a single enriched lead
  const enriched = groups.map(group => mergeLeadRecords(group));

  return enriched;
}

/**
 * Run all 3 scrapers in parallel. Tolerates individual failures.
 * @returns {Promise<Object>} { google_maps: [...], yelp: [...], yellow_pages: [...] }
 */
async function scrapeAllSources(params) {
  const maxPerSource = Math.max(10, Math.ceil((params.maxResults || 50) / 2));

  const scraperParams = {
    google_maps: { query: params.query, location: params.location, maxResults: maxPerSource },
    yelp: { term: params.query, location: params.location, maxResults: maxPerSource },
    yellow_pages: { query: params.query, location: params.location, maxResults: maxPerSource },
  };

  const results = await Promise.allSettled([
    SCRAPERS.google_maps.scrape(scraperParams.google_maps).catch(() => []),
    SCRAPERS.yelp.scrape(scraperParams.yelp).catch(() => []),
    SCRAPERS.yellow_pages.scrape(scraperParams.yellow_pages).catch(() => []),
  ]);

  const sourceNames = ['google_maps', 'yelp', 'yellow_pages'];
  const output = {};

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    output[sourceNames[i]] = r.status === 'fulfilled' ? (r.value || []) : [];
    if (r.status === 'rejected') {
      console.log(`[WATERFALL] ${sourceNames[i]} failed: ${r.reason?.message || 'unknown error'}`);
    }
  }

  return output;
}

/**
 * Group leads that represent the same company across sources.
 * Uses fuzzy name matching + phone as confirmation signal.
 */
function groupByCompany(leads) {
  const groups = []; // Array of arrays

  for (const lead of leads) {
    let matched = false;
    const normName = normalizeCompanyName(lead.company_name);
    const normPhone = (lead.phone || '').replace(/\D/g, '').slice(-10);

    for (const group of groups) {
      const rep = group[0]; // representative lead of this group
      const repName = normalizeCompanyName(rep.company_name);
      const repPhone = (rep.phone || '').replace(/\D/g, '').slice(-10);

      // Match by phone (strong signal)
      if (normPhone.length >= 10 && repPhone.length >= 10 && normPhone === repPhone) {
        group.push(lead);
        matched = true;
        break;
      }

      // Match by fuzzy name (only if similarity is very high)
      const sim = similarity(normName, repName);
      if (sim >= 0.85) {
        group.push(lead);
        matched = true;
        break;
      }
    }

    if (!matched) {
      groups.push([lead]);
    }
  }

  return groups;
}

/**
 * Merge multiple source records for the same company.
 * Applies field-level priority and category aggregation.
 */
function mergeLeadRecords(records) {
  if (records.length === 1) {
    const lead = records[0];
    return {
      ...lead,
      enrichment_sources: lead._source,
      source_count: 1,
    };
  }

  // Build a source-indexed map for priority lookups
  const bySource = {};
  for (const r of records) {
    bySource[r._source] = r;
  }

  const merged = {
    first_name: '',
    last_name: '',
    company_name: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    city: '',
    state: '',
    industry: '',
    service_type: '',
    rating: null,
    review_count: 0,
    source_url: '',
  };

  // Pick company_name from first available source with longest name
  merged.company_name = records
    .map(r => (r.company_name || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || '';

  // Priority-based field selection
  for (const [field, priority] of Object.entries(FIELD_PRIORITY)) {
    for (const source of priority) {
      const val = bySource[source]?.[field];
      if (val && String(val).trim() !== '') {
        merged[field] = val;
        break;
      }
    }
  }

  // Rating & reviews: use source with highest review_count (most data = most trustworthy)
  let bestReviewSource = null;
  let bestReviewCount = 0;
  for (const r of records) {
    const rc = parseInt(r.review_count || 0);
    if (rc > bestReviewCount) {
      bestReviewCount = rc;
      bestReviewSource = r;
    }
  }
  if (bestReviewSource) {
    merged.rating = bestReviewSource.rating;
    merged.review_count = bestReviewCount;
  }

  // Industry: merge all categories from all sources, deduplicate
  const allCategories = records
    .map(r => (r.industry || '').toLowerCase().split(',').map(s => s.trim()))
    .flat()
    .filter(Boolean);
  merged.industry = [...new Set(allCategories)].join(',');

  // Service type: use first non-empty
  merged.service_type = records.map(r => r.service_type).filter(Boolean)[0] || '';

  // Source tracking
  const sources = [...new Set(records.map(r => r._source))];
  merged.enrichment_sources = sources.join(',');
  merged.source_count = sources.length;

  // Keep first source_url
  merged.source_url = records.map(r => r.source_url).filter(Boolean)[0] || '';

  return merged;
}

/**
 * Normalize a company name for comparison.
 * Strips legal suffixes, punctuation, and extra spaces.
 */
function normalizeCompanyName(name) {
  return (name || '')
    .toLowerCase()
    .replace(STRIP_TERMS, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate string similarity (0-1) using Levenshtein distance.
 */
function similarity(s1, s2) {
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const longer = s1.length >= s2.length ? s1 : s2;
  const shorter = s1.length >= s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  // Quick check: if one contains the other
  if (longer.includes(shorter) && shorter.length / longer.length > 0.7) {
    return shorter.length / longer.length;
  }

  const dist = levenshtein(longer, shorter);
  return (longer.length - dist) / longer.length;
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate data completeness for a lead (0-100).
 */
function calculateCompleteness(lead) {
  const fields = [
    'company_name', 'phone', 'email', 'website', 'address',
    'city', 'state', 'industry', 'rating', 'review_count',
  ];
  let filled = 0;
  for (const field of fields) {
    const val = lead[field];
    if (val !== null && val !== undefined && val !== '' && val !== 0 && val !== '0') {
      filled++;
    }
  }
  return Math.round((filled / fields.length) * 100);
}

module.exports = {
  waterfallEnrich,
  scrapeAllSources,
  mergeLeadRecords,
  groupByCompany,
  fuzzyMatch: similarity,
  calculateCompleteness,
  normalizeCompanyName,
};
