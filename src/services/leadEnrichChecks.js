// ============================================
// Lead Enrichment Checks
// Phone type detection + Website reachability
// Zero new dependencies — uses libphonenumber-js + axios
// ============================================
const axios = require('axios');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

/**
 * Detect phone line type.
 * Uses libphonenumber-js heuristic (free, instant).
 * @param {string} phone - E.164 format e.g. +15551234567
 * @returns {Promise<string>} 'mobile' | 'landline' | 'voip' | 'unknown'
 */
async function detectPhoneType(phone) {
  if (!phone) return 'unknown';

  // Try libphonenumber-js heuristic first (free, no API call)
  const heuristic = heuristicPhoneType(phone);
  if (heuristic !== 'unknown') return heuristic;

  // Optional: Twilio Lookup v2 for higher confidence
  const twilioResult = await twilioLookup(phone);
  if (twilioResult) return twilioResult;

  return 'unknown';
}

/**
 * Heuristic phone type detection using libphonenumber-js.
 * Covers most US numbers accurately without API calls.
 */
function heuristicPhoneType(phone) {
  try {
    const parsed = parsePhoneNumberFromString(phone, 'US');
    if (!parsed || !parsed.isValid()) return 'unknown';

    const type = parsed.getType();
    if (type === 'MOBILE') return 'mobile';
    if (type === 'FIXED_LINE') return 'landline';
    if (type === 'VOIP') return 'voip';
    if (type === 'FIXED_LINE_OR_MOBILE') return 'landline'; // conservative
    return 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Try Twilio Lookup API (free with existing Twilio account for basic info).
 * Returns null if Twilio is not configured or lookup fails.
 */
async function twilioLookup(phone) {
  try {
    const twilio = require('../integrations/twilio');
    const client = twilio.getClient ? twilio.getClient() : null;
    if (!client) return null;

    const lookup = await client.lookups.v2.phoneNumbers(phone).fetch({
      fields: 'line_type_intelligence',
    });

    const lineType = lookup.lineTypeIntelligence?.type;
    if (lineType === 'mobile') return 'mobile';
    if (lineType === 'landline') return 'landline';
    if (lineType === 'voip') return 'voip';
    if (lineType === 'nonFixedVoip') return 'voip';
    return lineType || null;
  } catch (e) {
    // Twilio not configured or lookup failed — fall back silently
    return null;
  }
}

/**
 * Check if a website is reachable (HTTP HEAD, 5s timeout).
 * @param {string} url - Website URL (with or without protocol)
 * @returns {Promise<{ live: boolean, status: number|null }>}
 */
async function checkWebsite(url) {
  if (!url || url.length < 5) return { live: false, status: null };

  let fullUrl = url;
  if (!fullUrl.startsWith('http')) fullUrl = 'https://' + fullUrl;

  try {
    const response = await axios.head(fullUrl, {
      timeout: 5000,
      maxRedirects: 3,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)' },
    });
    return {
      live: response.status >= 200 && response.status < 400,
      status: response.status,
    };
  } catch (e) {
    // Try HTTP fallback if HTTPS fails
    try {
      const httpUrl = fullUrl.replace('https://', 'http://');
      const response = await axios.head(httpUrl, {
        timeout: 5000,
        maxRedirects: 3,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)' },
      });
      return {
        live: response.status >= 200 && response.status < 400,
        status: response.status,
      };
    } catch (e2) {
      return { live: false, status: null };
    }
  }
}

/**
 * Run phone + website checks in parallel for a lead.
 * @param {object} lead - { phone, website }
 * @returns {Promise<{ phone_line_type: string, website_live: boolean, website_status: number|null }>}
 */
async function enrichLead(lead) {
  const [phoneType, websiteResult] = await Promise.all([
    detectPhoneType(lead.phone),
    checkWebsite(lead.website),
  ]);

  return {
    phone_line_type: phoneType,
    website_live: websiteResult.live,
    website_status: websiteResult.status,
  };
}

module.exports = { detectPhoneType, checkWebsite, enrichLead };
