const express = require('express');
const router = express.Router();
const config = require('../config');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { updateScore } = require('../services/scoring');
const { routeLead, handleReply, handleOptOut } = require('../services/routing');
const { normalizePhone } = require('../utils/phone');
const { notify } = require('../services/notifier');

/**
 * Twilio SMS Status Callback
 * POST /webhooks/twilio/status
 * Called by Twilio when message status changes (queued, sent, delivered, failed, etc.)
 */
router.post('/status', (req, res) => {
  try {
    const { MessageSid, MessageStatus, To, ErrorCode } = req.body;
    console.log(`[TWILIO-WH] Status update: ${MessageSid} → ${MessageStatus}`);

    // Find the activity with this SID
    const activity = Activity.getByTwilioSid
      ? null // We'd need to add this method, but for now just log
      : null;

    // Find lead by phone
    const phone = normalizePhone(To);
    const lead = Lead.findByPhone(phone);

    if (lead) {
      switch (MessageStatus) {
        case 'delivered':
          Activity.create({
            lead_id: lead.id, type: 'sms_delivered', channel: 'sms',
            content: `SMS delivered to ${phone}`, twilio_sid: MessageSid,
          });
          updateScore(lead.id, 'sms_delivered');
          break;

        case 'failed':
        case 'undelivered':
          Activity.create({
            lead_id: lead.id, type: 'sms_failed', channel: 'sms',
            content: `SMS failed (${ErrorCode || 'unknown error'})`, twilio_sid: MessageSid,
          });
          break;
      }
    }

    res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error('[TWILIO-WH] Status error:', err.message);
    res.status(200).send('<Response></Response>');
  }
});

/**
 * Twilio Inbound SMS
 * POST /webhooks/twilio/inbound
 * Called by Twilio when someone sends an SMS to our number
 */
router.post('/inbound', (req, res) => {
  try {
    const { From, Body, MessageSid } = req.body;
    const phone = normalizePhone(From);
    const body = (Body || '').trim();

    console.log(`[TWILIO-WH] Inbound SMS from ${phone}: "${body.substring(0, 50)}"`);

    const lead = Lead.findByPhone(phone);
    if (!lead) {
      console.log(`[TWILIO-WH] Unknown number: ${phone}. Logging and ignoring.`);
      res.status(200).send('<Response></Response>');
      return;
    }

    // Check for opt-out keywords
    const upperBody = body.toUpperCase();
    const isOptOut = config.optOutKeywords.some(kw => upperBody === kw || upperBody.startsWith(kw + ' '));

    if (isOptOut) {
      handleOptOut(lead, 'sms');
      // Auto-reply confirmation
      const twiml = `<Response><Message>You've been unsubscribed and won't receive further messages from this number. Reply START to re-subscribe.</Message></Response>`;
      res.status(200).type('text/xml').send(twiml);
      return;
    }

    // Check for re-subscribe
    if (upperBody === 'START') {
      Lead.update(lead.id, { sms_opt_out: 0, call_opt_out: 0 });
      Activity.create({
        lead_id: lead.id, type: 'note_added', channel: 'sms',
        content: 'Lead re-subscribed to SMS (replied START)',
      });
      const twiml = `<Response><Message>Welcome back! You've been re-subscribed.</Message></Response>`;
      res.status(200).type('text/xml').send(twiml);
      return;
    }

    // Genuine reply — this is valuable!
    Activity.create({
      lead_id: lead.id, type: 'sms_replied', channel: 'sms', direction: 'inbound',
      content: body.substring(0, 500), twilio_sid: MessageSid,
    });

    // Update score
    const { lead: updatedLead, tierChanged, oldTier, newTier } = updateScore(lead.id, 'sms_replied');

    // Handle the reply (pause sequence, notify rep)
    const routeResult = handleReply(updatedLead, 'sms', body);

    // If tier changed, route accordingly
    if (tierChanged) {
      routeLead(Lead.findById(lead.id), oldTier, newTier);
    }

    console.log(`[TWILIO-WH] Reply processed for lead #${lead.id}. Score: ${updatedLead.score}`);

    // Send real-time notification
    notify('sms-received', {
      leadId: lead.id,
      leadName: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown',
      company: lead.company_name || '',
      phone,
      message: body.substring(0, 300),
    });

    res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error('[TWILIO-WH] Inbound error:', err.message);
    res.status(200).send('<Response></Response>');
  }
});

// =============================================
// VOICE CALL WEBHOOKS
// =============================================

const AICallLog = require('../models/AICallLog');
const { getNextPhoneNumber } = require('../integrations/twilio');

/**
 * TwiML endpoint — called by Twilio when operator answers manual call
 * Returns instructions to dial the lead
 */
router.all('/voice/connect/:leadId', (req, res) => {
  try {
    const leadId = parseInt(req.params.leadId);
    const lead = Lead.findById(leadId);

    if (!lead || !lead.phone) {
      res.type('text/xml').send('<Response><Say>Sorry, this lead could not be found.</Say><Hangup/></Response>');
      return;
    }

    const fromNumber = getNextPhoneNumber() || req.body.To || '';
    const twiml = `<Response>
  <Say voice="alice">Connecting you to ${lead.first_name || 'the lead'}${lead.company_name ? ' at ' + lead.company_name : ''}.</Say>
  <Dial callerId="${fromNumber}" action="${config.baseUrl}/webhooks/twilio/voice/status" method="POST">
    <Number>${lead.phone}</Number>
  </Dial>
</Response>`;

    console.log(`[TWILIO-WH] Voice connect: dialing lead #${leadId} at ${lead.phone}`);
    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('[TWILIO-WH] Voice connect error:', err.message);
    res.type('text/xml').send('<Response><Say>An error occurred.</Say><Hangup/></Response>');
  }
});

/**
 * TwiML App Voice URL — routes browser outbound calls
 * POST /webhooks/twilio/voice
 */
router.post('/voice', (req, res, next) => {
  // Forward to browser-outbound handler
  req.url = '/voice/browser-outbound';
  router.handle(req, res, next);
});

/**
 * Browser outbound TwiML — called by Twilio when browser client initiates an outbound call
 * The TwiML App's Voice URL should point here
 */
router.post('/voice/browser-outbound', (req, res) => {
  try {
    const leadId = parseInt(req.body.leadId);
    const lead = Lead.findById(leadId);

    if (!lead || !lead.phone) {
      res.type('text/xml').send('<Response><Say>Sorry, this lead could not be found.</Say><Hangup/></Response>');
      return;
    }

    const { CallSid } = req.body;
    const fromNumber = getNextPhoneNumber() || config.twilio.phoneNumbers[0] || '';

    // Create call log for browser call
    AICallLog.create({
      lead_id: lead.id, twilio_sid: CallSid,
      call_type: 'browser', status: 'initiated',
    });

    // Update lead stats
    Lead.update(lead.id, {
      total_calls_made: lead.total_calls_made + 1,
      last_contacted_at: new Date().toISOString(),
      status: lead.status === 'new' ? 'lead' : lead.status,
    });

    Activity.create({
      lead_id: lead.id, type: 'call_initiated', channel: 'call', direction: 'outbound',
      content: `Browser call initiated to ${lead.phone}`,
      metadata: { call_type: 'browser', twilio_sid: CallSid },
    });

    const twiml = `<Response>
  <Dial answerOnBridge="true" callerId="${fromNumber}" action="${config.baseUrl}/webhooks/twilio/voice/status" method="POST">
    <Number>${lead.phone}</Number>
  </Dial>
</Response>`;

    console.log(`[TWILIO-WH] Browser outbound: dialing lead #${leadId} at ${lead.phone}`);
    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('[TWILIO-WH] Browser outbound error:', err.message);
    res.type('text/xml').send('<Response><Say>An error occurred.</Say><Hangup/></Response>');
  }
});

/**
 * Voice call status callback — tracks manual/browser call completion
 */
router.post('/voice/status', (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, To, From } = req.body;
    console.log(`[TWILIO-WH] Voice status: ${CallSid} → ${CallStatus} (${CallDuration || 0}s)`);

    const callLog = AICallLog.findByTwilioSid(CallSid);
    if (!callLog) {
      console.log(`[TWILIO-WH] No call log found for SID ${CallSid}`);
      res.status(200).send('<Response></Response>');
      return;
    }

    const statusMap = {
      'completed': 'completed',
      'no-answer': 'no_answer',
      'busy': 'busy',
      'failed': 'failed',
      'canceled': 'failed',
    };
    const mappedStatus = statusMap[CallStatus] || CallStatus;
    const duration = parseInt(CallDuration) || 0;

    AICallLog.update(callLog.id, {
      status: mappedStatus,
      duration_seconds: duration,
      outcome: mappedStatus === 'completed' ? 'not_qualified' : 'no_answer',
    });

    const lead = Lead.findById(callLog.lead_id);
    const callTypeLabel = callLog.call_type === 'browser' ? 'Browser' : 'Manual';
    if (lead) {
      if (mappedStatus === 'completed' && duration > 0) {
        Activity.create({
          lead_id: lead.id, type: 'call_completed', channel: 'call',
          content: `${callTypeLabel} call completed (${duration}s)`,
          metadata: { call_type: callLog.call_type, duration },
        });
        updateScore(lead.id, 'call_answered');
        if (duration >= 60) updateScore(lead.id, 'call_long');
      } else {
        Activity.create({
          lead_id: lead.id, type: 'call_no_answer', channel: 'call',
          content: `${callTypeLabel} call — ${CallStatus}`,
          metadata: { call_type: callLog.call_type },
        });
      }
    }

    res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error('[TWILIO-WH] Voice status error:', err.message);
    res.status(200).send('<Response></Response>');
  }
});

/**
 * Inbound voice call — when a lead calls our Twilio number
 */
router.post('/voice/inbound', (req, res) => {
  try {
    const { From, To, CallSid } = req.body;
    const phone = normalizePhone(From);
    const operatorPhone = config.admin.operatorPhone;

    console.log(`[TWILIO-WH] Inbound voice call from ${phone}`);

    const lead = Lead.findByPhone(phone);

    if (lead) {
      AICallLog.create({
        lead_id: lead.id, twilio_sid: CallSid,
        call_type: 'inbound', status: 'answered',
      });

      Activity.create({
        lead_id: lead.id, type: 'call_received', channel: 'call', direction: 'inbound',
        content: `Inbound call from ${lead.first_name || phone}`,
        metadata: { call_type: 'inbound', twilio_sid: CallSid },
      });

      updateScore(lead.id, 'call_answered');
      console.log(`[TWILIO-WH] Inbound call matched lead #${lead.id} — ${lead.first_name} ${lead.last_name}`);
    } else {
      console.log(`[TWILIO-WH] Inbound call from unknown number: ${phone}`);
    }

    const sayText = lead
      ? `Incoming call from ${lead.first_name || 'a lead'}${lead.company_name ? ' at ' + lead.company_name : ''}.`
      : 'Incoming call from an unknown number.';

    // Ring browser client first, then fall back to operator phone, then Vapi inbound
    const fallbackAction = `${config.baseUrl}/webhooks/twilio/voice/inbound-fallback`;
    const twiml = `<Response>
  <Say voice="alice">${sayText}</Say>
  <Dial timeout="20" action="${fallbackAction}" method="POST">
    <Client>breasy-operator</Client>
  </Dial>
</Response>`;
    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('[TWILIO-WH] Inbound voice error:', err.message);
    res.type('text/xml').send('<Response><Say>An error occurred. Please try again later.</Say><Hangup/></Response>');
  }
});

/**
 * Inbound fallback — browser didn't answer, try operator phone then Vapi
 */
router.post('/voice/inbound-fallback', (req, res) => {
  try {
    const { DialCallStatus } = req.body;
    console.log(`[TWILIO-WH] Inbound fallback — browser status: ${DialCallStatus}`);

    if (DialCallStatus === 'completed') {
      // Browser answered and call finished normally
      res.type('text/xml').send('<Response></Response>');
      return;
    }

    // Browser didn't answer — try operator phone
    const operatorPhone = config.admin.operatorPhone || config.admin.phone;
    if (operatorPhone) {
      console.log(`[TWILIO-WH] Forwarding to operator phone: ${operatorPhone}`);
      const twiml = `<Response>
  <Say voice="alice">Connecting to operator.</Say>
  <Dial timeout="25" action="${config.baseUrl}/webhooks/twilio/voice/status" method="POST">
    <Number>${operatorPhone}</Number>
  </Dial>
</Response>`;
      res.type('text/xml').send(twiml);
      return;
    }

    // No operator phone — send to voicemail
    console.log(`[TWILIO-WH] No operator phone, sending to voicemail`);
    const twiml = `<Response>
  <Say voice="alice">Sorry, no one is available right now. Please leave a message after the beep, or try again later.</Say>
  <Record maxLength="120" action="${config.baseUrl}/webhooks/twilio/voice/status" method="POST" />
</Response>`;
    res.type('text/xml').send(twiml);
  } catch (err) {
    console.error('[TWILIO-WH] Inbound fallback error:', err.message);
    res.type('text/xml').send('<Response><Say>An error occurred.</Say><Hangup/></Response>');
  }
});

module.exports = router;
