const axios = require('axios');
const config = require('../config');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const Template = require('../models/Template');
const { replaceMergeTags } = require('../utils/mergeTags');

const DIALPAD_BASE = 'https://dialpad.com/api/v2';
let phoneNumberIndex = 0;

function getHeaders() {
  return {
    'Authorization': `Bearer ${config.dialpad.apiKey}`,
    'Content-Type': 'application/json',
  };
}

function isDevMode() {
  return !config.dialpad.apiKey || config.dialpad.apiKey.startsWith('your_');
}

function getNextPhoneNumber() {
  const numbers = config.dialpad.phoneNumbers;
  if (!numbers.length) return null;
  const number = numbers[phoneNumberIndex % numbers.length];
  phoneNumberIndex++;
  return number;
}

/**
 * Send SMS to a lead via Dialpad
 */
async function sendSMS(leadId, templateId) {
  const lead = Lead.findById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  if (lead.sms_opt_out) { console.log(`[DIALPAD] Skipping SMS to opted-out lead #${leadId}`); return null; }
  if (Lead.isOnSuppressionList(lead.phone, null)) { console.log(`[DIALPAD] Skipping suppressed lead #${leadId}`); return null; }
  if (!lead.phone) { console.log(`[DIALPAD] No phone for lead #${leadId}`); return null; }

  let template = Template.findById(templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  template = Template.pickVariant(templateId, lead.unique_id) || template;
  const body = replaceMergeTags(template.body, lead);
  const fromNumber = getNextPhoneNumber();

  if (!isDevMode()) {
    try {
      const response = await axios.post(`${DIALPAD_BASE}/sms`, {
        to_numbers: [lead.phone],
        text: body,
        from_number: fromNumber,
      }, { headers: getHeaders() });

      const messageSid = response.data.id || response.data.request_id || `dp_${Date.now()}`;

      Template.incrementSendCount(template.id);
      Lead.update(leadId, {
        total_sms_sent: lead.total_sms_sent + 1,
        last_contacted_at: new Date().toISOString(),
        status: lead.status === 'new' ? 'lead' : lead.status,
      });

      Activity.create({
        lead_id: leadId,
        type: 'sms_sent',
        channel: 'sms',
        direction: 'outbound',
        content: body.substring(0, 300),
        twilio_sid: `dialpad_${messageSid}`,
        provider: 'dialpad',
        provider_sid: messageSid,
        metadata: { template_id: template.id, template_version: template.version, from: fromNumber },
      });

      console.log(`[DIALPAD] SMS sent to ${lead.phone} (ID: ${messageSid})`);
      return { sid: messageSid, status: 'queued' };
    } catch (err) {
      Activity.create({
        lead_id: leadId,
        type: 'sms_failed',
        channel: 'sms',
        direction: 'outbound',
        content: `Failed: ${err.message}`,
        provider: 'dialpad',
      });
      console.error(`[DIALPAD] SMS failed for lead #${leadId}: ${err.message}`);
      return null;
    }
  }

  // Dev mode
  console.log(`[DIALPAD-DEV] Would send SMS to ${lead.phone}:\n${body.substring(0, 200)}...`);
  Template.incrementSendCount(template.id);
  Lead.update(leadId, {
    total_sms_sent: lead.total_sms_sent + 1,
    last_contacted_at: new Date().toISOString(),
    status: lead.status === 'new' ? 'lead' : lead.status,
  });

  const devSid = `dev_dp_${Date.now()}`;
  Activity.create({
    lead_id: leadId,
    type: 'sms_sent',
    channel: 'sms',
    direction: 'outbound',
    content: body.substring(0, 300),
    twilio_sid: `dialpad_${devSid}`,
    provider: 'dialpad',
    provider_sid: devSid,
    metadata: { template_id: template.id, template_version: template.version, dev_mode: true },
  });

  return { sid: devSid, status: 'dev_queued' };
}

/**
 * Send a quick SMS (not from template)
 */
async function sendQuickSMS(leadId, message, fromOverride) {
  const lead = Lead.findById(leadId);
  if (!lead || lead.sms_opt_out || !lead.phone) return null;

  const body = replaceMergeTags(message, lead);
  const fromNumber = fromOverride || getNextPhoneNumber();

  if (!isDevMode()) {
    try {
      const response = await axios.post(`${DIALPAD_BASE}/sms`, {
        to_numbers: [lead.phone],
        text: body,
        from_number: fromNumber,
      }, { headers: getHeaders() });

      const messageSid = response.data.id || response.data.request_id || `dp_${Date.now()}`;
      Activity.create({
        lead_id: leadId, type: 'sms_sent', channel: 'sms', direction: 'outbound',
        content: body.substring(0, 300), twilio_sid: `dialpad_${messageSid}`,
        provider: 'dialpad', provider_sid: messageSid,
      });
      return { sid: messageSid };
    } catch (err) {
      console.error(`[DIALPAD] Quick SMS failed: ${err.message}`);
      return null;
    }
  }

  const devSid = `dev_dp_${Date.now()}`;
  console.log(`[DIALPAD-DEV] Quick SMS to ${lead.phone}: ${body.substring(0, 100)}`);
  Activity.create({
    lead_id: leadId, type: 'sms_sent', channel: 'sms', direction: 'outbound',
    content: body.substring(0, 300), twilio_sid: `dialpad_${devSid}`,
    provider: 'dialpad', provider_sid: devSid,
  });
  return { sid: devSid };
}

/**
 * Initiate a call via Dialpad
 * Note: Dialpad calls go directly to the lead. The operator joins via the Dialpad app.
 */
async function initiateManualCall(leadId) {
  const lead = Lead.findById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.call_opt_out) throw new Error('Lead has opted out of calls');
  if (!lead.phone) throw new Error('Lead has no phone number');

  const AICallLog = require('../models/AICallLog');
  const fromNumber = getNextPhoneNumber();

  if (!isDevMode()) {
    try {
      const response = await axios.post(`${DIALPAD_BASE}/calls`, {
        phone_number: lead.phone,
        caller_id: fromNumber,
      }, { headers: getHeaders() });

      const callSid = response.data.id || response.data.call_id || `dp_call_${Date.now()}`;

      const callLog = AICallLog.create({
        lead_id: leadId,
        twilio_sid: `dialpad_${callSid}`,
        call_type: 'manual',
        status: 'initiated',
        provider: 'dialpad',
        provider_sid: callSid,
      });

      Lead.update(leadId, {
        total_calls_made: lead.total_calls_made + 1,
        last_contacted_at: new Date().toISOString(),
        status: lead.status === 'new' ? 'lead' : lead.status,
      });

      Activity.create({
        lead_id: leadId, type: 'call_initiated', channel: 'call', direction: 'outbound',
        content: `Dialpad call initiated to ${lead.phone}`,
        provider: 'dialpad', provider_sid: callSid,
        metadata: { call_type: 'manual', call_id: callSid },
      });

      console.log(`[DIALPAD] Call initiated to ${lead.phone} (ID: ${callSid})`);
      return { success: true, callSid, callLogId: callLog.id };
    } catch (err) {
      console.error(`[DIALPAD] Call failed: ${err.message}`);
      throw err;
    }
  }

  // Dev mode
  const devSid = `dev_dp_call_${Date.now()}`;
  console.log(`[DIALPAD-DEV] Would initiate call to ${lead.phone}`);

  const callLog = AICallLog.create({
    lead_id: leadId, twilio_sid: `dialpad_${devSid}`, call_type: 'manual',
    status: 'initiated', provider: 'dialpad', provider_sid: devSid,
  });

  Lead.update(leadId, {
    total_calls_made: lead.total_calls_made + 1,
    last_contacted_at: new Date().toISOString(),
    status: lead.status === 'new' ? 'lead' : lead.status,
  });

  Activity.create({
    lead_id: leadId, type: 'call_initiated', channel: 'call', direction: 'outbound',
    content: `[DEV] Dialpad call initiated to ${lead.phone}`,
    provider: 'dialpad', provider_sid: devSid,
    metadata: { call_type: 'manual', call_id: devSid, dev_mode: true },
  });

  return { success: true, callSid: devSid, callLogId: callLog.id };
}

module.exports = { sendSMS, sendQuickSMS, getNextPhoneNumber, initiateManualCall };
