const config = require('../config');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');

function calculateTier(score) {
  if (score < 0) return 'dead';
  if (score <= 20) return 'cold';
  if (score <= 40) return 'warm';
  if (score <= 60) return 'hot';
  return 'qualified';
}

function getPointsForEvent(eventType) {
  return config.scoring[eventType] || 0;
}

/**
 * Update lead score after an event
 * @param {number} leadId
 * @param {string} eventType - key from config.scoring
 * @param {number} bonusPoints - additional points
 * @returns {{ lead, tierChanged }}
 */
function updateScore(leadId, eventType, bonusPoints = 0) {
  const lead = Lead.findById(leadId);
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const points = getPointsForEvent(eventType) + bonusPoints;
  const oldScore = lead.score;
  const oldTier = lead.score_tier;
  const newScore = oldScore + points;
  const newTier = calculateTier(newScore);

  Lead.update(leadId, {
    score: newScore,
    score_tier: newTier,
  });

  Activity.create({
    lead_id: leadId,
    type: 'score_change',
    channel: 'system',
    content: `Score ${oldScore} → ${newScore} (${eventType}: ${points > 0 ? '+' : ''}${points}) [${newTier}]`,
    score_before: oldScore,
    score_after: newScore,
  });

  const tierChanged = oldTier !== newTier;
  console.log(`[SCORING] Lead #${leadId}: ${oldScore} → ${newScore} (${eventType}) Tier: ${oldTier} → ${newTier}${tierChanged ? ' *** CHANGED ***' : ''}`);

  return { lead: Lead.findById(leadId), tierChanged, oldTier, newTier };
}

module.exports = { updateScore, calculateTier, getPointsForEvent };
