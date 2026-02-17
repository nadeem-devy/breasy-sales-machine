const crypto = require('crypto');
const AdCampaign = require('../models/AdCampaign');
const TrackingVisit = require('../models/TrackingVisit');
const { parseUA } = require('../utils/uaParser');

module.exports = (req, res) => {
  const { trackingId } = req.params;
  const campaign = AdCampaign.findByTrackingId(trackingId);

  if (!campaign || !campaign.landing_page_url) {
    return res.status(404).send('Link not found');
  }

  const ua = parseUA(req.headers['user-agent']);
  const visitorId = crypto.randomBytes(8).toString('hex');

  try {
    TrackingVisit.create({
      ad_campaign_id: campaign.id,
      tracking_id: trackingId,
      visitor_id: visitorId,
      visitor_ip: req.ip || req.headers['x-forwarded-for'] || '',
      user_agent: req.headers['user-agent'] || '',
      referer: req.headers['referer'] || '',
      utm_source: req.query.utm_source || campaign.platform || '',
      utm_medium: req.query.utm_medium || 'paid',
      utm_campaign: req.query.utm_campaign || campaign.name || '',
      utm_content: req.query.utm_content || '',
      utm_term: req.query.utm_term || '',
      device_type: ua.device_type,
      browser: ua.browser,
      os: ua.os,
    });
  } catch (err) {
    console.error('[TRACKING] Error logging visit:', err.message);
  }

  // Redirect to landing page with visitor ID + UTM params
  const landingUrl = new URL(campaign.landing_page_url);
  landingUrl.searchParams.set('breasy_vid', visitorId);
  landingUrl.searchParams.set('breasy_cid', campaign.id.toString());
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(param => {
    if (req.query[param]) landingUrl.searchParams.set(param, req.query[param]);
  });

  res.redirect(302, landingUrl.toString());
};
