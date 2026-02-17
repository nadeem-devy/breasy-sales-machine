// ============================================
// Step-by-Step Lead Enrichment API
// Each endpoint runs ONE enrichment step so the
// frontend can animate results in real-time.
// ============================================
const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Campaign = require('../models/Campaign');
const { validateLead } = require('../services/leadValidator');
const { detectPhoneType, checkWebsite } = require('../services/leadEnrichChecks');

// ---------------------------------------------------------------------------
// Step 1: Search Google Maps
// ---------------------------------------------------------------------------
router.post('/:id/google-maps', async (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const googleMaps = require('../scrapers/googleMaps');
    const query = lead.company_name || '';
    const location = [lead.city, lead.state].filter(Boolean).join(', ');

    if (!query) return res.json({ found: false, message: 'No company name to search' });

    const results = await googleMaps.scrape({ query, location, maxResults: 1 });

    if (results.length === 0) {
      return res.json({ found: false, source: 'google_maps', message: 'Not found on Google Maps' });
    }

    const match = results[0];
    const updates = {};
    const foundData = {};

    // Merge data — only fill in blanks or upgrade
    if (match.rating && (!lead.rating || lead.rating === 0)) {
      updates.rating = match.rating;
      foundData.rating = match.rating;
    } else if (match.rating) {
      foundData.rating = match.rating;
    }

    if (match.review_count && (!lead.review_count || lead.review_count === 0)) {
      updates.review_count = match.review_count;
      foundData.review_count = match.review_count;
    } else if (match.review_count) {
      foundData.review_count = match.review_count;
    }

    if (match.website && !lead.website) {
      updates.website = match.website;
      foundData.website = match.website;
    }

    if (match.phone && !lead.phone) {
      updates.phone = match.phone;
      foundData.phone = match.phone;
    }

    if (match.address && !lead.address) {
      updates.address = match.address;
      foundData.address = match.address;
    }

    if (match.city && !lead.city) {
      updates.city = match.city;
      foundData.city = match.city;
    }

    if (match.state && !lead.state) {
      updates.state = match.state;
      foundData.state = match.state;
    }

    // Track enrichment source
    const existingSources = (lead.enrichment_sources || '').split(',').filter(Boolean);
    if (!existingSources.includes('google_maps')) {
      existingSources.push('google_maps');
      updates.enrichment_sources = existingSources.join(',');
    }

    // Save enrichment data blob
    let enrichData = {};
    try { enrichData = JSON.parse(lead.enrichment_data || '{}'); } catch (e) {}
    enrichData.google_maps = {
      name: match.company_name,
      rating: match.rating,
      review_count: match.review_count,
      address: match.address,
      website: match.website,
      phone: match.phone,
      source_url: match.source_url,
    };
    updates.enrichment_data = JSON.stringify(enrichData);

    if (Object.keys(updates).length > 0) {
      Lead.update(lead.id, updates);
    }

    res.json({
      found: true,
      source: 'google_maps',
      data: {
        name: match.company_name,
        rating: match.rating || null,
        review_count: match.review_count || 0,
        address: match.address || '',
        website: match.website || '',
        phone: match.phone || '',
        source_url: match.source_url || '',
      },
      updated_fields: Object.keys(updates),
    });
  } catch (err) {
    res.json({ found: false, source: 'google_maps', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Step 2: Search Yelp
// ---------------------------------------------------------------------------
router.post('/:id/yelp', async (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const yelp = require('../scrapers/yelp');
    const term = lead.company_name || '';
    const location = [lead.city, lead.state].filter(Boolean).join(', ');

    if (!term) return res.json({ found: false, message: 'No company name to search' });

    const results = await yelp.scrape({ term, location, maxResults: 1 });

    if (results.length === 0) {
      return res.json({ found: false, source: 'yelp', message: 'Not found on Yelp' });
    }

    const match = results[0];
    const updates = {};
    const foundData = {};

    // Merge — upgrade rating if Yelp has more reviews
    const currentReviews = parseInt(lead.review_count || 0);
    if (match.review_count && match.review_count > currentReviews) {
      updates.rating = match.rating;
      updates.review_count = match.review_count;
      foundData.rating = match.rating;
      foundData.review_count = match.review_count;
    } else {
      foundData.rating = match.rating;
      foundData.review_count = match.review_count;
    }

    if (match.industry && !lead.industry) {
      updates.industry = match.industry;
      foundData.industry = match.industry;
    }

    if (match.website && !lead.website) {
      updates.website = match.website;
      foundData.website = match.website;
    }

    if (match.phone && !lead.phone) {
      updates.phone = match.phone;
      foundData.phone = match.phone;
    }

    // Track enrichment source
    const existingSources = (lead.enrichment_sources || '').split(',').filter(Boolean);
    if (!existingSources.includes('yelp')) {
      existingSources.push('yelp');
      updates.enrichment_sources = existingSources.join(',');
    }

    let enrichData = {};
    try { enrichData = JSON.parse(lead.enrichment_data || '{}'); } catch (e) {}
    enrichData.yelp = {
      name: match.company_name,
      rating: match.rating,
      review_count: match.review_count,
      categories: match.industry,
      website: match.website,
      phone: match.phone,
      source_url: match.source_url,
    };
    updates.enrichment_data = JSON.stringify(enrichData);

    if (Object.keys(updates).length > 0) {
      Lead.update(lead.id, updates);
    }

    res.json({
      found: true,
      source: 'yelp',
      data: {
        name: match.company_name,
        rating: match.rating || null,
        review_count: match.review_count || 0,
        categories: match.industry || '',
        website: match.website || '',
        phone: match.phone || '',
        source_url: match.source_url || '',
      },
      updated_fields: Object.keys(updates),
    });
  } catch (err) {
    res.json({ found: false, source: 'yelp', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Step 3: Search Yellow Pages
// ---------------------------------------------------------------------------
router.post('/:id/yellowpages', async (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const yellowPages = require('../scrapers/yellowPages');
    const query = lead.company_name || '';
    const location = [lead.city, lead.state].filter(Boolean).join(', ');

    if (!query || !location) return res.json({ found: false, message: 'Need company name + location' });

    const results = await yellowPages.scrape({ query, location, maxResults: 1 });

    if (results.length === 0) {
      return res.json({ found: false, source: 'yellow_pages', message: 'Not found on Yellow Pages' });
    }

    const match = results[0];
    const updates = {};

    if (match.website && !lead.website) updates.website = match.website;
    if (match.phone && !lead.phone) updates.phone = match.phone;
    if (match.address && !lead.address) updates.address = match.address;

    const existingSources = (lead.enrichment_sources || '').split(',').filter(Boolean);
    if (!existingSources.includes('yellow_pages')) {
      existingSources.push('yellow_pages');
      updates.enrichment_sources = existingSources.join(',');
    }

    let enrichData = {};
    try { enrichData = JSON.parse(lead.enrichment_data || '{}'); } catch (e) {}
    enrichData.yellow_pages = {
      name: match.company_name,
      phone: match.phone,
      address: match.address,
      categories: match.industry,
      website: match.website,
      source_url: match.source_url,
    };
    updates.enrichment_data = JSON.stringify(enrichData);

    if (Object.keys(updates).length > 0) {
      Lead.update(lead.id, updates);
    }

    res.json({
      found: true,
      source: 'yellow_pages',
      data: {
        name: match.company_name,
        phone: match.phone || '',
        address: match.address || '',
        categories: match.industry || '',
        website: match.website || '',
        source_url: match.source_url || '',
      },
      updated_fields: Object.keys(updates),
    });
  } catch (err) {
    res.json({ found: false, source: 'yellow_pages', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Step 4: Phone type detection
// ---------------------------------------------------------------------------
router.post('/:id/phone-check', async (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (!lead.phone) {
      return res.json({ checked: false, message: 'No phone number on record' });
    }

    const phoneType = await detectPhoneType(lead.phone);
    Lead.update(lead.id, { phone_line_type: phoneType });

    const labels = {
      mobile: 'Mobile Line',
      landline: 'Landline',
      voip: 'VOIP Number',
      unknown: 'Unknown Type',
    };

    res.json({
      checked: true,
      phone: lead.phone,
      phone_type: phoneType,
      label: labels[phoneType] || 'Unknown',
      score_impact: phoneType === 'mobile' ? '+10' : phoneType === 'landline' ? '+5' : phoneType === 'voip' ? '-5' : '+0',
    });
  } catch (err) {
    res.json({ checked: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Step 5: Website reachability check
// ---------------------------------------------------------------------------
router.post('/:id/website-check', async (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (!lead.website) {
      return res.json({ checked: false, message: 'No website on record' });
    }

    const result = await checkWebsite(lead.website);
    Lead.update(lead.id, { website_status: result.live ? 'live' : 'dead' });

    res.json({
      checked: true,
      website: lead.website,
      live: result.live,
      status_code: result.status,
      label: result.live ? 'Website is Live' : 'Website Down / Unreachable',
      score_impact: result.live ? '+10' : '+2',
    });
  } catch (err) {
    res.json({ checked: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Step 5b: Website content scrape (extract emails, contacts, services)
// ---------------------------------------------------------------------------
router.post('/:id/website-scrape', async (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    if (!lead.website) {
      return res.json({ found: false, message: 'No website on record' });
    }

    const { scrapeBusinessWebsite } = require('../services/websiteScraper');
    const result = await scrapeBusinessWebsite(lead.website);

    if (result.error) {
      return res.json({ found: false, source: 'website_scrape', error: result.error });
    }

    const updates = {};
    const updatedFields = [];

    // Fill in blanks only
    if (result.emails.length > 0 && !lead.email) {
      updates.email = result.emails[0];
      updatedFields.push('email');
    }

    if (result.owner_name) {
      const parts = result.owner_name.split(/\s+/);
      if (!lead.first_name && !lead.last_name && parts.length >= 2) {
        updates.first_name = parts[0];
        updates.last_name = parts.slice(1).join(' ');
        updatedFields.push('first_name', 'last_name');
      }
    }

    if (result.services.length > 0 && !lead.service_type) {
      updates.service_type = result.services[0];
      updatedFields.push('service_type');
    }

    if (result.phones.length > 0 && !lead.phone) {
      updates.phone = result.phones[0];
      updatedFields.push('phone');
    }

    // Track enrichment source
    const existingSources = (lead.enrichment_sources || '').split(',').filter(Boolean);
    if (!existingSources.includes('website_scrape')) {
      existingSources.push('website_scrape');
      updates.enrichment_sources = existingSources.join(',');
    }

    // Store full results in enrichment_data
    let enrichData = {};
    try { enrichData = JSON.parse(lead.enrichment_data || '{}'); } catch (e) {}
    enrichData.website_scrape = {
      emails: result.emails,
      owner_name: result.owner_name,
      services: result.services,
      social_links: result.social_links,
      phones: result.phones,
      description: result.description,
      scraped_at: new Date().toISOString(),
    };
    updates.enrichment_data = JSON.stringify(enrichData);

    if (Object.keys(updates).length > 0) {
      Lead.update(lead.id, updates);
    }

    // Log activity
    const Activity = require('../models/Activity');
    Activity.create({
      lead_id: lead.id,
      type: 'note_added',
      channel: 'system',
      content: `Website scraped: ${result.emails.length} email(s), ${result.services.length} service(s)${result.owner_name ? ', owner: ' + result.owner_name : ''} found`,
    });

    res.json({
      found: true,
      source: 'website_scrape',
      data: {
        emails: result.emails,
        owner_name: result.owner_name || '',
        services: result.services,
        social_links: result.social_links || {},
        phones: result.phones,
        description: result.description || '',
      },
      updated_fields: updatedFields,
    });
  } catch (err) {
    res.json({ found: false, source: 'website_scrape', error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Step 6: Finalize — recalculate quality score with all enrichment data
// ---------------------------------------------------------------------------
router.post('/:id/finalize', (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const nicheConfig = Campaign.getNicheConfig(lead.campaign_id || 1);

    // Count enrichment sources
    const sources = (lead.enrichment_sources || '').split(',').filter(Boolean);
    const sourceCount = sources.length;

    // Build enrichment context for the validator
    const enrichmentData = {
      source_count: sourceCount,
      phone_line_type: lead.phone_line_type || '',
      website_live: lead.website_status === 'live',
    };

    const validation = validateLead({
      company_name: lead.company_name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      city: lead.city || '',
      state: lead.state || '',
      industry: lead.industry || '',
      service_type: lead.service_type || '',
      website: lead.website || '',
      rating: lead.rating,
      review_count: lead.review_count,
      address: lead.address || '',
      employee_count: lead.employee_count,
    }, { nicheConfig, enrichmentData });

    // Update lead with final scores
    Lead.update(lead.id, {
      quality_score: validation.quality_score,
      qualification_grade: validation.qualification_grade,
      data_completeness: validation.data_completeness,
    });

    res.json({
      quality_score: validation.quality_score,
      qualification_grade: validation.qualification_grade,
      data_completeness: validation.data_completeness,
      breakdown: validation.scoring_breakdown || [],
      enrichment_sources: sources,
      source_count: sourceCount,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Bulk: Website scrape all leads with a website URL
// Runs in background, streams progress via SSE
// ---------------------------------------------------------------------------
router.get('/bulk-website-scrape/status', (req, res) => {
  // SSE endpoint for real-time progress
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const listener = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Store listener on the module so the bulk endpoint can emit to it
  if (!router._sseListeners) router._sseListeners = [];
  router._sseListeners.push(listener);

  req.on('close', () => {
    router._sseListeners = router._sseListeners.filter(l => l !== listener);
  });
});

router.post('/bulk-website-scrape', async (req, res) => {
  const db = require('../database/db');
  const { scrapeBusinessWebsite } = require('../services/websiteScraper');
  const Activity = require('../models/Activity');

  // Find all leads with a website that haven't been scraped yet
  const leads = db.prepare(`
    SELECT id, website, email, first_name, last_name, phone, service_type,
           enrichment_data, enrichment_sources
    FROM leads
    WHERE website IS NOT NULL AND website != ''
      AND (enrichment_data IS NULL OR enrichment_data NOT LIKE '%website_scrape%')
      AND status NOT IN ('do_not_call', 'bad_data')
    ORDER BY id
  `).all();

  if (leads.length === 0) {
    return res.json({ success: true, message: 'No leads to scrape — all already done or no websites on record', total: 0 });
  }

  // Respond immediately, process in background
  res.json({ success: true, message: `Scraping ${leads.length} websites in background...`, total: leads.length });

  function emit(data) {
    if (router._sseListeners) {
      router._sseListeners.forEach(fn => fn(data));
    }
  }

  let completed = 0;
  let updated = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      const result = await scrapeBusinessWebsite(lead.website);

      if (result.error) {
        failed++;
        emit({ type: 'progress', completed: ++completed, total: leads.length, leadId: lead.id, status: 'error', error: result.error });
        continue;
      }

      const updates = {};
      const updatedFields = [];

      if (result.emails.length > 0 && !lead.email) {
        updates.email = result.emails[0];
        updatedFields.push('email');
      }
      if (result.owner_name) {
        const parts = result.owner_name.split(/\s+/);
        if (!lead.first_name && !lead.last_name && parts.length >= 2) {
          updates.first_name = parts[0];
          updates.last_name = parts.slice(1).join(' ');
          updatedFields.push('name');
        }
      }
      if (result.services.length > 0 && !lead.service_type) {
        updates.service_type = result.services[0];
        updatedFields.push('service_type');
      }
      if (result.phones.length > 0 && !lead.phone) {
        updates.phone = result.phones[0];
        updatedFields.push('phone');
      }

      // Track source
      const existingSources = (lead.enrichment_sources || '').split(',').filter(Boolean);
      if (!existingSources.includes('website_scrape')) {
        existingSources.push('website_scrape');
        updates.enrichment_sources = existingSources.join(',');
      }

      // Store results
      let enrichData = {};
      try { enrichData = JSON.parse(lead.enrichment_data || '{}'); } catch (e) {}
      enrichData.website_scrape = {
        emails: result.emails,
        owner_name: result.owner_name,
        services: result.services,
        social_links: result.social_links,
        phones: result.phones,
        description: result.description,
        scraped_at: new Date().toISOString(),
      };
      updates.enrichment_data = JSON.stringify(enrichData);

      Lead.update(lead.id, updates);

      if (updatedFields.length > 0) updated++;

      Activity.create({
        lead_id: lead.id,
        type: 'note_added',
        channel: 'system',
        content: `Website scraped: ${result.emails.length} email(s), ${result.services.length} service(s)${result.owner_name ? ', owner: ' + result.owner_name : ''} found`,
      });

      completed++;
      emit({ type: 'progress', completed, total: leads.length, leadId: lead.id, status: 'ok', updatedFields });

      // Rate limit: 2 second delay between requests
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      failed++;
      completed++;
      emit({ type: 'progress', completed, total: leads.length, leadId: lead.id, status: 'error', error: err.message });
    }
  }

  emit({ type: 'done', completed, updated, failed, total: leads.length });
  console.log(`[ENRICHMENT] Bulk website scrape complete: ${completed} scraped, ${updated} updated, ${failed} failed`);
});

module.exports = router;
