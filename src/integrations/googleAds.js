const axios = require('axios');
const config = require('../config');
const AdCampaign = require('../models/AdCampaign');

const API_BASE = 'https://googleads.googleapis.com/v18';

function isConfigured() {
  return config.googleAds.clientId && config.googleAds.developerToken &&
    !config.googleAds.clientId.startsWith('xxx');
}

function getAuth() {
  return AdCampaign.getAuth('google');
}

function headers(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': config.googleAds.developerToken,
    'login-customer-id': config.googleAds.customerId,
  };
}

async function createCampaign(adCampaign) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log('[GOOGLE-DEV] Would create campaign:', adCampaign.name);
    return { id: `dev_google_${Date.now()}`, status: 'PAUSED' };
  }

  const customerId = config.googleAds.customerId;
  const creative = JSON.parse(adCampaign.creative || '{}');
  const targeting = JSON.parse(adCampaign.targeting || '{}');

  // Create campaign budget
  const budgetRes = await axios.post(
    `${API_BASE}/customers/${customerId}/campaignBudgets:mutate`,
    {
      operations: [{
        create: {
          name: `${adCampaign.name} Budget`,
          amountMicros: Math.round(adCampaign.daily_budget * 1000000).toString(),
          deliveryMethod: 'STANDARD',
        },
      }],
    },
    { headers: headers(auth.access_token) }
  );
  const budgetResourceName = budgetRes.data.results[0].resourceName;

  // Create campaign
  const campaignRes = await axios.post(
    `${API_BASE}/customers/${customerId}/campaigns:mutate`,
    {
      operations: [{
        create: {
          name: adCampaign.name,
          advertisingChannelType: 'SEARCH',
          status: 'PAUSED',
          campaignBudget: budgetResourceName,
          startDate: adCampaign.start_date ? adCampaign.start_date.replace(/-/g, '') : undefined,
          endDate: adCampaign.end_date ? adCampaign.end_date.replace(/-/g, '') : undefined,
        },
      }],
    },
    { headers: headers(auth.access_token) }
  );

  const campaignResourceName = campaignRes.data.results[0].resourceName;
  const campaignId = campaignResourceName.split('/').pop();

  console.log(`[GOOGLE] Campaign created: ${campaignId}`);
  return { id: campaignId, status: 'PAUSED' };
}

async function pauseCampaign(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log(`[GOOGLE-DEV] Would pause campaign ${platformCampaignId}`);
    return;
  }
  const customerId = config.googleAds.customerId;
  await axios.post(
    `${API_BASE}/customers/${customerId}/campaigns:mutate`,
    {
      operations: [{
        update: {
          resourceName: `customers/${customerId}/campaigns/${platformCampaignId}`,
          status: 'PAUSED',
        },
        updateMask: 'status',
      }],
    },
    { headers: headers(auth.access_token) }
  );
}

async function resumeCampaign(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    console.log(`[GOOGLE-DEV] Would resume campaign ${platformCampaignId}`);
    return;
  }
  const customerId = config.googleAds.customerId;
  await axios.post(
    `${API_BASE}/customers/${customerId}/campaigns:mutate`,
    {
      operations: [{
        update: {
          resourceName: `customers/${customerId}/campaigns/${platformCampaignId}`,
          status: 'ENABLED',
        },
        updateMask: 'status',
      }],
    },
    { headers: headers(auth.access_token) }
  );
}

async function getCampaignMetrics(platformCampaignId) {
  const auth = getAuth();
  if (!auth || !isConfigured()) {
    return { impressions: 0, clicks: 0, spend: 0, leads: 0 };
  }

  const customerId = config.googleAds.customerId;
  const res = await axios.post(
    `${API_BASE}/customers/${customerId}/googleAds:searchStream`,
    {
      query: `SELECT campaign.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
              FROM campaign WHERE campaign.id = ${platformCampaignId}`,
    },
    { headers: headers(auth.access_token) }
  );

  const row = res.data[0]?.results?.[0]?.metrics || {};
  return {
    impressions: parseInt(row.impressions || 0),
    clicks: parseInt(row.clicks || 0),
    spend: (parseInt(row.costMicros || 0) / 1000000),
    leads: parseInt(row.conversions || 0),
  };
}

async function getLeadFormSubmissions(formId, since) {
  const auth = getAuth();
  if (!auth || !isConfigured()) return [];

  const customerId = config.googleAds.customerId;
  const res = await axios.post(
    `${API_BASE}/customers/${customerId}/googleAds:searchStream`,
    {
      query: `SELECT lead_form_submission_data.id, lead_form_submission_data.lead_form_submission_fields,
              lead_form_submission_data.submission_date_time
              FROM lead_form_submission_data
              WHERE lead_form_submission_data.lead_form = 'customers/${customerId}/assets/${formId}'
              ${since ? `AND lead_form_submission_data.submission_date_time > '${since}'` : ''}`,
    },
    { headers: headers(auth.access_token) }
  );

  return (res.data[0]?.results || []).map(r => {
    const fields = {};
    (r.leadFormSubmissionData?.leadFormSubmissionFields || []).forEach(f => {
      fields[f.fieldType.toLowerCase()] = f.fieldValue;
    });
    return {
      id: r.leadFormSubmissionData?.id,
      submitted_at: r.leadFormSubmissionData?.submissionDateTime,
      ...fields,
    };
  });
}

async function refreshToken(refreshTokenValue) {
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: config.googleAds.clientId,
    client_secret: config.googleAds.clientSecret,
    refresh_token: refreshTokenValue,
    grant_type: 'refresh_token',
  });
  return {
    access_token: res.data.access_token,
    expires_in: res.data.expires_in,
  };
}

module.exports = {
  createCampaign, pauseCampaign, resumeCampaign,
  getCampaignMetrics, getLeadFormSubmissions, refreshToken, isConfigured,
};
