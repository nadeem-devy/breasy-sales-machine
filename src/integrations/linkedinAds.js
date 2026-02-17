const axios = require('axios');
const config = require('../config');
const AdCampaign = require('../models/AdCampaign');

const API_BASE = 'https://api.linkedin.com/rest';

function isConfigured() {
  return config.linkedin.clientId && config.linkedin.clientSecret &&
    !config.linkedin.clientId.startsWith('xxx');
}

function getAuth() {
  return AdCampaign.getAuth('linkedin');
}

function headers(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'LinkedIn-Version': '202401',
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

async function createCampaign(adCampaign) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log('[LINKEDIN-DEV] Would create campaign:', adCampaign.name);
    return { id: `dev_linkedin_${Date.now()}`, status: 'PAUSED' };
  }

  const accountId = auth.account_id;
  const creative = JSON.parse(adCampaign.creative || '{}');
  const targeting = JSON.parse(adCampaign.targeting || '{}');

  // Step 1: Create campaign group
  const groupRes = await axios.post(`${API_BASE}/adCampaignGroups`, {
    account: `urn:li:sponsoredAccount:${accountId}`,
    name: adCampaign.name,
    status: 'ACTIVE',
  }, { headers: headers(auth.access_token) });

  const groupId = groupRes.headers['x-restli-id'];

  // Step 2: Create campaign
  const objectiveMap = {
    lead_generation: 'LEAD_GENERATION',
    traffic: 'WEBSITE_VISITS',
    awareness: 'BRAND_AWARENESS',
  };

  const campaignRes = await axios.post(`${API_BASE}/adCampaigns`, {
    account: `urn:li:sponsoredAccount:${accountId}`,
    campaignGroup: `urn:li:sponsoredCampaignGroup:${groupId}`,
    name: `${adCampaign.name} - Campaign`,
    objective: objectiveMap[adCampaign.objective] || 'LEAD_GENERATION',
    type: 'SPONSORED_UPDATES',
    status: 'PAUSED',
    costType: 'CPM',
    dailyBudget: { amount: String(adCampaign.daily_budget), currencyCode: 'USD' },
    targetingCriteria: {
      include: {
        and: [
          { or: { 'urn:li:adTargetingFacet:locations': targeting.locations || ['urn:li:geo:103644278'] } },
        ],
      },
    },
    runSchedule: {
      start: adCampaign.start_date ? new Date(adCampaign.start_date).getTime() : Date.now(),
      end: adCampaign.end_date ? new Date(adCampaign.end_date).getTime() : undefined,
    },
  }, { headers: headers(auth.access_token) });

  const campaignId = campaignRes.headers['x-restli-id'];
  console.log(`[LINKEDIN] Campaign created: ${campaignId}`);
  return { id: campaignId, status: 'PAUSED' };
}

async function pauseCampaign(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log(`[LINKEDIN-DEV] Would pause campaign ${platformCampaignId}`);
    return;
  }
  await axios.post(`${API_BASE}/adCampaigns/${platformCampaignId}`, {
    status: 'PAUSED',
    patch: { $set: { status: 'PAUSED' } },
  }, { headers: headers(auth.access_token) });
}

async function resumeCampaign(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log(`[LINKEDIN-DEV] Would resume campaign ${platformCampaignId}`);
    return;
  }
  await axios.post(`${API_BASE}/adCampaigns/${platformCampaignId}`, {
    status: 'ACTIVE',
    patch: { $set: { status: 'ACTIVE' } },
  }, { headers: headers(auth.access_token) });
}

async function getCampaignMetrics(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    return { impressions: 0, clicks: 0, spend: 0, leads: 0 };
  }

  const res = await axios.get(`${API_BASE}/adAnalytics`, {
    params: {
      q: 'analytics',
      pivot: 'CAMPAIGN',
      campaigns: `urn:li:sponsoredCampaign:${platformCampaignId}`,
      dateRange: '(start:(year:2024,month:1,day:1))',
      timeGranularity: 'ALL',
      fields: 'impressions,clicks,costInLocalCurrency,leadGenerationMailContactInfoShares',
    },
    headers: headers(auth.access_token),
  });

  const data = res.data.elements?.[0] || {};
  return {
    impressions: parseInt(data.impressions || 0),
    clicks: parseInt(data.clicks || 0),
    spend: parseFloat(data.costInLocalCurrency || 0),
    leads: parseInt(data.leadGenerationMailContactInfoShares || 0),
  };
}

async function refreshToken(refreshTokenValue) {
  const res = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
    params: {
      grant_type: 'refresh_token',
      refresh_token: refreshTokenValue,
      client_id: config.linkedin.clientId,
      client_secret: config.linkedin.clientSecret,
    },
  });
  return {
    access_token: res.data.access_token,
    expires_in: res.data.expires_in,
    refresh_token: res.data.refresh_token,
  };
}

module.exports = {
  createCampaign, pauseCampaign, resumeCampaign,
  getCampaignMetrics, refreshToken, isConfigured,
};
