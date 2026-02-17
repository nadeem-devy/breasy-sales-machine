const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

const Lead = {
  create(data) {
    const uniqueId = uuidv4().split('-')[0];
    const videoLink = `${config.links.videoBaseUrl}?lead=${uniqueId}`;
    const appLink = `${config.links.appDownloadBaseUrl}?utm_source=outreach&utm_campaign=${data.campaign_id || ''}&utm_content=${uniqueId}`;
    const meetingLink = `${config.links.meetingBaseUrl}?name=${encodeURIComponent(data.first_name || '')}&email=${encodeURIComponent(data.email || '')}`;

    const stmt = db.prepare(`
      INSERT INTO leads (unique_id, first_name, last_name, email, phone, company_name, job_title, industry, service_type, city, state, source, campaign_id, sequence_id, sequence_status, next_action_at, video_link, app_download_link, meeting_link, hubspot_id, tags, enrichment_sources, data_completeness, quality_score, qualification_grade, phone_line_type, website_status, enrichment_data, website, address, rating, review_count, employee_count, ad_campaign_id, ad_platform, ad_lead_form_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      uniqueId,
      data.first_name || '',
      data.last_name || '',
      data.email || '',
      data.phone || '',
      data.company_name || '',
      data.job_title || '',
      data.industry || '',
      data.service_type || '',
      data.city || '',
      data.state || '',
      data.source || 'manual',
      data.campaign_id || 1,
      data.sequence_id || 1,
      videoLink,
      appLink,
      meetingLink,
      data.hubspot_id || '',
      data.tags || '',
      data.enrichment_sources || '',
      data.data_completeness || 0,
      data.quality_score || 0,
      data.qualification_grade || '',
      data.phone_line_type || '',
      data.website_status || '',
      data.enrichment_data || '{}',
      data.website || '',
      data.address || '',
      data.rating || 0,
      data.review_count || 0,
      data.employee_count || 0,
      data.ad_campaign_id || null,
      data.ad_platform || null,
      data.ad_lead_form_data || null
    );

    return Lead.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  },

  findByUniqueId(uniqueId) {
    return db.prepare('SELECT * FROM leads WHERE unique_id = ?').get(uniqueId);
  },

  findByPhone(phone) {
    return db.prepare('SELECT * FROM leads WHERE phone = ?').get(phone);
  },

  findByEmail(email) {
    return db.prepare('SELECT * FROM leads WHERE email = ?').get(email);
  },

  findDuplicate(phone, email) {
    return db.prepare('SELECT * FROM leads WHERE phone = ? OR email = ?').get(phone, email);
  },

  update(id, data) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    db.prepare(`UPDATE leads SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
    return Lead.findById(id);
  },

  getReadyForSequence(limit = 50) {
    return db.prepare(`
      SELECT l.*, ss.step_number as next_step_number, ss.channel as next_channel,
             ss.template_id, ss.send_window_start, ss.send_window_end, ss.send_days,
             ss.skip_if_replied, ss.skip_if_score_above
      FROM leads l
      JOIN sequence_steps ss ON ss.sequence_id = l.sequence_id AND ss.step_number = l.current_step + 1
      WHERE l.sequence_status = 'active'
        AND l.next_action_at <= datetime('now')
        AND l.status NOT IN ('bad_data', 'do_not_call', 'not_a_fit')
      ORDER BY l.score DESC
      LIMIT ?
    `).all(limit);
  },

  getByStatus(status, limit = 100) {
    return db.prepare('SELECT * FROM leads WHERE status = ? ORDER BY score DESC LIMIT ?').all(status, limit);
  },

  getByTier(tier, limit = 100) {
    return db.prepare('SELECT * FROM leads WHERE score_tier = ? ORDER BY score DESC LIMIT ?').all(tier, limit);
  },

  getByCampaign(campaignId, limit = 500) {
    return db.prepare('SELECT * FROM leads WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ?').all(campaignId, limit);
  },

  getAll(limit = 200, offset = 0, filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.status) { where += ' AND status = ?'; params.push(filters.status); }
    if (filters.score_tier) { where += ' AND score_tier = ?'; params.push(filters.score_tier); }
    if (filters.campaign_id) { where += ' AND campaign_id = ?'; params.push(filters.campaign_id); }
    if (filters.sequence_status) { where += ' AND sequence_status = ?'; params.push(filters.sequence_status); }
    if (filters.ad_campaign_id) { where += ' AND ad_campaign_id = ?'; params.push(filters.ad_campaign_id); }
    if (filters.company_id) { where += ' AND company_id = ?'; params.push(filters.company_id); }
    if (filters.max_review_count != null && filters.max_review_count !== '') {
      where += ' AND review_count <= ?'; params.push(parseInt(filters.max_review_count));
    }
    if (filters.search) {
      where += ' AND (first_name LIKE ? OR last_name LIKE ? OR company_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s, s, s);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM leads ${where}`).get(...params).count;
    const leads = db.prepare(`SELECT * FROM leads ${where} ORDER BY score DESC, updated_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    // Aggregate stats across ALL matching leads (not just current page)
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN sequence_status = 'active' THEN 1 ELSE 0 END) as active_sequences,
        SUM(CASE WHEN score_tier = 'qualified' THEN 1 ELSE 0 END) as qualified,
        SUM(CASE WHEN score_tier = 'hot' THEN 1 ELSE 0 END) as hot,
        SUM(CASE WHEN score_tier = 'warm' THEN 1 ELSE 0 END) as warm,
        SUM(CASE WHEN replied = 1 THEN 1 ELSE 0 END) as replied,
        SUM(total_sms_sent) as total_sms,
        SUM(total_emails_sent) as total_emails,
        SUM(total_calls_made) as total_calls,
        ROUND(AVG(score), 1) as avg_score
      FROM leads ${where}
    `).get(...params);

    return { leads, total, limit, offset, stats };
  },

  countByStatusToday() {
    return db.prepare(`
      SELECT status, COUNT(*) as count FROM leads
      WHERE date(created_at) = date('now')
      GROUP BY status
    `).all();
  },

  isOnSuppressionList(phone, email) {
    return db.prepare('SELECT * FROM suppression_list WHERE phone = ? OR email = ?').get(phone || '', email || '');
  },

  addToSuppressionList(phone, email, reason) {
    db.prepare('INSERT OR IGNORE INTO suppression_list (phone, email, reason) VALUES (?, ?, ?)').run(phone || '', email || '', reason || '');
  },

  delete(id) {
    db.prepare('DELETE FROM activities WHERE lead_id = ?').run(id);
    db.prepare('DELETE FROM ai_call_logs WHERE lead_id = ?').run(id);
    db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  },

  getRecentlyScraped(limit = 50) {
    return db.prepare(`
      SELECT * FROM leads
      WHERE source IN ('google_maps', 'search', 'agent_scrape')
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  },
};

module.exports = Lead;
