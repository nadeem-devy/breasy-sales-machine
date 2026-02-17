const express = require('express');
const router = express.Router();
const db = require('../database/db');
const Activity = require('../models/Activity');
const Template = require('../models/Template');
const Campaign = require('../models/Campaign');

/**
 * GET /api/dashboard/overview — Main dashboard KPIs
 */
router.get('/overview', (req, res) => {
  const campaignId = req.query.campaign_id;
  const campaignFilter = campaignId ? `AND campaign_id = ${parseInt(campaignId)}` : '';

  const totalLeads = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE 1=1 ${campaignFilter}`).get().c;
  const totalContacted = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE status != 'new' ${campaignFilter}`).get().c;
  const totalEngaged = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE replied = 1 ${campaignFilter}`).get().c;
  const totalQualified = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE status IN ('qualifying', 'ready_for_work') ${campaignFilter}`).get().c;
  const totalMeetings = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE meeting_booked = 1 ${campaignFilter}`).get().c;
  const totalDownloads = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE app_downloaded = 1 ${campaignFilter}`).get().c;
  const totalReadyForWork = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE status = 'ready_for_work' ${campaignFilter}`).get().c;
  const totalHot = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE score_tier = 'hot' ${campaignFilter}`).get().c;
  const totalDNC = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE status = 'do_not_call' ${campaignFilter}`).get().c;

  // Today's numbers
  const todayLeads = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE date(created_at) = date('now') ${campaignFilter}`).get().c;
  const todaySMS = db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'sms_sent' AND date(created_at) = date('now')`).get().c;
  const todaySMSReplied = db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'sms_replied' AND date(created_at) = date('now')`).get().c;
  const todayEmails = db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_sent' AND date(created_at) = date('now')`).get().c;
  const todayEmailsOpened = db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_opened' AND date(created_at) = date('now')`).get().c;
  const todayCalls = db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_initiated' AND date(created_at) = date('now')`).get().c;
  const todayCallsAnswered = db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_answered' AND date(created_at) = date('now')`).get().c;
  const todayQualified = db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_qualified' AND date(created_at) = date('now')`).get().c;

  // Score distribution
  const scoreDist = db.prepare(`
    SELECT score_tier, COUNT(*) as count FROM leads
    WHERE status NOT IN ('bad_data', 'do_not_call', 'not_a_fit')
    GROUP BY score_tier
  `).all();

  // Pipeline (status-based funnel)
  const pipeline = db.prepare(`
    SELECT status, COUNT(*) as count FROM leads
    GROUP BY status
    ORDER BY CASE status
      WHEN 'new' THEN 1 WHEN 'lead' THEN 2 WHEN 'discovery' THEN 3
      WHEN 'qualifying' THEN 4 WHEN 'ready_for_work' THEN 5
      WHEN 'bad_data' THEN 6 WHEN 'do_not_call' THEN 7 WHEN 'not_a_fit' THEN 8
      END
  `).all();

  res.json({
    totals: {
      leads: totalLeads, contacted: totalContacted, engaged: totalEngaged,
      qualified: totalQualified, meetings: totalMeetings, downloads: totalDownloads,
      ready_for_work: totalReadyForWork, hot: totalHot, dnc: totalDNC,
    },
    today: {
      leads: todayLeads, sms_sent: todaySMS, sms_replied: todaySMSReplied,
      emails_sent: todayEmails, emails_opened: todayEmailsOpened,
      calls_made: todayCalls, calls_answered: todayCallsAnswered, qualified: todayQualified,
    },
    rates: {
      contact_rate: totalLeads > 0 ? ((totalContacted / totalLeads) * 100).toFixed(1) : 0,
      engagement_rate: totalContacted > 0 ? ((totalEngaged / totalContacted) * 100).toFixed(1) : 0,
      qualification_rate: totalLeads > 0 ? ((totalQualified / totalLeads) * 100).toFixed(1) : 0,
      meeting_rate: totalQualified > 0 ? ((totalMeetings / totalQualified) * 100).toFixed(1) : 0,
      download_rate: totalLeads > 0 ? ((totalDownloads / totalLeads) * 100).toFixed(1) : 0,
      conversion_rate: totalLeads > 0 ? ((totalReadyForWork / totalLeads) * 100).toFixed(1) : 0,
    },
    score_distribution: scoreDist,
    pipeline,
  });
});

/**
 * GET /api/dashboard/analytics — Detailed channel analytics
 */
router.get('/analytics', (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // SMS metrics
  const sms = {
    sent: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'sms_sent' AND date(created_at) >= ?`).get(startDate).c,
    delivered: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'sms_delivered' AND date(created_at) >= ?`).get(startDate).c,
    replied: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'sms_replied' AND date(created_at) >= ?`).get(startDate).c,
    opted_out: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'opt_out' AND channel = 'sms' AND date(created_at) >= ?`).get(startDate).c,
  };
  sms.reply_rate = sms.delivered > 0 ? ((sms.replied / sms.delivered) * 100).toFixed(1) : 0;

  // Email metrics
  const email = {
    sent: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_sent' AND date(created_at) >= ?`).get(startDate).c,
    opened: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_opened' AND date(created_at) >= ?`).get(startDate).c,
    clicked: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_clicked' AND date(created_at) >= ?`).get(startDate).c,
    bounced: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_bounced' AND date(created_at) >= ?`).get(startDate).c,
    replied: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_replied' AND date(created_at) >= ?`).get(startDate).c,
  };
  email.open_rate = email.sent > 0 ? ((email.opened / email.sent) * 100).toFixed(1) : 0;
  email.click_rate = email.opened > 0 ? ((email.clicked / email.opened) * 100).toFixed(1) : 0;

  // Call metrics
  const calls = {
    made: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_initiated' AND date(created_at) >= ?`).get(startDate).c,
    answered: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_answered' AND date(created_at) >= ?`).get(startDate).c,
    qualified: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_qualified' AND date(created_at) >= ?`).get(startDate).c,
  };
  calls.answer_rate = calls.made > 0 ? ((calls.answered / calls.made) * 100).toFixed(1) : 0;
  calls.qualify_rate = calls.answered > 0 ? ((calls.qualified / calls.answered) * 100).toFixed(1) : 0;

  // Daily trend
  const dailyTrend = db.prepare(`
    SELECT date(created_at) as date, type, COUNT(*) as count
    FROM activities
    WHERE date(created_at) >= ?
    GROUP BY date(created_at), type
    ORDER BY date(created_at)
  `).all(startDate);

  // A/B test results
  const abTests = Template.getABTestResults();

  res.json({ sms, email, calls, dailyTrend, abTests, period: { days, startDate } });
});

/**
 * GET /api/dashboard/activity-feed — Real-time activity feed
 */
router.get('/activity-feed', (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  const feed = Activity.getRecentFeed(limit);
  res.json(feed);
});

/**
 * GET /api/dashboard/campaigns — Campaign list with stats
 */
router.get('/campaigns', (req, res) => {
  const campaigns = Campaign.getAll();
  // Update counts for active campaigns
  campaigns.forEach(c => { if (c.is_active) Campaign.updateCounts(c.id); });
  res.json(Campaign.getAll());
});

/**
 * POST /api/dashboard/campaigns — Create campaign
 */
router.post('/campaigns', (req, res) => {
  const campaign = Campaign.create(req.body);
  res.status(201).json(campaign);
});

/**
 * GET /api/dashboard/campaigns/:id/niche — Get campaign niche config
 */
router.get('/campaigns/:id/niche', (req, res) => {
  const config = Campaign.getNicheConfig(parseInt(req.params.id));
  if (!config) return res.status(404).json({ error: 'Campaign not found' });
  res.json(config);
});

/**
 * PUT /api/dashboard/campaigns/:id/niche — Update campaign niche config
 */
router.put('/campaigns/:id/niche', (req, res) => {
  const id = parseInt(req.params.id);
  const campaign = Campaign.findById(id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const updated = Campaign.updateNiche(id, {
    target_categories: req.body.target_categories || '',
    rejected_categories: req.body.rejected_categories || '',
    niche_name: req.body.niche_name || 'General',
  });

  res.json({ success: true, campaign: updated });
});

/**
 * GET /api/dashboard/settings — System settings
 */
router.get('/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM system_settings ORDER BY key').all();
  res.json(settings);
});

/**
 * PUT /api/dashboard/settings — Update setting
 */
router.put('/settings', (req, res) => {
  const { key, value } = req.body;
  // Upsert — insert if not exists
  db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run(key, value);
  res.json({ success: true });
});

/**
 * PUT /api/dashboard/settings/bulk — Update multiple settings at once
 */
router.put('/settings/bulk', (req, res) => {
  const settings = req.body; // expects { key: value, key2: value2, ... }
  const stmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');
  const updateMany = db.transaction((items) => {
    for (const [key, value] of Object.entries(items)) {
      stmt.run(key, value);
    }
  });
  updateMany(settings);
  res.json({ success: true });
});

/**
 * POST /api/dashboard/test-twilio — Test Twilio connection
 */
router.post('/test-twilio', async (req, res) => {
  const sid = db.prepare("SELECT value FROM system_settings WHERE key = 'twilio_account_sid'").get();
  const token = db.prepare("SELECT value FROM system_settings WHERE key = 'twilio_auth_token'").get();
  if (!sid?.value || !token?.value) return res.json({ success: false, error: 'Missing Account SID or Auth Token' });
  try {
    const twilio = require('twilio')(sid.value, token.value);
    const account = await twilio.api.accounts(sid.value).fetch();
    res.json({ success: true, message: `Connected: ${account.friendlyName} (${account.status})` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/**
 * POST /api/dashboard/sync-dialpad — Manually trigger Dialpad sync
 */
router.post('/sync-dialpad', async (req, res) => {
  try {
    const { runDialpadSync } = require('../services/dialpadSync');
    const result = await runDialpadSync();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/**
 * POST /api/dashboard/test-dialpad — Test Dialpad connection
 */
router.post('/test-dialpad', async (req, res) => {
  const apiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'dialpad_api_key'").get();
  if (!apiKey?.value) return res.json({ success: false, error: 'Missing API Key' });
  try {
    const axios = require('axios');
    const resp = await axios.get('https://dialpad.com/api/v2/users/me', {
      headers: { Authorization: `Bearer ${apiKey.value}` },
    });
    res.json({ success: true, message: `Connected: ${resp.data.display_name || resp.data.email || 'OK'}` });
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.message || err.message });
  }
});

/**
 * POST /api/dashboard/test-sendgrid — Test SendGrid connection
 */
router.post('/test-sendgrid', async (req, res) => {
  const apiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'sendgrid_api_key'").get();
  if (!apiKey?.value) return res.json({ success: false, error: 'Missing API Key' });
  try {
    const axios = require('axios');
    const resp = await axios.get('https://api.sendgrid.com/v3/user/profile', {
      headers: { Authorization: `Bearer ${apiKey.value}` },
    });
    res.json({ success: true, message: `Connected: ${resp.data.first_name} ${resp.data.last_name}` });
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.errors?.[0]?.message || err.message });
  }
});

/**
 * POST /api/dashboard/test-vapi — Test Vapi connection
 */
router.post('/test-vapi', async (req, res) => {
  const apiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_api_key'").get();
  if (!apiKey?.value) return res.json({ success: false, error: 'Missing API Key' });
  try {
    const axios = require('axios');
    const resp = await axios.get('https://api.vapi.ai/assistant', {
      headers: { Authorization: `Bearer ${apiKey.value}` },
    });
    res.json({ success: true, message: `Connected: ${resp.data.length || 0} assistants found` });
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.message || err.message });
  }
});

/**
 * POST /api/dashboard/deploy-inbound-assistant — Create/update Vapi inbound receptionist
 */
router.post('/deploy-inbound-assistant', async (req, res) => {
  try {
    const apiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_api_key'").get();
    if (!apiKey?.value) return res.json({ success: false, error: 'Set your Vapi API Key first' });

    const transferNumber = req.body.transfer_number || db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_transfer_number'").get()?.value || '+15102201987';
    const webhookUrl = db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_webhook_url'").get()?.value || (require('../config').baseUrl + '/webhooks/vapi');
    const existingId = db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_inbound_assistant_id'").get()?.value;

    // Temporarily set config for the deploy function
    const config = require('../config');
    config.vapi.apiKey = apiKey.value;
    config.vapi.inboundAssistantId = existingId || null;

    const { deployInboundAssistant, configureInboundNumber } = require('../integrations/vapi');
    const result = await deployInboundAssistant(transferNumber, webhookUrl);

    // Save the assistant ID
    const assistantId = result.id;
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run('vapi_inbound_assistant_id', assistantId);
    db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').run('vapi_transfer_number', transferNumber);

    // If phone number ID is configured, attach the assistant to it
    const phoneNumberId = db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_phone_number_id'").get()?.value;
    if (phoneNumberId) {
      try {
        await configureInboundNumber(phoneNumberId, assistantId);
      } catch (phoneErr) {
        return res.json({
          success: true,
          assistantId,
          warning: `Assistant created but could not attach to phone: ${phoneErr.message}`,
        });
      }
    }

    res.json({
      success: true,
      assistantId,
      message: existingId ? 'Inbound assistant updated' : 'Inbound assistant created',
      phoneAttached: !!phoneNumberId,
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

/**
 * POST /api/dashboard/test-hubspot — Test HubSpot connection
 */
router.post('/test-hubspot', async (req, res) => {
  const apiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'hubspot_api_key'").get();
  if (!apiKey?.value) return res.json({ success: false, error: 'Missing API Key' });
  try {
    const axios = require('axios');
    const resp = await axios.get('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: { Authorization: `Bearer ${apiKey.value}` },
    });
    res.json({ success: true, message: `Connected: ${resp.data.total || 0} contacts in CRM` });
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.message || err.message });
  }
});

/**
 * GET /api/dashboard/ad-overview — Ad campaign overview for dashboard card
 */
router.get('/ad-overview', (req, res) => {
  const AdCampaign = require('../models/AdCampaign');
  const overview = AdCampaign.getOverview();
  const todayLeads = db.prepare(`
    SELECT COUNT(*) as c FROM leads
    WHERE ad_campaign_id IS NOT NULL AND date(created_at) = date('now')
  `).get().c;
  const todaySpend = db.prepare(`
    SELECT COALESCE(SUM(spend), 0) as s FROM ad_campaign_metrics
    WHERE date = date('now')
  `).get().s;
  res.json({ ...overview, today_leads: todayLeads, today_spend: todaySpend });
});

/**
 * POST /api/dashboard/run-scheduler — Manually trigger sequence scheduler
 */
router.post('/run-scheduler', async (req, res) => {
  const { runScheduler } = require('../services/sequenceEngine');
  const result = await runScheduler();
  res.json(result);
});

/**
 * POST /api/dashboard/pause-system — Emergency pause
 */
router.post('/pause-system', (req, res) => {
  db.prepare("UPDATE system_settings SET value = '1' WHERE key = 'system_paused'").run();
  res.json({ success: true, message: 'System PAUSED. All outreach stopped.' });
});

/**
 * POST /api/dashboard/resume-system — Resume after pause
 */
router.post('/resume-system', (req, res) => {
  db.prepare("UPDATE system_settings SET value = '0' WHERE key = 'system_paused'").run();
  res.json({ success: true, message: 'System RESUMED. Outreach will continue.' });
});

/**
 * GET /api/dashboard/vapi-call/:callId — Fetch call details from Vapi API
 */
router.get('/vapi-call/:callId', async (req, res) => {
  try {
    const config = require('../config');
    const apiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_api_key'").get()?.value || config.vapi.apiKey;
    if (!apiKey || apiKey.startsWith('your_')) {
      return res.json({ success: false, error: 'Vapi API key not configured' });
    }

    const axios = require('axios');
    const response = await axios.get(`https://api.vapi.ai/call/${req.params.callId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const call = response.data;
    res.json({
      success: true,
      transcript: call.transcript || '',
      summary: call.summary || '',
      recordingUrl: call.recordingUrl || '',
      duration: call.duration || (call.endedAt && call.startedAt
        ? Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000)
        : 0),
      status: call.status || '',
      endedReason: call.endedReason || '',
      messages: call.messages || [],
      analysis: call.analysis || {},
      artifact: call.artifact || {},
    });
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.message || err.message });
  }
});

/**
 * POST /api/dashboard/sync-vapi-transcript/:callLogId — Fetch from Vapi and save to DB
 */
router.post('/sync-vapi-transcript/:callLogId', async (req, res) => {
  try {
    const AICallLog = require('../models/AICallLog');
    const callLog = AICallLog.findById(parseInt(req.params.callLogId));
    if (!callLog) return res.json({ success: false, error: 'Call log not found' });

    const callSid = callLog.call_sid;
    if (!callSid || callSid.startsWith('dev_')) {
      return res.json({ success: false, error: 'No Vapi call ID for this call' });
    }

    const config = require('../config');
    const apiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'vapi_api_key'").get()?.value || config.vapi.apiKey;
    if (!apiKey || apiKey.startsWith('your_')) {
      return res.json({ success: false, error: 'Vapi API key not configured' });
    }

    const axios = require('axios');
    const response = await axios.get(`https://api.vapi.ai/call/${callSid}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const call = response.data;
    const analysis = call.analysis || {};
    const artifact = call.artifact || {};
    const transcript = call.transcript || artifact.transcript || '';
    const recordingUrl = call.recordingUrl || artifact.recordingUrl || '';
    const summary = call.summary || analysis.summary || '';
    const structuredData = analysis.structuredData || {};

    const updates = {};
    if (transcript) updates.transcript = transcript.substring(0, 10000);
    if (recordingUrl) updates.recording_url = recordingUrl;
    if (summary) updates.summary = summary;
    if (structuredData.interest_level) updates.interest_level = structuredData.interest_level;
    if (structuredData.outcome) updates.outcome = structuredData.outcome;
    if (Object.keys(structuredData).length) updates.structured_data = JSON.stringify(structuredData);

    const duration = call.duration || (call.endedAt && call.startedAt
      ? Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000)
      : 0);
    if (duration) updates.duration_seconds = duration;

    if (Object.keys(updates).length) {
      AICallLog.update(callLog.id, updates);
    }

    res.json({
      success: true,
      transcript,
      recordingUrl,
      summary,
      duration,
      updated: Object.keys(updates),
    });
  } catch (err) {
    res.json({ success: false, error: err.response?.data?.message || err.message });
  }
});

module.exports = router;
