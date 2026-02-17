const db = require('../database/db');

const Activity = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO activities (lead_id, type, channel, direction, content, metadata, score_before, score_after, twilio_sid, sendgrid_id, provider, provider_sid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.lead_id,
      data.type,
      data.channel || 'system',
      data.direction || null,
      data.content || '',
      data.metadata ? JSON.stringify(data.metadata) : null,
      data.score_before ?? null,
      data.score_after ?? null,
      data.twilio_sid || null,
      data.sendgrid_id || null,
      data.provider || 'twilio',
      data.provider_sid || null
    );
    return Activity.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
  },

  getByLead(leadId, limit = 50) {
    return db.prepare('SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT ?').all(leadId, limit);
  },

  countTodayByType(type) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM activities
      WHERE type = ? AND date(created_at) = date('now')
    `).get(type).count;
  },

  countTodayByChannel(channel) {
    return db.prepare(`
      SELECT COUNT(*) as count FROM activities
      WHERE channel = ? AND direction = 'outbound' AND date(created_at) = date('now')
    `).get(channel).count;
  },

  getRecentFeed(limit = 50) {
    return db.prepare(`
      SELECT a.*, l.first_name, l.last_name, l.company_name
      FROM activities a
      JOIN leads l ON l.id = a.lead_id
      ORDER BY a.created_at DESC
      LIMIT ?
    `).all(limit);
  },

  getMetricsForDate(date) {
    return db.prepare(`
      SELECT type, COUNT(*) as count
      FROM activities
      WHERE date(created_at) = ?
      GROUP BY type
    `).all(date);
  },

  getSMSThread(leadId, limit = 100) {
    return db.prepare(`
      SELECT id, type, channel, direction, content, twilio_sid, created_at
      FROM activities
      WHERE lead_id = ? AND channel = 'sms' AND type IN ('sms_sent', 'sms_replied')
      ORDER BY created_at ASC
      LIMIT ?
    `).all(leadId, limit);
  },

  getSMSInbox(limit = 50, offset = 0, search = '') {
    let where = '';
    const params = [];
    if (search) {
      where = ` AND (l.first_name LIKE ? OR l.last_name LIKE ? OR l.company_name LIKE ? OR l.phone LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM leads l
      WHERE EXISTS (
        SELECT 1 FROM activities a2 WHERE a2.lead_id = l.id AND a2.channel = 'sms' AND a2.type IN ('sms_sent', 'sms_replied')
      )${where}
    `).get(...params).count;

    const conversations = db.prepare(`
      SELECT l.id, l.first_name, l.last_name, l.company_name, l.phone, l.sms_read_at,
        a.content as last_message, a.created_at as last_message_at, a.direction, a.type as last_type,
        (SELECT COUNT(*) FROM activities a3
         WHERE a3.lead_id = l.id AND a3.channel = 'sms' AND a3.type = 'sms_replied'
         AND (l.sms_read_at IS NULL OR a3.created_at > l.sms_read_at)
        ) as unread_count
      FROM leads l
      JOIN activities a ON a.lead_id = l.id AND a.channel = 'sms' AND a.type IN ('sms_sent', 'sms_replied')
      WHERE a.id = (
        SELECT MAX(a2.id) FROM activities a2
        WHERE a2.lead_id = l.id AND a2.channel = 'sms' AND a2.type IN ('sms_sent', 'sms_replied')
      )${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { conversations, total };
  },

  getEmailThread(leadId, limit = 100) {
    return db.prepare(`
      SELECT id, type, channel, direction, content, metadata, sendgrid_id, created_at
      FROM activities
      WHERE lead_id = ? AND channel = 'email' AND type IN ('email_sent', 'email_replied')
      ORDER BY created_at ASC
      LIMIT ?
    `).all(leadId, limit);
  },

  getEmailInbox(limit = 50, offset = 0, search = '') {
    let where = '';
    const params = [];
    if (search) {
      where = ` AND (l.first_name LIKE ? OR l.last_name LIKE ? OR l.company_name LIKE ? OR l.email LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM leads l
      WHERE EXISTS (
        SELECT 1 FROM activities a2 WHERE a2.lead_id = l.id AND a2.channel = 'email' AND a2.type IN ('email_sent', 'email_replied')
      )${where}
    `).get(...params).count;

    const conversations = db.prepare(`
      SELECT l.id, l.first_name, l.last_name, l.company_name, l.email,
        a.content as last_message, a.metadata, a.created_at as last_message_at, a.direction, a.type as last_type
      FROM leads l
      JOIN activities a ON a.lead_id = l.id AND a.channel = 'email' AND a.type IN ('email_sent', 'email_replied')
      WHERE a.id = (
        SELECT MAX(a2.id) FROM activities a2
        WHERE a2.lead_id = l.id AND a2.channel = 'email' AND a2.type IN ('email_sent', 'email_replied')
      )${where}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { conversations, total };
  },

  getMetricsForDateRange(startDate, endDate) {
    return db.prepare(`
      SELECT date(created_at) as date, type, COUNT(*) as count
      FROM activities
      WHERE date(created_at) BETWEEN ? AND ?
      GROUP BY date(created_at), type
      ORDER BY date(created_at)
    `).all(startDate, endDate);
  },
};

module.exports = Activity;
