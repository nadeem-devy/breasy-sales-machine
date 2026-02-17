const crypto = require('crypto');
const db = require('../database/db');

const AdCampaign = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO ad_campaigns (platform, name, status, objective, daily_budget, total_budget, start_date, end_date, targeting, creative, lead_form_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.platform,
      data.name,
      data.status || 'draft',
      data.objective || 'lead_generation',
      data.daily_budget || 0,
      data.total_budget || 0,
      data.start_date || null,
      data.end_date || null,
      JSON.stringify(data.targeting || {}),
      JSON.stringify(data.creative || {}),
      JSON.stringify(data.lead_form_config || {})
    );
    return AdCampaign.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare('SELECT * FROM ad_campaigns WHERE id = ?').get(id);
  },

  getAll(filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];
    if (filters.platform) { where += ' AND platform = ?'; params.push(filters.platform); }
    if (filters.status) { where += ' AND status = ?'; params.push(filters.status); }
    if (filters.is_external !== undefined) {
      where += ' AND is_external = ?';
      params.push(filters.is_external === 'true' || filters.is_external === '1' || filters.is_external === true ? 1 : 0);
    }
    return db.prepare(`SELECT * FROM ad_campaigns ${where} ORDER BY created_at DESC`).all(...params);
  },

  getByPlatform(platform) {
    return db.prepare('SELECT * FROM ad_campaigns WHERE platform = ? ORDER BY created_at DESC').all(platform);
  },

  getActive() {
    return db.prepare("SELECT * FROM ad_campaigns WHERE status = 'active'").all();
  },

  update(id, data) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    db.prepare(`UPDATE ad_campaigns SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
    return AdCampaign.findById(id);
  },

  updateStatus(id, status, errorMessage) {
    const updates = { status };
    if (errorMessage !== undefined) updates.error_message = errorMessage;
    return AdCampaign.update(id, updates);
  },

  updateMetrics(id, metrics) {
    db.prepare(`
      UPDATE ad_campaigns SET impressions = ?, clicks = ?, spend = ?, leads_captured = ?,
        cpl = ?, last_synced_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(
      metrics.impressions || 0, metrics.clicks || 0, metrics.spend || 0,
      metrics.leads_captured || 0, metrics.cpl || 0, id
    );
    return AdCampaign.findById(id);
  },

  insertDailyMetrics(adCampaignId, date, metrics) {
    db.prepare(`
      INSERT OR REPLACE INTO ad_campaign_metrics (ad_campaign_id, date, impressions, clicks, spend, leads, cpl)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(adCampaignId, date, metrics.impressions || 0, metrics.clicks || 0,
      metrics.spend || 0, metrics.leads || 0, metrics.cpl || 0);
  },

  getDailyMetrics(id, days = 30) {
    return db.prepare(`
      SELECT * FROM ad_campaign_metrics
      WHERE ad_campaign_id = ? AND date >= date('now', '-' || ? || ' days')
      ORDER BY date ASC
    `).all(id, days);
  },

  getOverview() {
    return db.prepare(`
      SELECT
        COUNT(*) as total_campaigns,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_campaigns,
        SUM(spend) as total_spend,
        SUM(leads_captured) as total_leads,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        CASE WHEN SUM(leads_captured) > 0 THEN ROUND(SUM(spend) / SUM(leads_captured), 2) ELSE 0 END as avg_cpl
      FROM ad_campaigns
    `).get();
  },

  delete(id) {
    db.prepare('DELETE FROM ad_campaign_metrics WHERE ad_campaign_id = ?').run(id);
    db.prepare('DELETE FROM ad_campaigns WHERE id = ?').run(id);
  },

  // Platform auth helpers
  getAuth(platform) {
    return db.prepare('SELECT * FROM ad_platform_auth WHERE platform = ?').get(platform);
  },

  saveAuth(platform, data) {
    db.prepare(`
      INSERT OR REPLACE INTO ad_platform_auth (platform, access_token, refresh_token, token_expiry, account_id, extra, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(platform, data.access_token, data.refresh_token || null,
      data.token_expiry || null, data.account_id || null, JSON.stringify(data.extra || {}));
  },

  deleteAuth(platform) {
    db.prepare('DELETE FROM ad_platform_auth WHERE platform = ?').run(platform);
  },

  getAllAuth() {
    return db.prepare('SELECT platform, account_id, token_expiry, updated_at FROM ad_platform_auth').all();
  },

  // === External campaign tracking ===

  createExternal(data) {
    const trackingId = crypto.randomBytes(4).toString('hex');
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const utmParams = `utm_source=${data.platform}&utm_medium=paid&utm_campaign=${encodeURIComponent(data.name)}`;
    const trackingUrl = `${baseUrl}/t/${trackingId}?${utmParams}`;

    const stmt = db.prepare(`
      INSERT INTO ad_campaigns (platform, name, status, platform_campaign_id, objective,
        daily_budget, total_budget, start_date, end_date, is_external, external_url,
        tracking_id, tracking_url, landing_page_url, manual_metrics)
      VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.platform,
      data.name,
      data.platform_campaign_id || null,
      data.objective || 'lead_generation',
      data.daily_budget || 0,
      data.total_budget || 0,
      data.start_date || null,
      data.end_date || null,
      data.external_url || null,
      trackingId,
      trackingUrl,
      data.landing_page_url || null,
      data.manual_metrics ? 1 : 0
    );
    return AdCampaign.findById(result.lastInsertRowid);
  },

  findByTrackingId(trackingId) {
    return db.prepare('SELECT * FROM ad_campaigns WHERE tracking_id = ?').get(trackingId);
  },

  updateManualMetrics(id, metrics) {
    const impressions = metrics.impressions != null ? metrics.impressions : 0;
    const clicks = metrics.clicks != null ? metrics.clicks : 0;
    const spend = metrics.spend != null ? metrics.spend : 0;
    const leads = metrics.leads_captured != null ? metrics.leads_captured : 0;
    const cpl = leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0;

    db.prepare(`
      UPDATE ad_campaigns SET impressions = ?, clicks = ?, spend = ?, leads_captured = ?,
        cpl = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(impressions, clicks, spend, leads, cpl, id);
    return AdCampaign.findById(id);
  },
};

module.exports = AdCampaign;
