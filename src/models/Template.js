const db = require('../database/db');

const Template = {
  findById(id) {
    return db.prepare('SELECT * FROM message_templates WHERE id = ?').get(id);
  },

  getByChannel(channel) {
    return db.prepare('SELECT * FROM message_templates WHERE channel = ? AND is_active = 1 ORDER BY id').all(channel);
  },

  getAll() {
    return db.prepare('SELECT * FROM message_templates ORDER BY channel, id').all();
  },

  incrementSendCount(id) {
    db.prepare('UPDATE message_templates SET send_count = send_count + 1 WHERE id = ?').run(id);
  },

  incrementReplyCount(id) {
    db.prepare('UPDATE message_templates SET reply_count = reply_count + 1 WHERE id = ?').run(id);
  },

  incrementOpenCount(id) {
    db.prepare('UPDATE message_templates SET open_count = open_count + 1 WHERE id = ?').run(id);
  },

  incrementClickCount(id) {
    db.prepare('UPDATE message_templates SET click_count = click_count + 1 WHERE id = ?').run(id);
  },

  getABTestResults() {
    return db.prepare(`
      SELECT name, version, send_count, reply_count, open_count, click_count,
        CASE WHEN send_count > 0 THEN ROUND(reply_count * 100.0 / send_count, 1) ELSE 0 END as reply_rate,
        CASE WHEN send_count > 0 THEN ROUND(open_count * 100.0 / send_count, 1) ELSE 0 END as open_rate
      FROM message_templates
      WHERE is_active = 1
      ORDER BY name, version
    `).all();
  },

  // Pick A/B variant based on lead unique_id
  pickVariant(templateId, leadUniqueId) {
    const template = Template.findById(templateId);
    if (!template) return null;

    // Check if there's a B variant
    const baseName = template.name.replace(/ \(.*\)$/, '');
    const variants = db.prepare(`
      SELECT * FROM message_templates
      WHERE name LIKE ? AND channel = ? AND is_active = 1
      ORDER BY version
    `).all(`${baseName}%`, template.channel);

    if (variants.length <= 1) return template;

    // Use last char of unique_id to determine variant
    const lastChar = leadUniqueId.charCodeAt(leadUniqueId.length - 1);
    const index = lastChar % variants.length;
    return variants[index];
  },
};

module.exports = Template;
