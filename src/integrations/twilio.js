const config = require('../config');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const Template = require('../models/Template');
const { replaceMergeTags } = require('../utils/mergeTags');

let twilioClient = null;
let phoneNumberIndex = 0;

function getClient() {
  if (!twilioClient && config.twilio.accountSid && config.twilio.authToken &&
      !config.twilio.accountSid.startsWith('ACxxxx')) {
    const twilio = require('twilio');
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

function getNextPhoneNumber() {
  const numbers = config.twilio.phoneNumbers;
  if (!numbers.length) return null;
  const number = numbers[phoneNumberIndex % numbers.length];
  phoneNumberIndex++;
  return number;
}

/**
 * Send SMS to a lead
 */
async function sendSMS(leadId, templateId) {
  const lead = Lead.findById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  // Safety checks
  if (lead.sms_opt_out) { console.log(`[TWILIO] Skipping SMS to opted-out lead #${leadId}`); return null; }
  if (Lead.isOnSuppressionList(lead.phone, null)) { console.log(`[TWILIO] Skipping suppressed lead #${leadId}`); return null; }
  if (!lead.phone) { console.log(`[TWILIO] No phone for lead #${leadId}`); return null; }

  // Get template and merge tags
  let template = Template.findById(templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  // A/B test variant selection
  template = Template.pickVariant(templateId, lead.unique_id) || template;

  const body = replaceMergeTags(template.body, lead);
  const fromNumber = getNextPhoneNumber();

  const client = getClient();
  if (client) {
    try {
      const message = await client.messages.create({
        body,
        from: fromNumber,
        to: lead.phone,
        statusCallback: `${config.baseUrl}/webhooks/twilio/status`,
      });

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
        twilio_sid: message.sid,
        metadata: { template_id: template.id, template_version: template.version, from: fromNumber },
      });

      console.log(`[TWILIO] SMS sent to ${lead.phone} (SID: ${message.sid})`);
      return message;
    } catch (err) {
      Activity.create({
        lead_id: leadId,
        type: 'sms_failed',
        channel: 'sms',
        direction: 'outbound',
        content: `Failed: ${err.message}`,
      });
      console.error(`[TWILIO] SMS failed for lead #${leadId}: ${err.message}`);
      return null;
    }
  }

  // Dev mode: log instead of sending
  console.log(`[TWILIO-DEV] Would send SMS to ${lead.phone}:\n${body.substring(0, 200)}...`);
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
    twilio_sid: `dev_${Date.now()}`,
    metadata: { template_id: template.id, template_version: template.version, dev_mode: true },
  });

  return { sid: `dev_${Date.now()}`, status: 'dev_queued' };
}

/**
 * Send a quick SMS (not from template — for post-call actions)
 */
async function sendQuickSMS(leadId, message, fromOverride) {
  const lead = Lead.findById(leadId);
  if (!lead || lead.sms_opt_out || !lead.phone) return null;

  const body = replaceMergeTags(message, lead);
  const fromNumber = fromOverride || getNextPhoneNumber();

  const client = getClient();
  if (client) {
    try {
      const msg = await client.messages.create({ body, from: fromNumber, to: lead.phone });
      Activity.create({
        lead_id: leadId, type: 'sms_sent', channel: 'sms', direction: 'outbound',
        content: body.substring(0, 300), twilio_sid: msg.sid,
      });
      return msg;
    } catch (err) {
      console.error(`[TWILIO] Quick SMS failed: ${err.message}`);
      return null;
    }
  }

  console.log(`[TWILIO-DEV] Quick SMS to ${lead.phone}: ${body.substring(0, 100)}`);
  Activity.create({
    lead_id: leadId, type: 'sms_sent', channel: 'sms', direction: 'outbound',
    content: body.substring(0, 300), twilio_sid: `dev_${Date.now()}`,
  });
  return { sid: `dev_${Date.now()}` };
}

/**
 * Initiate a manual call — bridges operator phone to lead phone via Twilio
 */
async function initiateManualCall(leadId) {
  const lead = Lead.findById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.call_opt_out) throw new Error('Lead has opted out of calls');
  if (!lead.phone) throw new Error('Lead has no phone number');

  const operatorPhone = config.admin.operatorPhone;
  if (!operatorPhone) throw new Error('No operator phone configured. Set OPERATOR_PHONE in .env');

  const AICallLog = require('../models/AICallLog');
  const fromNumber = getNextPhoneNumber();
  const client = getClient();

  if (client) {
    try {
      const call = await client.calls.create({
        to: operatorPhone,
        from: fromNumber,
        url: `${config.baseUrl}/webhooks/twilio/voice/connect/${leadId}`,
        statusCallback: `${config.baseUrl}/webhooks/twilio/voice/status`,
        statusCallbackEvent: ['completed', 'no-answer', 'busy', 'failed'],
      });

      const callLog = AICallLog.create({
        lead_id: leadId,
        twilio_sid: call.sid,
        call_type: 'manual',
        operator_phone: operatorPhone,
        status: 'initiated',
      });

      Lead.update(leadId, {
        total_calls_made: lead.total_calls_made + 1,
        last_contacted_at: new Date().toISOString(),
        status: lead.status === 'new' ? 'lead' : lead.status,
      });

      Activity.create({
        lead_id: leadId, type: 'call_initiated', channel: 'call', direction: 'outbound',
        content: `Manual call initiated to ${lead.phone}. Calling operator first...`,
        metadata: { call_type: 'manual', twilio_sid: call.sid },
      });

      console.log(`[TWILIO] Manual call initiated — SID: ${call.sid}. Calling operator at ${operatorPhone}...`);
      return { success: true, callSid: call.sid, callLogId: callLog.id };
    } catch (err) {
      console.error(`[TWILIO] Manual call failed: ${err.message}`);
      throw err;
    }
  }

  // Dev mode
  const devSid = `dev_call_${Date.now()}`;
  console.log(`[TWILIO-DEV] Would initiate manual call: operator ${operatorPhone} → lead ${lead.phone}`);

  const callLog = AICallLog.create({
    lead_id: leadId, twilio_sid: devSid, call_type: 'manual',
    operator_phone: operatorPhone, status: 'initiated',
  });

  Lead.update(leadId, {
    total_calls_made: lead.total_calls_made + 1,
    last_contacted_at: new Date().toISOString(),
    status: lead.status === 'new' ? 'lead' : lead.status,
  });

  Activity.create({
    lead_id: leadId, type: 'call_initiated', channel: 'call', direction: 'outbound',
    content: `[DEV] Manual call initiated to ${lead.phone}`,
    metadata: { call_type: 'manual', twilio_sid: devSid, dev_mode: true },
  });

  return { success: true, callSid: devSid, callLogId: callLog.id };
}

module.exports = { sendSMS, sendQuickSMS, getClient, getNextPhoneNumber, initiateManualCall };
