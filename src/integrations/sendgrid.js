const config = require('../config');
const Activity = require('../models/Activity');
const Lead = require('../models/Lead');
const Template = require('../models/Template');
const { replaceMergeTags } = require('../utils/mergeTags');

let sgMail = null;

function getClient() {
  if (!sgMail && config.sendgrid.apiKey && !config.sendgrid.apiKey.startsWith('SG.xxxx')) {
    sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(config.sendgrid.apiKey);
  }
  return sgMail;
}

/**
 * Send email to a lead
 */
async function sendEmail(leadId, templateId) {
  const lead = Lead.findById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  if (lead.email_opt_out) { console.log(`[SENDGRID] Skipping opted-out lead #${leadId}`); return null; }
  if (Lead.isOnSuppressionList(null, lead.email)) { console.log(`[SENDGRID] Skipping suppressed lead #${leadId}`); return null; }
  if (!lead.email) { console.log(`[SENDGRID] No email for lead #${leadId}`); return null; }

  let template = Template.findById(templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  template = Template.pickVariant(templateId, lead.unique_id) || template;

  const subject = replaceMergeTags(template.subject || '', lead);
  const htmlBody = replaceMergeTags(template.body, lead);

  const msg = {
    to: lead.email,
    from: { email: config.sendgrid.fromEmail, name: config.sendgrid.fromName },
    subject,
    html: htmlBody,
    trackingSettings: {
      clickTracking: { enable: true },
      openTracking: { enable: true },
    },
    customArgs: {
      lead_id: String(lead.id),
      lead_unique_id: lead.unique_id,
      template_id: String(template.id),
    },
  };

  const client = getClient();
  if (client) {
    try {
      const [response] = await client.send(msg);
      const messageId = response.headers['x-message-id'] || `sg_${Date.now()}`;

      Template.incrementSendCount(template.id);
      Lead.update(leadId, {
        total_emails_sent: lead.total_emails_sent + 1,
        last_contacted_at: new Date().toISOString(),
        status: lead.status === 'new' ? 'lead' : lead.status,
      });

      Activity.create({
        lead_id: leadId,
        type: 'email_sent',
        channel: 'email',
        direction: 'outbound',
        content: subject,
        sendgrid_id: messageId,
        metadata: { template_id: template.id, template_version: template.version },
      });

      console.log(`[SENDGRID] Email sent to ${lead.email} (ID: ${messageId})`);
      return { messageId, status: response.statusCode };
    } catch (err) {
      Activity.create({
        lead_id: leadId,
        type: 'email_failed',
        channel: 'email',
        direction: 'outbound',
        content: `Failed: ${err.message}`,
      });
      console.error(`[SENDGRID] Email failed for lead #${leadId}: ${err.message}`);
      return null;
    }
  }

  // Dev mode
  console.log(`[SENDGRID-DEV] Would send email to ${lead.email}: "${subject}"`);
  Template.incrementSendCount(template.id);
  Lead.update(leadId, {
    total_emails_sent: lead.total_emails_sent + 1,
    last_contacted_at: new Date().toISOString(),
    status: lead.status === 'new' ? 'lead' : lead.status,
  });

  Activity.create({
    lead_id: leadId,
    type: 'email_sent',
    channel: 'email',
    direction: 'outbound',
    content: subject,
    sendgrid_id: `dev_${Date.now()}`,
    metadata: { template_id: template.id, template_version: template.version, dev_mode: true },
  });

  return { messageId: `dev_${Date.now()}`, status: 'dev_queued' };
}

/**
 * Send a quick ad-hoc email (not template-based — for inbox compose)
 */
async function sendQuickEmail(leadId, subject, body) {
  const lead = Lead.findById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);
  if (lead.email_opt_out) throw new Error('Lead has opted out of emails');
  if (!lead.email) throw new Error('Lead has no email address');

  const resolvedSubject = replaceMergeTags(subject, lead);
  const resolvedBody = replaceMergeTags(body, lead);

  const msg = {
    to: lead.email,
    from: { email: config.sendgrid.fromEmail, name: config.sendgrid.fromName },
    subject: resolvedSubject,
    html: resolvedBody.replace(/\n/g, '<br>'),
    text: resolvedBody,
    trackingSettings: {
      clickTracking: { enable: true },
      openTracking: { enable: true },
    },
    customArgs: {
      lead_id: String(lead.id),
      lead_unique_id: lead.unique_id,
    },
  };

  const client = getClient();
  if (client) {
    try {
      const [response] = await client.send(msg);
      const messageId = response.headers['x-message-id'] || `sg_${Date.now()}`;

      Lead.update(leadId, {
        total_emails_sent: lead.total_emails_sent + 1,
        last_contacted_at: new Date().toISOString(),
        status: lead.status === 'new' ? 'lead' : lead.status,
      });

      Activity.create({
        lead_id: leadId, type: 'email_sent', channel: 'email', direction: 'outbound',
        content: resolvedBody.substring(0, 500), sendgrid_id: messageId,
        metadata: { subject: resolvedSubject, quick_email: true },
      });

      console.log(`[SENDGRID] Quick email sent to ${lead.email} (ID: ${messageId})`);
      return { messageId, status: response.statusCode };
    } catch (err) {
      Activity.create({
        lead_id: leadId, type: 'email_failed', channel: 'email', direction: 'outbound',
        content: `Failed: ${err.message}`, metadata: { subject: resolvedSubject },
      });
      console.error(`[SENDGRID] Quick email failed: ${err.message}`);
      return null;
    }
  }

  // Dev mode
  console.log(`[SENDGRID-DEV] Would send email to ${lead.email}: "${resolvedSubject}"`);
  Lead.update(leadId, {
    total_emails_sent: lead.total_emails_sent + 1,
    last_contacted_at: new Date().toISOString(),
    status: lead.status === 'new' ? 'lead' : lead.status,
  });

  Activity.create({
    lead_id: leadId, type: 'email_sent', channel: 'email', direction: 'outbound',
    content: resolvedBody.substring(0, 500), sendgrid_id: `dev_${Date.now()}`,
    metadata: { subject: resolvedSubject, quick_email: true, dev_mode: true },
  });

  return { messageId: `dev_${Date.now()}`, status: 'dev_queued' };
}

module.exports = { sendEmail, sendQuickEmail, getClient };
