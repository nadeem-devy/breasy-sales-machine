const db = require('../database/db');

const Company = {
  create(data) {
    const stmt = db.prepare(`
      INSERT INTO companies (name, domain, website, phone, email, address, city, state, industry, employee_count, rating, review_count, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      data.name || '',
      data.domain || '',
      data.website || '',
      data.phone || '',
      data.email || '',
      data.address || '',
      data.city || '',
      data.state || '',
      data.industry || '',
      data.employee_count || 0,
      data.rating || 0,
      data.review_count || 0,
      data.notes || ''
    );
    return Company.findById(result.lastInsertRowid);
  },

  findById(id) {
    return db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
  },

  findByDomain(domain) {
    if (!domain) return null;
    return db.prepare('SELECT * FROM companies WHERE domain = ?').get(domain.toLowerCase());
  },

  findByName(name) {
    if (!name) return null;
    return db.prepare('SELECT * FROM companies WHERE LOWER(name) = LOWER(?)').get(name);
  },

  update(id, data) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    db.prepare(`UPDATE companies SET ${fields}, updated_at = datetime('now') WHERE id = ?`).run(...values, id);
    return Company.findById(id);
  },

  delete(id) {
    // Unlink leads from this company
    db.prepare('UPDATE leads SET company_id = NULL WHERE company_id = ?').run(id);
    db.prepare('DELETE FROM companies WHERE id = ?').run(id);
  },

  getAll(limit = 100, offset = 0, filters = {}) {
    let where = 'WHERE 1=1';
    const params = [];

    if (filters.search) {
      where += ' AND (name LIKE ? OR domain LIKE ? OR city LIKE ? OR industry LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s, s);
    }
    if (filters.industry) {
      where += ' AND industry = ?';
      params.push(filters.industry);
    }
    if (filters.max_review_count != null && filters.max_review_count !== '') {
      where += ' AND review_count <= ?';
      params.push(parseInt(filters.max_review_count));
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM companies ${where}`).get(...params).count;
    const companies = db.prepare(`
      SELECT * FROM companies ${where}
      ORDER BY leads_count DESC, updated_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return { companies, total, limit, offset };
  },

  getContacts(companyId, limit = 100) {
    return db.prepare(`
      SELECT * FROM leads
      WHERE company_id = ?
      ORDER BY score DESC, updated_at DESC
      LIMIT ?
    `).all(companyId, limit);
  },

  refreshLeadsCount(companyId) {
    const count = db.prepare('SELECT COUNT(*) as c FROM leads WHERE company_id = ?').get(companyId).c;
    db.prepare('UPDATE companies SET leads_count = ?, updated_at = datetime(\'now\') WHERE id = ?').run(count, companyId);
    return count;
  },

  getOverview() {
    const total = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
    const withContacts = db.prepare('SELECT COUNT(*) as c FROM companies WHERE leads_count > 0').get().c;
    const totalContacts = db.prepare('SELECT COUNT(*) as c FROM leads WHERE company_id IS NOT NULL').get().c;
    const unmatched = db.prepare('SELECT COUNT(*) as c FROM leads WHERE company_id IS NULL').get().c;
    const industries = db.prepare(`
      SELECT industry, COUNT(*) as count FROM companies
      WHERE industry != ''
      GROUP BY industry ORDER BY count DESC LIMIT 10
    `).all();
    return { total, with_contacts: withContacts, total_contacts: totalContacts, unmatched, industries };
  },

  getIndustries() {
    return db.prepare(`
      SELECT DISTINCT industry FROM companies
      WHERE industry != '' ORDER BY industry
    `).all().map(r => r.industry);
  },

  merge(keepId, mergeId) {
    // Move all leads from mergeId to keepId
    db.prepare('UPDATE leads SET company_id = ? WHERE company_id = ?').run(keepId, mergeId);
    Company.refreshLeadsCount(keepId);
    Company.delete(mergeId);
    return Company.findById(keepId);
  },
};

module.exports = Company;
