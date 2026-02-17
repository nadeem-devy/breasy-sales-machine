// ============================================
// Website Scraper v2 — Multi-page deep extraction
// Crawls homepage + About + Contact + Services + Team pages
// Aggressively extracts emails, owner, services, socials, phones
// ============================================
const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

// Pages we want to discover and crawl
const TARGET_PAGE_PATTERNS = [
  // About pages
  { keywords: ['about', 'about-us', 'about_us', 'our-story', 'our-team', 'who-we-are', 'our-company'], type: 'about' },
  // Contact pages
  { keywords: ['contact', 'contact-us', 'contact_us', 'get-in-touch', 'reach-us', 'get-a-quote', 'request-quote', 'free-estimate', 'free-quote'], type: 'contact' },
  // Services pages
  { keywords: ['services', 'our-services', 'our_services', 'what-we-do', 'solutions', 'offerings', 'capabilities'], type: 'services' },
  // Team pages
  { keywords: ['team', 'our-team', 'staff', 'leadership', 'people', 'crew', 'meet-the-team', 'meet-us'], type: 'team' },
];

// Link text patterns — split into specific owner links vs general team links
const OWNER_SPECIFIC_LINK_PATTERNS = [
  /\b(owner|founder|ceo|president|captain|principal|director)\b/i,
];
const TEAM_LINK_TEXT_PATTERNS = [
  /\bmeet\b.*\b(team|crew|us)\b/i,
  /\b(our|the)\s+(team|crew|people|staff)\b/i,
  /\bcollaborator/i,
];

// False positive email filters
const FALSE_EMAIL_DOMAINS = new Set([
  'example.com', 'sentry.io', 'wixpress.com', 'domain.com', 'email.com',
  'yoursite.com', 'yourdomain.com', 'company.com', 'wordpress.org',
  'w3.org', 'schema.org', 'googleapis.com', 'gravatar.com',
  'placeholder.com', 'test.com', 'sample.com', 'sentry-next.wixpress.com',
  'wix.com', 'squarespace.com', 'weebly.com', 'godaddy.com',
  'mailchimp.com', 'constantcontact.com', 'hubspot.com', 'sendgrid.net',
  'googlemail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'gmail.com',
  'aol.com', 'icloud.com', 'protonmail.com',
]);

const FALSE_EMAIL_PATTERNS = [
  /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js)$/i,
  /^noreply@/i, /^no-reply@/i, /^donotreply@/i,
  /^admin@wordpress/i, /^webmaster@/i, /^postmaster@/i,
  /^support@(wix|squarespace|weebly|wordpress)/i,
  /@[^.]+\.(png|jpg|gif)/i,
];

// Owner/contact title keywords — expanded
const OWNER_TITLES = [
  'owner', 'co-owner', 'co owner', 'founder', 'co-founder', 'cofounder',
  'president', 'ceo', 'chief executive', 'principal', 'proprietor',
  'managing director', 'director', 'general manager', 'gm',
  'managing member', 'managing partner', 'partner',
  'operator', 'licensed contractor',
];

// Service-related heading keywords — expanded
const SERVICE_KEYWORDS = [
  'service', 'services', 'what we do', 'our work', 'specialt',
  'capabilities', 'solutions', 'what we offer', 'our expertise',
  'areas of service', 'our services include', 'we offer', 'we provide',
  'we specialize', 'residential services', 'commercial services',
];

// ========== Main Entry Point ==========

async function scrapeBusinessWebsite(url) {
  const result = {
    emails: [],
    owner_name: '',
    services: [],
    social_links: {},
    phones: [],
    description: '',
    raw_title: '',
    pages_crawled: 0,
  };

  if (!url || url.length < 5) {
    result.error = 'No valid URL provided';
    return result;
  }

  let baseUrl = url;
  if (!baseUrl.startsWith('http')) baseUrl = 'https://' + baseUrl;

  // Remove trailing slash for consistent URL building
  baseUrl = baseUrl.replace(/\/+$/, '');

  // ===== Step 1: Fetch homepage =====
  let homepageHtml;
  try {
    homepageHtml = await fetchPage(baseUrl);
  } catch (err) {
    try {
      homepageHtml = await fetchPage(baseUrl.replace('https://', 'http://'));
      baseUrl = baseUrl.replace('https://', 'http://');
    } catch (err2) {
      result.error = friendlyError(err2);
      return result;
    }
  }

  const origin = new URL(baseUrl).origin;
  const pages = [{ url: baseUrl, html: homepageHtml, type: 'homepage' }];

  // ===== Step 2: Discover internal pages =====
  const $home = cheerio.load(homepageHtml);
  const discoveredUrls = discoverInternalPages($home, origin, baseUrl);

  // ===== Step 3: Fetch discovered pages (parallel, max 5) =====
  const fetchPromises = discoveredUrls.slice(0, 5).map(async (page) => {
    try {
      const html = await fetchPage(page.url);
      return { url: page.url, html, type: page.type };
    } catch (e) {
      return null;
    }
  });

  const fetchedPages = (await Promise.all(fetchPromises)).filter(Boolean);

  // Sort: owner_page and team pages first (after homepage) for owner extraction priority
  const typeOrder = { 'team': 0, 'about': 1, 'services': 2, 'contact': 3 };
  fetchedPages.sort((a, b) => (typeOrder[a.type] ?? 5) - (typeOrder[b.type] ?? 5));

  pages.push(...fetchedPages);
  result.pages_crawled = pages.length;

  // ===== Step 4: Extract from ALL pages =====
  const allEmails = new Set();
  const allPhones = new Set();
  const allServices = new Set();
  const allSocial = {};
  let bestOwnerName = '';
  let bestDescription = '';

  for (const page of pages) {
    let html = page.html;
    if (html.length > 500000) html = html.substring(0, 500000);

    const $ = cheerio.load(html);
    const bodyText = cleanBodyText($);

    // Emails — from every page
    extractEmails($, bodyText).forEach(e => allEmails.add(e));

    // Phones — from every page
    extractPhones($, bodyText).forEach(p => allPhones.add(p));

    // Social links — merge from all pages
    const social = extractSocialLinks($);
    Object.entries(social).forEach(([k, v]) => { if (v && !allSocial[k]) allSocial[k] = v; });

    // Owner — prioritize About/Team pages, then homepage
    if (!bestOwnerName) {
      const ownerName = extractOwnerName($, bodyText, page.type);
      if (ownerName) bestOwnerName = ownerName;
    }

    // Services — extract from all pages (services can be mentioned anywhere)
    extractServices($, bodyText).forEach(s => allServices.add(s));

    // Description — from homepage only
    if (page.type === 'homepage' && !bestDescription) {
      bestDescription = extractDescription($);
    }
  }

  // ===== Step 5: Assemble results =====
  result.emails = dedupeEmails([...allEmails]);
  result.phones = dedupePhones([...allPhones]);
  result.services = [...allServices].slice(0, 20);
  result.social_links = allSocial;
  result.owner_name = bestOwnerName;
  result.description = bestDescription;
  result.raw_title = $home('title').first().text().trim().substring(0, 200);

  return result;
}

// ========== Page Discovery ==========

function discoverInternalPages($, origin, baseUrl) {
  const found = new Map(); // type -> url

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href') || '';
    const linkText = ($(el).text() || '').toLowerCase().trim();
    let fullUrl;

    try {
      if (rawHref.startsWith('//')) fullUrl = 'https:' + rawHref;
      else if (rawHref.startsWith('/')) fullUrl = origin + rawHref;
      else if (rawHref.startsWith('http')) fullUrl = rawHref;
      else if (!rawHref.startsWith('#') && !rawHref.startsWith('mailto:') && !rawHref.startsWith('tel:') && !rawHref.startsWith('javascript:')) {
        fullUrl = baseUrl + '/' + rawHref;
      } else return;
    } catch (e) { return; }

    // Must be same host (protocol-agnostic — http vs https links are common)
    try {
      if (new URL(fullUrl).host !== new URL(origin).host) return;
    } catch (e) { return; }

    // Clean URL
    fullUrl = fullUrl.split('#')[0].split('?')[0].replace(/\/+$/, '');
    if (fullUrl === baseUrl) return;

    const path = fullUrl.replace(origin, '').toLowerCase();

    // Standard keyword matching for page types
    for (const pattern of TARGET_PAGE_PATTERNS) {
      if (found.has(pattern.type)) continue;

      const match = pattern.keywords.some(kw => {
        if (path.includes('/' + kw) || path.endsWith('/' + kw)) return true;
        if (linkText === kw || linkText === kw.replace(/-/g, ' ')) return true;
        if (linkText.includes(kw.replace(/-/g, ' '))) return true;
        return false;
      });

      if (match) {
        found.set(pattern.type, { url: fullUrl, type: pattern.type });
      }
    }

    // Owner-specific link (highest priority — "the Captain", "Founder")
    if (!found.has('owner_page')) {
      const isOwnerSpecific = OWNER_SPECIFIC_LINK_PATTERNS.some(p => p.test(linkText));
      if (isOwnerSpecific) {
        found.set('owner_page', { url: fullUrl, type: 'team' });
      }
    }

    // General team link ("meet your collaborators", "our team")
    if (!found.has('team') && !found.has('team_link')) {
      const isTeamLink = TEAM_LINK_TEXT_PATTERNS.some(p => p.test(linkText));
      if (isTeamLink) {
        found.set('team_link', { url: fullUrl, type: 'team' });
      }
    }
  });

  return [...found.values()];
}

// ========== Fetch ==========

async function fetchPage(url) {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  const res = await axios.get(url, {
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="124", "Not(A:Brand";v="24", "Google Chrome";v="124"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
    timeout: 15000,
    maxRedirects: 5,
    responseType: 'text',
  });

  return typeof res.data === 'string' ? res.data : String(res.data);
}

function friendlyError(err) {
  if (err.code === 'ECONNREFUSED') return 'Website refused connection';
  if (err.code === 'ENOTFOUND') return 'Website domain not found';
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') return 'Website timed out';
  if (err.response) {
    if (err.response.status === 403) return 'Website blocked scraper (403)';
    if (err.response.status === 404) return 'Website not found (404)';
    if (err.response.status === 429) return 'Rate limited (429)';
    return `HTTP ${err.response.status}`;
  }
  return err.message || 'Failed to fetch';
}

function cleanBodyText($) {
  return $('body').clone().find('script, style, noscript, svg, iframe').remove().end().text();
}

// ========== Email Extraction ==========

function extractEmails($, bodyText) {
  const found = new Set();

  // 1. mailto: links (highest confidence)
  $('a[href^="mailto:"], a[href^="MAILTO:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
    if (email && email.includes('@')) found.add(email);
  });

  // 2. Regex on visible text (good confidence)
  const matches = bodyText.match(EMAIL_REGEX) || [];
  matches.forEach(email => found.add(email.toLowerCase()));

  // 3. href attributes that might contain emails
  $('a[href*="@"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const emailMatch = href.match(EMAIL_REGEX);
    if (emailMatch) emailMatch.forEach(e => found.add(e.toLowerCase()));
  });

  // 4. Common footer/contact containers
  $('footer, [class*="contact"], [class*="footer"], [id*="contact"], [id*="footer"]').each((_, el) => {
    const text = $(el).text();
    const m = text.match(EMAIL_REGEX) || [];
    m.forEach(e => found.add(e.toLowerCase()));
  });

  // 5. Meta tags
  $('meta[name="email"], meta[property="og:email"], meta[name="contact:email"]').each((_, el) => {
    const content = $(el).attr('content') || '';
    if (EMAIL_REGEX.test(content)) found.add(content.toLowerCase());
  });

  // 6. Check data attributes and aria-labels
  $('[data-email], [data-mail]').each((_, el) => {
    const email = $(el).attr('data-email') || $(el).attr('data-mail') || '';
    if (email && email.includes('@')) found.add(email.toLowerCase());
  });

  // 7. Obfuscated emails (common: "info [at] company [dot] com")
  const obfuscated = bodyText.match(/[\w.+-]+\s*(?:\[at\]|@|\(at\))\s*[\w.-]+\s*(?:\[dot\]|\.|\(dot\))\s*\w{2,}/gi) || [];
  obfuscated.forEach(raw => {
    const cleaned = raw.replace(/\s*\[at\]\s*|\s*\(at\)\s*/gi, '@').replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/gi, '.').trim().toLowerCase();
    if (EMAIL_REGEX.test(cleaned)) found.add(cleaned);
  });

  return filterEmails([...found]);
}

function filterEmails(emails) {
  return emails.filter(email => {
    const domain = email.split('@')[1];
    if (!domain) return false;
    if (FALSE_EMAIL_DOMAINS.has(domain)) return false;
    if (FALSE_EMAIL_PATTERNS.some(p => p.test(email))) return false;
    // Must have a valid TLD (at least 2 chars)
    const tld = domain.split('.').pop();
    if (!tld || tld.length < 2) return false;
    // Skip very long emails (likely garbage)
    if (email.length > 60) return false;
    return true;
  });
}

function dedupeEmails(emails) {
  const seen = new Set();
  return emails.filter(e => {
    const lower = e.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

// ========== Owner Name Extraction ==========

function extractOwnerName($, bodyText, pageType) {
  // Strategy 1: JSON-LD structured data (highest confidence)
  const jsonLdName = extractFromJsonLd($);
  if (jsonLdName) return cleanPersonName(jsonLdName);

  // Strategy 2: Meta author tag
  const metaAuthor = $('meta[name="author"]').attr('content') || '';
  if (isPersonName(metaAuthor)) return cleanPersonName(metaAuthor);

  // Strategy 3: Schema.org microdata
  const microdataName = extractFromMicrodata($);
  if (microdataName) return cleanPersonName(microdataName);

  // Strategy 4: HTML patterns — title-based ("Owner: John Smith")
  const titleBasedName = extractOwnerByTitle($, bodyText);
  if (titleBasedName) return cleanPersonName(titleBasedName);

  // Strategy 5: Greeting patterns — "Hi, I'm John Smith", "My name is Jane Doe"
  // These are common on About pages for small businesses
  const greetingName = extractFromGreeting(bodyText);
  if (greetingName) return cleanPersonName(greetingName);

  // Strategy 6: "Meet [Name]" / "About [Name]" headings
  const meetName = extractFromMeetHeading($);
  if (meetName) return cleanPersonName(meetName);

  // Strategy 7: "Founded by" / "Started by" / "Owned by" in running text
  const foundedByName = extractFromFoundedBy(bodyText);
  if (foundedByName) return cleanPersonName(foundedByName);

  // Strategy 8: Team/About page specific — look for first person listed
  if (pageType === 'team' || pageType === 'about') {
    const teamName = extractFirstTeamMember($);
    if (teamName) return cleanPersonName(teamName);

    // Strategy 9: On team/owner pages, look for name headings near owner-title headings
    // E.g., heading "the CAPTAIN OF THE SHIP" followed by heading "chad BENNETT"
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      headings.push({ text: $(el).text().trim(), el });
    });

    // Find a person name heading right after/before an owner-title heading
    for (let i = 0; i < headings.length; i++) {
      const lowerText = headings[i].text.toLowerCase();
      const hasTitle = OWNER_TITLES.some(t => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(lowerText));
      if (!hasTitle) continue;

      // Check next heading
      if (i + 1 < headings.length && isPersonName(headings[i + 1].text)) {
        return cleanPersonName(headings[i + 1].text);
      }
      // Check previous heading
      if (i > 0 && isPersonName(headings[i - 1].text)) {
        return cleanPersonName(headings[i - 1].text);
      }
    }

    // Strategy 10: Page <title> tag — "Chad Bennett - Ground Zero" → extract person name
    const pageTitle = $('title').text().trim();
    const titleParts = pageTitle.split(/\s*[-–—|]\s*/);
    for (const part of titleParts) {
      if (isPersonName(part.trim())) return cleanPersonName(part.trim());
    }
  }

  return '';
}

function extractFromJsonLd($) {
  const scripts = $('script[type="application/ld+json"]');
  let name = '';

  scripts.each((_, el) => {
    if (name) return;
    try {
      let data = JSON.parse($(el).html());
      if (Array.isArray(data)) {
        // Search all items in the array
        for (const item of data) {
          const n = extractNameFromJsonLdNode(item);
          if (n) { name = n; return; }
        }
      } else {
        const n = extractNameFromJsonLdNode(data);
        if (n) { name = n; return; }
      }
    } catch (e) { /* invalid JSON-LD */ }
  });

  return name;
}

function extractNameFromJsonLdNode(data) {
  if (!data) return '';

  // Check nested @graph array
  if (data['@graph'] && Array.isArray(data['@graph'])) {
    for (const item of data['@graph']) {
      const n = extractNameFromJsonLdNode(item);
      if (n) return n;
    }
  }

  // Direct person
  if (data['@type'] === 'Person' && data.name && isPersonName(data.name)) {
    return data.name.trim();
  }

  // Founder(s)
  if (data.founder) {
    const founders = Array.isArray(data.founder) ? data.founder : [data.founder];
    for (const f of founders) {
      const n = typeof f === 'string' ? f : f.name;
      if (isPersonName(n)) return n.trim();
    }
  }

  // Author
  if (data.author) {
    const authors = Array.isArray(data.author) ? data.author : [data.author];
    for (const a of authors) {
      const n = typeof a === 'string' ? a : a.name;
      if (isPersonName(n)) return n.trim();
    }
  }

  // Employee/member
  if (data.employee) {
    const emps = Array.isArray(data.employee) ? data.employee : [data.employee];
    for (const e of emps) {
      const n = typeof e === 'string' ? e : e.name;
      if (isPersonName(n)) return n.trim();
    }
  }

  // Contact point
  if (data.contactPoint) {
    const points = Array.isArray(data.contactPoint) ? data.contactPoint : [data.contactPoint];
    for (const p of points) {
      if (p.name && isPersonName(p.name)) return p.name.trim();
    }
  }

  return '';
}

function extractFromMicrodata($) {
  // Schema.org microdata via itemtype/itemprop
  let name = '';
  $('[itemtype*="schema.org/Person"] [itemprop="name"]').each((_, el) => {
    if (name) return;
    const n = $(el).text().trim();
    if (isPersonName(n)) name = n;
  });
  return name;
}

function extractOwnerByTitle($, bodyText) {
  // Strategy A: Look through HTML elements for title+name patterns
  const candidates = [];

  // Check elements with role/title-like text near a name
  $('h1, h2, h3, h4, h5, p, div, span, strong, b, em').each((_, el) => {
    const text = $(el).text().trim();
    if (text.length < 5 || text.length > 200) return;

    const lower = text.toLowerCase();
    for (const title of OWNER_TITLES) {
      // Use word-boundary matching to avoid "owners manual" matching "owner"
      const regex = new RegExp('\\b' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const match = regex.exec(lower);
      if (!match) continue;
      const idx = match.index;

      // Pattern A: "John Smith, Owner" or "John Smith - CEO"
      if (idx > 2) {
        const before = text.substring(0, idx).replace(/[\s,\-–—|]+$/, '').trim();
        if (isPersonName(before)) {
          candidates.push({ name: before, confidence: 3 });
          return;
        }
      }

      // Pattern B: "Owner: John Smith" or "CEO - John Smith"
      const after = text.substring(idx + title.length).replace(/^[\s:,\-–—|]+/, '').trim();
      const words = after.split(/\s+/).slice(0, 4);
      const candidate = words.join(' ').replace(/[.,;!?"'()]+$/, '').trim();
      if (isPersonName(candidate)) {
        candidates.push({ name: candidate, confidence: 3 });
        return;
      }
    }
  });

  // Strategy B: Check sibling patterns (title in one element, name in next)
  $('h3, h4, h5, strong, b, .title, .role, .position, [class*="title"], [class*="role"]').each((_, el) => {
    const titleText = $(el).text().trim().toLowerCase();
    const hasTitle = OWNER_TITLES.some(t => new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(titleText));
    if (!hasTitle) return;

    // Check previous sibling or parent's previous child for a name
    const prev = $(el).prev();
    if (prev.length) {
      const n = prev.text().trim();
      if (isPersonName(n)) candidates.push({ name: n, confidence: 2 });
    }

    // Check next sibling
    const next = $(el).next();
    if (next.length) {
      const n = next.text().trim();
      if (isPersonName(n)) candidates.push({ name: n, confidence: 2 });
    }

    // Check parent container for a name-like heading
    const parent = $(el).parent();
    parent.find('h2, h3, h4, strong, [class*="name"]').each((_, nameEl) => {
      const n = $(nameEl).text().trim();
      if (n !== titleText && isPersonName(n)) {
        candidates.push({ name: n, confidence: 2 });
      }
    });
  });

  // Strategy C: Raw text line scanning
  const lines = bodyText.split(/\n/).map(l => l.trim()).filter(l => l.length > 3 && l.length < 200);
  for (const line of lines) {
    const lower = line.toLowerCase();
    for (const title of OWNER_TITLES) {
      const regex = new RegExp('\\b' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      const match = regex.exec(lower);
      if (!match) continue;
      const idx = match.index;

      // Name after title
      const after = line.substring(idx + title.length).replace(/^[\s:,\-–—|]+/, '').trim();
      const words = after.split(/\s+/).slice(0, 4);
      const candidate = words.join(' ').replace(/[.,;!?"'()]+$/, '').trim();
      if (isPersonName(candidate)) {
        candidates.push({ name: candidate, confidence: 1 });
      }

      // Name before title
      if (idx > 2) {
        const before = line.substring(0, idx).replace(/[\s,\-–—|]+$/, '').trim();
        const bWords = before.split(/\s+/).slice(-4);
        const bCandidate = bWords.join(' ');
        if (isPersonName(bCandidate)) {
          candidates.push({ name: bCandidate, confidence: 1 });
        }
      }
    }
  }

  // Return highest confidence match
  if (candidates.length === 0) return '';
  candidates.sort((a, b) => b.confidence - a.confidence);
  return candidates[0].name;
}

function extractFromGreeting(bodyText) {
  // Matches: "Hi, I'm John Smith", "Hello, my name is Jane Doe", "I'm Travis Daher",
  // "My name is Juan Rivas", "Hey, I'm Eli Hall", "I am Chad Bennett"
  // Note: handles both straight (') and curly/smart (\u2019) apostrophes
  const apos = "['\u2018\u2019\u0027]"; // straight, left curly, right curly apostrophe
  const greetingPatterns = [
    new RegExp(`(?:hi|hello|hey|howdy)[,!.]?\\s+(?:i${apos}?m|i\\s+am|my\\s+name\\s+is)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})`, 'gi'),
    new RegExp(`(?:i${apos}m|i\\s+am)\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){1,3})`, 'g'),
    /my\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/gi,
  ];

  for (const pattern of greetingPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(bodyText);
    if (match && match[1]) {
      const name = match[1].trim();
      if (isPersonName(name)) return name;
    }
  }
  return '';
}

function extractFromMeetHeading($) {
  // Matches headings like "Meet John Smith", "About Travis Daher"
  const patterns = [
    /^meet\s+(.+)/i,
    /^about\s+(.+)/i,
    /^introducing\s+(.+)/i,
    /^a\s+word\s+from\s+(.+)/i,
    /^a\s+message\s+from\s+(.+)/i,
  ];

  let result = '';
  $('h1, h2, h3, h4').each((_, el) => {
    if (result) return;
    const text = $(el).text().trim();
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        // Clean out trailing punctuation and role titles
        let candidate = match[1].replace(/[,\-–—|:].*/g, '').trim();
        if (isPersonName(candidate)) {
          result = candidate;
          return;
        }
      }
    }
  });
  return result;
}

function extractFromFoundedBy(bodyText) {
  // Matches: "founded by John Smith", "owned by Travis Daher", "started by Jane Doe"
  const patterns = [
    /(?:founded|co-?founded|owned|co-?owned|started|established|created|built|run|operated|managed)\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g,
    /(?:founder|co-?founder|owner|co-?owner|president|ceo)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(bodyText);
    if (match && match[1]) {
      const name = match[1].trim();
      if (isPersonName(name)) return name;
    }
  }
  return '';
}

function extractFirstTeamMember($) {
  // On team/about pages, the first person card is often the owner
  const selectors = [
    '[class*="team"] [class*="name"]',
    '[class*="staff"] [class*="name"]',
    '[class*="member"] [class*="name"]',
    '[class*="person"] [class*="name"]',
    '[class*="team"] h3',
    '[class*="team"] h4',
    '.team-member h3',
    '.team-card h3',
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const name = el.text().trim();
      if (isPersonName(name)) return name;
    }
  }

  return '';
}

function isPersonName(str) {
  if (!str || typeof str !== 'string') return false;
  let trimmed = str.trim();
  if (trimmed.length < 3 || trimmed.length > 60) return false;

  // Reject strings with commas, apostrophes (except O'Brien), exclamation, question marks
  if (/[,!?;]/.test(trimmed)) return false;
  if (/['']/.test(trimmed) && !/^[A-Z][a-z]+[''][A-Z]/.test(trimmed)) return false;

  // Normalize case: "chad BENNETT" or "JOHN SMITH" → "Chad Bennett"
  trimmed = normalizeNameCase(trimmed);

  const words = trimmed.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;

  // Each word should start with uppercase (allow Jr., III, etc.)
  const allCapitalized = words.every(w => /^[A-Z]/.test(w) || /^(Jr|Sr|III|II|IV)\.?$/i.test(w));
  if (!allCapitalized) return false;

  // No URLs, emails, phone numbers, or special characters
  if (/[@\/\\<>{}[\]]/.test(trimmed)) return false;
  if (/\d{3,}/.test(trimmed)) return false;

  // Reject common non-name starting words
  if (/^(the|our|your|this|all|get|new|top|best|free|home|more|view|call|click|contact|about|follow|join|site|page|team|staff|general|back|next|quick|main|meet|hi|hello|hey|welcome|we|my|see|read|learn|should|would|could|can|will|did|how|what|why|where|when|who|let|it|no|yes|not|just|also|here|each|every|much|very|so|too|an|if|or|by|at|to|in|on|up|off|out|for|with|from|into|over|some|any|has|had|have|was|were|been|being|am|is|are|do|does|done|got|go|went)/i.test(trimmed)) return false;

  // Reject common business/industry words that look like 2-word names
  const lowerTrimmed = trimmed.toLowerCase();
  const BUSINESS_WORDS = [
    'landscaping', 'landscape', 'construction', 'services', 'service',
    'solutions', 'company', 'enterprise', 'industries', 'associates',
    'contracting', 'maintenance', 'management', 'consulting', 'design',
    'properties', 'development', 'builders', 'building', 'electric',
    'plumbing', 'roofing', 'painting', 'cleaning', 'lawn', 'care',
    'home', 'outdoor', 'living', 'space', 'residential', 'commercial',
    'desert', 'mountain', 'valley', 'stone', 'water', 'fire', 'wood',
    'concrete', 'paving', 'fencing', 'irrigation', 'lighting',
    'entertainment', 'backyard', 'outdoor', 'premium', 'professional',
    'expert', 'custom', 'quality', 'trusted', 'certified', 'licensed',
    'insured', 'affordable', 'reliable', 'llc', 'inc', 'corp',
  ];
  if (BUSINESS_WORDS.some(bw => lowerTrimmed.includes(bw))) return false;

  // Reject if last word is a title/role word (often caught from adjacent text like "John Smith Chief")
  const lastWord = words[words.length - 1].toLowerCase();
  const TITLE_WORDS = ['chief', 'director', 'manager', 'officer', 'president', 'vice',
    'vp', 'ceo', 'cfo', 'cto', 'coo', 'owner', 'founder', 'partner', 'head', 'lead',
    'senior', 'junior', 'executive', 'supervisor', 'coordinator', 'administrator',
    'specialist', 'assistant', 'associate', 'superintendent', 'foreman'];
  if (TITLE_WORDS.includes(lastWord)) return false;

  // Also reject if first word is a title/role word
  const firstWord = words[0].toLowerCase();
  if (TITLE_WORDS.includes(firstWord)) return false;

  return true;
}

function normalizeNameCase(str) {
  // If mixed case with some all-uppercase words, title-case them
  // "chad BENNETT" → "Chad Bennett", "JOHN SMITH" → "John Smith"
  return str.split(/\s+/).map(word => {
    if (word.length <= 3 && /^(Jr|Sr|II|IV)\.?$/i.test(word)) return word;
    if (word === word.toUpperCase() || word === word.toLowerCase()) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return word;
  }).join(' ');
}

// Normalize a name before returning it (for results)
function cleanPersonName(str) {
  if (!str) return '';
  return normalizeNameCase(str.trim());
}

// ========== Services Extraction ==========

function extractServices($, bodyText) {
  const services = new Set();

  // Strategy 1: Lists under service-related headings
  $('h1, h2, h3, h4').each((_, heading) => {
    const text = $(heading).text().toLowerCase().trim();
    const isServiceHeading = SERVICE_KEYWORDS.some(k => text.includes(k));
    if (!isServiceHeading) return;

    // Find nearby lists — check next siblings and within parent container
    const searchTargets = [
      $(heading).nextAll('ul, ol').first(),
      $(heading).next().find('ul, ol').first(),
      $(heading).parent().find('ul, ol').first(),
      $(heading).parent().next().find('ul, ol').first(),
    ];

    for (const target of searchTargets) {
      if (!target.length) continue;
      target.find('li').each((_, li) => {
        let svc = $(li).clone().children('ul, ol').remove().end().text().trim();
        if (!svc) svc = $(li).text().trim();
        svc = svc.replace(/^\s*[\-–—•·▸▹►]\s*/, '').trim();
        if (isValidService(svc)) services.add(svc);
      });
      if (services.size > 0) break;
    }
  });

  // Strategy 2: Cards/divs with service-like class names or IDs
  if (services.size === 0) {
    const serviceSelectors = [
      '[class*="service"] h2', '[class*="service"] h3', '[class*="service"] h4',
      '[class*="Service"] h2', '[class*="Service"] h3', '[class*="Service"] h4',
      '[id*="service"] h2', '[id*="service"] h3', '[id*="service"] h4',
      '.service-item h3', '.service-card h3', '.service-box h3',
      '[class*="offering"] h3', '[class*="solution"] h3',
    ];
    for (const sel of serviceSelectors) {
      $(sel).each((_, el) => {
        const svc = $(el).text().trim();
        if (isValidService(svc)) services.add(svc);
      });
      if (services.size > 0) break;
    }
  }

  // Strategy 3: Internal link clusters — groups of 3+ same-domain links with short descriptive text
  // Many landscaping/service sites list services as link groups (navigation, content sections, etc.)
  if (services.size === 0) {
    // Scan the entire page for clusters of internal links with service-like text
    const allInternalLinks = [];
    const pageHost = (() => { try { return new URL($('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content') || '').host; } catch(e) { return ''; } })();

    $('a[href]').each((_, link) => {
      const text = $(link).text().trim();
      const href = $(link).attr('href') || '';

      // Must be internal link with descriptive text
      if (!text || text.length < 4 || text.length > 60) return;
      if (text.split(/\s+/).length > 8) return;

      const lower = text.toLowerCase();
      if (GENERIC_NAV_ITEMS.has(lower)) return;

      // Skip location-only single words (city names like "Phoenix", "Tempe")
      if (text.split(/\s+/).length === 1 && /^[A-Z][a-z]+$/.test(text)) return;

      // Must be internal (relative or same host)
      const isInternal = href.startsWith('/') || href.startsWith('./') ||
        (pageHost && href.includes(pageHost)) ||
        (!href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:'));
      if (!isInternal && href.startsWith('http')) return;

      allInternalLinks.push({ text, href });
    });

    // Filter to links that look like service/product names (multi-word, descriptive)
    const serviceLike = allInternalLinks.filter(l => {
      const words = l.text.split(/\s+/).length;
      return words >= 2 && words <= 7; // Multi-word = more likely a service name
    });

    if (serviceLike.length >= 3) {
      serviceLike.forEach(l => {
        if (isValidService(l.text)) services.add(l.text);
      });
    }
  }

  // Strategy 4: Grid/flex containers with service-like content
  if (services.size === 0) {
    $('[class*="grid"], [class*="flex"], [class*="row"]').each((_, container) => {
      const children = $(container).children();
      if (children.length < 3 || children.length > 15) return;
      if (services.size > 0) return;

      children.each((_, child) => {
        const heading = $(child).find('h2, h3, h4').first();
        if (heading.length) {
          const svc = heading.text().trim();
          if (isValidService(svc)) services.add(svc);
        }
      });
    });
  }

  // Strategy 5: Common WordPress/Elementor widget patterns
  if (services.size === 0) {
    $('.elementor-widget-container h3, .wp-block-heading, .et_pb_module_header').each((_, el) => {
      const parent = $(el).closest('[class*="service"], [class*="Service"]');
      if (parent.length) {
        const svc = $(el).text().trim();
        if (isValidService(svc)) services.add(svc);
      }
    });
  }

  return dedupeServices([...services].filter(s => isValidService(s))).slice(0, 20);
}

function dedupeServices(services) {
  const seen = new Set();
  return services.filter(svc => {
    // Normalize: lowercase, remove trailing "s", "services" suffix
    const key = svc.toLowerCase()
      .replace(/\s+services?\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Generic navigation items to skip
const GENERIC_NAV_ITEMS = new Set([
  'home', 'about', 'about us', 'contact', 'contact us', 'blog', 'gallery',
  'portfolio', 'faq', 'login', 'sign in', 'sign up', 'register', 'cart',
  'shop', 'store', 'menu', 'search', 'more', 'back', 'next', 'previous',
  'reviews', 'testimonials', 'careers', 'jobs', 'privacy', 'terms',
  'schedule a consultation', 'get a quote', 'free estimate', 'request quote',
  'financing', 'warranty', 'warranties', 'client warranties',
]);

function isValidService(svc) {
  if (!svc || svc.length < 3 || svc.length > 120) return false;
  const lower = svc.toLowerCase();
  if (GENERIC_NAV_ITEMS.has(lower)) return false;
  // Skip sentences (too many words = description, not a service name)
  if (svc.split(/\s+/).length > 10) return false;
  // Skip things that are clearly calls-to-action, not services
  if (/^(check out|see (our|the|a)|view|click|learn more|read more|call|schedule|get|request|download|book now|meet|partnering|legacy|testaments|client|quality|skip to|tap to|go to|start a|budget|team &|our team|send us|follow us|complete project)/i.test(svc)) return false;
  // Skip prices/numbers only
  if (/^\$?\d+/.test(svc)) return false;
  // Skip all-caps navigation text (like "COLLABORATORS", "FINANCING")
  if (/^[A-Z\s]+$/.test(svc) && svc.split(/\s+/).length <= 2) return false;
  // Skip if contains a phone number
  if (/\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/.test(svc)) return false;
  if (/\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(svc)) return false;
  // Skip team member references
  if (/^(meet\s|holly|chris|john|mike|dave|steve|sarah|jennifer|jessica|ashley)/i.test(lower)) return false;
  // Skip "Case Study" type content
  if (/^case stud/i.test(svc)) return false;
  return true;
}

// ========== Social Links Extraction ==========

function extractSocialLinks($) {
  const social = {};
  const ignorePatterns = ['sharer', 'share', 'intent/tweet', 'pin/create', '/plugins/', '/dialog/', 'add_to_cart'];

  $('a[href]').each((_, el) => {
    const rawHref = $(el).attr('href') || '';
    const href = rawHref.toLowerCase();

    if (ignorePatterns.some(p => href.includes(p))) return;

    if (!social.facebook && (href.includes('facebook.com/') || href.includes('fb.com/')) && !href.includes('facebook.com/tr') && !href.includes('facebook.com/plugins')) {
      social.facebook = rawHref;
    }
    if (!social.linkedin && href.includes('linkedin.com/')) {
      social.linkedin = rawHref;
    }
    if (!social.instagram && href.includes('instagram.com/')) {
      social.instagram = rawHref;
    }
    if (!social.twitter && (href.includes('twitter.com/') || href.includes('x.com/'))) {
      social.twitter = rawHref;
    }
    if (!social.youtube && (href.includes('youtube.com/') || href.includes('youtu.be/'))) {
      social.youtube = rawHref;
    }
    if (!social.tiktok && href.includes('tiktok.com/')) {
      social.tiktok = rawHref;
    }
    if (!social.yelp && href.includes('yelp.com/biz/')) {
      social.yelp = rawHref;
    }
    if (!social.google && href.includes('google.com/maps') || href.includes('maps.google')) {
      social.google = rawHref;
    }
    if (!social.bbb && href.includes('bbb.org/')) {
      social.bbb = rawHref;
    }
    if (!social.nextdoor && href.includes('nextdoor.com/')) {
      social.nextdoor = rawHref;
    }
  });

  return social;
}

// ========== Phone Extraction ==========

function extractPhones($, bodyText) {
  const found = new Set();

  // 1. tel: links (highest confidence)
  $('a[href^="tel:"], a[href^="TEL:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const phone = href.replace(/^tel:/i, '').replace(/\s/g, '').trim();
    if (phone.replace(/\D/g, '').length >= 10) found.add(phone);
  });

  // 2. Elements with phone-related classes/IDs
  $('[class*="phone"], [class*="Phone"], [id*="phone"], [class*="tel"], [id*="tel"], [class*="number"]').each((_, el) => {
    const text = $(el).text().trim();
    const matches = text.match(PHONE_REGEX) || [];
    matches.forEach(p => found.add(p.trim()));
  });

  // 3. Contact sections and footer
  $('footer, [class*="contact"], [class*="footer"], header, [class*="header"]').each((_, el) => {
    const text = $(el).text();
    const matches = text.match(PHONE_REGEX) || [];
    matches.forEach(p => found.add(p.trim()));
  });

  // 4. Full body text regex scan
  const matches = bodyText.match(PHONE_REGEX) || [];
  matches.forEach(phone => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11) found.add(phone.trim());
  });

  // 5. JSON-LD phone numbers
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const phones = [];
      if (data.telephone) phones.push(data.telephone);
      if (data.phone) phones.push(data.phone);
      if (data.contactPoint) {
        const points = Array.isArray(data.contactPoint) ? data.contactPoint : [data.contactPoint];
        points.forEach(p => { if (p.telephone) phones.push(p.telephone); });
      }
      phones.forEach(p => {
        if (typeof p === 'string' && p.replace(/\D/g, '').length >= 10) found.add(p);
      });
    } catch (e) { /* skip */ }
  });

  return dedupePhones([...found]);
}

function dedupePhones(phones) {
  const seen = new Set();
  return phones.filter(phone => {
    const digits = phone.replace(/\D/g, '');
    const last10 = digits.slice(-10);
    if (last10.length < 10) return false;
    if (seen.has(last10)) return false;
    seen.add(last10);
    return true;
  });
}

// ========== Description Extraction ==========

function extractDescription($) {
  // Priority: og:description > meta description > JSON-LD description
  const ogDesc = $('meta[property="og:description"]').attr('content');
  if (ogDesc && ogDesc.trim().length > 10) return ogDesc.trim().substring(0, 500);

  const metaDesc = $('meta[name="description"]').attr('content')
    || $('meta[name="Description"]').attr('content');
  if (metaDesc && metaDesc.trim().length > 10) return metaDesc.trim().substring(0, 500);

  // JSON-LD description
  let jsonDesc = '';
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonDesc) return;
    try {
      const data = JSON.parse($(el).html());
      if (data.description && data.description.length > 10) {
        jsonDesc = data.description.substring(0, 500);
      }
    } catch (e) { /* skip */ }
  });
  if (jsonDesc) return jsonDesc;

  // Fallback: first substantial paragraph
  let fallback = '';
  $('p').each((_, el) => {
    if (fallback) return;
    const text = $(el).text().trim();
    if (text.length > 50 && text.length < 500) {
      fallback = text;
    }
  });

  return fallback;
}

module.exports = { scrapeBusinessWebsite };
