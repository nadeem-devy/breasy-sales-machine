const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const AICallLog = require('../models/AICallLog');
const { updateScore } = require('../services/scoring');
const { routeLead } = require('../services/routing');
const { sendQuickSMS } = require('../integrations/twilio');
const { notify } = require('../services/notifier');

/**
 * Vapi Call Webhook
 * POST /webhooks/vapi
 * Called by Vapi when call status changes or ends
 */
router.post('/', async (req, res) => {
  try {
    const payload = req.body;
    const messageType = payload.message?.type || payload.type || 'unknown';

    console.log(`[VAPI-WH] Event: ${messageType}`);

    switch (messageType) {
      case 'end-of-call-report':
        await handleCallEnd(payload);
        break;
      case 'status-update':
        handleStatusUpdate(payload);
        break;
      case 'function-call':
        handleFunctionCall(payload, res);
        return; // Function calls need custom response
      default:
        console.log(`[VAPI-WH] Unhandled event type: ${messageType}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[VAPI-WH] Error:', err.message);
    res.status(200).json({ error: err.message });
  }
});

async function handleCallEnd(payload) {
  const call = payload.message?.call || payload.call || payload;
  const callId = call.id || call.callId;
  const analysis = payload.message?.analysis || payload.analysis || {};
  const artifact = payload.message?.artifact || payload.artifact || {};
  const transcript = artifact.transcript || '';
  const recordingUrl = artifact.recordingUrl || '';
  const duration = call.duration || call.endedAt && call.startedAt
    ? Math.round((new Date(call.endedAt) - new Date(call.startedAt)) / 1000)
    : 0;

  // Determine if this is an inbound call
  const callType = call.type || 'outboundPhoneCall';
  const isInbound = callType === 'inboundPhoneCall';

  // Parse structured data from analysis (needed early for inbound handling)
  const structuredData = analysis.structuredData || {};

  // Find call log
  let callLog = AICallLog.findByCallSid(callId);
  if (!callLog) {
    // Try to find by caller phone number
    const customerNumber = call.customer?.number;
    if (customerNumber) {
      const lead = Lead.findByPhone(customerNumber);
      if (lead) {
        callLog = { lead_id: lead.id, id: null };
      }
    }
  }

  // For inbound calls with no matching lead — log as general inbound
  if (!callLog && isInbound) {
    const callerNumber = call.customer?.number || 'unknown';
    console.log(`[VAPI-WH] Inbound call from ${callerNumber} (${duration}s)`);

    const newLog = AICallLog.create({
      lead_id: null,
      call_sid: callId,
      call_type: 'inbound',
      status: 'completed',
      operator_phone: callerNumber,
    });
    if (newLog) {
      AICallLog.update(newLog.id, {
        duration_seconds: duration,
        outcome: structuredData.outcome || 'unknown',
        transcript: transcript.substring(0, 10000),
        summary: analysis.summary || '',
        interest_level: structuredData.interest_level || 'none',
        recording_url: recordingUrl,
        structured_data: JSON.stringify(structuredData),
      });
    }

    Activity.create({
      lead_id: null,
      type: 'inbound_call',
      channel: 'call',
      direction: 'inbound',
      content: `Inbound call from ${callerNumber} (${duration}s). ${analysis.summary || ''}`.substring(0, 500),
      metadata: {
        call_id: callId,
        caller_number: callerNumber,
        duration,
        outcome: structuredData.outcome || 'unknown',
        caller_intent: structuredData.caller_intent || '',
        is_inbound: true,
      },
    });

    notify('inbound-call', {
      callerNumber,
      duration,
      outcome: structuredData.outcome || 'unknown',
      summary: analysis.summary || '',
      callerIntent: structuredData.caller_intent || '',
      interestLevel: structuredData.interest_level || 'none',
      transcript: transcript.substring(0, 500),
      recordingUrl,
    });

    return;
  }

  // For inbound calls FROM a known lead — log with lead context
  if (callLog && isInbound) {
    const leadId = callLog.lead_id;
    console.log(`[VAPI-WH] Inbound call from lead #${leadId} (${duration}s)`);

    if (callLog.id) {
      AICallLog.update(callLog.id, {
        call_type: 'inbound',
        status: 'completed',
        duration_seconds: duration,
        outcome: structuredData.outcome || 'unknown',
        transcript: transcript.substring(0, 10000),
        summary: analysis.summary || '',
        interest_level: structuredData.interest_level || 'none',
        recording_url: recordingUrl,
        structured_data: JSON.stringify(structuredData),
        operator_phone: call.customer?.number || '',
      });
    } else {
      const newLog = AICallLog.create({
        lead_id: leadId,
        call_sid: callId,
        call_type: 'inbound',
        status: 'completed',
        operator_phone: call.customer?.number || '',
      });
      if (newLog) {
        AICallLog.update(newLog.id, {
          duration_seconds: duration,
          outcome: structuredData.outcome || 'unknown',
          transcript: transcript.substring(0, 10000),
          summary: analysis.summary || '',
          interest_level: structuredData.interest_level || 'none',
          recording_url: recordingUrl,
          structured_data: JSON.stringify(structuredData),
        });
      }
    }

    Activity.create({
      lead_id: leadId,
      type: 'inbound_call',
      channel: 'call',
      direction: 'inbound',
      content: `Inbound call (${duration}s). ${analysis.summary || ''}`.substring(0, 500),
      metadata: { call_id: callId, duration, outcome: structuredData.outcome || 'unknown', is_inbound: true },
    });

    // Score boost for inbound call (lead calling us = high interest)
    const lead = Lead.findById(leadId);
    if (lead) {
      updateScore(leadId, 'call_answered');
      if (structuredData.interest_level === 'high') {
        updateScore(leadId, 'wants_meeting');
      }

      notify('inbound-call', {
        leadId,
        leadName: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || `Lead #${leadId}`,
        callerNumber: lead.phone,
        duration,
        outcome: structuredData.outcome || 'unknown',
        summary: analysis.summary || '',
        interestLevel: structuredData.interest_level || 'none',
      });
    }

    return;
  }

  if (!callLog) {
    console.log(`[VAPI-WH] No call log found for call ${callId}`);
    return;
  }

  // ---- OUTBOUND CALL HANDLING (existing logic) ----
  const summary = analysis.summary || '';
  const outcome = structuredData.outcome || (call.endedReason === 'customer-did-not-answer' ? 'no_answer' : 'not_qualified');
  const interestLevel = structuredData.interest_level || 'none';
  const wantsMeeting = structuredData.wants_meeting || false;
  const wantsApp = structuredData.wants_app || false;
  const objections = structuredData.objections || '';

  // Determine status
  let status = 'completed';
  if (call.endedReason === 'customer-did-not-answer') status = 'no_answer';
  else if (call.endedReason === 'voicemail') status = 'voicemail';
  else if (duration > 0) status = 'completed';
  else status = 'no_answer';

  // Update call log
  if (callLog.id) {
    AICallLog.update(callLog.id, {
      status,
      duration_seconds: duration,
      outcome,
      transcript: transcript.substring(0, 10000),
      summary,
      interest_level: interestLevel,
      wants_meeting: wantsMeeting ? 1 : 0,
      wants_app: wantsApp ? 1 : 0,
      objections,
      recording_url: recordingUrl,
      structured_data: JSON.stringify(structuredData),
    });
  }

  const leadId = callLog.lead_id;
  const lead = Lead.findById(leadId);
  if (!lead) return;

  // Process outcome
  if (status === 'no_answer') {
    Activity.create({
      lead_id: leadId, type: 'call_no_answer', channel: 'call',
      content: 'AI call — no answer',
    });

    const noAnswerCount = AICallLog.countNoAnswerForLead(leadId);
    if (noAnswerCount >= 3) {
      updateScore(leadId, 'no_answer_3x');
    }
    return;
  }

  if (outcome === 'wrong_number') {
    Lead.update(leadId, { status: 'bad_data', score: -50, score_tier: 'dead', sequence_status: 'stopped' });
    Activity.create({
      lead_id: leadId, type: 'call_completed', channel: 'call',
      content: 'Wrong number — lead marked as dead.',
    });
    return;
  }

  // Call was answered
  Activity.create({
    lead_id: leadId, type: 'call_answered', channel: 'call',
    content: `Call answered (${duration}s). ${summary}`.substring(0, 500),
    metadata: { duration, outcome, interest_level: interestLevel },
  });

  // Score for answering
  let scoreResult = updateScore(leadId, 'call_answered');

  // Bonus for long call
  if (duration >= 60) {
    scoreResult = updateScore(leadId, 'call_long');
  }

  // Score for qualification
  if (outcome === 'qualified') {
    scoreResult = updateScore(leadId, 'call_qualified');
    Lead.update(leadId, {
      call_qualified: 1,
    });
    Activity.create({
      lead_id: leadId, type: 'call_qualified', channel: 'call',
      content: `QUALIFIED on AI call! Interest: ${interestLevel}. ${summary}`.substring(0, 500),
    });
  }

  if (wantsMeeting) {
    scoreResult = updateScore(leadId, 'wants_meeting');
    // Auto-send meeting link
    const updatedLead = Lead.findById(leadId);
    await sendQuickSMS(leadId,
      `Hey {{first_name}}, great chatting! Here's the link to book your 15-min demo with our team:\n\n{{meeting_link}}\n\nPick whatever time works best. Talk soon!\n— Sarah, Breasy`
    );
  }

  if (wantsApp) {
    scoreResult = updateScore(leadId, 'wants_app');
    await sendQuickSMS(leadId,
      `{{first_name}}, as promised — here's the free app download:\n\n{{app_link}}\n\nTakes about 2 min to set up. Text me if you have any Qs!\n— Sarah, Breasy`
    );
  }

  if (outcome === 'callback') {
    Activity.create({
      lead_id: leadId, type: 'note_added', channel: 'call',
      content: `Requested callback. Preferred time: ${structuredData.preferred_callback_time || 'not specified'}`,
    });
  }

  // Route based on new score
  const finalLead = Lead.findById(leadId);
  if (scoreResult && scoreResult.tierChanged) {
    routeLead(finalLead, scoreResult.oldTier, scoreResult.newTier);
  }

  // Push notification to dashboard
  notify('ai-call-ended', {
    leadId,
    leadName: `${finalLead.first_name || ''} ${finalLead.last_name || ''}`.trim() || `Lead #${leadId}`,
    phone: finalLead.phone,
    duration,
    outcome,
    summary,
    interestLevel,
    transcript: transcript.substring(0, 500),
    recordingUrl,
    wantsMeeting,
    wantsApp,
    status,
  });
}

function handleStatusUpdate(payload) {
  const status = payload.message?.status || payload.status;
  const callId = payload.message?.call?.id || payload.call?.id;
  console.log(`[VAPI-WH] Call ${callId} status: ${status}`);
}

function handleFunctionCall(payload, res) {
  const functionCall = payload.message?.functionCall || payload.functionCall;
  const fnName = functionCall?.name || 'unknown';
  const call = payload.message?.call || payload.call || {};
  const callerNumber = call.customer?.number || 'unknown';
  const config = require('../config');

  console.log(`[VAPI-WH] Function call: ${fnName} (caller: ${callerNumber})`);

  if (fnName === 'transferCall') {
    const destNumber = functionCall?.parameters?.destination || functionCall?.parameters?.number || '';
    const routingEntry = config.vapi.routing[destNumber];
    const destination = routingEntry ? routingEntry.name : (destNumber || 'Unknown');
    const routingRole = routingEntry ? routingEntry.role : '';
    console.log(`[VAPI-WH] Transferring call from ${callerNumber} to ${destination} (${destNumber})${routingRole ? ' — ' + routingRole : ''}`);

    // Try to find the lead by caller phone
    const lead = callerNumber !== 'unknown' ? Lead.findByPhone(callerNumber) : null;

    Activity.create({
      lead_id: lead ? lead.id : null,
      type: 'call_transferred',
      channel: 'call',
      direction: 'inbound',
      content: `Inbound call from ${callerNumber} transferred to ${destination}`,
      metadata: {
        caller_number: callerNumber,
        transfer_to: destination,
        transfer_number: destNumber,
        transfer_role: routingRole,
        call_id: call.id,
      },
    });
  }

  // Respond to Vapi function calls
  res.status(200).json({ result: 'acknowledged' });
}

module.exports = router;
