const axios = require('axios');
const config = require('../config');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const AICallLog = require('../models/AICallLog');

const VAPI_BASE_URL = 'https://api.vapi.ai';

function getHeaders() {
  return {
    'Authorization': `Bearer ${config.vapi.apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Initiate an AI phone call to a lead via Vapi
 */
async function initiateCall(leadId) {
  const lead = Lead.findById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Safety checks
  if (lead.call_opt_out) throw new Error('Lead has opted out of calls');
  if (!lead.phone) throw new Error('Lead has no phone number');

  // Check max call attempts
  const noAnswerCount = AICallLog.countNoAnswerForLead(leadId);
  if (noAnswerCount >= 3) {
    throw new Error(`Lead has ${noAnswerCount} unanswered calls (max 3). No more attempts.`);
  }

  // Check daily limit
  const todayCalls = AICallLog.countTodayCalls();
  if (todayCalls >= config.limits.callsDailyLimit) {
    throw new Error(`Daily call limit reached (${todayCalls}/${config.limits.callsDailyLimit})`);
  }

  const payload = {
    assistantId: config.vapi.assistantId,
    phoneNumberId: config.vapi.phoneNumberId,
    customer: {
      number: lead.phone,
      name: lead.first_name,
    },
    assistantOverrides: {
      variableValues: {
        lead_name: lead.first_name || 'there',
        company_name: lead.company_name || 'your business',
        service_type: lead.service_type || 'field service',
        city: lead.city || 'your area',
        industry: lead.industry || 'your industry',
      },
    },
  };

  if (config.vapi.apiKey && !config.vapi.apiKey.startsWith('your_')) {
    // Validate required Vapi config
    if (!config.vapi.assistantId) throw new Error('Vapi Assistant ID not configured. Set VAPI_ASSISTANT_ID in Settings.');
    if (!config.vapi.phoneNumberId) throw new Error('Vapi Phone Number ID not configured. Set VAPI_PHONE_NUMBER_ID in Settings.');

    try {
      const response = await axios.post(`${VAPI_BASE_URL}/call/phone`, payload, {
        headers: getHeaders(),
      });

      const callLog = AICallLog.create({
        lead_id: leadId,
        call_sid: response.data.id,
        status: 'initiated',
      });

      Lead.update(leadId, {
        total_calls_made: lead.total_calls_made + 1,
        last_contacted_at: new Date().toISOString(),
        status: lead.status === 'new' ? 'lead' : lead.status,
      });

      Activity.create({
        lead_id: leadId,
        type: 'call_initiated',
        channel: 'call',
        direction: 'outbound',
        content: `AI call initiated to ${lead.phone}`,
        metadata: { call_sid: response.data.id, vapi_call_id: response.data.id },
      });

      console.log(`[VAPI] Call initiated to ${lead.phone} (ID: ${response.data.id})`);
      return response.data;
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message;
      Activity.create({
        lead_id: leadId,
        type: 'call_failed',
        channel: 'call',
        direction: 'outbound',
        content: `Failed: ${errMsg}`,
      });
      console.error(`[VAPI] Call failed for lead #${leadId}: ${errMsg}`);
      throw new Error(`Vapi API error: ${errMsg}`);
    }
  }

  // Dev mode
  console.log(`[VAPI-DEV] Would call ${lead.phone} (${lead.first_name} at ${lead.company_name})`);

  const callLog = AICallLog.create({
    lead_id: leadId,
    call_sid: `dev_call_${Date.now()}`,
    status: 'initiated',
  });

  Lead.update(leadId, {
    total_calls_made: lead.total_calls_made + 1,
    last_contacted_at: new Date().toISOString(),
    status: lead.status === 'new' ? 'lead' : lead.status,
  });

  Activity.create({
    lead_id: leadId,
    type: 'call_initiated',
    channel: 'call',
    direction: 'outbound',
    content: `[DEV] AI call initiated to ${lead.phone}`,
    metadata: { dev_mode: true },
  });

  return { id: `dev_call_${Date.now()}`, status: 'dev_initiated' };
}

/**
 * Create or update the inbound receptionist assistant on Vapi
 */
async function deployInboundAssistant(transferNumber, webhookUrl) {
  if (!config.vapi.apiKey || config.vapi.apiKey.startsWith('your_')) {
    console.log('[VAPI-DEV] Would deploy inbound assistant (dev mode)');
    return { id: 'dev_inbound_' + Date.now(), status: 'dev_created' };
  }

  const inboundConfig = require('../../scripts/vapi-inbound-config.json');

  // Replace template variables
  const systemPrompt = inboundConfig.model.systemPrompt
    .replace(/\{\{transfer_number\}\}/g, transferNumber);

  const payload = {
    name: inboundConfig.name,
    model: {
      ...inboundConfig.model,
      systemPrompt,
      tools: [
        {
          type: 'transferCall',
          destinations: [
            {
              type: 'number',
              number: transferNumber,
              message: 'Connecting you with David now. One moment please.',
            },
          ],
        },
      ],
    },
    voice: inboundConfig.voice,
    firstMessage: inboundConfig.firstMessage,
    transcriber: inboundConfig.transcriber,
    endCallFunctionEnabled: inboundConfig.endCallFunctionEnabled,
    endCallMessage: inboundConfig.endCallMessage,
    serverUrl: webhookUrl,
    analysisPlan: inboundConfig.analysisPlan,
    hipaaEnabled: inboundConfig.hipaaEnabled,
    backgroundSound: inboundConfig.backgroundSound,
    silenceTimeoutSeconds: inboundConfig.silenceTimeoutSeconds,
    maxDurationSeconds: inboundConfig.maxDurationSeconds,
    backgroundDenoisingEnabled: inboundConfig.backgroundDenoisingEnabled,
    modelOutputInMessagesEnabled: inboundConfig.modelOutputInMessagesEnabled,
  };

  try {
    const existingId = config.vapi.inboundAssistantId;
    let response;

    if (existingId) {
      // Update existing assistant
      response = await axios.patch(`${VAPI_BASE_URL}/assistant/${existingId}`, payload, {
        headers: getHeaders(),
      });
      console.log(`[VAPI] Inbound assistant updated: ${existingId}`);
    } else {
      // Create new assistant
      response = await axios.post(`${VAPI_BASE_URL}/assistant`, payload, {
        headers: getHeaders(),
      });
      console.log(`[VAPI] Inbound assistant created: ${response.data.id}`);
    }

    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error(`[VAPI] Deploy inbound assistant failed: ${errMsg}`);
    throw new Error(`Vapi API error: ${errMsg}`);
  }
}

/**
 * Attach an assistant to a Vapi phone number for inbound calls
 */
async function configureInboundNumber(phoneNumberId, assistantId) {
  if (!config.vapi.apiKey || config.vapi.apiKey.startsWith('your_')) {
    console.log(`[VAPI-DEV] Would configure phone ${phoneNumberId} with assistant ${assistantId}`);
    return { id: phoneNumberId, status: 'dev_configured' };
  }

  try {
    const response = await axios.patch(`${VAPI_BASE_URL}/phone-number/${phoneNumberId}`, {
      assistantId: assistantId,
    }, {
      headers: getHeaders(),
    });
    console.log(`[VAPI] Phone ${phoneNumberId} configured for inbound with assistant ${assistantId}`);
    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    console.error(`[VAPI] Configure inbound number failed: ${errMsg}`);
    throw new Error(`Vapi API error: ${errMsg}`);
  }
}

module.exports = { initiateCall, deployInboundAssistant, configureInboundNumber };
