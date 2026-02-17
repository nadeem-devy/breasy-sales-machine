const cron = require('node-cron');
const config = require('../config');
const { runScheduler } = require('../services/sequenceEngine');
const { runDialpadSync } = require('../services/dialpadSync');
const db = require('../database/db');

let schedulerJob = null;

/**
 * Start the sequence scheduler cron job
 * Runs every N minutes (default: every 5 minutes)
 */
function startScheduler() {
  const interval = config.scheduler.intervalMinutes;
  const cronExpression = `*/${interval} * * * *`;

  console.log(`[CRON] Starting sequence scheduler (every ${interval} minutes)`);

  schedulerJob = cron.schedule(cronExpression, async () => {
    try {
      await runScheduler();
    } catch (err) {
      console.error('[CRON] Scheduler error:', err.message);
    }
  });

  // Dialpad sync — every 5 minutes, pull calls + SMS from Dialpad API
  cron.schedule(cronExpression, async () => {
    try {
      await runDialpadSync();
    } catch (err) {
      console.error('[CRON] Dialpad sync error:', err.message);
    }
  });

  // Ad campaign metrics sync — every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { syncAllCampaigns, syncGoogleLeads } = require('../services/adCampaignSync');
      await syncAllCampaigns();
      await syncGoogleLeads();
    } catch (err) {
      console.error('[CRON] Ad campaign sync error:', err.message);
    }
  });

  // Also run daily metrics rollup at midnight
  cron.schedule('59 23 * * *', () => {
    try {
      rollupDailyMetrics();
    } catch (err) {
      console.error('[CRON] Metrics rollup error:', err.message);
    }
  });

  // Weekly score decay — every Sunday at midnight
  cron.schedule('0 0 * * 0', () => {
    try {
      applyScoreDecay();
    } catch (err) {
      console.error('[CRON] Score decay error:', err.message);
    }
  });

  console.log('[CRON] All scheduled jobs started.');
}

function stopScheduler() {
  if (schedulerJob) {
    schedulerJob.stop();
    console.log('[CRON] Scheduler stopped.');
  }
}

/**
 * Daily metrics rollup — aggregate today's activities into daily_metrics
 */
function rollupDailyMetrics() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[CRON] Rolling up metrics for ${today}`);

  const metrics = {
    sms_sent: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'sms_sent' AND date(created_at) = ?`).get(today).c,
    sms_delivered: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'sms_delivered' AND date(created_at) = ?`).get(today).c,
    sms_replied: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'sms_replied' AND date(created_at) = ?`).get(today).c,
    sms_opt_outs: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'opt_out' AND channel = 'sms' AND date(created_at) = ?`).get(today).c,
    emails_sent: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_sent' AND date(created_at) = ?`).get(today).c,
    emails_opened: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_opened' AND date(created_at) = ?`).get(today).c,
    emails_clicked: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_clicked' AND date(created_at) = ?`).get(today).c,
    emails_replied: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_replied' AND date(created_at) = ?`).get(today).c,
    emails_bounced: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'email_bounced' AND date(created_at) = ?`).get(today).c,
    calls_made: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_initiated' AND date(created_at) = ?`).get(today).c,
    calls_answered: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_answered' AND date(created_at) = ?`).get(today).c,
    calls_qualified: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'call_qualified' AND date(created_at) = ?`).get(today).c,
    meetings_booked: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'meeting_booked' AND date(created_at) = ?`).get(today).c,
    app_downloads: db.prepare(`SELECT COUNT(*) as c FROM activities WHERE type = 'app_download' AND date(created_at) = ?`).get(today).c,
    leads_imported: db.prepare(`SELECT COUNT(*) as c FROM leads WHERE date(created_at) = ?`).get(today).c,
  };

  db.prepare(`
    INSERT OR REPLACE INTO daily_metrics (date, leads_imported, sms_sent, sms_delivered, sms_replied, sms_opt_outs,
      emails_sent, emails_opened, emails_clicked, emails_replied, emails_bounced,
      calls_made, calls_answered, calls_qualified, meetings_booked, app_downloads)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    today, metrics.leads_imported, metrics.sms_sent, metrics.sms_delivered, metrics.sms_replied, metrics.sms_opt_outs,
    metrics.emails_sent, metrics.emails_opened, metrics.emails_clicked, metrics.emails_replied, metrics.emails_bounced,
    metrics.calls_made, metrics.calls_answered, metrics.calls_qualified, metrics.meetings_booked, metrics.app_downloads
  );

  console.log(`[CRON] Metrics rolled up for ${today}:`, metrics);
}

/**
 * Weekly score decay — reduce scores of inactive leads
 */
function applyScoreDecay() {
  console.log('[CRON] Applying weekly score decay...');

  const staleLeads = db.prepare(`
    SELECT id, score, score_tier FROM leads
    WHERE sequence_status = 'active'
      AND score > 10
      AND (last_contacted_at IS NULL OR datetime(last_contacted_at) < datetime('now', '-7 days'))
      AND (last_reply_at IS NULL OR datetime(last_reply_at) < datetime('now', '-7 days'))
  `).all();

  for (const lead of staleLeads) {
    const newScore = lead.score - 3;
    const { calculateTier } = require('../services/scoring');
    const newTier = calculateTier(newScore);

    db.prepare('UPDATE leads SET score = ?, score_tier = ? WHERE id = ?').run(newScore, newTier, lead.id);

    if (newTier !== lead.score_tier) {
      console.log(`[CRON] Lead #${lead.id} decayed: ${lead.score} → ${newScore} (${lead.score_tier} → ${newTier})`);
    }
  }

  console.log(`[CRON] Score decay applied to ${staleLeads.length} leads.`);
}

module.exports = { startScheduler, stopScheduler, rollupDailyMetrics };
