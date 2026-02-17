const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const Template = require('../models/Template');
const { updateScore } = require('../services/scoring');
const { routeLead, handleOptOut } = require('../services/routing');

/**
 * SendGrid Event Webhook
 * POST /webhooks/sendgrid
 * Called by SendGrid for email events (delivered, open, click, bounce, etc.)
 */
router.post('/', (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      processEvent(event);
    }

    res.status(200).json({ received: events.length });
  } catch (err) {
    console.error('[SENDGRID-WH] Error:', err.message);
    res.status(200).json({ error: err.message });
  }
});

function processEvent(event) {
  const leadId = event.lead_id || (event.custom_args && event.custom_args.lead_id);
  if (!leadId) return;

  const lead = Lead.findById(parseInt(leadId));
  if (!lead) return;

  const templateId = event.template_id || (event.custom_args && event.custom_args.template_id);

  switch (event.event) {
    case 'delivered':
      Activity.create({
        lead_id: lead.id, type: 'email_delivered', channel: 'email',
        content: 'Email delivered',
        sendgrid_id: event.sg_message_id,
      });
      updateScore(lead.id, 'email_delivered');
      break;

    case 'open':
      Activity.create({
        lead_id: lead.id, type: 'email_opened', channel: 'email',
        content: 'Email opened',
        sendgrid_id: event.sg_message_id,
      });
      if (templateId) Template.incrementOpenCount(parseInt(templateId));

      // Check if opened multiple times
      const openCount = Activity.countTodayByType('email_opened');
      const scoreEvent = openCount > 1 ? 'email_opened_again' : 'email_opened';
      const { lead: updated, tierChanged, oldTier, newTier } = updateScore(lead.id, scoreEvent);
      if (tierChanged) routeLead(Lead.findById(lead.id), oldTier, newTier);
      break;

    case 'click':
      Activity.create({
        lead_id: lead.id, type: 'email_clicked', channel: 'email',
        content: `Clicked: ${event.url || 'unknown link'}`,
        sendgrid_id: event.sg_message_id,
      });
      if (templateId) Template.incrementClickCount(parseInt(templateId));

      // Determine if video link was clicked
      const isVideo = (event.url || '').includes('demo') || (event.url || '').includes('video');
      const clickEvent = isVideo ? 'video_clicked' : 'email_clicked';
      const clickResult = updateScore(lead.id, clickEvent);
      if (clickResult.tierChanged) routeLead(Lead.findById(lead.id), clickResult.oldTier, clickResult.newTier);
      break;

    case 'bounce':
      Activity.create({
        lead_id: lead.id, type: 'email_bounced', channel: 'email',
        content: `Bounced: ${event.type || 'unknown'} — ${event.reason || ''}`,
        sendgrid_id: event.sg_message_id,
      });
      // Hard bounce: mark email as invalid
      if (event.type === 'bounce') {
        Lead.update(lead.id, { email_opt_out: 1 });
      }
      break;

    case 'spamreport':
    case 'unsubscribe':
      handleOptOut(lead, 'email');
      break;

    case 'dropped':
      Activity.create({
        lead_id: lead.id, type: 'email_failed', channel: 'email',
        content: `Dropped: ${event.reason || 'unknown'}`,
      });
      break;
  }
}

/**
 * SendGrid Inbound Parse Webhook
 * POST /webhooks/sendgrid/inbound
 * Called when an email is received at the configured inbound domain.
 */
router.post('/inbound', (req, res) => {
  try {
    const { from, to, subject, text, html } = req.body;

    // Extract email from "Name <email@example.com>" format
    const fromMatch = (from || '').match(/<([^>]+)>/);
    const senderEmail = (fromMatch ? fromMatch[1] : from || '').trim().toLowerCase();

    console.log(`[SENDGRID-WH] Inbound email from ${senderEmail}: "${(subject || '').substring(0, 50)}"`);

    const lead = Lead.findByEmail(senderEmail);
    if (!lead) {
      console.log(`[SENDGRID-WH] Unknown sender: ${senderEmail}`);
      res.status(200).json({ received: true, matched: false });
      return;
    }

    const emailBody = (text || '').trim() || (html || '').replace(/<[^>]+>/g, '').trim();

    Activity.create({
      lead_id: lead.id, type: 'email_replied', channel: 'email', direction: 'inbound',
      content: emailBody.substring(0, 1000),
      metadata: { subject: subject || '(no subject)', sender_email: senderEmail },
    });

    const scoreResult = updateScore(lead.id, 'email_replied');

    // Pause sequence, mark as discovery
    Lead.update(lead.id, {
      replied: 1, last_reply_at: new Date().toISOString(),
      status: 'discovery', sequence_status: 'paused',
    });

    if (scoreResult.tierChanged) {
      routeLead(Lead.findById(lead.id), scoreResult.oldTier, scoreResult.newTier);
    }

    console.log(`[SENDGRID-WH] Inbound email processed for lead #${lead.id}. Score: ${scoreResult.lead.score}`);
    res.status(200).json({ received: true, matched: true, lead_id: lead.id });
  } catch (err) {
    console.error('[SENDGRID-WH] Inbound error:', err.message);
    res.status(200).json({ error: err.message });
  }
});

module.exports = router;
