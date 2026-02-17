const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const config = require('../config');
const db = require('../database/db');

/**
 * Route a lead after a tier change
 */
function routeLead(lead, oldTier, newTier) {
  console.log(`[ROUTING] Lead #${lead.id} "${lead.first_name}" tier changed: ${oldTier} → ${newTier}`);

  switch (newTier) {
    case 'dead':
      return handleDead(lead);
    case 'cold':
      return handleCold(lead);
    case 'warm':
      return handleWarm(lead);
    case 'hot':
      return handleHot(lead);
    case 'qualified':
      return handleQualified(lead);
    default:
      return { action: 'none' };
  }
}

function handleDead(lead) {
  const deadStatus = (lead.sms_opt_out || lead.email_opt_out || lead.call_opt_out)
    ? 'do_not_call'
    : 'bad_data';

  Lead.update(lead.id, {
    sequence_status: 'stopped',
    status: deadStatus,
  });

  if (lead.phone) Lead.addToSuppressionList(lead.phone, lead.email, 'dead_score');

  Activity.create({
    lead_id: lead.id,
    type: 'stage_change',
    channel: 'system',
    content: `Lead marked as ${deadStatus.replace(/_/g, ' ')}. All outreach stopped.`,
  });

  console.log(`[ROUTING] Lead #${lead.id} → ${deadStatus.toUpperCase()}. All outreach stopped.`);
  return { action: 'stopped', reason: deadStatus };
}

function handleCold(lead) {
  Activity.create({
    lead_id: lead.id,
    type: 'stage_change',
    channel: 'system',
    content: 'Lead is cold. Continuing automated sequence.',
  });
  return { action: 'continue' };
}

function handleWarm(lead) {
  Lead.update(lead.id, {
    status: lead.status === 'new' ? 'lead' : lead.status,
  });

  Activity.create({
    lead_id: lead.id,
    type: 'stage_change',
    channel: 'system',
    content: 'Lead is now WARM. Ensuring AI call step fires.',
  });

  console.log(`[ROUTING] Lead #${lead.id} → WARM. Continuing with priority.`);
  return { action: 'continue_priority' };
}

function handleHot(lead) {
  Lead.update(lead.id, {
    status: 'discovery',
    next_action_at: new Date().toISOString(),
  });

  Activity.create({
    lead_id: lead.id,
    type: 'stage_change',
    channel: 'system',
    content: 'Lead is now HOT → Discovery. Moved to front of call queue.',
  });

  console.log(`[ROUTING] Lead #${lead.id} → HOT / Discovery. Prioritized for call.`);

  return {
    action: 'prioritize',
    notifications: [{
      type: 'ops_alert',
      message: `Hot lead: ${lead.first_name} ${lead.last_name} from ${lead.company_name} (Score: ${lead.score})`,
    }],
  };
}

function handleQualified(lead) {
  Lead.update(lead.id, {
    status: 'qualifying',
    sequence_status: 'paused',
  });

  // Send qualifying notification email to Mari + maintenance
  sendQualifyingNotification(lead);

  Activity.create({
    lead_id: lead.id,
    type: 'stage_change',
    channel: 'system',
    content: `Lead QUALIFYING! Notification sent to Mari. Score: ${lead.score}. Sequence paused.`,
  });

  console.log(`[ROUTING] Lead #${lead.id} → QUALIFYING! Email notification sent. Sequence paused.`);

  return {
    action: 'qualifying',
    notifications: [{
      type: 'ops_alert',
      message: `NEW QUALIFYING LEAD: ${lead.first_name} ${lead.last_name} from ${lead.company_name}. Score: ${lead.score}. Email sent to Mari.`,
    }],
    autoActions: [
      { type: 'send_meeting_link', leadId: lead.id },
      { type: 'send_app_link', leadId: lead.id },
    ],
  };
}

/**
 * Build and send qualifying notification email to Mari + maintenance
 */
async function sendQualifyingNotification(lead) {
  const toEmail = db.prepare("SELECT value FROM system_settings WHERE key = 'qualifying_notification_email'").get()?.value || 'mari@joinbreasy.com';
  const ccEmail = db.prepare("SELECT value FROM system_settings WHERE key = 'qualifying_notification_cc'").get()?.value || 'maintenance@joinbreasy.com';

  // Get latest AI call log for this lead
  const callLog = db.prepare(`
    SELECT * FROM ai_call_logs WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(lead.id) || {};

  const htmlContent = buildQualifyingEmailContent(lead, callLog);

  const { getClient } = require('../integrations/sendgrid');
  const client = getClient();

  const msg = {
    to: toEmail,
    cc: ccEmail,
    from: { email: config.sendgrid.fromEmail, name: config.sendgrid.fromName },
    subject: `[Qualifying Lead] ${lead.first_name} ${lead.last_name} - ${lead.company_name || 'Unknown'}`,
    html: htmlContent,
  };

  if (client) {
    try {
      await client.send(msg);
      console.log(`[ROUTING] Qualifying notification sent for lead #${lead.id} to ${toEmail}`);
    } catch (err) {
      console.error(`[ROUTING] Failed to send qualifying notification: ${err.message}`);
    }
  } else {
    console.log(`[ROUTING-DEV] Would send qualifying notification for lead #${lead.id} to ${toEmail} (CC: ${ccEmail})`);
    console.log(`[ROUTING-DEV] Subject: ${msg.subject}`);
  }
}

/**
 * Build HTML content for qualifying notification email
 */
function buildQualifyingEmailContent(lead, callLog) {
  const suggestedAction = callLog.next_action || (lead.meeting_booked ? 'Meeting already booked' : 'Follow up with lead');

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#7c3aed;color:white;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">New Qualifying Lead</h2>
        <p style="margin:4px 0 0;opacity:0.9;">Score: ${lead.score} | ${new Date().toLocaleDateString()}</p>
      </div>

      <div style="background:#f9fafb;padding:20px;border:1px solid #e5e7eb;">
        <h3 style="margin-top:0;color:#374151;">Lead Information</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 12px;font-weight:600;color:#6b7280;">Name</td><td style="padding:6px 12px;">${lead.first_name} ${lead.last_name || ''}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#6b7280;">Company</td><td style="padding:6px 12px;">${lead.company_name || '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#6b7280;">Service Type</td><td style="padding:6px 12px;">${lead.service_type || '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#6b7280;">Market</td><td style="padding:6px 12px;">${lead.city || '—'}${lead.state ? ', ' + lead.state : ''}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#6b7280;">Phone</td><td style="padding:6px 12px;"><a href="tel:${lead.phone}">${lead.phone || '—'}</a></td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#6b7280;">Email</td><td style="padding:6px 12px;"><a href="mailto:${lead.email}">${lead.email || '—'}</a></td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#6b7280;">Score</td><td style="padding:6px 12px;"><strong>${lead.score}</strong> (${lead.score_tier})</td></tr>
        </table>
      </div>

      ${callLog.summary ? `
      <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none;">
        <h3 style="margin-top:0;color:#374151;">AI Call Summary</h3>
        <p style="color:#4b5563;line-height:1.6;">${callLog.summary}</p>
        ${callLog.interest_level ? `<p><strong>Interest Level:</strong> ${callLog.interest_level}</p>` : ''}
        ${callLog.objections ? `<p><strong>Objections:</strong> ${callLog.objections}</p>` : ''}
        ${callLog.duration_seconds ? `<p><strong>Call Duration:</strong> ${Math.round(callLog.duration_seconds / 60)} min</p>` : ''}
      </div>
      ` : ''}

      <div style="background:#eff6ff;padding:20px;border:1px solid #e5e7eb;border-top:none;">
        <h3 style="margin-top:0;color:#374151;">Suggested Next Step</h3>
        <p style="color:#1d4ed8;font-weight:600;font-size:16px;">${suggestedAction}</p>
      </div>

      <div style="background:#fff;padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <h3 style="margin-top:0;color:#374151;">Quick Links</h3>
        <p>
          <a href="${lead.app_download_link || config.links.appDownloadBaseUrl}" style="display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;margin-right:8px;">App Download Link</a>
          <a href="${lead.meeting_link || config.links.meetingBaseUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">Schedule Meeting</a>
        </p>
        ${lead.meeting_booked ? '<p style="color:#22c55e;font-weight:600;">Meeting already booked</p>' : ''}
        ${lead.app_downloaded ? '<p style="color:#22c55e;font-weight:600;">App already downloaded</p>' : ''}
      </div>
    </div>
  `;
}

/**
 * Handle lead reply — pause sequence and set to Discovery
 */
function handleReply(lead, channel, content) {
  Lead.update(lead.id, {
    replied: 1,
    last_reply_at: new Date().toISOString(),
    status: 'discovery',
    sequence_status: 'paused',
  });

  Activity.create({
    lead_id: lead.id,
    type: `${channel}_replied`,
    channel,
    direction: 'inbound',
    content: content.substring(0, 500),
  });

  console.log(`[ROUTING] Lead #${lead.id} REPLIED via ${channel}. Status → Discovery. Sequence paused.`);

  return {
    action: 'paused',
    notifications: [{
      type: 'rep_alert',
      message: `${lead.first_name} ${lead.last_name} replied via ${channel}: "${content.substring(0, 100)}"`,
    }],
  };
}

/**
 * Handle opt-out
 */
function handleOptOut(lead, channel) {
  const updates = {};

  if (channel === 'sms') {
    updates.sms_opt_out = 1;
    updates.call_opt_out = 1;
  } else if (channel === 'email') {
    updates.email_opt_out = 1;
  }

  const allOptedOut = (lead.sms_opt_out || updates.sms_opt_out) &&
                       (lead.email_opt_out || updates.email_opt_out);

  if (allOptedOut) {
    updates.sequence_status = 'stopped';
    updates.status = 'do_not_call';
    updates.score = -100;
    updates.score_tier = 'dead';
  }

  Lead.update(lead.id, updates);
  Lead.addToSuppressionList(lead.phone, lead.email, `opt_out_${channel}`);

  Activity.create({
    lead_id: lead.id,
    type: 'opt_out',
    channel,
    content: `Opted out of ${channel}. ${allOptedOut ? 'All channels opted out — marked Do Not Call.' : 'Other channels may continue.'}`,
  });

  console.log(`[ROUTING] Lead #${lead.id} opted out of ${channel}.${allOptedOut ? ' ALL channels — Do Not Call.' : ''}`);

  return { action: allOptedOut ? 'do_not_call' : 'partial_opt_out', channel };
}

module.exports = { routeLead, handleReply, handleOptOut, sendQualifyingNotification };
