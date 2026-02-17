const axios = require('axios');
const config = require('../config');
const AdCampaign = require('../models/AdCampaign');

const API_BASE = 'https://ads-api.reddit.com/api/v3';

function isConfigured() {
  return config.reddit.clientId && config.reddit.clientSecret &&
    !config.reddit.clientId.startsWith('xxx');
}

function getAuth() {
  return AdCampaign.getAuth('reddit');
}

/**
 * Reddit uses client credentials — auto-refresh on every call
 */
async function getAccessToken() {
  const res = await axios.post('https://www.reddit.com/api/v1/access_token',
    'grant_type=client_credentials',
    {
      auth: { username: config.reddit.clientId, password: config.reddit.clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  return res.data.access_token;
}

function headers(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function createCampaign(adCampaign) {
  if (!isConfigured()) {
    console.log('[REDDIT-DEV] Would create campaign:', adCampaign.name);
    return { id: `dev_reddit_${Date.now()}`, status: 'PAUSED' };
  }

  const auth = getAuth();
  const accountId = auth?.account_id;
  if (!accountId) {
    console.log('[REDDIT-DEV] No account_id configured');
    return { id: `dev_reddit_${Date.now()}`, status: 'PAUSED' };
  }

  const token = await getAccessToken();
  const creative = JSON.parse(adCampaign.creative || '{}');
  const targeting = JSON.parse(adCampaign.targeting || '{}');

  // Create campaign
  const campaignRes = await axios.post(`${API_BASE}/accounts/${accountId}/campaigns`, {
    name: adCampaign.name,
    objective: adCampaign.objective === 'lead_generation' ? 'CONVERSIONS' : 'TRAFFIC',
    daily_budget_micro: Math.round(adCampaign.daily_budget * 1000000),
    start_time: adCampaign.start_date || undefined,
    end_time: adCampaign.end_date || undefined,
    is_paid: true,
    configured_status: 'PAUSED',
  }, { headers: headers(token) });

  const campaignId = campaignRes.data.data?.id;

  // Create ad group
  const adGroupRes = await axios.post(`${API_BASE}/accounts/${accountId}/adgroups`, {
    campaign_id: campaignId,
    name: `${adCampaign.name} - Ad Group`,
    bid_strategy: 'CPM',
    bid_micro: 5000000, // $5 CPM default
    target: {
      geos: targeting.geos || [{ country: 'US' }],
      interests: targeting.interests || [],
      subreddits: targeting.subreddits || [],
    },
    configured_status: 'PAUSED',
  }, { headers: headers(token) });

  const adGroupId = adGroupRes.data.data?.id;

  // Create ad (link ad type — directs to landing page with UTM)
  await axios.post(`${API_BASE}/accounts/${accountId}/ads`, {
    adgroup_id: adGroupId,
    name: `${adCampaign.name} - Ad`,
    click_url: `${config.baseUrl}/capture?utm_source=reddit&utm_campaign=${adCampaign.id}`,
    headline: creative.headline || adCampaign.name,
    configured_status: 'PAUSED',
  }, { headers: headers(token) });

  console.log(`[REDDIT] Campaign created: ${campaignId}`);
  return { id: String(campaignId), status: 'PAUSED' };
}

async function pauseCampaign(platformCampaignId) {
  if (!isConfigured()) {
    console.log(`[REDDIT-DEV] Would pause campaign ${platformCampaignId}`);
    return;
  }
  const auth = getAuth();
  const token = await getAccessToken();
  await axios.put(`${API_BASE}/accounts/${auth.account_id}/campaigns/${platformCampaignId}`, {
    configured_status: 'PAUSED',
  }, { headers: headers(token) });
}

async function resumeCampaign(platformCampaignId) {
  if (!isConfigured()) {
    console.log(`[REDDIT-DEV] Would resume campaign ${platformCampaignId}`);
    return;
  }
  const auth = getAuth();
  const token = await getAccessToken();
  await axios.put(`${API_BASE}/accounts/${auth.account_id}/campaigns/${platformCampaignId}`, {
    configured_status: 'ACTIVE',
  }, { headers: headers(token) });
}

async function getCampaignMetrics(platformCampaignId) {
  if (!isConfigured()) {
    return { impressions: 0, clicks: 0, spend: 0, leads: 0 };
  }

  const auth = getAuth();
  const token = await getAccessToken();
  const res = await axios.get(`${API_BASE}/accounts/${auth.account_id}/campaigns/${platformCampaignId}/report`, {
    params: { group_by: 'campaign' },
    headers: headers(token),
  });

  const data = res.data.data?.[0] || {};
  return {
    impressions: parseInt(data.impressions || 0),
    clicks: parseInt(data.clicks || 0),
    spend: (parseInt(data.spend_micro || 0) / 1000000),
    leads: parseInt(data.conversions || 0),
  };
}

module.exports = {
  createCampaign, pauseCampaign, resumeCampaign,
  getCampaignMetrics, getAccessToken, isConfigured,
};
