const axios = require('axios');
const config = require('../config');
const db = require('../database/db');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const AICallLog = require('../models/AICallLog');
const { normalizePhone } = require('../utils/phone');
const { updateScore } = require('./scoring');
const { handleReply, handleOptOut } = require('./routing');

const DIALPAD_BASE = 'https://dialpad.com/api/v2';

function getHeaders() {
  // Check system_settings first (UI-configured), fall back to env
  const savedKey = db.prepare("SELECT value FROM system_settings WHERE key = 'dialpad_api_key'").get();
  const apiKey = (savedKey && savedKey.value) || config.dialpad.apiKey;
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function isConfigured() {
  const savedKey = db.prepare("SELECT value FROM system_settings WHERE key = 'dialpad_api_key'").get();
  const apiKey = (savedKey && savedKey.value) || config.dialpad.apiKey;
  return apiKey && !apiKey.startsWith('your_');
}

function getLastSyncTime() {
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'dialpad_last_sync'").get();
  if (row && row.value) return row.value;
  // Default: sync last 24 hours on first run
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

function updateLastSyncTime() {
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)")
    .run('dialpad_last_sync', now, 'Last Dialpad sync timestamp');
}

function alreadySynced(providerSid, table) {
  if (table === 'activities') {
    return !!db.prepare("SELECT 1 FROM activities WHERE provider = 'dialpad' AND provider_sid = ?").get(providerSid);
  }
  return !!db.prepare("SELECT 1 FROM ai_call_logs WHERE provider = 'dialpad' AND provider_sid = ?").get(providerSid);
}

/**
 * Sync recent calls from Dialpad API
 */
async function syncCalls(sinceTime) {
  let synced = 0;
  try {
    const params = {
      started_at_after: new Date(sinceTime).getTime(),
      limit: 100,
    };

    const response = await axios.get(`${DIALPAD_BASE}/stats/calls`, {
      headers: getHeaders(),
      params,
    });

    const calls = response.data.items || response.data.calls || response.data || [];
    if (!Array.isArray(calls)) {
      console.log('[DIALPAD-SYNC] Unexpected calls response format, skipping');
      return 0;
    }

    for (const call of calls) {
      const callId = String(call.id || call.call_id);
      if (!callId || alreadySynced(callId, 'ai_call_logs')) continue;

      // Determine direction and phone
      const isInbound = call.direction === 'inbound' || call.type === 'inbound';
      const externalPhone = normalizePhone(
        isInbound ? (call.from_number || call.caller_number) : (call.to_number || call.called_number)
      );

      if (!externalPhone) continue;

      const lead = Lead.findByPhone(externalPhone);
      if (!lead) {
        console.log(`[DIALPAD-SYNC] Call ${callId}: no lead for ${externalPhone}, skipping`);
        continue;
      }

      // Map Dialpad status
      const duration = parseInt(call.duration || call.duration_seconds || 0);
      let status = 'completed';
      if (call.status === 'missed' || call.status === 'no_answer') status = 'no_answer';
      else if (call.status === 'busy') status = 'busy';
      else if (call.status === 'failed') status = 'failed';
      else if (call.status === 'voicemail') status = 'voicemail';
      else if (duration === 0 && !isInbound) status = 'no_answer';

      // Create AICallLog
      AICallLog.create({
        lead_id: lead.id,
        twilio_sid: `dialpad_${callId}`,
        call_type: isInbound ? 'inbound' : 'manual',
        status,
        duration_seconds: duration,
        outcome: status === 'completed' && duration > 0 ? 'not_qualified' : 'no_answer',
        provider: 'dialpad',
        provider_sid: callId,
      });

      // Create Activity
      if (isInbound) {
        Activity.create({
          lead_id: lead.id,
          type: 'call_received',
          channel: 'call',
          direction: 'inbound',
          content: `Inbound Dialpad call from ${lead.first_name || externalPhone} (${duration}s)`,
          provider: 'dialpad',
          provider_sid: callId,
          metadata: { call_type: 'inbound', duration, synced: true },
        });
        if (duration > 0) updateScore(lead.id, 'call_answered');
      } else {
        const activityType = status === 'completed' && duration > 0 ? 'call_completed' : 'call_no_answer';
        Activity.create({
          lead_id: lead.id,
          type: activityType,
          channel: 'call',
          direction: 'outbound',
          content: `Dialpad call to ${lead.first_name || externalPhone} — ${status} (${duration}s)`,
          provider: 'dialpad',
          provider_sid: callId,
          metadata: { call_type: 'manual', duration, status, synced: true },
        });
        if (status === 'completed' && duration > 0) {
          updateScore(lead.id, 'call_answered');
          if (duration >= 60) updateScore(lead.id, 'call_long');
        }
      }

      synced++;
    }
  } catch (err) {
    console.error(`[DIALPAD-SYNC] Call sync error: ${err.message}`);
  }

  return synced;
}

/**
 * Sync recent SMS from Dialpad API
 */
async function syncSMS(sinceTime) {
  let synced = 0;
  try {
    const params = {
      after: new Date(sinceTime).getTime(),
      limit: 100,
    };

    const response = await axios.get(`${DIALPAD_BASE}/sms`, {
      headers: getHeaders(),
      params,
    });

    const messages = response.data.items || response.data.messages || response.data || [];
    if (!Array.isArray(messages)) {
      console.log('[DIALPAD-SYNC] Unexpected SMS response format, skipping');
      return 0;
    }

    for (const msg of messages) {
      const msgId = String(msg.id || msg.message_id);
      if (!msgId || alreadySynced(msgId, 'activities')) continue;

      const isInbound = msg.direction === 'inbound' || msg.type === 'inbound';
      const externalPhone = normalizePhone(
        isInbound ? (msg.from_number || msg.sender) : (msg.to_number || msg.recipient)
      );
      const text = msg.text || msg.body || msg.content || '';

      if (!externalPhone) continue;

      const lead = Lead.findByPhone(externalPhone);
      if (!lead) {
        console.log(`[DIALPAD-SYNC] SMS ${msgId}: no lead for ${externalPhone}, skipping`);
        continue;
      }

      if (isInbound) {
        // Check opt-out
        const upperBody = text.toUpperCase().trim();
        const isOptOut = config.optOutKeywords.some(kw => upperBody === kw || upperBody.startsWith(kw + ' '));

        if (isOptOut) {
          handleOptOut(lead, 'sms');
        }

        Activity.create({
          lead_id: lead.id,
          type: 'sms_replied',
          channel: 'sms',
          direction: 'inbound',
          content: text.substring(0, 500),
          provider: 'dialpad',
          provider_sid: msgId,
          twilio_sid: `dialpad_${msgId}`,
          metadata: { synced: true },
        });

        if (!isOptOut) {
          updateScore(lead.id, 'sms_replied');
          handleReply(lead, 'sms', text);
        }
      } else {
        // Outbound SMS sent from Dialpad (outside platform)
        Activity.create({
          lead_id: lead.id,
          type: 'sms_sent',
          channel: 'sms',
          direction: 'outbound',
          content: text.substring(0, 300),
          provider: 'dialpad',
          provider_sid: msgId,
          twilio_sid: `dialpad_${msgId}`,
          metadata: { synced: true, sent_outside_platform: true },
        });
      }

      synced++;
    }
  } catch (err) {
    console.error(`[DIALPAD-SYNC] SMS sync error: ${err.message}`);
  }

  return synced;
}

/**
 * Main sync entry point — called by scheduler and manual trigger
 */
async function runDialpadSync() {
  if (!isConfigured()) {
    return { success: false, error: 'Dialpad not configured' };
  }

  const sinceTime = getLastSyncTime();
  console.log(`[DIALPAD-SYNC] Starting sync since ${sinceTime}...`);

  const callsSynced = await syncCalls(sinceTime);
  const smsSynced = await syncSMS(sinceTime);

  updateLastSyncTime();

  console.log(`[DIALPAD-SYNC] Done — ${callsSynced} calls, ${smsSynced} SMS synced`);
  return { success: true, calls_synced: callsSynced, sms_synced: smsSynced };
}

module.exports = { runDialpadSync };
