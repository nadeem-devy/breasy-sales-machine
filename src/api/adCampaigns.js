const express = require('express');
const router = express.Router();
const AdCampaign = require('../models/AdCampaign');
const TrackingVisit = require('../models/TrackingVisit');
const { parseAdUrl } = require('../utils/adUrlParser');
const config = require('../config');

// Integration clients (lazy-loaded per platform)
function getClient(platform) {
  const map = {
    facebook: '../integrations/metaAds',
    instagram: '../integrations/metaAds',
    google: '../integrations/googleAds',
    linkedin: '../integrations/linkedinAds',
    reddit: '../integrations/redditAds',
  };
  return require(map[platform]);
}

// GET /api/ad-campaigns — List all
router.get('/', (req, res) => {
  const filters = {};
  if (req.query.platform) filters.platform = req.query.platform;
  if (req.query.status) filters.status = req.query.status;
  if (req.query.is_external !== undefined) filters.is_external = req.query.is_external;
  const campaigns = AdCampaign.getAll(filters);
  res.json(campaigns);
});

// GET /api/ad-campaigns/overview — Cross-platform summary
router.get('/overview', (req, res) => {
  const overview = AdCampaign.getOverview();
  const authStatus = AdCampaign.getAllAuth();
  res.json({ ...overview, platforms: authStatus });
});

// GET /api/ad-campaigns/auth/:platform — Check auth status
router.get('/auth/:platform', (req, res) => {
  const auth = AdCampaign.getAuth(req.params.platform);
  res.json({
    connected: !!auth,
    account_id: auth?.account_id || null,
    token_expiry: auth?.token_expiry || null,
    updated_at: auth?.updated_at || null,
  });
});

// POST /api/ad-campaigns/auth/:platform — Save OAuth tokens
router.post('/auth/:platform', (req, res) => {
  const { platform } = req.params;
  const { access_token, refresh_token, token_expiry, account_id, extra } = req.body;

  AdCampaign.saveAuth(platform, {
    access_token, refresh_token, token_expiry, account_id,
    extra: extra || {},
  });

  res.json({ success: true, message: `${platform} connected` });
});

// DELETE /api/ad-campaigns/auth/:platform — Disconnect
router.delete('/auth/:platform', (req, res) => {
  AdCampaign.deleteAuth(req.params.platform);
  res.json({ success: true, message: `${req.params.platform} disconnected` });
});

// GET /api/ad-campaigns/auth/:platform/callback — OAuth callback
router.get('/auth/:platform/callback', async (req, res) => {
  const { platform } = req.params;
  const { code } = req.query;

  if (!code) return res.status(400).send('Missing authorization code');

  try {
    let tokens, accountId;
    const redirectUri = `${config.baseUrl}/api/ad-campaigns/auth/${platform}/callback`;

    if (platform === 'facebook' || platform === 'instagram') {
      const axios = require('axios');
      // Exchange code for token
      const tokenRes = await axios.get(`https://graph.facebook.com/${config.meta.apiVersion}/oauth/access_token`, {
        params: {
          client_id: config.meta.appId,
          client_secret: config.meta.appSecret,
          redirect_uri: redirectUri,
          code,
        },
      });

      // Exchange for long-lived token
      const metaAds = require('../integrations/metaAds');
      const longLived = await metaAds.exchangeToken(tokenRes.data.access_token);

      // Get ad accounts
      const accountsRes = await axios.get(`https://graph.facebook.com/${config.meta.apiVersion}/me/adaccounts`, {
        params: { access_token: longLived.access_token, fields: 'id,name,account_id' },
      });
      accountId = accountsRes.data.data?.[0]?.account_id;

      // Get page ID
      const pagesRes = await axios.get(`https://graph.facebook.com/${config.meta.apiVersion}/me/accounts`, {
        params: { access_token: longLived.access_token },
      });
      const pageId = pagesRes.data.data?.[0]?.id;

      tokens = {
        access_token: longLived.access_token,
        token_expiry: new Date(Date.now() + (longLived.expires_in || 5184000) * 1000).toISOString(),
        account_id: accountId,
        extra: { page_id: pageId },
      };

      // Save for both facebook and instagram (same auth)
      AdCampaign.saveAuth('facebook', tokens);
      AdCampaign.saveAuth('instagram', tokens);

    } else if (platform === 'google') {
      const axios = require('axios');
      const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: config.googleAds.clientId,
        client_secret: config.googleAds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      });

      tokens = {
        access_token: tokenRes.data.access_token,
        refresh_token: tokenRes.data.refresh_token,
        token_expiry: new Date(Date.now() + tokenRes.data.expires_in * 1000).toISOString(),
        account_id: config.googleAds.customerId,
      };
      AdCampaign.saveAuth('google', tokens);

    } else if (platform === 'linkedin') {
      const axios = require('axios');
      const tokenRes = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
        params: {
          grant_type: 'authorization_code',
          code,
          client_id: config.linkedin.clientId,
          client_secret: config.linkedin.clientSecret,
          redirect_uri: redirectUri,
        },
      });

      // Get ad accounts
      const accountsRes = await axios.get('https://api.linkedin.com/rest/adAccounts', {
        headers: {
          Authorization: `Bearer ${tokenRes.data.access_token}`,
          'LinkedIn-Version': '202401',
        },
        params: { q: 'search' },
      });
      accountId = accountsRes.data.elements?.[0]?.id;

      tokens = {
        access_token: tokenRes.data.access_token,
        refresh_token: tokenRes.data.refresh_token,
        token_expiry: new Date(Date.now() + tokenRes.data.expires_in * 1000).toISOString(),
        account_id: accountId,
      };
      AdCampaign.saveAuth('linkedin', tokens);
    }

    res.redirect('/settings?connected=' + platform);
  } catch (err) {
    console.error(`[AUTH] ${platform} OAuth error:`, err.message);
    res.redirect('/settings?auth_error=' + encodeURIComponent(err.message));
  }
});

// POST /api/ad-campaigns/parse-url — Parse campaign URL
router.post('/parse-url', (req, res) => {
  const result = parseAdUrl(req.body.url);
  if (!result) return res.status(400).json({ error: 'Could not parse URL' });
  const auth = result.platform ? AdCampaign.getAuth(result.platform) : null;
  res.json({ ...result, auth_connected: !!auth });
});

// POST /api/ad-campaigns/track-external — Create externally tracked campaign
router.post('/track-external', (req, res) => {
  const { url_or_id, platform, name, landing_page_url, daily_budget, total_budget,
          start_date, end_date, objective } = req.body;

  const parsed = parseAdUrl(url_or_id);
  const finalPlatform = platform || parsed?.platform;

  if (!finalPlatform) {
    return res.status(400).json({ error: 'Could not detect platform. Please provide a valid campaign URL or select a platform.' });
  }
  if (!name) {
    return res.status(400).json({ error: 'Campaign name is required.' });
  }

  const auth = AdCampaign.getAuth(finalPlatform);

  const campaign = AdCampaign.createExternal({
    platform: finalPlatform,
    name,
    platform_campaign_id: parsed?.campaignId || null,
    external_url: parsed?.url || url_or_id,
    landing_page_url: landing_page_url || null,
    daily_budget: parseFloat(daily_budget) || 0,
    total_budget: parseFloat(total_budget) || 0,
    start_date: start_date || null,
    end_date: end_date || null,
    objective: objective || 'lead_generation',
    manual_metrics: !auth,
  });

  res.status(201).json({ ...campaign, auth_connected: !!auth });
});

// GET /api/ad-campaigns/:id — Single campaign
router.get('/:id', (req, res) => {
  const campaign = AdCampaign.findById(parseInt(req.params.id));
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json(campaign);
});

// POST /api/ad-campaigns — Create draft
router.post('/', (req, res) => {
  const campaign = AdCampaign.create(req.body);
  res.status(201).json(campaign);
});

// PUT /api/ad-campaigns/:id — Update draft
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const campaign = AdCampaign.findById(id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'draft') return res.status(400).json({ error: 'Can only edit draft campaigns' });

  const updated = AdCampaign.update(id, req.body);
  res.json(updated);
});

// POST /api/ad-campaigns/:id/publish — Push to platform
router.post('/:id/publish', async (req, res) => {
  const id = parseInt(req.params.id);
  const campaign = AdCampaign.findById(id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  try {
    AdCampaign.updateStatus(id, 'pending');
    const client = getClient(campaign.platform);
    const result = await client.createCampaign(campaign);

    AdCampaign.update(id, {
      platform_campaign_id: result.id,
      status: 'active',
      error_message: null,
    });

    // Now activate on platform
    if (result.status === 'PAUSED' && result.id && !result.id.startsWith('dev_')) {
      await client.resumeCampaign(result.id);
    }

    res.json({ success: true, platform_campaign_id: result.id });
  } catch (err) {
    AdCampaign.updateStatus(id, 'error', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ad-campaigns/:id/pause
router.post('/:id/pause', async (req, res) => {
  const id = parseInt(req.params.id);
  const campaign = AdCampaign.findById(id);
  if (!campaign || !campaign.platform_campaign_id) return res.status(404).json({ error: 'Campaign not found or not published' });

  try {
    const client = getClient(campaign.platform);
    await client.pauseCampaign(campaign.platform_campaign_id);
    AdCampaign.updateStatus(id, 'paused');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ad-campaigns/:id/resume
router.post('/:id/resume', async (req, res) => {
  const id = parseInt(req.params.id);
  const campaign = AdCampaign.findById(id);
  if (!campaign || !campaign.platform_campaign_id) return res.status(404).json({ error: 'Campaign not found or not published' });

  try {
    const client = getClient(campaign.platform);
    await client.resumeCampaign(campaign.platform_campaign_id);
    AdCampaign.updateStatus(id, 'active');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/ad-campaigns/:id — Delete draft only
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const campaign = AdCampaign.findById(id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'draft') return res.status(400).json({ error: 'Can only delete draft campaigns' });

  AdCampaign.delete(id);
  res.json({ success: true });
});

// GET /api/ad-campaigns/:id/metrics — Daily metrics for charts
router.get('/:id/metrics', (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const metrics = AdCampaign.getDailyMetrics(parseInt(req.params.id), days);
  res.json(metrics);
});

// PUT /api/ad-campaigns/:id/manual-metrics — Manual metric entry
router.put('/:id/manual-metrics', (req, res) => {
  const id = parseInt(req.params.id);
  const campaign = AdCampaign.findById(id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const { impressions, clicks, spend, leads_captured } = req.body;
  const updated = AdCampaign.updateManualMetrics(id, { impressions, clicks, spend, leads_captured });

  const today = new Date().toISOString().split('T')[0];
  AdCampaign.insertDailyMetrics(id, today, {
    impressions: impressions || 0,
    clicks: clicks || 0,
    spend: spend || 0,
    leads: leads_captured || 0,
    cpl: leads_captured > 0 ? Math.round((spend / leads_captured) * 100) / 100 : 0,
  });

  res.json(updated);
});

// POST /api/ad-campaigns/capture-lead — Link a landing page form submission to a tracking visit
router.post('/capture-lead', (req, res) => {
  const { breasy_vid, breasy_cid, first_name, last_name, email, phone, company_name } = req.body;

  if (!breasy_vid) {
    return res.status(400).json({ error: 'Missing visitor ID (breasy_vid)' });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: 'Email or phone is required' });
  }

  const Lead = require('../models/Lead');
  const Activity = require('../models/Activity');

  // Check for existing lead by email/phone to avoid duplicates
  const existing = Lead.findDuplicate(phone || '', email || '');
  if (existing) {
    // Link existing lead to tracking visit
    TrackingVisit.linkToLead(breasy_vid, existing.id);
    return res.json({ success: true, lead_id: existing.id, linked: true, message: 'Existing lead linked to ad click' });
  }

  // Determine campaign context from visitor ID
  const visit = TrackingVisit.findByVisitorId(breasy_vid);
  const campaignId = breasy_cid ? parseInt(breasy_cid) : (visit ? visit.ad_campaign_id : null);
  const campaign = campaignId ? AdCampaign.findById(campaignId) : null;

  // Create new lead
  const lead = Lead.create({
    first_name: first_name || '',
    last_name: last_name || '',
    email: email || '',
    phone: phone || '',
    company_name: company_name || '',
    source: 'manual',
    ad_campaign_id: campaignId,
    ad_platform: campaign ? campaign.platform : null,
  });

  // Link tracking visit to lead
  TrackingVisit.linkToLead(breasy_vid, lead.id);

  // Increment leads_captured on campaign
  if (campaign) {
    AdCampaign.updateManualMetrics(campaignId, {
      impressions: campaign.impressions || 0,
      clicks: campaign.clicks || 0,
      spend: campaign.spend || 0,
      leads_captured: (campaign.leads_captured || 0) + 1,
    });
  }

  Activity.create({
    lead_id: lead.id,
    type: 'ad_lead_captured',
    channel: 'system',
    direction: 'inbound',
    content: 'Lead captured from ad tracking link',
    metadata: JSON.stringify({ visitor_id: breasy_vid, campaign_id: campaignId, platform: campaign?.platform }),
  });

  res.status(201).json({ success: true, lead_id: lead.id, linked: true, message: 'Lead created and linked to ad click' });
});

// GET /api/ad-campaigns/:id/tracking-visits — Tracking visit data
router.get('/:id/tracking-visits', (req, res) => {
  const id = parseInt(req.params.id);
  const visits = TrackingVisit.getByCampaign(id, parseInt(req.query.limit) || 100);
  const stats = TrackingVisit.getStatsByCampaign(id);
  const dailyVisits = TrackingVisit.getDailyVisits(id, parseInt(req.query.days) || 30);
  res.json({ visits, stats, dailyVisits });
});

module.exports = router;
