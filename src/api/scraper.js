const express = require('express');
const router = express.Router();
const { scrapeAndImport, waterfallScrapeAndImport } = require('../scrapers');

/**
 * POST /api/scraper/run — Run a scrape and import leads
 * Body: { source, campaign_id, params: { query/term, location, maxResults, ... } }
 */
router.post('/run', async (req, res) => {
  const { source, campaign_id = 1, params = {} } = req.body;

  if (!source) return res.status(400).json({ error: 'Missing "source" — must be google_maps, yelp, or yellow_pages' });
  if (!params.location && !params.geo_location_terms) {
    return res.status(400).json({ error: 'Missing "location" in params' });
  }
  if (!params.query && !params.term) {
    return res.status(400).json({ error: 'Missing "query" or "term" in params' });
  }

  // Normalize: Yelp uses "term", others use "query"
  if (source === 'yelp' && params.query && !params.term) {
    params.term = params.query;
  }
  if (source !== 'yelp' && params.term && !params.query) {
    params.query = params.term;
  }

  // Pass through max review filter if provided
  if (params.maxReviewCount != null) {
    params.maxReviewCount = parseInt(params.maxReviewCount);
  }

  try {
    const result = await scrapeAndImport(source, params, parseInt(campaign_id));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/scraper/batch — Run scrape across multiple cities
 * Body: { source, campaign_id, query, maxPerCity, cities: ["Phoenix, AZ", "Dallas, TX", ...] }
 */
router.post('/batch', async (req, res) => {
  const { source, campaign_id = 1, query, maxPerCity = 50, maxReviewCount, cities = [] } = req.body;

  if (!source) return res.status(400).json({ error: 'Missing "source"' });
  if (!query) return res.status(400).json({ error: 'Missing "query" (business type)' });
  if (!cities.length) return res.status(400).json({ error: 'No cities selected' });

  const results = [];
  let totalFound = 0, totalImported = 0, totalDuplicates = 0, totalRejected = 0, totalNoPhone = 0, totalErrors = 0;
  const allRejectionReasons = {};

  for (const city of cities) {
    try {
      const params = {
        query,
        location: city,
        maxResults: parseInt(maxPerCity),
      };
      if (maxReviewCount != null) params.maxReviewCount = parseInt(maxReviewCount);
      if (source === 'yelp') params.term = query;

      const result = await scrapeAndImport(source, params, parseInt(campaign_id));
      results.push({ city, success: true, ...result });
      totalFound += result.total_found;
      totalImported += result.imported;
      totalDuplicates += result.duplicates;
      totalRejected += result.rejected || 0;
      totalNoPhone += result.no_phone;
      totalErrors += result.errors;
      // Aggregate rejection reasons
      if (result.rejection_reasons) {
        for (const [reason, count] of Object.entries(result.rejection_reasons)) {
          allRejectionReasons[reason] = (allRejectionReasons[reason] || 0) + count;
        }
      }
    } catch (err) {
      results.push({ city, success: false, error: err.message, total_found: 0, imported: 0, duplicates: 0, rejected: 0, no_phone: 0, errors: 0 });
    }
  }

  res.json({
    success: true,
    summary: {
      cities_attempted: cities.length,
      cities_succeeded: results.filter(r => r.success).length,
      total_found: totalFound,
      total_imported: totalImported,
      total_duplicates: totalDuplicates,
      total_rejected: totalRejected,
      total_no_phone: totalNoPhone,
      total_errors: totalErrors,
      rejection_reasons: allRejectionReasons,
    },
    results,
  });
});

/**
 * POST /api/scraper/waterfall — Run all 3 sources + merge + enrich for a single location
 * Body: { campaign_id, query, location, maxResults }
 */
router.post('/waterfall', async (req, res) => {
  const { campaign_id = 1, query, location, maxResults = 50, maxReviewCount } = req.body;

  if (!query) return res.status(400).json({ error: 'Missing "query" (business type)' });
  if (!location) return res.status(400).json({ error: 'Missing "location"' });

  const params = { query, location, maxResults: parseInt(maxResults) };
  if (maxReviewCount != null) params.maxReviewCount = parseInt(maxReviewCount);

  try {
    const result = await waterfallScrapeAndImport(
      params,
      parseInt(campaign_id)
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/scraper/waterfall-batch — Waterfall scrape across multiple cities
 * Body: { campaign_id, query, maxPerCity, cities: [...] }
 */
router.post('/waterfall-batch', async (req, res) => {
  const { campaign_id = 1, query, maxPerCity = 50, maxReviewCount, cities = [] } = req.body;

  if (!query) return res.status(400).json({ error: 'Missing "query" (business type)' });
  if (!cities.length) return res.status(400).json({ error: 'No cities selected' });

  const results = [];
  let totalFound = 0, totalImported = 0, totalDuplicates = 0, totalRejected = 0, totalNoPhone = 0, totalErrors = 0;
  const allRejectionReasons = {};
  const allGradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let totalMultiSource = 0, totalAvgCompleteness = 0, citiesWithStats = 0;

  for (const city of cities) {
    try {
      const waterfallParams = { query, location: city, maxResults: parseInt(maxPerCity) };
      if (maxReviewCount != null) waterfallParams.maxReviewCount = parseInt(maxReviewCount);
      const result = await waterfallScrapeAndImport(
        waterfallParams,
        parseInt(campaign_id)
      );
      results.push({ city, success: true, ...result });
      totalFound += result.total_found;
      totalImported += result.imported;
      totalDuplicates += result.duplicates;
      totalRejected += result.rejected || 0;
      totalNoPhone += result.no_phone;
      totalErrors += result.errors;
      // Aggregate rejection reasons
      if (result.rejection_reasons) {
        for (const [reason, count] of Object.entries(result.rejection_reasons)) {
          allRejectionReasons[reason] = (allRejectionReasons[reason] || 0) + count;
        }
      }
      // Aggregate grade distribution
      if (result.grade_distribution) {
        for (const [grade, count] of Object.entries(result.grade_distribution)) {
          allGradeDistribution[grade] = (allGradeDistribution[grade] || 0) + count;
        }
      }
      // Aggregate enrichment stats
      if (result.enrichment_stats) {
        totalMultiSource += result.enrichment_stats.multi_source || 0;
        totalAvgCompleteness += result.enrichment_stats.avg_completeness || 0;
        citiesWithStats++;
      }
    } catch (err) {
      results.push({ city, success: false, error: err.message, total_found: 0, imported: 0, duplicates: 0, rejected: 0, no_phone: 0, errors: 0 });
    }
  }

  res.json({
    success: true,
    summary: {
      cities_attempted: cities.length,
      cities_succeeded: results.filter(r => r.success).length,
      total_found: totalFound,
      total_imported: totalImported,
      total_duplicates: totalDuplicates,
      total_rejected: totalRejected,
      total_no_phone: totalNoPhone,
      total_errors: totalErrors,
      rejection_reasons: allRejectionReasons,
      grade_distribution: allGradeDistribution,
    },
    enrichment_stats: {
      multi_source: totalMultiSource,
      avg_completeness: citiesWithStats > 0 ? Math.round(totalAvgCompleteness / citiesWithStats) : 0,
    },
    results,
  });
});

module.exports = router;
