const AdCampaign = require('../models/AdCampaign');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');

// Integration clients (lazy-loaded)
function getClient(platform) {
  const map = {
    facebook: '../integrations/metaAds',
    instagram: '../integrations/metaAds',
    google: '../integrations/googleAds',
    linkedin: '../integrations/linkedinAds',
    reddit: '../integrations/redditAds',
  };
  return require(map[platform]);
}

/**
 * Sync metrics for all active ad campaigns
 */
async function syncAllCampaigns() {
  const activeCampaigns = AdCampaign.getActive();
  if (!activeCampaigns.length) return;

  console.log(`[AD-SYNC] Syncing ${activeCampaigns.length} active campaigns...`);

  for (const campaign of activeCampaigns) {
    try {
      if (!campaign.platform_campaign_id) continue;

      const client = getClient(campaign.platform);
      const metrics = await client.getCampaignMetrics(campaign.platform_campaign_id);

      const leadsCount = Lead.getByCampaignAd ? Lead.getByCampaignAd(campaign.id) :
        require('../database/db').prepare('SELECT COUNT(*) as c FROM leads WHERE ad_campaign_id = ?').get(campaign.id)?.c || 0;

      const totalLeads = typeof leadsCount === 'number' ? leadsCount : metrics.leads || 0;
      const cpl = totalLeads > 0 ? Math.round((metrics.spend / totalLeads) * 100) / 100 : 0;

      AdCampaign.updateMetrics(campaign.id, {
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        spend: metrics.spend,
        leads_captured: totalLeads,
        cpl,
      });

      // Insert daily snapshot
      const today = new Date().toISOString().split('T')[0];
      AdCampaign.insertDailyMetrics(campaign.id, today, {
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        spend: metrics.spend,
        leads: totalLeads,
        cpl,
      });

      console.log(`[AD-SYNC] ${campaign.platform}/${campaign.name}: ${metrics.impressions} imp, ${metrics.clicks} clicks, $${metrics.spend} spent, ${totalLeads} leads`);
    } catch (err) {
      console.error(`[AD-SYNC] Error syncing campaign ${campaign.id} (${campaign.platform}):`, err.message);
      AdCampaign.updateStatus(campaign.id, 'error', err.message);
    }
  }
}

/**
 * Poll Google Ads lead form submissions (no webhook support)
 */
async function syncGoogleLeads() {
  const googleCampaigns = AdCampaign.getAll({ platform: 'google', status: 'active' });
  if (!googleCampaigns.length) return;

  const googleAds = require('../integrations/googleAds');
  if (!googleAds.isConfigured()) return;

  for (const campaign of googleCampaigns) {
    try {
      const leadFormConfig = JSON.parse(campaign.lead_form_config || '{}');
      const formId = leadFormConfig.form_id;
      if (!formId) continue;

      const lastSync = campaign.last_synced_at || '2024-01-01T00:00:00Z';
      const submissions = await googleAds.getLeadFormSubmissions(formId, lastSync);

      for (const sub of submissions) {
        const phone = sub.phone_number || sub.phone || '';
        const email = sub.email || '';

        if (phone || email) {
          const existing = Lead.findDuplicate(phone, email);
          if (existing) continue;
        }

        const lead = Lead.create({
          first_name: sub.first_name || sub.full_name?.split(' ')[0] || '',
          last_name: sub.last_name || sub.full_name?.split(' ').slice(1).join(' ') || '',
          email,
          phone,
          company_name: sub.company_name || '',
          city: sub.city || '',
          state: sub.state || '',
          source: 'manual',
          ad_campaign_id: campaign.id,
          ad_platform: 'google',
          ad_lead_form_data: JSON.stringify(sub),
        });

        AdCampaign.update(campaign.id, {
          leads_captured: (campaign.leads_captured || 0) + 1,
        });

        Activity.create({
          lead_id: lead.id,
          type: 'ad_lead_captured',
          channel: 'system',
          direction: 'inbound',
          content: 'Lead captured from Google Ads lead form',
          metadata: { platform: 'google', submission_id: sub.id },
        });

        console.log(`[AD-SYNC] Google lead captured: ${lead.id}`);
      }
    } catch (err) {
      console.error(`[AD-SYNC] Error syncing Google leads for campaign ${campaign.id}:`, err.message);
    }
  }
}

module.exports = { syncAllCampaigns, syncGoogleLeads };
