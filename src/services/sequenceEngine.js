const config = require('../config');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { sendSMS } = require('../integrations/telephonyProvider');
const { sendEmail } = require('../integrations/sendgrid');
const { initiateCall } = require('../integrations/vapi');
const { isWithinStepWindow, getNextValidSendTime } = require('../utils/timeWindow');
const { updateScore } = require('./scoring');
const { routeLead } = require('./routing');
const db = require('../database/db');

/**
 * The core sequence scheduler — runs every 5 minutes
 * Finds leads with pending actions and executes their next step
 */
async function processSequenceBatch() {
  // Check emergency pause
  const paused = db.prepare("SELECT value FROM system_settings WHERE key = 'system_paused'").get();
  if (paused && paused.value === '1') {
    console.log('[SCHEDULER] System is PAUSED. Skipping batch.');
    return { processed: 0, reason: 'system_paused' };
  }

  const batchSize = config.scheduler.batchSize;
  const leads = Lead.getReadyForSequence(batchSize);

  if (leads.length === 0) {
    console.log('[SCHEDULER] No leads ready for processing.');
    return { processed: 0 };
  }

  console.log(`[SCHEDULER] Processing batch of ${leads.length} leads...`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const result = await processLeadStep(lead);
      if (result.executed) processed++;
      else skipped++;
    } catch (err) {
      console.error(`[SCHEDULER] Error processing lead #${lead.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`[SCHEDULER] Batch complete: ${processed} sent, ${skipped} skipped, ${errors} errors`);
  return { processed, skipped, errors };
}

async function processLeadStep(lead) {
  const stepNumber = lead.next_step_number;
  const channel = lead.next_channel;
  const templateId = lead.template_id;

  // === SKIP CONDITIONS ===

  // Skip if replied and step says to skip
  if (lead.skip_if_replied && lead.replied) {
    console.log(`[SCHEDULER] Lead #${lead.id}: Skipping step ${stepNumber} (already replied)`);
    advanceToNextStep(lead, channel);
    return { executed: false, reason: 'replied' };
  }

  // Skip if score too high
  if (lead.skip_if_score_above && lead.score > lead.skip_if_score_above) {
    console.log(`[SCHEDULER] Lead #${lead.id}: Skipping step ${stepNumber} (score ${lead.score} > ${lead.skip_if_score_above})`);
    advanceToNextStep(lead, channel);
    return { executed: false, reason: 'score_above_threshold' };
  }

  // === SEND WINDOW CHECK ===
  if (!isWithinStepWindow(lead.send_window_start, lead.send_window_end, lead.send_days)) {
    const nextTime = getNextValidSendTime(channel, 0);
    Lead.update(lead.id, { next_action_at: nextTime });
    console.log(`[SCHEDULER] Lead #${lead.id}: Outside send window. Rescheduled to ${nextTime}`);
    return { executed: false, reason: 'outside_window' };
  }

  // === DAILY LIMIT CHECK ===
  const todayCount = Activity.countTodayByChannel(channel === 'ai_call' ? 'call' : channel);
  const limit = channel === 'sms' ? config.limits.smsDailyLimit
    : channel === 'email' ? config.limits.emailDailyLimit
    : config.limits.callsDailyLimit;

  if (todayCount >= limit) {
    const nextTime = getNextValidSendTime(channel, 12); // Push to next day
    Lead.update(lead.id, { next_action_at: nextTime });
    console.log(`[SCHEDULER] Daily ${channel} limit reached (${todayCount}/${limit}). Rescheduled lead #${lead.id}`);
    return { executed: false, reason: 'daily_limit' };
  }

  // === OPT-OUT CHECK ===
  if (channel === 'sms' && lead.sms_opt_out) {
    advanceToNextStep(lead, channel);
    return { executed: false, reason: 'opted_out' };
  }
  if (channel === 'email' && lead.email_opt_out) {
    advanceToNextStep(lead, channel);
    return { executed: false, reason: 'opted_out' };
  }
  if (channel === 'ai_call' && lead.call_opt_out) {
    advanceToNextStep(lead, channel);
    return { executed: false, reason: 'opted_out' };
  }

  // === EXECUTE SEND ===
  let success = false;

  switch (channel) {
    case 'sms':
      if (templateId) {
        const result = await sendSMS(lead.id, templateId);
        success = !!result;
      }
      break;

    case 'email':
      if (templateId) {
        const result = await sendEmail(lead.id, templateId);
        success = !!result;
      }
      break;

    case 'ai_call':
      const result = await initiateCall(lead.id);
      success = !!result;
      break;
  }

  if (success) {
    advanceToNextStep(lead, channel);
    console.log(`[SCHEDULER] Lead #${lead.id}: Step ${stepNumber} (${channel}) executed successfully`);
  }

  return { executed: success };
}

function advanceToNextStep(lead, currentChannel) {
  // Get next step info
  const nextStep = db.prepare(`
    SELECT * FROM sequence_steps
    WHERE sequence_id = ? AND step_number = ?
  `).get(lead.sequence_id, lead.current_step + 2); // +2 because current_step is 0-indexed and we want the one after next

  if (!nextStep) {
    // Sequence complete
    Lead.update(lead.id, {
      current_step: lead.current_step + 1,
      sequence_status: 'completed',
    });
    Activity.create({
      lead_id: lead.id,
      type: 'note_added',
      channel: 'system',
      content: 'Sequence completed. All steps executed.',
    });
    console.log(`[SCHEDULER] Lead #${lead.id}: Sequence COMPLETED.`);
    return;
  }

  // Calculate next action time
  const nextTime = getNextValidSendTime(nextStep.channel, nextStep.delay_hours);

  Lead.update(lead.id, {
    current_step: lead.current_step + 1,
    next_action_at: nextTime,
  });
}

/**
 * Run the scheduler once (called by cron or manually)
 */
async function runScheduler() {
  console.log(`\n[SCHEDULER] ====== Run started at ${new Date().toISOString()} ======`);
  const result = await processSequenceBatch();
  console.log(`[SCHEDULER] ====== Run complete: ${JSON.stringify(result)} ======\n`);
  return result;
}

module.exports = { runScheduler, processSequenceBatch };
