const db = require('../database/db');

const Campaign = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO campaigns (name, source, start_date, end_date, is_active)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(data.name, data.source || 'manual', data.start_date || null, data.end_date || null, 1);
    return Campaign.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  },

  getAll() {
    return db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  },

  getActive() {
    return db.prepare('SELECT * FROM campaigns WHERE is_active = 1 ORDER BY created_at DESC').all();
  },

  updateNiche(id, data) {
    db.prepare(`
      UPDATE campaigns SET
        target_categories = ?,
        rejected_categories = ?,
        niche_name = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      data.target_categories || '',
      data.rejected_categories || '',
      data.niche_name || 'General',
      id
    );
    return Campaign.findById(id);
  },

  getNicheConfig(id) {
    const campaign = Campaign.findById(id);
    if (!campaign) return null;
    return {
      target_categories: (campaign.target_categories || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      rejected_categories: (campaign.rejected_categories || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      niche_name: campaign.niche_name || 'General',
    };
  },

  updateCounts(id) {
    db.prepare(`
      UPDATE campaigns SET
        total_leads = (SELECT COUNT(*) FROM leads WHERE campaign_id = ?),
        total_contacted = (SELECT COUNT(*) FROM leads WHERE campaign_id = ? AND status != 'new'),
        total_qualified = (SELECT COUNT(*) FROM leads WHERE campaign_id = ? AND status IN ('qualifying', 'ready_for_work')),
        total_converted = (SELECT COUNT(*) FROM leads WHERE campaign_id = ? AND status = 'ready_for_work'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(id, id, id, id, id);
    return Campaign.findById(id);
  },
};

module.exports = Campaign;
