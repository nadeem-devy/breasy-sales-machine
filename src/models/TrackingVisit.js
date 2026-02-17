const db = require('../database/db');

const TrackingVisit = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO ad_tracking_visits (ad_campaign_id, tracking_id, visitor_id, visitor_ip, user_agent,
        referer, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        device_type, browser, os, lead_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.ad_campaign_id, data.tracking_id, data.visitor_id || null,
      data.visitor_ip || null, data.user_agent || null, data.referer || null,
      data.utm_source || null, data.utm_medium || null, data.utm_campaign || null,
      data.utm_content || null, data.utm_term || null,
      data.device_type || null, data.browser || null, data.os || null,
      data.lead_id || null
    );
    return result.lastInsertRowid;
  },

  getByCampaign(adCampaignId, limit = 100) {
    return db.prepare(`
      SELECT tv.*, l.first_name as lead_first_name, l.last_name as lead_last_name, l.email as lead_email
      FROM ad_tracking_visits tv
      LEFT JOIN leads l ON tv.lead_id = l.id
      WHERE tv.ad_campaign_id = ?
      ORDER BY tv.created_at DESC LIMIT ?
    `).all(adCampaignId, limit);
  },

  findByVisitorId(visitorId) {
    return db.prepare('SELECT * FROM ad_tracking_visits WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 1').get(visitorId);
  },

  linkToLead(visitorId, leadId) {
    return db.prepare('UPDATE ad_tracking_visits SET lead_id = ? WHERE visitor_id = ?').run(leadId, visitorId);
  },

  getStatsByCampaign(adCampaignId) {
    return db.prepare(`
      SELECT
        COUNT(*) as total_visits,
        COUNT(DISTINCT visitor_ip) as unique_visitors,
        COUNT(DISTINCT lead_id) as converted_leads,
        SUM(CASE WHEN device_type = 'Mobile' THEN 1 ELSE 0 END) as mobile_visits,
        SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) as today_visits,
        MIN(created_at) as first_visit,
        MAX(created_at) as last_visit
      FROM ad_tracking_visits WHERE ad_campaign_id = ?
    `).get(adCampaignId);
  },

  getDailyVisits(adCampaignId, days = 30) {
    return db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as visits, COUNT(DISTINCT visitor_ip) as unique_visitors
      FROM ad_tracking_visits
      WHERE ad_campaign_id = ? AND date(created_at) >= date('now', '-' || ? || ' days')
      GROUP BY date(created_at) ORDER BY date ASC
    `).all(adCampaignId, days);
  },
};

module.exports = TrackingVisit;
