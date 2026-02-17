// ============================================
// Unified Scraper Service
// Orchestrates all scrapers + imports results
// Supports single-source + waterfall (all 3) modes
// ============================================
const googleMaps = require('./googleMaps');
const yelp = require('./yelp');
const yellowPages = require('./yellowPages');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const Campaign = require('../models/Campaign');
const { validateLead } = require('../services/leadValidator');
const { waterfallEnrich, calculateCompleteness } = require('../services/enrichmentEngine');
const { enrichLead } = require('../services/leadEnrichChecks');

const SCRAPERS = {
  google_maps: googleMaps,
  yelp: yelp,
  yellow_pages: yellowPages,
};

/**
 * Run a scrape and import results into the leads table (single source)
 * @param {string} source - 'google_maps' | 'yelp' | 'yellow_pages'
 * @param {object} params - Source-specific search params
 * @param {number} campaignId - Campaign to assign leads to
 * @returns {Promise<object>} Import summary
 */
async function scrapeAndImport(source, params, campaignId = 1) {
  const scraper = SCRAPERS[source];
  if (!scraper) throw new Error(`Unknown scraper source: ${source}. Valid: ${Object.keys(SCRAPERS).join(', ')}`);

  // Get campaign niche config (if available)
  const nicheConfig = Campaign.getNicheConfig(campaignId);

  // Run the scrape
  let rawLeads = await scraper.scrape(params);

  // Apply max review count filter (post-scrape, works for all sources)
  if (params.maxReviewCount != null) {
    rawLeads = rawLeads.filter(l => (l.review_count || 0) <= params.maxReviewCount);
  }

  // Import into database
  let imported = 0, duplicates = 0, noPhone = 0, rejected = 0, errors = 0;
  const errorDetails = [];
  const rejectionReasons = {};
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  for (const raw of rawLeads) {
    try {
      // Skip leads without a phone number (we need it for outreach)
      if (!raw.phone || raw.phone.trim() === '') {
        noPhone++;
        continue;
      }

      // Clean phone number
      const phone = cleanPhone(raw.phone);
      if (!phone) {
        noPhone++;
        continue;
      }

      // Lead quality filter (campaign-configurable niche)
      const validation = validateLead({
        company_name: raw.company_name || '',
        phone,
        email: raw.email || '',
        city: raw.city || '',
        state: raw.state || '',
        industry: raw.industry || '',
        service_type: raw.service_type || params.query || '',
        website: raw.website || '',
        rating: raw.rating,
        review_count: raw.review_count,
        address: raw.address || '',
      }, { nicheConfig });

      if (!validation.valid) {
        rejected++;
        const reason = validation.rejected_reason;
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        continue;
      }

      // Check for duplicate
      const existing = Lead.findByPhone(phone);
      if (existing) {
        duplicates++;
        continue;
      }

      // Create the lead
      const lead = Lead.create({
        first_name: raw.first_name || '',
        last_name: raw.last_name || '',
        phone: phone,
        email: raw.email || '',
        company_name: raw.company_name || '',
        industry: raw.industry || '',
        service_type: raw.service_type || params.query || '',
        city: raw.city || '',
        state: raw.state || '',
        source: raw.source || source,
        campaign_id: campaignId,
        quality_score: validation.quality_score,
        qualification_grade: validation.qualification_grade,
        data_completeness: validation.data_completeness,
        enrichment_sources: source,
        website: raw.website || '',
        address: raw.address || '',
        rating: raw.rating || 0,
        review_count: raw.review_count || 0,
        enrichment_data: JSON.stringify({
          website: raw.website || '',
          address: raw.address || '',
          rating: raw.rating,
          review_count: raw.review_count,
          source_url: raw.source_url || '',
          scraped_at: new Date().toISOString(),
        }),
      });

      if (lead?.id) {
        imported++;
        if (validation.qualification_grade) {
          gradeDistribution[validation.qualification_grade] = (gradeDistribution[validation.qualification_grade] || 0) + 1;
        }
        Activity.create({ lead_id: lead.id, type: 'lead_scraped', channel: 'system', content: `Scraped from ${source} | Grade: ${validation.qualification_grade} | Score: ${validation.quality_score}` });
      }
    } catch (e) {
      errors++;
      if (errorDetails.length < 10) {
        errorDetails.push(`${raw.company_name || 'Unknown'}: ${e.message}`);
      }
    }
  }

  return {
    source,
    total_found: rawLeads.length,
    imported,
    duplicates,
    rejected,
    no_phone: noPhone,
    errors,
    rejection_reasons: rejectionReasons,
    error_details: errorDetails,
    grade_distribution: gradeDistribution,
  };
}

/**
 * Waterfall scrape: query all 3 sources, merge, enrich, validate, import.
 * @param {object} params - { query, location, maxResults }
 * @param {number} campaignId - Campaign to assign leads to
 * @returns {Promise<object>} Import summary with enrichment stats
 */
async function waterfallScrapeAndImport(params, campaignId = 1) {
  // Get campaign niche config
  const nicheConfig = Campaign.getNicheConfig(campaignId);

  // Run waterfall enrichment (parallel scrape + merge + dedup)
  let enrichedLeads = await waterfallEnrich(params);

  // Apply max review count filter
  if (params.maxReviewCount != null) {
    enrichedLeads = enrichedLeads.filter(l => (l.review_count || 0) <= params.maxReviewCount);
  }

  let imported = 0, duplicates = 0, noPhone = 0, rejected = 0, errors = 0;
  const errorDetails = [];
  const rejectionReasons = {};
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const enrichmentStats = { total_enriched: enrichedLeads.length, multi_source: 0, avg_completeness: 0 };
  let totalCompleteness = 0;

  for (const raw of enrichedLeads) {
    try {
      // Skip leads without a phone number
      if (!raw.phone || raw.phone.trim() === '') {
        noPhone++;
        continue;
      }

      const phone = cleanPhone(raw.phone);
      if (!phone) {
        noPhone++;
        continue;
      }

      // Track multi-source matches
      if ((raw.source_count || 0) >= 2) {
        enrichmentStats.multi_source++;
      }

      // Run phone type + website checks
      let enrichChecks = { phone_line_type: '', website_live: null, website_status: null };
      try {
        enrichChecks = await enrichLead({ phone, website: raw.website });
      } catch (e) {
        // Enrichment checks are optional — don't block import
      }

      // Calculate data completeness
      const completeness = calculateCompleteness(raw);
      totalCompleteness += completeness;

      // Validate with full enrichment context
      const validation = validateLead({
        company_name: raw.company_name || '',
        phone,
        email: raw.email || '',
        city: raw.city || '',
        state: raw.state || '',
        industry: raw.industry || '',
        service_type: raw.service_type || params.query || '',
        website: raw.website || '',
        rating: raw.rating,
        review_count: raw.review_count,
        address: raw.address || '',
        employee_count: raw.employee_count,
      }, {
        nicheConfig,
        enrichmentData: {
          source_count: raw.source_count || 1,
          data_completeness: completeness,
          phone_line_type: enrichChecks.phone_line_type,
          website_live: enrichChecks.website_live,
        },
      });

      if (!validation.valid) {
        rejected++;
        const reason = validation.rejected_reason;
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        continue;
      }

      // Check for duplicate
      const existing = Lead.findByPhone(phone);
      if (existing) {
        duplicates++;
        continue;
      }

      // Create the lead with full enrichment data
      const lead = Lead.create({
        first_name: raw.first_name || '',
        last_name: raw.last_name || '',
        phone: phone,
        email: raw.email || '',
        company_name: raw.company_name || '',
        industry: raw.industry || '',
        service_type: raw.service_type || params.query || '',
        city: raw.city || '',
        state: raw.state || '',
        source: 'search', // Use 'search' to satisfy CHECK constraint
        campaign_id: campaignId,
        quality_score: validation.quality_score,
        qualification_grade: validation.qualification_grade,
        data_completeness: completeness,
        enrichment_sources: raw.enrichment_sources || '',
        phone_line_type: enrichChecks.phone_line_type || '',
        website_status: enrichChecks.website_live ? 'live' : (enrichChecks.website_live === false ? 'dead' : 'unknown'),
        website: raw.website || '',
        address: raw.address || '',
        rating: raw.rating || 0,
        review_count: raw.review_count || 0,
        enrichment_data: JSON.stringify({
          website: raw.website || '',
          address: raw.address || '',
          rating: raw.rating,
          review_count: raw.review_count,
          source_url: raw.source_url || '',
          source_count: raw.source_count || 1,
          enrichment_sources: raw.enrichment_sources || '',
          phone_line_type: enrichChecks.phone_line_type,
          website_live: enrichChecks.website_live,
          website_http_status: enrichChecks.website_status,
          scraped_at: new Date().toISOString(),
        }),
      });

      if (lead?.id) {
        imported++;
        if (validation.qualification_grade) {
          gradeDistribution[validation.qualification_grade] = (gradeDistribution[validation.qualification_grade] || 0) + 1;
        }
        Activity.create({ lead_id: lead.id, type: 'lead_scraped', channel: 'system', content: `Waterfall enriched (${raw.source_count || 1} sources) | Grade: ${validation.qualification_grade} | Score: ${validation.quality_score}` });
      }
    } catch (e) {
      errors++;
      if (errorDetails.length < 10) {
        errorDetails.push(`${raw.company_name || 'Unknown'}: ${e.message}`);
      }
    }
  }

  enrichmentStats.avg_completeness = Math.round(totalCompleteness / (enrichedLeads.length || 1));

  return {
    source: 'waterfall',
    total_found: enrichedLeads.length,
    imported,
    duplicates,
    rejected,
    no_phone: noPhone,
    errors,
    rejection_reasons: rejectionReasons,
    error_details: errorDetails,
    grade_distribution: gradeDistribution,
    enrichment_stats: enrichmentStats,
  };
}

/**
 * Clean and normalize phone number
 */
function cleanPhone(phone) {
  if (!phone) return null;
  // Strip everything except digits and leading +
  let cleaned = phone.replace(/[^\d+]/g, '');
  // If it starts with 1 and is 11 digits, add +
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    cleaned = '+' + cleaned;
  }
  // If it's 10 digits (US), add +1
  if (cleaned.length === 10) {
    cleaned = '+1' + cleaned;
  }
  // Must be at least 10 digits
  if (cleaned.replace(/\D/g, '').length < 10) return null;
  return cleaned;
}

module.exports = { scrapeAndImport, waterfallScrapeAndImport, SCRAPERS };
