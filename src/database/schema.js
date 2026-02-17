const db = require('./db');

function createTables() {
  db.exec(`
    -- =============================================
    -- CAMPAIGNS
    -- =============================================
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      start_date TEXT,
      end_date TEXT,
      total_leads INTEGER DEFAULT 0,
      total_contacted INTEGER DEFAULT 0,
      total_qualified INTEGER DEFAULT 0,
      total_converted INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- =============================================
    -- SEQUENCES
    -- =============================================
    CREATE TABLE IF NOT EXISTS sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      total_steps INTEGER DEFAULT 7,
      target_industry TEXT,
      campaign_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );

    -- =============================================
    -- MESSAGE TEMPLATES
    -- =============================================
    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('sms', 'email')),
      subject TEXT,
      body TEXT NOT NULL,
      version TEXT DEFAULT 'A',
      is_active INTEGER DEFAULT 1,
      send_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- =============================================
    -- SEQUENCE STEPS
    -- =============================================
    CREATE TABLE IF NOT EXISTS sequence_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_id INTEGER NOT NULL,
      step_number INTEGER NOT NULL,
      channel TEXT NOT NULL CHECK(channel IN ('sms', 'email', 'ai_call')),
      delay_hours INTEGER DEFAULT 0,
      template_id INTEGER,
      send_window_start INTEGER DEFAULT 9,
      send_window_end INTEGER DEFAULT 20,
      send_days TEXT DEFAULT 'mon,tue,wed,thu,fri',
      skip_if_replied INTEGER DEFAULT 1,
      skip_if_score_above INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (sequence_id) REFERENCES sequences(id),
      FOREIGN KEY (template_id) REFERENCES message_templates(id)
    );

    -- =============================================
    -- LEADS
    -- =============================================
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_id TEXT NOT NULL UNIQUE,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      company_name TEXT,
      job_title TEXT,
      industry TEXT,
      city TEXT,
      state TEXT,
      service_type TEXT,
      source TEXT DEFAULT 'manual' CHECK(source IN ('google_maps', 'search', 'agent_scrape', 'hubspot', 'manual')),
      campaign_id INTEGER,
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'lead', 'discovery', 'qualifying', 'ready_for_work', 'bad_data', 'do_not_call', 'not_a_fit')),
      score INTEGER DEFAULT 0,
      score_tier TEXT DEFAULT 'cold' CHECK(score_tier IN ('cold', 'warm', 'hot', 'qualified', 'dead')),
      assigned_to INTEGER,
      sequence_id INTEGER,
      current_step INTEGER DEFAULT 0,
      sequence_status TEXT DEFAULT 'pending' CHECK(sequence_status IN ('pending', 'active', 'paused', 'completed', 'stopped')),
      next_action_at TEXT,
      sms_opt_out INTEGER DEFAULT 0,
      email_opt_out INTEGER DEFAULT 0,
      call_opt_out INTEGER DEFAULT 0,
      last_contacted_at TEXT,
      last_reply_at TEXT,
      total_sms_sent INTEGER DEFAULT 0,
      total_emails_sent INTEGER DEFAULT 0,
      total_calls_made INTEGER DEFAULT 0,
      replied INTEGER DEFAULT 0,
      call_answered INTEGER DEFAULT 0,
      call_qualified INTEGER DEFAULT 0,
      app_downloaded INTEGER DEFAULT 0,
      meeting_booked INTEGER DEFAULT 0,
      video_link TEXT,
      app_download_link TEXT,
      meeting_link TEXT,
      hubspot_id TEXT,
      notes TEXT,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      FOREIGN KEY (sequence_id) REFERENCES sequences(id)
    );

    CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
    CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_score_tier ON leads(score_tier);
    CREATE INDEX IF NOT EXISTS idx_leads_sequence_status ON leads(sequence_status);
    CREATE INDEX IF NOT EXISTS idx_leads_next_action ON leads(next_action_at);
    CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_leads_service_type ON leads(service_type);

    -- =============================================
    -- ACTIVITIES (Event Log)
    -- =============================================
    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      channel TEXT CHECK(channel IN ('sms', 'email', 'call', 'system')),
      direction TEXT CHECK(direction IN ('outbound', 'inbound')),
      content TEXT,
      metadata TEXT,
      score_before INTEGER,
      score_after INTEGER,
      twilio_sid TEXT,
      sendgrid_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id);
    CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
    CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);

    -- =============================================
    -- AI CALL LOGS
    -- =============================================
    CREATE TABLE IF NOT EXISTS ai_call_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      call_sid TEXT,
      twilio_sid TEXT,
      call_type TEXT DEFAULT 'ai',
      operator_phone TEXT,
      status TEXT DEFAULT 'initiated',
      duration_seconds INTEGER DEFAULT 0,
      outcome TEXT,
      transcript TEXT,
      summary TEXT,
      interest_level TEXT,
      wants_meeting INTEGER DEFAULT 0,
      wants_app INTEGER DEFAULT 0,
      objections TEXT,
      next_action TEXT,
      recording_url TEXT,
      structured_data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON ai_call_logs(lead_id);
    CREATE INDEX IF NOT EXISTS idx_call_logs_sid ON ai_call_logs(call_sid);
    CREATE INDEX IF NOT EXISTS idx_call_logs_twilio_sid ON ai_call_logs(twilio_sid);
    CREATE INDEX IF NOT EXISTS idx_activities_direction ON activities(direction);

    -- =============================================
    -- DAILY METRICS
    -- =============================================
    CREATE TABLE IF NOT EXISTS daily_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      campaign_id INTEGER,
      leads_imported INTEGER DEFAULT 0,
      sms_sent INTEGER DEFAULT 0,
      sms_delivered INTEGER DEFAULT 0,
      sms_replied INTEGER DEFAULT 0,
      sms_opt_outs INTEGER DEFAULT 0,
      emails_sent INTEGER DEFAULT 0,
      emails_opened INTEGER DEFAULT 0,
      emails_clicked INTEGER DEFAULT 0,
      emails_replied INTEGER DEFAULT 0,
      emails_bounced INTEGER DEFAULT 0,
      calls_made INTEGER DEFAULT 0,
      calls_answered INTEGER DEFAULT 0,
      calls_qualified INTEGER DEFAULT 0,
      meetings_booked INTEGER DEFAULT 0,
      app_downloads INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_date ON daily_metrics(date);

    -- =============================================
    -- SUPPRESSION LIST (DNC)
    -- =============================================
    CREATE TABLE IF NOT EXISTS suppression_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      email TEXT,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_suppression_phone ON suppression_list(phone);
    CREATE INDEX IF NOT EXISTS idx_suppression_email ON suppression_list(email);

    -- =============================================
    -- USERS (Sales/Ops team)
    -- =============================================
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      role TEXT DEFAULT 'sales' CHECK(role IN ('admin', 'sales', 'ops')),
      is_active INTEGER DEFAULT 1,
      daily_lead_cap INTEGER DEFAULT 25,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- =============================================
    -- SYSTEM SETTINGS
    -- =============================================
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT
    );
  `);

  console.log('Database tables created successfully.');

  // Migration: ensure 'browser' is allowed in call_type CHECK constraint
  try {
    db.exec(`
      INSERT INTO ai_call_logs (lead_id, call_type, status) VALUES (0, 'browser', 'initiated');
      DELETE FROM ai_call_logs WHERE lead_id = 0 AND call_type = 'browser';
    `);
  } catch (e) {
    // Old CHECK constraint rejects 'browser' — recreate table
    console.log('[MIGRATION] Updating ai_call_logs to support browser call type...');
    db.exec(`
      DROP TABLE IF EXISTS ai_call_logs_new;
      CREATE TABLE ai_call_logs_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        call_sid TEXT,
        twilio_sid TEXT,
        call_type TEXT DEFAULT 'ai',
        operator_phone TEXT,
        status TEXT DEFAULT 'initiated',
        duration_seconds INTEGER DEFAULT 0,
        outcome TEXT,
        transcript TEXT,
        summary TEXT,
        interest_level TEXT,
        wants_meeting INTEGER DEFAULT 0,
        wants_app INTEGER DEFAULT 0,
        objections TEXT,
        next_action TEXT,
        recording_url TEXT,
        structured_data TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        provider TEXT DEFAULT 'twilio',
        provider_sid TEXT,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      );
      INSERT INTO ai_call_logs_new (id, lead_id, call_sid, twilio_sid, call_type, operator_phone, status, duration_seconds, outcome, transcript, summary, interest_level, wants_meeting, wants_app, objections, next_action, recording_url, structured_data, created_at)
        SELECT id, lead_id, call_sid, twilio_sid, call_type, operator_phone, status, duration_seconds, outcome, transcript, summary, interest_level, wants_meeting, wants_app, objections, next_action, recording_url, structured_data, created_at FROM ai_call_logs;
      DROP TABLE ai_call_logs;
      ALTER TABLE ai_call_logs_new RENAME TO ai_call_logs;
      CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON ai_call_logs(lead_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_sid ON ai_call_logs(call_sid);
      CREATE INDEX IF NOT EXISTS idx_call_logs_twilio_sid ON ai_call_logs(twilio_sid);
    `);
    console.log('[MIGRATION] ai_call_logs updated successfully.');
  }

  // Migration: Add provider columns for multi-telephony support (Dialpad fallback)
  try {
    db.exec(`ALTER TABLE activities ADD COLUMN provider TEXT DEFAULT 'twilio'`);
    console.log('[MIGRATION] Added provider column to activities');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE activities ADD COLUMN provider_sid TEXT`);
    console.log('[MIGRATION] Added provider_sid column to activities');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE ai_call_logs ADD COLUMN provider TEXT DEFAULT 'twilio'`);
    console.log('[MIGRATION] Added provider column to ai_call_logs');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE ai_call_logs ADD COLUMN provider_sid TEXT`);
    console.log('[MIGRATION] Added provider_sid column to ai_call_logs');
  } catch (e) { /* column exists */ }

  // Seed telephony provider setting
  try {
    db.prepare(
      "INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)"
    ).run('telephony_provider', 'twilio', 'Active telephony provider (twilio or dialpad)');
  } catch (e) { /* exists */ }

  // Migration: Add sms_read_at to leads for read/unread tracking
  try {
    db.exec(`ALTER TABLE leads ADD COLUMN sms_read_at TEXT`);
    console.log('[MIGRATION] Added sms_read_at column to leads');
  } catch (e) { /* column exists */ }

  // Seed Dialpad sync timestamp
  try {
    db.prepare(
      "INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)"
    ).run('dialpad_last_sync', '', 'Last Dialpad sync timestamp');
  } catch (e) { /* exists */ }

  // =============================================
  // Migration: Campaign niche configuration
  // =============================================
  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN target_categories TEXT DEFAULT ''`);
    console.log('[MIGRATION] Added target_categories to campaigns');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN rejected_categories TEXT DEFAULT ''`);
    console.log('[MIGRATION] Added rejected_categories to campaigns');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE campaigns ADD COLUMN niche_name TEXT DEFAULT 'General'`);
    console.log('[MIGRATION] Added niche_name to campaigns');
  } catch (e) { /* column exists */ }

  // =============================================
  // Migration: Lead enrichment metadata
  // =============================================
  try {
    db.exec(`ALTER TABLE leads ADD COLUMN enrichment_sources TEXT DEFAULT ''`);
    console.log('[MIGRATION] Added enrichment_sources to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN data_completeness INTEGER DEFAULT 0`);
    console.log('[MIGRATION] Added data_completeness to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN quality_score INTEGER DEFAULT 0`);
    console.log('[MIGRATION] Added quality_score to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN qualification_grade TEXT DEFAULT ''`);
    console.log('[MIGRATION] Added qualification_grade to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN phone_line_type TEXT DEFAULT ''`);
    console.log('[MIGRATION] Added phone_line_type to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN website_status TEXT DEFAULT ''`);
    console.log('[MIGRATION] Added website_status to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN enrichment_data TEXT DEFAULT '{}'`);
    console.log('[MIGRATION] Added enrichment_data to leads');
  } catch (e) { /* column exists */ }

  // =============================================
  // Migration: Lead business data columns (for enrichment)
  // =============================================
  try {
    db.exec(`ALTER TABLE leads ADD COLUMN website TEXT DEFAULT ''`);
    console.log('[MIGRATION] Added website to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN address TEXT DEFAULT ''`);
    console.log('[MIGRATION] Added address to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN rating REAL DEFAULT 0`);
    console.log('[MIGRATION] Added rating to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN review_count INTEGER DEFAULT 0`);
    console.log('[MIGRATION] Added review_count to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN employee_count INTEGER DEFAULT 0`);
    console.log('[MIGRATION] Added employee_count to leads');
  } catch (e) { /* column exists */ }

  // =============================================
  // Ad Campaign Management tables
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL CHECK(platform IN ('facebook','instagram','google','linkedin','reddit')),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','pending','active','paused','completed','error')),
      platform_campaign_id TEXT,
      objective TEXT DEFAULT 'lead_generation' CHECK(objective IN ('lead_generation','traffic','awareness')),
      daily_budget REAL DEFAULT 0,
      total_budget REAL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      targeting TEXT DEFAULT '{}',
      creative TEXT DEFAULT '{}',
      lead_form_config TEXT DEFAULT '{}',
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      spend REAL DEFAULT 0,
      leads_captured INTEGER DEFAULT 0,
      cpl REAL DEFAULT 0,
      last_synced_at TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ad_campaign_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_campaign_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      impressions INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      spend REAL DEFAULT 0,
      leads INTEGER DEFAULT 0,
      cpl REAL DEFAULT 0,
      FOREIGN KEY (ad_campaign_id) REFERENCES ad_campaigns(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ad_metrics_campaign ON ad_campaign_metrics(ad_campaign_id);
    CREATE INDEX IF NOT EXISTS idx_ad_metrics_date ON ad_campaign_metrics(date);

    CREATE TABLE IF NOT EXISTS ad_platform_auth (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL UNIQUE,
      access_token TEXT,
      refresh_token TEXT,
      token_expiry TEXT,
      account_id TEXT,
      extra TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // =============================================
  // Companies table (Company-Contact association)
  // =============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      domain TEXT,
      website TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT DEFAULT '',
      state TEXT DEFAULT '',
      industry TEXT DEFAULT '',
      employee_count INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      leads_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
    CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
  `);

  // Migration: Add company_id FK to leads
  try {
    db.exec(`ALTER TABLE leads ADD COLUMN company_id INTEGER`);
    console.log('[MIGRATION] Added company_id to leads');
  } catch (e) { /* column exists */ }

  // =============================================
  // Migration: Remove restrictive outcome CHECK constraint on ai_call_logs
  // Inbound calls from Vapi have outcomes like 'transferred_to_david', 'learned_about_breasy', etc.
  // =============================================
  try {
    db.exec(`
      INSERT INTO ai_call_logs (lead_id, call_type, status, outcome) VALUES (0, 'ai', 'initiated', 'transferred_to_david');
      DELETE FROM ai_call_logs WHERE lead_id = 0 AND outcome = 'transferred_to_david';
    `);
  } catch (e) {
    console.log('[MIGRATION] Removing restrictive outcome CHECK on ai_call_logs...');
    db.exec(`
      DROP TABLE IF EXISTS ai_call_logs_v3;
      CREATE TABLE ai_call_logs_v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        call_sid TEXT,
        twilio_sid TEXT,
        call_type TEXT DEFAULT 'ai',
        operator_phone TEXT,
        status TEXT DEFAULT 'initiated',
        duration_seconds INTEGER DEFAULT 0,
        outcome TEXT,
        transcript TEXT,
        summary TEXT,
        interest_level TEXT,
        wants_meeting INTEGER DEFAULT 0,
        wants_app INTEGER DEFAULT 0,
        objections TEXT,
        next_action TEXT,
        recording_url TEXT,
        structured_data TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        provider TEXT DEFAULT 'twilio',
        provider_sid TEXT,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      );
      INSERT INTO ai_call_logs_v3 SELECT * FROM ai_call_logs;
      DROP TABLE ai_call_logs;
      ALTER TABLE ai_call_logs_v3 RENAME TO ai_call_logs;
      CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON ai_call_logs(lead_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_sid ON ai_call_logs(call_sid);
      CREATE INDEX IF NOT EXISTS idx_call_logs_twilio_sid ON ai_call_logs(twilio_sid);
    `);
    console.log('[MIGRATION] ai_call_logs outcome constraint removed.');
  }

  // Migration: Ad campaign columns on leads
  try {
    db.exec(`ALTER TABLE leads ADD COLUMN ad_campaign_id INTEGER`);
    console.log('[MIGRATION] Added ad_campaign_id to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN ad_platform TEXT`);
    console.log('[MIGRATION] Added ad_platform to leads');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE leads ADD COLUMN ad_lead_form_data TEXT`);
    console.log('[MIGRATION] Added ad_lead_form_data to leads');
  } catch (e) { /* column exists */ }

  // =============================================
  // Migration: External ad campaign tracking
  // =============================================
  try {
    db.exec(`ALTER TABLE ad_campaigns ADD COLUMN is_external INTEGER DEFAULT 0`);
    console.log('[MIGRATION] Added is_external to ad_campaigns');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE ad_campaigns ADD COLUMN external_url TEXT`);
    console.log('[MIGRATION] Added external_url to ad_campaigns');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE ad_campaigns ADD COLUMN tracking_id TEXT`);
    console.log('[MIGRATION] Added tracking_id to ad_campaigns');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE ad_campaigns ADD COLUMN tracking_url TEXT`);
    console.log('[MIGRATION] Added tracking_url to ad_campaigns');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE ad_campaigns ADD COLUMN landing_page_url TEXT`);
    console.log('[MIGRATION] Added landing_page_url to ad_campaigns');
  } catch (e) { /* column exists */ }

  try {
    db.exec(`ALTER TABLE ad_campaigns ADD COLUMN manual_metrics INTEGER DEFAULT 0`);
    console.log('[MIGRATION] Added manual_metrics to ad_campaigns');
  } catch (e) { /* column exists */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_tracking_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_campaign_id INTEGER NOT NULL,
      tracking_id TEXT NOT NULL,
      visitor_ip TEXT,
      user_agent TEXT,
      referer TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      utm_content TEXT,
      utm_term TEXT,
      device_type TEXT,
      browser TEXT,
      os TEXT,
      lead_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (ad_campaign_id) REFERENCES ad_campaigns(id),
      FOREIGN KEY (lead_id) REFERENCES leads(id)
    );

    CREATE INDEX IF NOT EXISTS idx_tracking_visits_campaign ON ad_tracking_visits(ad_campaign_id);
    CREATE INDEX IF NOT EXISTS idx_tracking_visits_tracking_id ON ad_tracking_visits(tracking_id);
    CREATE INDEX IF NOT EXISTS idx_tracking_visits_created ON ad_tracking_visits(created_at);
    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_tracking_id ON ad_campaigns(tracking_id);
  `);

  // Migration: add visitor_id to tracking visits
  try { db.exec('ALTER TABLE ad_tracking_visits ADD COLUMN visitor_id TEXT'); } catch (e) {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_tracking_visits_visitor ON ad_tracking_visits(visitor_id)'); } catch (e) {}

  // Migration: expand source CHECK constraint to include 'ad_campaign'
  // SQLite doesn't support ALTER CHECK, so we recreate the column constraint isn't enforceable
  // Instead, we'll just drop the check by recreating
  try {
    const hasAdSource = db.prepare("SELECT COUNT(*) as c FROM pragma_table_info('leads') WHERE name = 'source'").get();
    if (hasAdSource) {
      // SQLite workaround: Create a new table without constraint, copy data, swap
      const tableExists = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='leads'").get();
      if (tableExists && tableExists.sql && !tableExists.sql.includes('ad_campaign')) {
        db.exec(`
          UPDATE leads SET source = 'manual' WHERE source NOT IN ('google_maps', 'search', 'agent_scrape', 'hubspot', 'manual');
        `);
        // We can't alter CHECK constraints in SQLite, so we'll handle it at the application level
        // For now, ad-captured leads use source='manual' with ad_campaign_id set to distinguish them
      }
    }
  } catch (e) {}
}

module.exports = { createTables };
