const db = require('../database/db');

const AICallLog = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO ai_call_logs (lead_id, call_sid, twilio_sid, call_type, operator_phone, status, provider, provider_sid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.lead_id,
      data.call_sid || '',
      data.twilio_sid || '',
      data.call_type || 'ai',
      data.operator_phone || null,
      data.status || 'initiated',
      data.provider || 'twilio',
      data.provider_sid || null
    );
    return AICallLog.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare('SELECT * FROM ai_call_logs WHERE id = ?').get(id);
  },

  findByCallSid(sid) {
    return db.prepare('SELECT * FROM ai_call_logs WHERE call_sid = ?').get(sid);
  },

  update(id, data) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    db.prepare(`UPDATE ai_call_logs SET ${fields} WHERE id = ?`).run(...values, id);
    return AICallLog.findById(id);
  },

  getByLead(leadId) {
    return db.prepare('SELECT * FROM ai_call_logs WHERE lead_id = ? ORDER BY created_at DESC').all(leadId);
  },

  countNoAnswerForLead(leadId) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM ai_call_logs
      WHERE lead_id = ? AND outcome = 'no_answer'
    `).get(leadId).count;
  },

  countTodayCalls() {
    return db.prepare(`
      SELECT COUNT(*) as count FROM ai_call_logs
      WHERE date(created_at) = date('now')
    `).get().count;
  },

  findByTwilioSid(sid) {
    return db.prepare('SELECT * FROM ai_call_logs WHERE twilio_sid = ?').get(sid);
  },

  findByProviderSid(sid) {
    return db.prepare('SELECT * FROM ai_call_logs WHERE provider_sid = ?').get(sid);
  },

  getAllWithLeadInfo(limit = 50, offset = 0, filters = {}) {
    let where = '1=1';
    const params = [];
    if (filters.call_type) { where += ' AND c.call_type = ?'; params.push(filters.call_type); }
    if (filters.status) { where += ' AND c.status = ?'; params.push(filters.status); }
    if (filters.outcome) { where += ' AND c.outcome = ?'; params.push(filters.outcome); }

    const total = db.prepare(`SELECT COUNT(*) as count FROM ai_call_logs c WHERE ${where}`).get(...params).count;

    const callParams = [...params, limit, offset];
    const calls = db.prepare(`
      SELECT c.*, l.first_name, l.last_name, l.company_name, l.phone
      FROM ai_call_logs c
      LEFT JOIN leads l ON l.id = c.lead_id
      WHERE ${where}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...callParams);

    return { calls, total };
  },
};

module.exports = AICallLog;
