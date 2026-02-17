const express = require('express');
const router = express.Router();
const config = require('../config');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const AICallLog = require('../models/AICallLog');
const { updateScore } = require('../services/scoring');
const { routeLead, handleReply, handleOptOut } = require('../services/routing');
const { normalizePhone } = require('../utils/phone');

/**
 * Dialpad SMS Status Webhook
 * POST /webhooks/dialpad/sms/status
 */
router.post('/sms/status', (req, res) => {
  try {
    const { message_id, status, to_number, error_message } = req.body;
    console.log(`[DIALPAD-WH] SMS status: ${message_id} → ${status}`);

    const phone = normalizePhone(to_number);
    const lead = Lead.findByPhone(phone);

    if (lead) {
      if (status === 'delivered') {
        Activity.create({
          lead_id: lead.id, type: 'sms_delivered', channel: 'sms',
          content: `SMS delivered to ${phone}`,
          provider: 'dialpad', provider_sid: message_id,
          twilio_sid: `dialpad_${message_id}`,
        });
        updateScore(lead.id, 'sms_delivered');
      } else if (status === 'failed' || status === 'undelivered') {
        Activity.create({
          lead_id: lead.id, type: 'sms_failed', channel: 'sms',
          content: `SMS failed (${error_message || 'unknown error'})`,
          provider: 'dialpad', provider_sid: message_id,
          twilio_sid: `dialpad_${message_id}`,
        });
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[DIALPAD-WH] SMS status error:', err.message);
    res.status(200).json({ ok: true });
  }
});

/**
 * Dialpad Inbound SMS
 * POST /webhooks/dialpad/sms/inbound
 */
router.post('/sms/inbound', async (req, res) => {
  try {
    const { from_number, text, message_id } = req.body;
    const phone = normalizePhone(from_number);
    const body = (text || '').trim();

    console.log(`[DIALPAD-WH] Inbound SMS from ${phone}: "${body.substring(0, 50)}"`);

    const lead = Lead.findByPhone(phone);
    if (!lead) {
      console.log(`[DIALPAD-WH] Unknown number: ${phone}. Ignoring.`);
      res.status(200).json({ ok: true });
      return;
    }

    // Check for opt-out keywords
    const upperBody = body.toUpperCase();
    const isOptOut = config.optOutKeywords.some(kw => upperBody === kw || upperBody.startsWith(kw + ' '));

    if (isOptOut) {
      handleOptOut(lead, 'sms');
      // Send auto-reply via Dialpad
      try {
        const axios = require('axios');
        await axios.post('https://dialpad.com/api/v2/sms', {
          to_numbers: [phone],
          text: "You've been unsubscribed and won't receive further messages. Reply START to re-subscribe.",
        }, {
          headers: { 'Authorization': `Bearer ${config.dialpad.apiKey}`, 'Content-Type': 'application/json' },
        });
      } catch (e) {
        console.log(`[DIALPAD-WH] Auto-reply failed: ${e.message}`);
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Check for re-subscribe
    if (upperBody === 'START') {
      Lead.update(lead.id, { sms_opt_out: 0, call_opt_out: 0 });
      Activity.create({
        lead_id: lead.id, type: 'note_added', channel: 'sms',
        content: 'Lead re-subscribed to SMS (replied START)',
        provider: 'dialpad',
      });
      res.status(200).json({ ok: true });
      return;
    }

    // Genuine reply
    Activity.create({
      lead_id: lead.id, type: 'sms_replied', channel: 'sms', direction: 'inbound',
      content: body.substring(0, 500),
      provider: 'dialpad', provider_sid: message_id,
      twilio_sid: `dialpad_${message_id}`,
    });

    const { lead: updatedLead, tierChanged, oldTier, newTier } = updateScore(lead.id, 'sms_replied');
    handleReply(updatedLead, 'sms', body);

    if (tierChanged) {
      routeLead(Lead.findById(lead.id), oldTier, newTier);
    }

    console.log(`[DIALPAD-WH] Reply processed for lead #${lead.id}. Score: ${updatedLead.score}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[DIALPAD-WH] Inbound SMS error:', err.message);
    res.status(200).json({ ok: true });
  }
});

/**
 * Dialpad Call Status Webhook
 * POST /webhooks/dialpad/call/status
 */
router.post('/call/status', (req, res) => {
  try {
    const { call_id, status, duration, to_number, from_number } = req.body;
    console.log(`[DIALPAD-WH] Call status: ${call_id} → ${status} (${duration || 0}s)`);

    const callLog = AICallLog.findByProviderSid(call_id);
    if (!callLog) {
      console.log(`[DIALPAD-WH] No call log found for call_id ${call_id}`);
      res.status(200).json({ ok: true });
      return;
    }

    const statusMap = {
      'connected': 'completed',
      'completed': 'completed',
      'no_answer': 'no_answer',
      'no-answer': 'no_answer',
      'busy': 'busy',
      'failed': 'failed',
      'cancelled': 'failed',
      'voicemail': 'voicemail',
    };
    const mappedStatus = statusMap[status] || status;
    const durationSecs = parseInt(duration) || 0;

    AICallLog.update(callLog.id, {
      status: mappedStatus,
      duration_seconds: durationSecs,
      outcome: mappedStatus === 'completed' ? 'not_qualified' : 'no_answer',
    });

    const lead = Lead.findById(callLog.lead_id);
    if (lead) {
      if (mappedStatus === 'completed' && durationSecs > 0) {
        Activity.create({
          lead_id: lead.id, type: 'call_completed', channel: 'call',
          content: `Dialpad call completed (${durationSecs}s)`,
          provider: 'dialpad', provider_sid: call_id,
          metadata: { call_type: callLog.call_type, duration: durationSecs },
        });
        updateScore(lead.id, 'call_answered');
        if (durationSecs >= 60) updateScore(lead.id, 'call_long');
      } else {
        Activity.create({
          lead_id: lead.id, type: 'call_no_answer', channel: 'call',
          content: `Dialpad call — ${status}`,
          provider: 'dialpad', provider_sid: call_id,
          metadata: { call_type: callLog.call_type },
        });
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[DIALPAD-WH] Call status error:', err.message);
    res.status(200).json({ ok: true });
  }
});

/**
 * Dialpad Inbound Call Webhook
 * POST /webhooks/dialpad/call/inbound
 */
router.post('/call/inbound', (req, res) => {
  try {
    const { from_number, to_number, call_id } = req.body;
    const phone = normalizePhone(from_number);

    console.log(`[DIALPAD-WH] Inbound call from ${phone}`);

    const lead = Lead.findByPhone(phone);
    if (lead) {
      AICallLog.create({
        lead_id: lead.id,
        twilio_sid: `dialpad_${call_id}`,
        call_type: 'inbound',
        status: 'answered',
        provider: 'dialpad',
        provider_sid: call_id,
      });

      Activity.create({
        lead_id: lead.id, type: 'call_received', channel: 'call', direction: 'inbound',
        content: `Inbound Dialpad call from ${lead.first_name || phone}`,
        provider: 'dialpad', provider_sid: call_id,
        metadata: { call_type: 'inbound', call_id },
      });

      updateScore(lead.id, 'call_answered');
      console.log(`[DIALPAD-WH] Inbound call matched lead #${lead.id}`);
    } else {
      console.log(`[DIALPAD-WH] Inbound call from unknown: ${phone}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[DIALPAD-WH] Inbound call error:', err.message);
    res.status(200).json({ ok: true });
  }
});

module.exports = router;
