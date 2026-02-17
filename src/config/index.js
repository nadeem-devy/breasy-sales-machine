require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',

  telephonyProvider: process.env.TELEPHONY_PROVIDER || 'twilio',

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumbers: (process.env.TWILIO_PHONE_NUMBERS || '').split(',').filter(Boolean),
    webhookUrl: process.env.TWILIO_WEBHOOK_URL,
    twimlAppSid: process.env.TWILIO_TWIML_APP_SID,
    apiKey: process.env.TWILIO_API_KEY,
    apiSecret: process.env.TWILIO_API_SECRET,
  },

  dialpad: {
    apiKey: process.env.DIALPAD_API_KEY,
    apiSecret: process.env.DIALPAD_API_SECRET,
    phoneNumbers: (process.env.DIALPAD_PHONE_NUMBERS || '').split(',').filter(Boolean),
    webhookUrl: process.env.DIALPAD_WEBHOOK_URL,
    webhookSecret: process.env.DIALPAD_WEBHOOK_SECRET,
  },

  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'nadeem@breasy.com',
    fromName: process.env.SENDGRID_FROM_NAME || 'Nadeem from Breasy',
  },

  vapi: {
    apiKey: process.env.VAPI_API_KEY,
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    assistantId: process.env.VAPI_ASSISTANT_ID,
    inboundAssistantId: process.env.VAPI_INBOUND_ASSISTANT_ID || 'a691bebb-3ca2-44bb-ac3a-3161a7c877cf',
    webhookUrl: process.env.VAPI_WEBHOOK_URL,
    routing: {
      '+13104006987': { name: 'Market Manager', role: 'Existing jobs, job status, technician issues, appointment follow-ups' },
      '+16025620531': { name: 'Marie (Field Team)', role: 'Platform support, joining as provider, new customers, lead follow-ups' },
    },
  },

  hubspot: {
    apiKey: process.env.HUBSPOT_API_KEY,
    portalId: process.env.HUBSPOT_PORTAL_ID,
  },

  links: {
    meetingBaseUrl: process.env.MEETING_BASE_URL || 'https://calendly.com/breasy/demo',
    appDownloadBaseUrl: process.env.APP_DOWNLOAD_BASE_URL || 'https://breasy.app.link',
    videoBaseUrl: process.env.VIDEO_BASE_URL || 'https://breasy.com/demo',
  },

  limits: {
    smsDailyLimit: parseInt(process.env.SMS_DAILY_LIMIT) || 200,
    emailDailyLimit: parseInt(process.env.EMAIL_DAILY_LIMIT) || 500,
    callsDailyLimit: parseInt(process.env.CALLS_DAILY_LIMIT) || 75,
  },

  sendWindows: {
    sms: { start: parseInt(process.env.SMS_WINDOW_START) || 9, end: parseInt(process.env.SMS_WINDOW_END) || 20 },
    email: { start: parseInt(process.env.EMAIL_WINDOW_START) || 8, end: parseInt(process.env.EMAIL_WINDOW_END) || 21 },
    call: { start: parseInt(process.env.CALL_WINDOW_START) || 10, end: parseInt(process.env.CALL_WINDOW_END) || 17 },
  },

  timezone: process.env.DEFAULT_TIMEZONE || 'America/New_York',

  scheduler: {
    intervalMinutes: parseInt(process.env.SCHEDULER_INTERVAL_MINUTES) || 5,
    batchSize: parseInt(process.env.BATCH_SIZE) || 50,
  },

  admin: {
    phone: process.env.ADMIN_PHONE,
    email: process.env.ADMIN_EMAIL,
    operatorPhone: process.env.OPERATOR_PHONE || process.env.ADMIN_PHONE || '',
  },

  scoring: {
    sms_delivered: 1,
    email_delivered: 1,
    email_opened: 3,
    email_opened_again: 2,
    email_clicked: 5,
    video_clicked: 7,
    sms_replied: 10,
    email_replied: 10,
    call_answered: 10,
    call_long: 5,
    call_qualified: 20,
    wants_meeting: 15,
    wants_app: 10,
    meeting_booked: 30,
    app_downloaded: 25,
    negative_reply: -15,
    opt_out: -100,
    wrong_number: -50,
    no_answer_3x: -10,
  },

  tiers: {
    dead: { max: -1 },
    cold: { min: 0, max: 20 },
    warm: { min: 21, max: 40 },
    hot: { min: 41, max: 60 },
    qualified: { min: 61 },
  },

  optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'QUIT', 'CANCEL', 'OPT OUT', 'OPTOUT', 'REMOVE'],

  // Ad Platform integrations
  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'breasy_meta_verify',
    apiVersion: 'v21.0',
  },

  googleAds: {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    customerId: process.env.GOOGLE_ADS_CUSTOMER_ID || '',
  },

  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  },

  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
  },

  auth: {
    sessionSecret: process.env.SESSION_SECRET || 'breasy-dev-secret-change-me',
    username: process.env.ADMIN_USERNAME || 'admin',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
    totpSecret: process.env.TOTP_SECRET || '',
    totpEnabled: process.env.TOTP_ENABLED === 'true',
  },
};
