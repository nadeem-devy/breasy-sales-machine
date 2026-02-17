require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { requireAuth } = require('./middleware/auth');

// Initialize database
const { createTables } = require('./database/schema');
createTables();

// Auto-generate password hash on first run if not set
if (!config.auth.passwordHash) {
  const defaultPassword = 'breasy123';
  const hash = bcrypt.hashSync(defaultPassword, 10);
  console.log('\n  ==========================================');
  console.log('  NO ADMIN PASSWORD SET — using defaults:');
  console.log('  Username: ' + config.auth.username);
  console.log('  Password: ' + defaultPassword);
  console.log('  Hash:     ' + hash);
  console.log('  Add to .env: ADMIN_PASSWORD_HASH=' + hash);
  console.log('  ==========================================\n');
  config.auth.passwordHash = hash;
}

const app = express();

// =============================================
// MIDDLEWARE
// =============================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('short'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } })); // 50MB max
app.use(express.static(path.join(__dirname, '..', 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Session
app.use(session({
  secret: config.auth.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax',
  },
}));

// =============================================
// TOTP Helper
// =============================================
function getTOTP(secret) {
  return new TOTP({
    issuer: 'Breasy',
    label: config.auth.username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

// =============================================
// AUTH ROUTES (before guard)
// =============================================
app.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === config.auth.username && bcrypt.compareSync(password || '', config.auth.passwordHash)) {
    req.session.passwordVerified = true;
    req.session.username = username;

    // If 2FA is enabled, go to verify page
    if (config.auth.totpEnabled && config.auth.totpSecret) {
      return res.redirect('/2fa/verify');
    }

    // No 2FA — fully authenticated
    req.session.authenticated = true;
    return res.redirect('/');
  }

  res.render('login', { error: 'Invalid username or password' });
});

// 2FA Verify — shown after password login when 2FA is active
app.get('/2fa/verify', (req, res) => {
  if (!req.session || !req.session.passwordVerified) {
    return res.redirect('/login');
  }
  if (req.session.authenticated) {
    return res.redirect('/');
  }
  res.render('2fa-verify', { error: null });
});

app.post('/2fa/verify', (req, res) => {
  if (!req.session || !req.session.passwordVerified) {
    return res.redirect('/login');
  }

  const { token } = req.body;
  const totp = getTOTP(config.auth.totpSecret);
  const valid = totp.validate({ token: token || '', window: 1 }) !== null;

  if (valid) {
    req.session.authenticated = true;
    return res.redirect('/');
  }

  res.render('2fa-verify', { error: 'Invalid code. Please try again.' });
});

// 2FA Setup — accessible after password login, generates QR code
app.get('/2fa/setup', async (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.redirect('/login');
  }

  // Generate a new secret for setup
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: 'Breasy',
    label: config.auth.username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  req.session.pendingTotpSecret = secret.base32;
  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri, { width: 200, margin: 2 });

  res.render('2fa-setup', { qrDataUrl, secret: secret.base32, error: null });
});

app.post('/2fa/setup', async (req, res) => {
  if (!req.session || !req.session.authenticated || !req.session.pendingTotpSecret) {
    return res.redirect('/login');
  }

  const { token } = req.body;
  const totp = getTOTP(req.session.pendingTotpSecret);
  const valid = totp.validate({ token: token || '', window: 1 }) !== null;

  if (!valid) {
    const secret = new Secret({ size: 20 });
    // Re-show with same pending secret
    const reTOTP = new TOTP({
      issuer: 'Breasy',
      label: config.auth.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(req.session.pendingTotpSecret),
    });
    const qrDataUrl = await QRCode.toDataURL(reTOTP.toString(), { width: 200, margin: 2 });
    return res.render('2fa-setup', { qrDataUrl, secret: req.session.pendingTotpSecret, error: 'Invalid code. Scan the QR code and try again.' });
  }

  // Code verified — save secret to .env and config
  const newSecret = req.session.pendingTotpSecret;
  config.auth.totpSecret = newSecret;
  config.auth.totpEnabled = true;

  // Persist to .env file
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('TOTP_SECRET=')) {
    envContent = envContent.replace(/TOTP_SECRET=.*/, 'TOTP_SECRET=' + newSecret);
  } else {
    envContent += '\nTOTP_SECRET=' + newSecret;
  }
  if (envContent.includes('TOTP_ENABLED=')) {
    envContent = envContent.replace(/TOTP_ENABLED=.*/, 'TOTP_ENABLED=true');
  } else {
    envContent += '\nTOTP_ENABLED=true';
  }
  fs.writeFileSync(envPath, envContent);

  delete req.session.pendingTotpSecret;
  res.redirect('/settings?totp=enabled');
});

// Disable 2FA
app.post('/2fa/disable', (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  config.auth.totpSecret = '';
  config.auth.totpEnabled = false;

  // Update .env
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  envContent = envContent.replace(/TOTP_ENABLED=.*/, 'TOTP_ENABLED=false');
  fs.writeFileSync(envPath, envContent);

  res.json({ success: true });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// =============================================
// AUTH GUARD — protect everything below
// =============================================
app.use(requireAuth);

// =============================================
// WEB PAGES (Dashboard)
// =============================================
app.get('/', (req, res) => res.render('dashboard'));
app.get('/leads', (req, res) => res.render('leads'));
app.get('/lead/:id', (req, res) => res.render('lead-detail', { leadId: req.params.id }));
app.get('/settings', (req, res) => res.render('settings'));
app.get('/import', (req, res) => res.render('import'));
app.get('/scrape', (req, res) => res.render('scrape'));
app.get('/sms-inbox', (req, res) => res.render('sms-inbox'));
app.get('/email-inbox', (req, res) => res.render('email-inbox', { sendgridFromEmail: config.sendgrid.fromEmail }));
app.get('/call-log', (req, res) => res.render('call-log'));
app.get('/playbook', (req, res) => res.render('playbook'));
app.get('/companies', (req, res) => res.render('companies'));
app.get('/company/:id', (req, res) => res.render('company-detail', { companyId: req.params.id }));
app.get('/app-support', (req, res) => res.render('app-support'));
app.get('/ad-campaigns', (req, res) => res.render('ad-campaigns'));
app.get('/ad-campaigns/create', (req, res) => res.render('ad-campaign-create'));
app.get('/ad-campaigns/track', (req, res) => res.render('ad-campaign-track'));
app.get('/ad-campaigns/:id', (req, res) => res.render('ad-campaign-detail', { adCampaignId: req.params.id }));

// Tracking link redirect
app.get('/t/:trackingId', require('./api/trackingRedirect'));

// Unsubscribe page
app.get('/unsubscribe', (req, res) => {
  const { lid } = req.query;
  if (lid) {
    const Lead = require('./models/Lead');
    const lead = Lead.findByUniqueId(lid);
    if (lead) {
      const { handleOptOut } = require('./services/routing');
      handleOptOut(lead, 'email');
    }
  }
  res.send('<html><body style="font-family:sans-serif;text-align:center;padding:60px;"><h2>You have been unsubscribed.</h2><p>You will no longer receive emails from us.</p></body></html>');
});

// =============================================
// API ROUTES
// =============================================
app.use('/api/leads', require('./api/leads'));
app.use('/api/dashboard', require('./api/dashboard'));
app.use('/api/scraper', require('./api/scraper'));
app.use('/api/enrichment', require('./api/enrichment'));
app.use('/api/companies', require('./api/companies'));
app.use('/api/app-support', require('./api/appSupport'));
app.use('/api/ad-campaigns', require('./api/adCampaigns'));

// =============================================
// WEBHOOK ROUTES
// =============================================
app.use('/webhooks/twilio', require('./webhooks/twilioWebhook'));
app.use('/webhooks/dialpad', require('./webhooks/dialpadWebhook'));
app.use('/webhooks/sendgrid', require('./webhooks/sendgridWebhook'));
app.use('/webhooks/vapi', require('./webhooks/vapiWebhook'));
app.use('/webhooks/meta-leads', require('./webhooks/metaLeadWebhook'));
app.use('/webhooks/linkedin-leads', require('./webhooks/linkedinLeadWebhook'));

// =============================================
// SSE NOTIFICATIONS
// =============================================
const { addClient } = require('./services/notifier');
app.get('/api/notifications/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('event: connected\ndata: {}\n\n');
  addClient(res);
});

// =============================================
// HEALTH CHECK
// =============================================
app.get('/health', (req, res) => {
  const db = require('./database/db');
  const leadCount = db.prepare('SELECT COUNT(*) as c FROM leads').get().c;
  const activityCount = db.prepare('SELECT COUNT(*) as c FROM activities').get().c;
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    leads: leadCount,
    activities: activityCount,
    env: config.env,
  });
});

// =============================================
// GLOBAL ERROR HANDLER
// =============================================
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    path: req.url,
  });
});

// =============================================
// START SERVER + SCHEDULER
// =============================================
app.listen(config.port, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   BREASY SALES MACHINE                          ║
  ║   Running on http://localhost:${config.port}            ║
  ║                                                  ║
  ║   Dashboard:  http://localhost:${config.port}            ║
  ║   API:        http://localhost:${config.port}/api        ║
  ║   Health:     http://localhost:${config.port}/health     ║
  ╚══════════════════════════════════════════════════╝
  `);

  // Start scheduler
  const { startScheduler } = require('./jobs/scheduler');
  startScheduler();
});

module.exports = app;
