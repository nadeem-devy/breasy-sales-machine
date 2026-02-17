const express = require('express');
const router = express.Router();
const config = require('../config');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const AdCampaign = require('../models/AdCampaign');

// Meta Webhook Verification (GET)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.meta.webhookVerifyToken) {
    console.log('[META-WEBHOOK] Verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Lead Form Submission (POST)
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'page' && body.object !== 'instagram') {
      return res.sendStatus(200);
    }

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;

        const leadgenData = change.value;
        const formId = leadgenData.form_id;
        const leadgenId = leadgenData.leadgen_id;
        const pageId = leadgenData.page_id;

        // Fetch full lead data from Meta API
        const leadData = await fetchLeadData(leadgenId);
        if (!leadData) continue;

        // Find matching ad campaign
        const platform = body.object === 'instagram' ? 'instagram' : 'facebook';
        const adCampaigns = AdCampaign.getAll({ platform });
        const matchedCampaign = adCampaigns.find(c => c.status === 'active');

        // Parse form fields
        const fields = {};
        (leadData.field_data || []).forEach(f => {
          fields[f.name] = f.values?.[0] || '';
        });

        // Check for duplicate
        const phone = fields.phone_number || fields.phone || '';
        const email = fields.email || '';
        if (phone || email) {
          const existing = Lead.findDuplicate(phone, email);
          if (existing) {
            console.log(`[META-WEBHOOK] Duplicate lead skipped: ${phone || email}`);
            continue;
          }
        }

        // Create lead
        const lead = Lead.create({
          first_name: fields.first_name || fields.full_name?.split(' ')[0] || '',
          last_name: fields.last_name || fields.full_name?.split(' ').slice(1).join(' ') || '',
          email,
          phone,
          company_name: fields.company_name || fields.company || '',
          city: fields.city || '',
          state: fields.state || '',
          source: 'manual',
          ad_campaign_id: matchedCampaign?.id || null,
          ad_platform: platform,
          ad_lead_form_data: JSON.stringify({ leadgen_id: leadgenId, form_id: formId, page_id: pageId, fields }),
        });

        // Update campaign lead count
        if (matchedCampaign) {
          AdCampaign.update(matchedCampaign.id, {
            leads_captured: (matchedCampaign.leads_captured || 0) + 1,
          });
        }

        Activity.create({
          lead_id: lead.id,
          type: 'ad_lead_captured',
          channel: 'system',
          direction: 'inbound',
          content: `Lead captured from ${platform} lead form`,
          metadata: { platform, form_id: formId, leadgen_id: leadgenId },
        });

        console.log(`[META-WEBHOOK] Lead captured: ${lead.id} from ${platform}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[META-WEBHOOK] Error:', err.message);
    res.sendStatus(200); // Always 200 to prevent Meta retries
  }
});

async function fetchLeadData(leadgenId) {
  const auth = AdCampaign.getAuth('facebook');
  if (!auth) return null;

  try {
    const axios = require('axios');
    const res = await axios.get(
      `https://graph.facebook.com/${config.meta.apiVersion}/${leadgenId}`,
      { params: { access_token: auth.access_token } }
    );
    return res.data;
  } catch (err) {
    console.error(`[META-WEBHOOK] Failed to fetch lead ${leadgenId}:`, err.message);
    return null;
  }
}

module.exports = router;
