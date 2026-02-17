const db = require('../database/db');
const Company = require('../models/Company');

// Common free email providers — leads with these domains won't create/match companies by email alone
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'live.com', 'msn.com', 'me.com', 'comcast.net', 'att.net',
  'verizon.net', 'sbcglobal.net', 'cox.net', 'charter.net',
  'earthlink.net', 'optonline.net', 'frontier.com', 'windstream.net',
]);

// Generic hosting/platform domains that aren't real company domains
const GENERIC_WEBSITE_DOMAINS = new Set([
  'sites.google.com', 'wix.com', 'squarespace.com', 'wordpress.com',
  'weebly.com', 'godaddy.com', 'shopify.com', 'blogspot.com',
  'tumblr.com', 'facebook.com', 'instagram.com', 'linkedin.com',
  'twitter.com', 'x.com', 'yelp.com', 'yellowpages.com',
  'bbb.org', 'manta.com', 'homeadvisor.com', 'angi.com',
  'thumbtack.com', 'nextdoor.com',
]);

/**
 * Extract domain from an email address
 * e.g. "john@acme.com" → "acme.com"
 */
function extractEmailDomain(email) {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1].toLowerCase().trim();
  if (FREE_EMAIL_DOMAINS.has(domain)) return null;
  return domain || null;
}

/**
 * Extract domain from a website URL
 * e.g. "https://www.acme.com/about" → "acme.com"
 */
function extractWebsiteDomain(website) {
  if (!website) return null;
  let url = website.toLowerCase().trim();
  // Remove protocol
  url = url.replace(/^https?:\/\//, '');
  // Remove www.
  url = url.replace(/^www\./, '');
  // Remove path/query
  url = url.split('/')[0].split('?')[0];
  if (!url) return null;
  // Skip generic hosting/platform domains
  if (GENERIC_WEBSITE_DOMAINS.has(url)) return null;
  // Also check if host is a subdomain of a generic domain (e.g. sites.google.com/mysite)
  for (const gd of GENERIC_WEBSITE_DOMAINS) {
    if (url.endsWith('.' + gd) || url === gd) return null;
  }
  return url;
}

/**
 * Match a single lead to a company. Creates the company if it doesn't exist.
 * Returns the company or null if no domain could be extracted.
 */
function matchLeadToCompany(lead) {
  if (!lead) return null;
  // Already matched?
  if (lead.company_id) return Company.findById(lead.company_id);

  // Try to extract a domain — email first, then website
  const emailDomain = extractEmailDomain(lead.email);
  const websiteDomain = extractWebsiteDomain(lead.website);
  const domain = emailDomain || websiteDomain;

  if (!domain) return null;

  // Check if company with this domain already exists
  let company = Company.findByDomain(domain);

  if (!company) {
    // Also check the alternate domain (if email gave us one domain and website gave another)
    if (emailDomain && websiteDomain && emailDomain !== websiteDomain) {
      company = Company.findByDomain(websiteDomain);
    }
  }

  if (!company) {
    // Try matching by company name
    if (lead.company_name) {
      company = Company.findByName(lead.company_name);
      // If found by name but domain is different/missing, update domain
      if (company && !company.domain) {
        Company.update(company.id, { domain });
      }
    }
  }

  if (!company) {
    // Create new company from lead data
    company = Company.create({
      name: lead.company_name || domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
      domain,
      website: lead.website || `https://${domain}`,
      phone: '', // Don't copy lead phone to company
      email: '', // Don't copy lead email to company
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      industry: lead.industry || '',
      employee_count: lead.employee_count || 0,
      rating: lead.rating || 0,
      review_count: lead.review_count || 0,
    });
    console.log(`[COMPANY-MATCHER] Created company: "${company.name}" (${domain})`);
  }

  // Link lead to company
  db.prepare('UPDATE leads SET company_id = ?, updated_at = datetime(\'now\') WHERE id = ?').run(company.id, lead.id);
  Company.refreshLeadsCount(company.id);

  return company;
}

/**
 * Run bulk matching — find all leads without a company_id and try to match them.
 * Returns stats about the matching run.
 */
function runBulkMatch() {
  const unmatched = db.prepare(`
    SELECT * FROM leads WHERE company_id IS NULL
    ORDER BY created_at DESC
  `).all();

  let matched = 0;
  let created = 0;
  let skipped = 0;

  const existingBefore = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;

  for (const lead of unmatched) {
    const company = matchLeadToCompany(lead);
    if (company) {
      matched++;
    } else {
      skipped++;
    }
  }

  const existingAfter = db.prepare('SELECT COUNT(*) as c FROM companies').get().c;
  created = existingAfter - existingBefore;

  console.log(`[COMPANY-MATCHER] Bulk match complete: ${matched} matched, ${created} new companies, ${skipped} skipped (no domain)`);

  return {
    total_processed: unmatched.length,
    matched,
    new_companies: created,
    skipped,
  };
}

module.exports = {
  extractEmailDomain,
  extractWebsiteDomain,
  matchLeadToCompany,
  runBulkMatch,
};
