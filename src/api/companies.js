const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const { matchLeadToCompany, runBulkMatch } = require('../services/companyMatcher');

/**
 * GET /api/companies — List all companies
 */
router.get('/', (req, res) => {
  const { page = 1, limit = 50, search, industry, max_review_count } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const result = Company.getAll(parseInt(limit), offset, { search, industry, max_review_count });
  res.json(result);
});

/**
 * GET /api/companies/overview — Stats for dashboard
 */
router.get('/overview', (req, res) => {
  const overview = Company.getOverview();
  res.json(overview);
});

/**
 * GET /api/companies/industries — Distinct industry list
 */
router.get('/industries', (req, res) => {
  res.json(Company.getIndustries());
});

/**
 * POST /api/companies/run-matcher — Manually trigger bulk matching
 */
router.post('/run-matcher', (req, res) => {
  const result = runBulkMatch();
  res.json({ success: true, ...result });
});

/**
 * GET /api/companies/:id — Single company with contacts
 */
router.get('/:id', (req, res) => {
  const company = Company.findById(parseInt(req.params.id));
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const contacts = Company.getContacts(company.id);
  res.json({ company, contacts });
});

/**
 * POST /api/companies — Create company
 */
router.post('/', (req, res) => {
  try {
    const company = Company.create(req.body);
    res.status(201).json(company);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/companies/:id — Update company
 */
router.put('/:id', (req, res) => {
  const company = Company.findById(parseInt(req.params.id));
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const updated = Company.update(company.id, req.body);
  res.json(updated);
});

/**
 * DELETE /api/companies/:id — Delete company (unlinks leads)
 */
router.delete('/:id', (req, res) => {
  const company = Company.findById(parseInt(req.params.id));
  if (!company) return res.status(404).json({ error: 'Company not found' });

  Company.delete(company.id);
  res.json({ success: true, message: 'Company deleted' });
});

/**
 * POST /api/companies/:id/merge — Merge another company into this one
 */
router.post('/:id/merge', (req, res) => {
  const keepId = parseInt(req.params.id);
  const { merge_id } = req.body;
  if (!merge_id) return res.status(400).json({ error: 'merge_id required' });

  const keep = Company.findById(keepId);
  if (!keep) return res.status(404).json({ error: 'Target company not found' });

  const merge = Company.findById(parseInt(merge_id));
  if (!merge) return res.status(404).json({ error: 'Merge company not found' });

  const result = Company.merge(keepId, parseInt(merge_id));
  res.json({ success: true, company: result });
});

/**
 * POST /api/companies/:id/add-lead — Manually link a lead to this company
 */
router.post('/:id/add-lead', (req, res) => {
  const company = Company.findById(parseInt(req.params.id));
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const { lead_id } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

  const Lead = require('../models/Lead');
  const lead = Lead.findById(parseInt(lead_id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { company_id: company.id });
  Company.refreshLeadsCount(company.id);

  // If the lead was previously linked to another company, refresh that one too
  if (lead.company_id && lead.company_id !== company.id) {
    Company.refreshLeadsCount(lead.company_id);
  }

  res.json({ success: true });
});

/**
 * POST /api/companies/:id/remove-lead — Unlink a lead from this company
 */
router.post('/:id/remove-lead', (req, res) => {
  const company = Company.findById(parseInt(req.params.id));
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const { lead_id } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

  const Lead = require('../models/Lead');
  const lead = Lead.findById(parseInt(lead_id));
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  Lead.update(lead.id, { company_id: null });
  Company.refreshLeadsCount(company.id);
  res.json({ success: true });
});

module.exports = router;
