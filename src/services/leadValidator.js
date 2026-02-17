// ============================================
// Lead Qualification & Validation (Enhanced)
// Clay-level scoring with 22+ signals
// Campaign-configurable niche targeting
// ============================================

// Default landscaping categories (used when no campaign niche is configured)
const ACCEPTED_CATEGORIES = [
  'landscaping', 'landscape', 'lawn care', 'lawn mowing', 'lawn maintenance',
  'lawn service', 'hardscape', 'hardscaping', 'irrigation', 'sprinkler',
  'tree trimming', 'tree removal', 'tree service', 'arborist',
  'mulching', 'garden', 'sod', 'turf', 'yard maintenance', 'yard work',
  'outdoor lighting', 'landscape lighting', 'patio', 'retaining wall',
  'fence', 'fencing', 'snow removal', 'snow plow', 'leaf removal',
  'brush clearing', 'land clearing', 'grading', 'drainage',
  'pressure washing', 'power washing', 'gutter cleaning',
  'landscape design', 'landscape installation', 'grounds maintenance',
  'property maintenance', 'exterior maintenance',
];

// Default rejected categories
const REJECTED_CATEGORIES = [
  'nursery', 'garden center', 'plant store', 'florist', 'flower shop',
  'golf course', 'agriculture', 'farming', 'ranch', 'excavation',
  'demolition', 'mining', 'highway', 'commercial only',
  'staffing', 'temp agency', 'recruiting', 'real estate',
  'insurance', 'attorney', 'lawyer', 'accounting',
];

// Business name red flags
const NAME_BLACKLIST = [
  'hiring', 'jobs', 'careers', 'franchise hq', 'corporate office',
  'headquarters', 'national', 'test', 'asdf', 'xxx', 'sample',
  'do not call', 'spam', 'fake', 'temp ', 'n/a',
];

// Toll-free / premium prefixes to reject
const BAD_PHONE_PREFIXES = [
  '+1800', '+1888', '+1877', '+1866', '+1855', '+1844', '+1833',
  '+1900', '+1976',
];

// Fields used to calculate data completeness (0-100)
const COMPLETENESS_FIELDS = [
  'company_name', 'phone', 'email', 'website', 'address',
  'city', 'state', 'industry', 'rating', 'review_count',
];

/**
 * Validate a single lead against business criteria.
 * @param {object} lead - Lead data
 * @param {object} options - Optional enrichment context
 *   options.nicheConfig: { target_categories: [], rejected_categories: [] }
 *   options.enrichmentData: { source_count, data_completeness, phone_line_type, website_live }
 * @returns {{ valid, rejected_reason, quality_score, qualification_grade, data_completeness }}
 */
function validateLead(lead, options = {}) {
  const result = {
    valid: true,
    rejected_reason: null,
    quality_score: 0,
    qualification_grade: '',
    data_completeness: 0,
  };

  // ========== HARD REJECTIONS ==========

  // 1. Must have a business name
  const name = (lead.company_name || '').trim().toLowerCase();
  if (!name || name.length < 2) {
    return reject(result, 'no_business_name');
  }

  // 2. Business name blacklist
  for (const term of NAME_BLACKLIST) {
    if (name.includes(term)) {
      return reject(result, `blacklisted_name: "${term}"`);
    }
  }

  // 3. Must have phone
  const phone = (lead.phone || '').trim();
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return reject(result, 'invalid_phone');
  }

  // 4. No toll-free / premium numbers
  const cleanPhone = phone.startsWith('+') ? phone : '+1' + phone.replace(/\D/g, '');
  for (const prefix of BAD_PHONE_PREFIXES) {
    if (cleanPhone.startsWith(prefix)) {
      return reject(result, 'toll_free_or_premium_number');
    }
  }

  // 5. Must have city or state (need location for job matching)
  const city = (lead.city || '').trim();
  const state = (lead.state || '').trim();
  if (!city && !state) {
    return reject(result, 'no_location');
  }

  // 6. Check for rejected categories — use campaign config if provided
  const industry = (lead.industry || '').toLowerCase();
  const serviceType = (lead.service_type || '').toLowerCase();
  const combined = `${name} ${industry} ${serviceType}`;

  const rejectedCats = options.nicheConfig?.rejected_categories?.length > 0
    ? options.nicheConfig.rejected_categories
    : REJECTED_CATEGORIES;

  for (const cat of rejectedCats) {
    if (combined.includes(cat)) {
      return reject(result, `wrong_niche: "${cat}"`);
    }
  }

  // 7. Too-large companies (50+ employees)
  const employees = parseInt(lead.employee_count || lead.employees || 0);
  if (employees > 50) {
    return reject(result, 'too_large_company');
  }

  // ========== QUALITY SCORING (22 signals) ==========

  const enrichment = options.enrichmentData || {};
  const breakdown = []; // Track each signal for UI display

  function signal(name, maxPts, pts, tip) {
    result.quality_score += pts;
    breakdown.push({ signal: name, max: maxPts, earned: pts, tip: tip || null });
  }

  // --- Category match (0-20) ---
  const targetCats = options.nicheConfig?.target_categories?.length > 0
    ? options.nicheConfig.target_categories
    : ACCEPTED_CATEGORIES;

  const matchesCategory = targetCats.some(cat => combined.includes(cat));
  signal('Category match', 20, matchesCategory ? 20 : 0, !matchesCategory ? 'Set service type to match campaign niche' : null);

  // --- Business size (0-15) ---
  let sizePts = 10; // Unknown = likely small
  if (employees >= 1 && employees <= 10) sizePts = 15;
  else if (employees >= 11 && employees <= 25) sizePts = 5;
  signal('Small business', 15, sizePts, employees === 0 ? 'Employee count unknown — assumed small' : null);

  // --- Data completeness (0-20) ---
  const completeness = enrichment.data_completeness != null
    ? enrichment.data_completeness
    : calculateCompleteness(lead);
  result.data_completeness = completeness;

  let compPts = 0;
  if (completeness >= 90) compPts = 20;
  else if (completeness >= 70) compPts = 15;
  else if (completeness >= 50) compPts = 10;
  else if (completeness >= 30) compPts = 5;
  signal('Data completeness (' + completeness + '%)', 20, compPts, completeness < 70 ? 'Add email, website, address to boost score' : null);

  // --- Multi-source verification (0-15) ---
  const sourceCount = enrichment.source_count || 0;
  let srcPts = 0;
  if (sourceCount >= 3) srcPts = 15;
  else if (sourceCount >= 2) srcPts = 10;
  signal('Multi-source verified', 15, srcPts, sourceCount < 2 ? 'Use waterfall scrape to verify across sources' : null);

  // --- Contact quality: website (0-10) ---
  const website = lead.website || '';
  let webPts = 0;
  if (website && website.length > 5) {
    if (enrichment.website_live === true) webPts = 10;
    else if (enrichment.website_live === false) webPts = 2;
    else webPts = 5;
  }
  signal('Website', 10, webPts, !website ? 'Add website URL for +5 to +10 pts' : null);

  // --- Contact quality: email (+5) ---
  const hasEmail = lead.email && lead.email.includes('@');
  signal('Has email', 5, hasEmail ? 5 : 0, !hasEmail ? 'Add email address for +5 pts' : null);

  // --- Phone quality (0-10) ---
  const phoneType = enrichment.phone_line_type || '';
  let phonePts = 0;
  if (phoneType === 'mobile') phonePts = 10;
  else if (phoneType === 'landline') phonePts = 5;
  else if (phoneType === 'voip') phonePts = -5;
  signal('Phone type' + (phoneType ? ' (' + phoneType + ')' : ''), 10, phonePts, !phoneType ? 'Phone type detected on scrape/waterfall' : null);

  // --- Reviews & reputation (0-23) ---
  const reviewCount = parseInt(lead.review_count || 0);
  let revPts = 0;
  if (reviewCount > 50) revPts = 15;
  else if (reviewCount > 10) revPts = 10;
  else if (reviewCount > 0) revPts = 5;
  signal('Review count (' + reviewCount + ')', 15, revPts, reviewCount === 0 ? 'Available from Google Maps / Yelp scrape' : null);

  const rating = parseFloat(lead.rating || 0);
  let ratPts = 0;
  if (rating >= 4.5) ratPts = 8;
  else if (rating >= 4.0) ratPts = 5;
  if (rating > 0 && rating < 3.0) ratPts = -10;
  signal('Rating' + (rating > 0 ? ' (' + rating + ')' : ''), 8, ratPts, rating === 0 ? 'Available from Google Maps / Yelp scrape' : null);

  // --- Geographic quality (0-10) ---
  const address = (lead.address || '').trim();
  let geoPts = 0;
  if (address && city && state) geoPts = 10;
  else if (city && state) geoPts = 5;
  signal('Location data', 10, geoPts, !address ? 'Add street address for +5 more pts' : null);

  // --- Business name quality (0-5) ---
  const rawName = (lead.company_name || '').trim();
  const hasEntity = /\b(llc|inc|co|corp|ltd)\b/i.test(rawName);
  const hasProperCase = rawName.length > 2 && rawName !== rawName.toUpperCase() && rawName !== rawName.toLowerCase();
  signal('Business name quality', 5, (hasEntity ? 3 : 0) + (hasProperCase ? 2 : 0), null);

  // --- Compute grade ---
  result.qualification_grade = getGrade(result.quality_score);
  result.scoring_breakdown = breakdown;

  return result;
}

/**
 * Calculate data completeness score (0-100).
 * Counts how many key fields have real values.
 */
function calculateCompleteness(lead) {
  let filled = 0;
  for (const field of COMPLETENESS_FIELDS) {
    const val = lead[field];
    if (val !== null && val !== undefined && val !== '' && val !== 0 && val !== '0') {
      filled++;
    }
  }
  return Math.round((filled / COMPLETENESS_FIELDS.length) * 100);
}

/**
 * Map quality score to A-F grade.
 */
function getGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

/**
 * Validate a batch of leads. Returns { accepted, rejected, summary }.
 */
function validateBatch(leads, options = {}) {
  const accepted = [];
  const rejected = [];
  const reasons = {};
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  for (const lead of leads) {
    const result = validateLead(lead, options);
    if (result.valid) {
      lead._quality_score = result.quality_score;
      lead._qualification_grade = result.qualification_grade;
      lead._data_completeness = result.data_completeness;
      accepted.push(lead);
      gradeDistribution[result.qualification_grade] = (gradeDistribution[result.qualification_grade] || 0) + 1;
    } else {
      rejected.push({ lead, reason: result.rejected_reason });
      reasons[result.rejected_reason] = (reasons[result.rejected_reason] || 0) + 1;
    }
  }

  // Sort accepted by quality score (highest first)
  accepted.sort((a, b) => (b._quality_score || 0) - (a._quality_score || 0));

  return {
    accepted,
    rejected,
    summary: {
      total: leads.length,
      accepted: accepted.length,
      rejected: rejected.length,
      rejection_reasons: reasons,
      grade_distribution: gradeDistribution,
    },
  };
}

function reject(result, reason) {
  result.valid = false;
  result.rejected_reason = reason;
  return result;
}

module.exports = {
  validateLead,
  validateBatch,
  calculateCompleteness,
  getGrade,
  ACCEPTED_CATEGORIES,
  REJECTED_CATEGORIES,
};
