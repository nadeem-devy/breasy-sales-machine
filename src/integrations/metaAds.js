const axios = require('axios');
const config = require('../config');
const AdCampaign = require('../models/AdCampaign');

const API_BASE = `https://graph.facebook.com/${config.meta.apiVersion}`;

function isConfigured() {
  return config.meta.appId && config.meta.appSecret &&
    !config.meta.appId.startsWith('xxx');
}

function getAuth() {
  return AdCampaign.getAuth('facebook');
}

function headers(accessToken) {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Create a campaign on Meta (Facebook/Instagram)
 */
async function createCampaign(adCampaign) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log('[META-DEV] Would create campaign:', adCampaign.name);
    return { id: `dev_meta_${Date.now()}`, status: 'PAUSED' };
  }

  const accountId = auth.account_id;
  const creative = JSON.parse(adCampaign.creative || '{}');
  const targeting = JSON.parse(adCampaign.targeting || '{}');

  // Step 1: Create campaign
  const campaignRes = await axios.post(`${API_BASE}/act_${accountId}/campaigns`, {
    name: adCampaign.name,
    objective: adCampaign.objective === 'lead_generation' ? 'OUTCOME_LEADS' : 'OUTCOME_TRAFFIC',
    status: 'PAUSED',
    special_ad_categories: [],
  }, { headers: headers(auth.access_token) });

  const campaignId = campaignRes.data.id;

  // Step 2: Create ad set
  const adSetRes = await axios.post(`${API_BASE}/act_${accountId}/adsets`, {
    name: `${adCampaign.name} - Ad Set`,
    campaign_id: campaignId,
    daily_budget: Math.round(adCampaign.daily_budget * 100), // cents
    billing_event: 'IMPRESSIONS',
    optimization_goal: adCampaign.objective === 'lead_generation' ? 'LEAD_GENERATION' : 'LINK_CLICKS',
    targeting: {
      geo_locations: targeting.locations || { countries: ['US'] },
      age_min: targeting.age_min || 25,
      age_max: targeting.age_max || 65,
      interests: (targeting.interests || []).map(i => ({ id: i.id, name: i.name })),
    },
    start_time: adCampaign.start_date || undefined,
    end_time: adCampaign.end_date || undefined,
    status: 'PAUSED',
  }, { headers: headers(auth.access_token) });

  // Step 3: Create ad creative
  const adCreativeRes = await axios.post(`${API_BASE}/act_${accountId}/adcreatives`, {
    name: `${adCampaign.name} - Creative`,
    object_story_spec: {
      page_id: auth.extra ? JSON.parse(auth.extra).page_id : undefined,
      link_data: {
        message: creative.body || '',
        link: creative.link || config.baseUrl,
        name: creative.headline || adCampaign.name,
        call_to_action: { type: creative.cta || 'LEARN_MORE' },
        image_hash: creative.image_hash || undefined,
      },
    },
  }, { headers: headers(auth.access_token) });

  // Step 4: Create ad
  await axios.post(`${API_BASE}/act_${accountId}/ads`, {
    name: `${adCampaign.name} - Ad`,
    adset_id: adSetRes.data.id,
    creative: { creative_id: adCreativeRes.data.id },
    status: 'PAUSED',
  }, { headers: headers(auth.access_token) });

  console.log(`[META] Campaign created: ${campaignId}`);
  return { id: campaignId, status: 'PAUSED' };
}

async function pauseCampaign(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log(`[META-DEV] Would pause campaign ${platformCampaignId}`);
    return;
  }
  await axios.post(`${API_BASE}/${platformCampaignId}`, { status: 'PAUSED' }, { headers: headers(auth.access_token) });
}

async function resumeCampaign(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log(`[META-DEV] Would resume campaign ${platformCampaignId}`);
    return;
  }
  await axios.post(`${API_BASE}/${platformCampaignId}`, { status: 'ACTIVE' }, { headers: headers(auth.access_token) });
}

async function getCampaignMetrics(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    return { impressions: 0, clicks: 0, spend: 0, leads: 0 };
  }

  const res = await axios.get(`${API_BASE}/${platformCampaignId}/insights`, {
    params: {
      fields: 'impressions,clicks,spend,actions',
      date_preset: 'lifetime',
    },
    headers: headers(auth.access_token),
  });

  const data = res.data.data?.[0] || {};
  const leadActions = (data.actions || []).find(a => a.action_type === 'lead');
  return {
    impressions: parseInt(data.impressions || 0),
    clicks: parseInt(data.clicks || 0),
    spend: parseFloat(data.spend || 0),
    leads: parseInt(leadActions?.value || 0),
  };
}

async function getDailyMetrics(platformCampaignId, since) {
  const auth = getAuth();
  if (!auth || !isConfigured()) return [];

  const res = await axios.get(`${API_BASE}/${platformCampaignId}/insights`, {
    params: {
      fields: 'impressions,clicks,spend,actions',
      time_increment: 1,
      since: since,
    },
    headers: headers(auth.access_token),
  });

  return (res.data.data || []).map(day => {
    const leadActions = (day.actions || []).find(a => a.action_type === 'lead');
    return {
      date: day.date_start,
      impressions: parseInt(day.impressions || 0),
      clicks: parseInt(day.clicks || 0),
      spend: parseFloat(day.spend || 0),
      leads: parseInt(leadActions?.value || 0),
    };
  });
}

/**
 * Exchange short-lived token for long-lived token
 */
async function exchangeToken(shortLivedToken) {
  const res = await axios.get(`${API_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });
  return {
    access_token: res.data.access_token,
    expires_in: res.data.expires_in,
  };
}

async function refreshToken(existingToken) {
  // Meta long-lived tokens last 60 days; re-exchange before expiry
  return exchangeToken(existingToken);
}

module.exports = {
  createCampaign, pauseCampaign, resumeCampaign,
  getCampaignMetrics, getDailyMetrics,
  exchangeToken, refreshToken, isConfigured,
};
