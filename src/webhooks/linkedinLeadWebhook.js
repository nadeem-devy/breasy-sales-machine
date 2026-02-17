const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const AdCampaign = require('../models/AdCampaign');

// LinkedIn Lead Gen Form Submission
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // LinkedIn sends lead gen form responses
    const formResponse = body.formResponse || body;
    const fields = {};

    (formResponse.answers || []).forEach(a => {
      const fieldName = (a.questionId || a.id || '').toLowerCase();
      fields[fieldName] = a.answer || a.value || '';
    });

    // Also handle flat field format
    if (formResponse.firstName) fields.first_name = formResponse.firstName;
    if (formResponse.lastName) fields.last_name = formResponse.lastName;
    if (formResponse.emailAddress) fields.email = formResponse.emailAddress;
    if (formResponse.phoneNumber) fields.phone = formResponse.phoneNumber;
    if (formResponse.companyName) fields.company_name = formResponse.companyName;

    const phone = fields.phone || fields.phone_number || '';
    const email = fields.email || fields.emailaddress || '';

    // Check for duplicate
    if (phone || email) {
      const existing = Lead.findDuplicate(phone, email);
      if (existing) {
        console.log(`[LINKEDIN-WEBHOOK] Duplicate lead skipped: ${phone || email}`);
        return res.sendStatus(200);
      }
    }

    // Find matching active LinkedIn campaign
    const adCampaigns = AdCampaign.getAll({ platform: 'linkedin' });
    const matchedCampaign = adCampaigns.find(c => c.status === 'active');

    const lead = Lead.create({
      first_name: fields.first_name || fields.firstname || '',
      last_name: fields.last_name || fields.lastname || '',
      email,
      phone,
      company_name: fields.company_name || fields.companyname || '',
      city: fields.city || '',
      state: fields.state || '',
      source: 'manual',
      ad_campaign_id: matchedCampaign?.id || null,
      ad_platform: 'linkedin',
      ad_lead_form_data: JSON.stringify({ form_response: formResponse, fields }),
    });

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
      content: 'Lead captured from LinkedIn lead gen form',
      metadata: { platform: 'linkedin', form_id: formResponse.formId || '' },
    });

    console.log(`[LINKEDIN-WEBHOOK] Lead captured: ${lead.id}`);
    res.sendStatus(200);
  } catch (err) {
    console.error('[LINKEDIN-WEBHOOK] Error:', err.message);
    res.sendStatus(200);
  }
});

module.exports = router;
