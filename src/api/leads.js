const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const AICallLog = require('../models/AICallLog');
const Campaign = require('../models/Campaign');
const { normalizePhone, isValidPhone, isValidEmail } = require('../utils/phone');
const { updateScore } = require('../services/scoring');
const { routeLead, handleOptOut } = require('../services/routing');
const { sendQuickSMS, initiateManualCall } = require('../integrations/telephonyProvider');
const { initiateCall } = require('../integrations/vapi');
const { parse } = require('csv-parse/sync');
const { validateLead } = require('../services/leadValidator');

/**
 * GET /api/leads — List all leads with filtering
 */
router.get('/', (req, res) => {
  const { page = 1, limit = 50, status, score_tier, campaign_id, sequence_status, search, ad_campaign_id, company_id, max_review_count } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const result = Lead.getAll(parseInt(limit), offset, { status, score_tier, campaign_id, sequence_status, search, ad_campaign_id, company_id, max_review_count });
  res.json(result);
});

/**
 * GET /api/leads/sms-inbox — SMS conversations across all leads
 * MUST be before /:id to avoid param capture
 */
router.get('/sms-inbox', (req, res) => {
  const { page = 1, limit = 50, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const result = Activity.getSMSInbox(parseInt(limit), offset, search || '');
  res.json(result);
});

/**
 * GET /api/leads/twilio-numbers — Available Twilio phone numbers
 */
router.get('/twilio-numbers', (req, res) => {
  const config = require('../config');
  res.json({ numbers: config.twilio.phoneNumbers });
});

/**
 * GET /api/leads/telephony-info — Active provider info + phone numbers
 */
router.get('/telephony-info', (req, res) => {
  const config = require('../config');
  const { getActiveProvider } = require('../integrations/telephonyProvider');
  const provider = getActiveProvider();
  res.json({
    provider,
    numbers: provider === 'dialpad' ? config.dialpad.phoneNumbers : config.twilio.phoneNumbers,
    browser_calling: provider === 'twilio',
  });
});

/**
 * GET /api/leads/voice-token — Generate Twilio Access Token for browser calling
 */
router.get('/voice-token', (req, res) => {
  const config = require('../config');
  const { accountSid, apiKey, apiSecret, twimlAppSid } = config.twilio;

  if (!apiKey || !apiSecret || !accountSid || accountSid.startsWith('ACxxxx')) {
    return res.json({ token: null, identity: 'breasy-operator', dev_mode: true, reason: 'Twilio credentials not configured' });
  }

  if (!twimlAppSid) {
    return res.json({ token: null, identity: 'breasy-operator', dev_mode: true, reason: 'TwiML App SID not configured' });
  }

  const twilio = require('twilio');
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  // Check if Vapi inbound assistant is handling incoming calls
  const db = require('../database/db');
  const vapiInbound = db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_inbound_assistant_id'").get();
  const hasVapiInbound = !!(vapiInbound && vapiInbound.value);

  const identity = 'breasy-operator';
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: !hasVapiInbound, // Disable browser incoming when Vapi AI handles inbound
  });

  const token = new AccessToken(accountSid, apiKey, apiSecret, { identity, ttl: 3600 });
  token.addGrant(voiceGrant);

  res.json({ token: token.toJwt(), identity, dev_mode: false, baseUrl: config.baseUrl, vapiInbound: hasVapiInbound });
});

/**
 * GET /api/leads/email-inbox — Email conversations across all leads
 * MUST be before /:id to avoid param capture
 */
router.get('/email-inbox', (req, res) => {
  const { page = 1, limit = 50, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const result = Activity.getEmailInbox(parseInt(limit), offset, search || '');
  res.json(result);
});

/**
 * GET /api/leads/call-log — All calls across all leads
 * MUST be before /:id to avoid param capture
 */
router.get('/call-log', (req, res) => {
  const { page = 1, limit = 50, call_type, status, outcome } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const result = AICallLog.getAllWithLeadInfo(parseInt(limit), offset, { call_type, status, outcome });
  res.json(result);
});

/**
 * GET /api/leads/recently-scraped — Get recently scraped leads
 * MUST be before /:id to avoid param capture
 */
router.get('/recently-scraped', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const leads = Lead.getRecentlyScraped(limit);
  res.json(leads);
});

/**
 * POST /api/leads/phone-lookup — Research a phone number via multiple sources
 * MUST be before /:id to avoid param capture
 */
router.post('/phone-lookup', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const normalized = normalizePhone(phone);
    if (!isValidPhone(normalized)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if lead already exists
    const existing = Lead.findByPhone(normalized);
    if (existing) {
      return res.status(409).json({
        error: 'Lead already exists for this phone number',
        existing_lead: {
          id: existing.id,
          first_name: existing.first_name,
          last_name: existing.last_name,
          company_name: existing.company_name,
          email: existing.email,
          website: existing.website,
        },
      });
    }

    const results = {
      phone: normalized,
      caller_name: '',
      first_name: '',
      last_name: '',
      company_name: '',
      email: '',
      website: '',
      address: '',
      city: '',
      state: '',
      phone_line_type: '',
      rating: null,
      review_count: 0,
      industry: '',
      snippets: [],
      sources_checked: [],
      google_maps_found: false,
      google_search_found: false,
      twilio_found: false,
    };

    // Step 1 & 2: Run Twilio Lookup + Google Search in parallel
    const [twilioResult, searchResult] = await Promise.allSettled([
      lookupTwilio(normalized),
      lookupGoogleSearch(normalized),
    ]);

    // Process Twilio results
    if (twilioResult.status === 'fulfilled' && twilioResult.value) {
      const tw = twilioResult.value;
      results.sources_checked.push('twilio');
      results.twilio_found = !!(tw.caller_name || tw.line_type);
      if (tw.caller_name) {
        results.caller_name = tw.caller_name;
        const parts = tw.caller_name.trim().split(/\s+/);
        if (parts.length >= 2) {
          results.first_name = parts[0];
          results.last_name = parts.slice(1).join(' ');
        } else if (parts.length === 1) {
          results.company_name = results.company_name || parts[0];
        }
      }
      if (tw.line_type) results.phone_line_type = tw.line_type;
    }

    // Process Google Search results
    if (searchResult.status === 'fulfilled' && searchResult.value) {
      const gs = searchResult.value;
      results.sources_checked.push('google_search');
      results.google_search_found = !!(gs.company_name || gs.website);
      if (gs.company_name && !results.company_name) results.company_name = gs.company_name;
      if (gs.website && !results.website) results.website = gs.website;
      if (gs.email && !results.email) results.email = gs.email;
      if (gs.address && !results.address) results.address = gs.address;
      if (gs.city && !results.city) results.city = gs.city;
      if (gs.state && !results.state) results.state = gs.state;
      if (gs.snippets) results.snippets = gs.snippets.slice(0, 5);
    }

    // Step 3: If we found a company name, do Google Maps lookup for reviews
    if (results.company_name) {
      try {
        const googleMaps = require('../scrapers/googleMaps');
        const location = [results.city, results.state].filter(Boolean).join(', ');
        const gmResults = await googleMaps.scrape({
          query: results.company_name,
          location,
          maxResults: 1,
        });

        results.sources_checked.push('google_maps');

        if (gmResults.length > 0) {
          const gm = gmResults[0];
          results.google_maps_found = true;
          if (gm.rating) results.rating = gm.rating;
          if (gm.review_count) results.review_count = gm.review_count;
          if (gm.website && !results.website) results.website = gm.website;
          if (gm.address && !results.address) results.address = gm.address;
          if (gm.city && !results.city) results.city = gm.city;
          if (gm.state && !results.state) results.state = gm.state;
          if (gm.industry && !results.industry) results.industry = gm.industry;
        }
      } catch (err) {
        console.log(`[PHONE-LOOKUP] Google Maps lookup failed: ${err.message}`);
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('[PHONE-LOOKUP] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function lookupTwilio(phone) {
  try {
    const twilio = require('../integrations/twilio');
    const client = twilio.getClient ? twilio.getClient() : null;
    if (!client) return null;

    const lookup = await client.lookups.v2.phoneNumbers(phone).fetch({
      fields: 'caller_name,line_type_intelligence',
    });

    return {
      caller_name: lookup.callerName?.caller_name || '',
      line_type: lookup.lineTypeIntelligence?.type || '',
    };
  } catch (e) {
    console.log(`[PHONE-LOOKUP] Twilio lookup failed: ${e.message}`);
    return null;
  }
}

async function lookupGoogleSearch(phone) {
  try {
    const googleSearch = require('../scrapers/googleSearch');
    return await googleSearch.searchPhone(phone);
  } catch (e) {
    console.log(`[PHONE-LOOKUP] Google Search failed: ${e.message}`);
    return null;
  }
}

/**
 * POST /api/leads/create-from-lookup — Save phone lookup results as a new lead
 * MUST be before /:id to avoid param capture
 */
router.post('/create-from-lookup', (req, res) => {
  try {
    const data = req.body;
    const phone = normalizePhone(data.phone);
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });

    const existing = Lead.findByPhone(phone);
    if (existing) {
      return res.status(409).json({
        error: 'Lead already exists',
        existing_lead: { id: existing.id, company_name: existing.company_name },
      });
    }

    const validation = validateLead({
      company_name: data.company_name || '',
      phone,
      email: data.email || '',
      city: data.city || '',
      state: data.state || '',
      industry: data.industry || '',
      service_type: data.service_type || '',
      website: data.website || '',
      rating: data.rating,
      review_count: data.review_count,
      address: data.address || '',
    }, {});

    const lead = Lead.create({
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      email: data.email || '',
      phone,
      company_name: data.company_name || '',
      industry: data.industry || '',
      city: data.city || '',
      state: data.state || '',
      website: data.website || '',
      address: data.address || '',
      rating: data.rating || 0,
      review_count: data.review_count || 0,
      phone_line_type: data.phone_line_type || '',
      source: 'manual',
      campaign_id: data.campaign_id || 1,
      sequence_id: data.sequence_id || 1,
      quality_score: validation.quality_score,
      qualification_grade: validation.qualification_grade,
      data_completeness: validation.data_completeness,
      enrichment_sources: 'phone_lookup',
      enrichment_data: data.enrichment_data || '{}',
    });

    // Link the call log entry to this new lead
    if (data.call_log_id) {
      const callLogId = parseInt(data.call_log_id);
      const callLog = AICallLog.findById(callLogId);
      if (callLog) {
        AICallLog.update(callLogId, { lead_id: lead.id });
      }
    }

    Activity.create({
      lead_id: lead.id,
      type: 'note_added',
      channel: 'system',
      content: `Lead created from phone lookup (inbound call). Grade: ${validation.qualification_grade || 'N/A'} | Score: ${validation.quality_score}`,
    });

    try {
      const { matchLeadToCompany } = require('../services/companyMatcher');
      matchLeadToCompany(lead);
    } catch (e) { /* non-fatal */ }

    const freshLead = Lead.findById(lead.id);
    res.status(201).json({
      success: true,
      lead: freshLead,
      _scoring: {
        quality_score: validation.quality_score,
        qualification_grade: validation.qualification_grade,
        data_completeness: validation.data_completeness,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/leads/:id — Get single lead with activities
 */
router.get('/:id', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const activities = Activity.getByLead(lead.id, 50);
  const callLogs = AICallLog.getByLead(lead.id);
  res.json({ lead, activities, callLogs });
});

/**
 * POST /api/leads — Create single lead
 */
router.post('/', (req, res) => {
  try {
    const data = req.body;
    data.phone = normalizePhone(data.phone);

    // Check for duplicate
    if (data.phone || data.email) {
      const existing = Lead.findDuplicate(data.phone, data.email);
      if (existing) {
        const matchField = existing.phone === data.phone ? 'phone' : 'email';
        return res.status(409).json({
          error: 'Duplicate lead',
          message: `Lead already exists with this ${matchField}`,
          existing_lead: {
            id: existing.id,
            unique_id: existing.unique_id,
            company_name: existing.company_name,
            first_name: existing.first_name,
            last_name: existing.last_name,
            phone: existing.phone,
            email: existing.email,
            status: existing.status,
            score: existing.score,
            created_at: existing.created_at,
          },
          view_url: `/leads/${existing.id}`,
          api_url: `/api/leads/${existing.id}`,
        });
      }
    }

    // Run quality validation & scoring
    const nicheConfig = Campaign.getNicheConfig(data.campaign_id || 1);
    const validation = validateLead({
      company_name: data.company_name || '',
      phone: data.phone || '',
      email: data.email || '',
      city: data.city || '',
      state: data.state || '',
      industry: data.industry || '',
      service_type: data.service_type || '',
      website: data.website || '',
      rating: data.rating,
      review_count: data.review_count,
      address: data.address || '',
    }, { nicheConfig });

    data.quality_score = validation.quality_score;
    data.qualification_grade = validation.qualification_grade;
    data.data_completeness = validation.data_completeness;

    const lead = Lead.create(data);

    // Auto-match lead to company by email/website domain
    try {
      const { matchLeadToCompany } = require('../services/companyMatcher');
      matchLeadToCompany(lead);
    } catch (e) { console.error('[COMPANY-MATCHER] Error:', e.message); }

    Activity.create({
      lead_id: lead.id,
      type: 'note_added',
      channel: 'system',
      content: `Lead created (source: ${data.source || 'manual'}) | Grade: ${validation.qualification_grade || 'N/A'} | Score: ${validation.quality_score}`,
    });

    // Re-fetch lead to include company_id set by matcher
    const freshLead = Lead.findById(lead.id);

    res.status(201).json({
      ...freshLead,
      _scoring: {
        quality_score: validation.quality_score,
        qualification_grade: validation.qualification_grade,
        data_completeness: validation.data_completeness,
        breakdown: validation.scoring_breakdown || [],
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/leads/:id — Update lead
 */
router.put('/:id', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const updated = Lead.update(lead.id, req.body);
  res.json(updated);
});

/**
 * DELETE /api/leads/:id — Delete a lead permanently
 */
router.delete('/:id', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.delete(lead.id);
  res.json({ success: true, message: 'Lead deleted' });
});

/**
 * POST /api/leads/:id/score — Manually adjust score
 */
router.post('/:id/score', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const { event_type, bonus_points } = req.body;
  const result = updateScore(lead.id, event_type || 'manual', bonus_points || 0);

  if (result.tierChanged) {
    routeLead(Lead.findById(lead.id), result.oldTier, result.newTier);
  }

  res.json(result);
});

/**
 * POST /api/leads/:id/pause — Pause sequence
 */
router.post('/:id/pause', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { sequence_status: 'paused' });
  Activity.create({ lead_id: lead.id, type: 'note_added', channel: 'system', content: 'Sequence paused manually.' });
  res.json({ success: true, message: 'Sequence paused' });
});

/**
 * POST /api/leads/:id/resume — Resume sequence
 */
router.post('/:id/resume', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { sequence_status: 'active', next_action_at: new Date().toISOString() });
  Activity.create({ lead_id: lead.id, type: 'note_added', channel: 'system', content: 'Sequence resumed manually.' });
  res.json({ success: true, message: 'Sequence resumed' });
});

/**
 * POST /api/leads/:id/mark-qualified — Manually qualify
 */
router.post('/:id/mark-qualified', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const oldTier = lead.score_tier;
  Lead.update(lead.id, { status: 'qualifying', score: Math.max(lead.score, 61), score_tier: 'qualified' });
  routeLead(Lead.findById(lead.id), oldTier, 'qualified');
  res.json({ success: true, message: 'Lead marked as qualified' });
});

/**
 * POST /api/leads/:id/mark-dnc — Mark as Do Not Contact
 */
router.post('/:id/mark-dnc', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  handleOptOut(lead, 'sms');
  handleOptOut(lead, 'email');
  res.json({ success: true, message: 'Lead marked as DNC' });
});

/**
 * GET /api/leads/:id/sms-thread — Get SMS conversation for a lead
 */
router.get('/:id/sms-thread', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const messages = Activity.getSMSThread(lead.id, 200);
  res.json({ messages });
});

/**
 * POST /api/leads/:id/mark-sms-read — Mark SMS conversation as read
 */
router.post('/:id/mark-sms-read', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { sms_read_at: new Date().toISOString() });
  res.json({ success: true });
});

/**
 * GET /api/leads/:id/email-thread — Get email conversation for a lead
 */
router.get('/:id/email-thread', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const messages = Activity.getEmailThread(lead.id, 200);
  res.json({ messages });
});

/**
 * POST /api/leads/:id/email — Send ad-hoc email to lead
 */
router.post('/:id/email', async (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const { subject, body } = req.body;
  if (!subject) return res.status(400).json({ error: 'Subject required' });
  if (!body) return res.status(400).json({ error: 'Body required' });

  try {
    const { sendQuickEmail } = require('../integrations/sendgrid');
    const result = await sendQuickEmail(lead.id, subject, body);
    res.json({ success: !!result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/leads/:id/sms — Send quick SMS to lead
 */
router.post('/:id/sms', async (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const { message, from } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const result = await sendQuickSMS(lead.id, message, from || null);
  res.json({ success: !!result });
});

/**
 * POST /api/leads/:id/call-manual — Initiate manual call via Twilio
 */
router.post('/:id/call-manual', async (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.phone) return res.status(400).json({ error: 'Lead has no phone number' });
    if (lead.call_opt_out) return res.status(400).json({ error: 'Lead has opted out of calls' });

    const result = await initiateManualCall(lead.id);
    res.json({ success: true, message: 'Call initiated — your phone will ring shortly', ...result });
  } catch (err) {
    console.error(`[API] Manual call error for lead #${req.params.id}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/leads/:id/call-ai — Initiate AI call via Vapi
 */
router.post('/:id/call-ai', async (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (!lead.phone) return res.status(400).json({ error: 'Lead has no phone number' });
    if (lead.call_opt_out) return res.status(400).json({ error: 'Lead has opted out of calls' });

    const result = await initiateCall(lead.id);
    if (!result) return res.status(500).json({ error: 'AI call failed — no response from Vapi' });
    res.json({ success: true, message: 'AI call initiated', result });
  } catch (err) {
    console.error(`[API] AI call error for lead #${req.params.id}:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/leads/:id/call-browser — Log browser call (dev mode)
 */
router.post('/:id/call-browser', (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (lead.call_opt_out) return res.status(400).json({ error: 'Lead has opted out of calls' });
    if (!lead.phone) return res.status(400).json({ error: 'Lead has no phone number' });

    const devSid = `dev_browser_${Date.now()}`;
    const callLog = AICallLog.create({
      lead_id: lead.id,
      twilio_sid: devSid,
      call_type: 'browser',
      status: 'initiated',
    });

    Lead.update(lead.id, {
      total_calls_made: lead.total_calls_made + 1,
      last_contacted_at: new Date().toISOString(),
      status: lead.status === 'new' ? 'lead' : lead.status,
    });

    Activity.create({
      lead_id: lead.id,
      type: 'call_initiated',
      channel: 'call',
      direction: 'outbound',
      content: `[DEV] Browser call initiated to ${lead.phone}`,
      metadata: { call_type: 'browser', twilio_sid: devSid, dev_mode: true },
    });

    res.json({ success: true, callSid: devSid, callLogId: callLog.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/leads/:id/call-outcome — Log outcome after a browser/manual call
 */
router.post('/:id/call-outcome', (req, res) => {
  try {
    const lead = Lead.findById(parseInt(req.params.id));
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const { outcome, notes, duration, callLogId } = req.body;
    if (!outcome) return res.status(400).json({ error: 'Outcome is required' });

    // Update call log if we have an ID
    if (callLogId) {
      const callLog = AICallLog.findById(callLogId);
      if (callLog) {
        AICallLog.update(callLog.id, {
          outcome,
          status: 'completed',
          duration_seconds: duration || 0,
          summary: notes || '',
        });
      }
    }

    // Log activity
    const outcomeLabels = {
      qualified: 'Qualified — interested in Breasy',
      callback: 'Callback requested',
      not_interested: 'Not interested',
      no_answer: 'No answer',
      voicemail: 'Left voicemail',
      wrong_number: 'Wrong number',
      busy: 'Line busy',
      gatekeeper: 'Gatekeeper — couldn\'t reach decision maker',
    };
    const label = outcomeLabels[outcome] || outcome;

    Activity.create({
      lead_id: lead.id,
      type: outcome === 'qualified' ? 'call_qualified' : 'call_completed',
      channel: 'call',
      direction: 'outbound',
      content: `Call outcome: ${label}${notes ? ' — ' + notes : ''}`,
      metadata: { outcome, notes, duration, call_log_id: callLogId },
    });

    // Score updates based on outcome
    const { updateScore } = require('../services/scoring');
    const { routeLead } = require('../services/routing');

    if (outcome === 'qualified') {
      const r = updateScore(lead.id, 'call_qualified');
      if (r.tierChanged) routeLead(Lead.findById(lead.id), r.oldTier, r.newTier);
    } else if (outcome === 'callback') {
      updateScore(lead.id, 'call_answered');
    } else if (outcome === 'not_interested') {
      updateScore(lead.id, 'negative_reply');
    } else if (outcome === 'wrong_number') {
      updateScore(lead.id, 'wrong_number');
      Lead.update(lead.id, { status: 'bad_data', sequence_status: 'stopped' });
    } else if (outcome === 'no_answer' || outcome === 'busy') {
      // no score change
    }

    res.json({ success: true, message: `Outcome recorded: ${label}` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/leads/:id/note — Add a note
 */
router.post('/:id/note', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Activity.create({
    lead_id: lead.id, type: 'note_added', channel: 'system',
    content: req.body.note || '',
  });
  res.json({ success: true });
});

/**
 * POST /api/leads/:id/meeting-booked — Record meeting booking
 */
router.post('/:id/meeting-booked', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { meeting_booked: 1 });
  const result = updateScore(lead.id, 'meeting_booked');
  if (result.tierChanged) routeLead(Lead.findById(lead.id), result.oldTier, result.newTier);

  Activity.create({ lead_id: lead.id, type: 'meeting_booked', channel: 'system', content: 'Meeting booked!' });
  res.json({ success: true });
});

/**
 * POST /api/leads/:id/app-downloaded — Record app download
 */
router.post('/:id/app-downloaded', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { app_downloaded: 1 });
  const result = updateScore(lead.id, 'app_downloaded');
  if (result.tierChanged) routeLead(Lead.findById(lead.id), result.oldTier, result.newTier);

  Activity.create({ lead_id: lead.id, type: 'app_download', channel: 'system', content: 'App downloaded!' });
  res.json({ success: true });
});

/**
 * POST /api/leads/:id/mark-bad-data — Mark as bad data
 */
router.post('/:id/mark-bad-data', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { status: 'bad_data', sequence_status: 'stopped', score: -50, score_tier: 'dead' });
  Lead.addToSuppressionList(lead.phone, lead.email, 'bad_data');
  Activity.create({ lead_id: lead.id, type: 'stage_change', channel: 'system', content: 'Marked as bad data. Outreach stopped.' });
  res.json({ success: true, message: 'Lead marked as bad data' });
});

/**
 * POST /api/leads/:id/mark-not-a-fit — Mark as not a fit
 */
router.post('/:id/mark-not-a-fit', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { status: 'not_a_fit', sequence_status: 'stopped' });
  Activity.create({ lead_id: lead.id, type: 'stage_change', channel: 'system', content: 'Marked as not a fit. Outreach stopped.' });
  res.json({ success: true, message: 'Lead marked as not a fit' });
});

/**
 * POST /api/leads/:id/mark-ready-for-work — Mark as ready for work (ops only)
 */
router.post('/:id/mark-ready-for-work', (req, res) => {
  const lead = Lead.findById(parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { status: 'ready_for_work' });
  Activity.create({ lead_id: lead.id, type: 'stage_change', channel: 'system', content: 'Marked as Ready for Work by ops team.' });
  res.json({ success: true, message: 'Lead marked as ready for work' });
});

/**
 * POST /api/leads/import-csv — Bulk import from CSV
 */
router.post('/import-csv', (req, res) => {
  try {
    if (!req.files || !req.files.csv) {
      return res.status(400).json({ error: 'No CSV file uploaded. Send as "csv" field.' });
    }

    const csvBuffer = req.files.csv.data;
    const records = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const campaignId = parseInt(req.body.campaign_id) || 1;
    const sequenceId = parseInt(req.body.sequence_id) || 1;
    const source = req.body.source || 'scraped';
    const skipValidation = req.body.skip_validation === 'true';

    const nicheConfig = Campaign.getNicheConfig(campaignId);

    let imported = 0;
    let duplicates = 0;
    let rejected = 0;
    let errors = 0;
    const errorDetails = [];
    const duplicateDetails = [];
    const rejectionReasons = {};
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    for (const row of records) {
      try {
        const phone = normalizePhone(row.phone || row.Phone || row.PHONE || '');
        const email = (row.email || row.Email || row.EMAIL || '').trim().toLowerCase();
        const firstName = row.first_name || row.FirstName || row.firstname || row['First Name'] || '';
        const lastName = row.last_name || row.LastName || row.lastname || row['Last Name'] || '';
        const companyName = row.company_name || row.CompanyName || row.company || row.Company || '';
        const serviceType = row.service_type || row.ServiceType || row['Service Type'] || row.service || '';
        const city = row.city || row.City || '';
        const state = row.state || row.State || '';
        const industry = row.industry || row.Industry || '';

        // Basic validation
        if (!phone && !email) {
          errors++;
          errorDetails.push(`Row skipped: no phone or email`);
          continue;
        }

        // Lead quality filter (campaign-configurable niche)
        let validation = null;
        if (!skipValidation) {
          validation = validateLead({
            company_name: companyName,
            phone,
            email,
            city,
            state,
            industry,
            service_type: serviceType,
            rating: row.rating || row.Rating,
            review_count: row.review_count || row.reviews || row.Reviews,
            website: row.website || row.Website,
            employee_count: row.employee_count || row.employees || row.Employees,
          }, { nicheConfig });

          if (!validation.valid) {
            rejected++;
            const reason = validation.rejected_reason;
            rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
            continue;
          }
        }

        // Dedup check
        const existingByPhone = phone ? Lead.findByPhone(phone) : null;
        const existingByEmail = email ? Lead.findByEmail(email) : null;
        const existingLead = existingByPhone || existingByEmail;

        if (existingLead) {
          duplicates++;
          duplicateDetails.push({
            company_name: companyName,
            phone,
            email,
            matched_field: existingByPhone ? 'phone' : 'email',
            existing_lead: {
              id: existingLead.id,
              unique_id: existingLead.unique_id,
              company_name: existingLead.company_name,
              phone: existingLead.phone,
              email: existingLead.email,
              view_url: `/leads/${existingLead.id}`,
            },
          });
          continue;
        }

        // Suppression check
        if (Lead.isOnSuppressionList(phone, email)) {
          duplicates++;
          duplicateDetails.push({
            company_name: companyName,
            phone,
            email,
            matched_field: 'suppression_list',
            reason: 'On suppression/DNC list',
          });
          continue;
        }

        const newLead = Lead.create({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          company_name: companyName,
          job_title: row.job_title || row.title || row.Title || '',
          industry,
          service_type: serviceType,
          city,
          state,
          source,
          campaign_id: campaignId,
          sequence_id: sequenceId,
          tags: row.tags || '',
          quality_score: validation?.quality_score || 0,
          qualification_grade: validation?.qualification_grade || '',
          data_completeness: validation?.data_completeness || 0,
          website: row.website || row.Website || '',
        });

        // Auto-match to company
        try {
          const { matchLeadToCompany } = require('../services/companyMatcher');
          matchLeadToCompany(newLead);
        } catch (matchErr) { /* non-fatal */ }

        imported++;
        if (validation?.qualification_grade) {
          gradeDistribution[validation.qualification_grade] = (gradeDistribution[validation.qualification_grade] || 0) + 1;
        }
      } catch (err) {
        errors++;
        errorDetails.push(err.message);
      }
    }

    // Update campaign counts
    Campaign.updateCounts(campaignId);

    res.json({
      success: true,
      summary: {
        total_rows: records.length,
        imported,
        duplicates,
        rejected,
        errors,
        rejection_reasons: rejectionReasons,
        error_details: errorDetails.slice(0, 10),
        duplicate_details: duplicateDetails.slice(0, 20), // Show first 20 duplicates with links
        grade_distribution: gradeDistribution,
      },
    });
  } catch (err) {
    res.status(400).json({ error: `CSV parse error: ${err.message}` });
  }
});

module.exports = router;
