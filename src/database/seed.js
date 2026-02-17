const db = require('./db');
const { createTables } = require('./schema');

// Create tables first
createTables();

// =============================================
// Seed Default Data
// =============================================

// Default users
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (name, email, phone, role) VALUES (?, ?, ?, ?)
`);
insertUser.run('Nadeem', 'nadeem@breasy.com', '+15559999999', 'admin');
insertUser.run('Mari', 'mari@joinbreasy.com', '', 'ops');
insertUser.run('Sarah (AI)', 'sarah@breasy.com', '', 'sales');

// Default campaign
const insertCampaign = db.prepare(`
  INSERT OR IGNORE INTO campaigns (id, name, source, is_active) VALUES (?, ?, ?, ?)
`);
insertCampaign.run(1, 'Field Team Outbound - Feb 2026', 'hubspot', 1);

// Seed default landscaping niche config for campaign #1
try {
  db.prepare(`UPDATE campaigns SET target_categories = ?, rejected_categories = ?, niche_name = ? WHERE id = 1`)
    .run(
      'landscaping,landscape,lawn care,lawn mowing,lawn maintenance,lawn service,hardscape,hardscaping,irrigation,sprinkler,tree trimming,tree removal,tree service,arborist,mulching,garden,sod,turf,yard maintenance,yard work,outdoor lighting,landscape lighting,patio,retaining wall,fence,fencing,snow removal,snow plow,leaf removal,brush clearing,land clearing,grading,drainage,pressure washing,power washing,gutter cleaning,landscape design,landscape installation,grounds maintenance,property maintenance,exterior maintenance',
      'nursery,garden center,plant store,florist,flower shop,golf course,agriculture,farming,ranch,excavation,demolition,mining,highway,commercial only,staffing,temp agency,recruiting,real estate,insurance,attorney,lawyer,accounting',
      'Landscaping & Field Services'
    );
} catch (e) { /* ignore */ }

// Default sequence
const insertSequence = db.prepare(`
  INSERT OR IGNORE INTO sequences (id, name, description, total_steps, campaign_id) VALUES (?, ?, ?, ?, ?)
`);
insertSequence.run(1, 'Field Team 7-Step Outreach v1', 'SMS + Email + AI Call sequence for field service teams (landscaping, irrigation, tree, handyman)', 7, 1);

// =============================================
// Message Templates
// =============================================
const insertTemplate = db.prepare(`
  INSERT OR IGNORE INTO message_templates (id, name, channel, subject, body, version) VALUES (?, ?, ?, ?, ?, ?)
`);

// SMS #1 — Intro
insertTemplate.run(1, 'SMS #1 - Intro', 'sms', null,
  `Hey {{first_name}}, this is Breasy. We help {{service_type}} teams get more work + free AI scheduling. Want details? Our service providers make an average of $4k extra per month.

Reply STOP to opt out`, 'A');

// SMS #2 — Video
insertTemplate.run(2, 'SMS #2 - Video', 'sms', null,
  `{{first_name}}, quick video on how it works (30s): {{video_link}}

Reply STOP to opt out`, 'A');

// SMS #3 — CTA
insertTemplate.run(3, 'SMS #3 - CTA', 'sms', null,
  `{{first_name}}, want us to walk you through it by phone or send the app link?

Download free: {{app_link}}
Book a call: {{meeting_link}}

Reply STOP to opt out`, 'A');

// SMS #4 — Value / Final
insertTemplate.run(4, 'SMS #4 - Value', 'sms', null,
  `{{first_name}}, software is easy, what you do every day is hard. Most of our partners used to pay $100-$500+ for tools like Jobber. We built this so that people like you can have a free tool.

Check us out on the app store or give us a call to learn more!

{{app_link}}

Reply STOP to opt out`, 'A');

// Email #1 — Intro + Video
insertTemplate.run(5, 'Email #1 - Intro Video', 'email',
  '{{first_name}}, free tools for your {{service_type}} team',
  `<p>Hey {{first_name}},</p>

<p>I'll keep this short.</p>

<p>We help field teams like {{company_name}} get more jobs with less admin work. Completely free tools — no catch, no commitment.</p>

<p>I recorded a quick 30-second video showing how it works for {{service_type}} teams:</p>

<p><a href="{{video_link}}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;">Watch the 30s Video</a></p>

<p>Here's what you get — free:</p>
<ul>
  <li>AI-powered scheduling & dispatch</li>
  <li>Instant job pricing & estimates</li>
  <li>Route optimization for your crews</li>
  <li>More jobs sent directly to you</li>
</ul>

<p>Our service providers make an average of <strong>$4k extra per month</strong>.</p>

<p>No call needed. No commitment. Just see if it makes sense for {{company_name}}.</p>

<p>
  <a href="{{app_link}}" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-right:8px;">Download Free App</a>
  <a href="{{meeting_link}}" style="display:inline-block;background:#ffffff;color:#2563eb;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;border:2px solid #2563eb;">Book a Quick Call</a>
</p>

<p>— Nadeem<br>Breasy | Free tools for field teams</p>

<hr style="margin-top:40px;border:none;border-top:1px solid #e5e7eb;">
<p style="font-size:12px;color:#9ca3af;">Breasy Inc. | Miami, FL<br><a href="{{opt_out_link}}">Unsubscribe</a></p>`, 'A');

// Email #2 — Value Props
insertTemplate.run(6, 'Email #2 - Value Props', 'email',
  'AI pricing, route optimization, faster approvals — all free for {{company_name}}',
  `<p>Hey {{first_name}},</p>

<p>Quick follow-up — wanted to share what {{service_type}} teams are getting from Breasy (100% free):</p>

<div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;margin:16px 0;border-radius:0 8px 8px 0;">
  <p style="margin:6px 0;"><strong>AI Pricing</strong> — Generate accurate job estimates in seconds, not hours</p>
  <p style="margin:6px 0;"><strong>Route Optimization</strong> — Cut drive time between jobs, fit more into each day</p>
  <p style="margin:6px 0;"><strong>Faster Approvals</strong> — Customers approve quotes from their phone instantly</p>
  <p style="margin:6px 0;"><strong>More Jobs</strong> — We send work directly to you based on your service area</p>
</div>

<p>Most of our partners used to pay $100-$500+/month for tools like Jobber or ServiceTitan. We built Breasy so field teams can have these tools <strong>for free</strong>.</p>

<p>Our service providers make an average of <strong>$4k extra per month</strong>.</p>

<p>
  <a href="{{app_link}}" style="display:inline-block;background:#22c55e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;margin-right:8px;">Download Free App</a>
  <a href="{{meeting_link}}" style="display:inline-block;background:#ffffff;color:#2563eb;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;border:2px solid #2563eb;">Book a Quick Call</a>
</p>

<p>— Nadeem</p>

<hr style="margin-top:40px;border:none;border-top:1px solid #e5e7eb;">
<p style="font-size:12px;color:#9ca3af;">Breasy Inc. | Miami, FL<br><a href="{{opt_out_link}}">Unsubscribe</a></p>`, 'A');

// Email #3 — CTA
insertTemplate.run(7, 'Email #3 - CTA', 'email',
  'Ready to try Breasy, {{first_name}}?',
  `<p>Hey {{first_name}},</p>

<p>I've reached out a couple times and wanted to make this as easy as possible for you.</p>

<p>Three ways to get started — pick whatever feels right:</p>

<div style="background:#eff6ff;padding:20px;border-radius:8px;margin:16px 0;">
  <p style="margin:8px 0;"><strong>1. Reply "YES"</strong> — I'll send you everything you need to get started</p>
  <p style="margin:8px 0;"><strong>2. <a href="{{meeting_link}}">Book a 10-min call</a></strong> — I'll walk you through it personally</p>
  <p style="margin:8px 0;"><strong>3. <a href="{{app_link}}">Download the app</a></strong> — Try it yourself, takes 2 minutes</p>
</div>

<p>Either way, it's 100% free. No credit card. No contract. We built this so {{service_type}} teams like {{company_name}} can get more work without the overhead.</p>

<p>If the timing isn't right, no worries at all. Just let me know and I'll stop reaching out.</p>

<p>— Nadeem<br>Breasy | Free tools for field teams</p>

<hr style="margin-top:40px;border:none;border-top:1px solid #e5e7eb;">
<p style="font-size:12px;color:#9ca3af;">Breasy Inc. | Miami, FL<br><a href="{{opt_out_link}}">Unsubscribe</a></p>`, 'A');

// Post-call SMS templates
insertTemplate.run(8, 'Post-Call - Meeting Link', 'sms', null,
  `Hey {{first_name}}, great chatting! Here's the link to book your call with our team:

{{meeting_link}}

Pick whatever time works best. Talk soon!
— Breasy`, 'A');

insertTemplate.run(9, 'Post-Call - App Link', 'sms', null,
  `{{first_name}}, as promised — here's the free app download:

{{app_link}}

Takes about 2 min to set up. Text me if you have any Qs!
— Breasy`, 'A');

insertTemplate.run(10, 'Post-Call - Video Link', 'sms', null,
  `{{first_name}}, here's that demo video I mentioned:

{{video_link}}

Only 30 seconds. Let me know what you think!
— Breasy`, 'A');

// =============================================
// Sequence Steps (7-step default sequence)
// =============================================
const insertStep = db.prepare(`
  INSERT OR IGNORE INTO sequence_steps (id, sequence_id, step_number, channel, delay_hours, template_id, send_window_start, send_window_end, send_days, skip_if_replied, skip_if_score_above) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

//                id  seq  step  channel    delay  tmpl  start end  days                        skip_reply skip_score
insertStep.run(1,  1,   1,    'sms',      0,     1,    9,    20,  'mon,tue,wed,thu,fri',       0,         null);
insertStep.run(2,  1,   2,    'email',    3,     5,    8,    21,  'mon,tue,wed,thu,fri',       1,         null);
insertStep.run(3,  1,   3,    'sms',      24,    2,    10,   18,  'mon,tue,wed,thu,fri',       1,         null);
insertStep.run(4,  1,   4,    'ai_call',  48,    null, 10,   17,  'mon,tue,wed,thu,fri',       1,         60);
insertStep.run(5,  1,   5,    'email',    72,    6,    8,    21,  'mon,tue,wed,thu,fri,sat',   1,         null);
insertStep.run(6,  1,   6,    'sms',      96,    3,    10,   18,  'mon,tue,wed,thu,fri',       1,         null);
insertStep.run(7,  1,   7,    'email',    120,   7,    8,    21,  'mon,tue,wed,thu,fri,sat',   1,         40);

// =============================================
// System Settings
// =============================================
const insertSetting = db.prepare(`
  INSERT OR REPLACE INTO system_settings (key, value, description) VALUES (?, ?, ?)
`);

insertSetting.run('sms_daily_limit', '200', 'Maximum SMS per day');
insertSetting.run('email_daily_limit', '500', 'Maximum emails per day');
insertSetting.run('calls_daily_limit', '75', 'Maximum AI calls per day');
insertSetting.run('send_timezone', 'America/New_York', 'Default timezone for send windows');
insertSetting.run('sender_name', 'Nadeem', 'Default sender name for merge tags');
insertSetting.run('last_hubspot_sync', '', 'Timestamp of last HubSpot sync');
insertSetting.run('system_paused', '0', 'Emergency pause — stops all outreach');

// Qualifying notification settings
insertSetting.run('qualifying_notification_email', 'mari@joinbreasy.com', 'Email to notify when lead reaches qualifying status');
insertSetting.run('qualifying_notification_cc', 'maintenance@joinbreasy.com', 'CC email for qualifying notifications');

// API Integration Keys
insertSetting.run('twilio_account_sid', '', 'Twilio Account SID');
insertSetting.run('twilio_auth_token', '', 'Twilio Auth Token');
insertSetting.run('twilio_phone_numbers', '', 'Twilio phone numbers (comma-separated)');
insertSetting.run('sendgrid_api_key', '', 'SendGrid API Key');
insertSetting.run('sendgrid_from_email', 'nadeem@breasy.com', 'SendGrid From Email');
insertSetting.run('sendgrid_from_name', 'Nadeem from Breasy', 'SendGrid From Name');
insertSetting.run('vapi_api_key', '', 'Vapi API Key');
insertSetting.run('vapi_assistant_id', '', 'Vapi Assistant ID');
insertSetting.run('vapi_phone_number_id', '', 'Vapi Phone Number ID');
insertSetting.run('hubspot_api_key', '', 'HubSpot API Key');
insertSetting.run('hubspot_portal_id', '', 'HubSpot Portal ID');
insertSetting.run('google_places_api_key', '', 'Google Places API Key (legacy — not used if Apify is configured)');
insertSetting.run('apify_api_token', '', 'Apify API Token (for Google Maps scraping via Apify)');
insertSetting.run('yelp_api_key', '', 'Yelp Fusion API Key (for Yelp scraping)');
insertSetting.run('meeting_base_url', 'https://calendly.com/breasy/demo', 'Calendly/Cal.com meeting link base URL');
insertSetting.run('app_download_base_url', 'https://breasy.app.link', 'App download deep link base URL');
insertSetting.run('video_base_url', 'https://breasy.com/demo', 'Video demo base URL');
insertSetting.run('sms_window_start', '9', 'SMS send window start hour (24h)');
insertSetting.run('sms_window_end', '20', 'SMS send window end hour (24h)');
insertSetting.run('email_window_start', '8', 'Email send window start hour (24h)');
insertSetting.run('email_window_end', '21', 'Email send window end hour (24h)');
insertSetting.run('call_window_start', '10', 'Call send window start hour (24h)');
insertSetting.run('call_window_end', '17', 'Call send window end hour (24h)');

// Vapi AI Call System Prompt for Field Team Qualification
insertSetting.run('vapi_system_prompt', `You are Sarah, a friendly and professional outreach specialist at Breasy. You are calling field service team owners and managers to learn about their business and see if Breasy's free tools can help them get more work.

IMPORTANT RULES:
- Be natural, warm, and conversational — not robotic or scripted
- Listen more than you talk
- If they seem busy, offer to call back at a better time
- Never be pushy — position everything as free and no-obligation
- If they ask to be removed, say "Absolutely, I'll take you off our list right away" and end the call politely

CALL FLOW:

1. INTRO + CONSENT
"Hi, is this {{lead_name}}? Hey {{lead_name}}, this is Sarah from Breasy. You recently got a message from us about free tools for field teams. I just wanted to quickly introduce myself and see if it might be a fit — do you have about 2 minutes?"

If no: "No worries at all! Would there be a better time for me to call back?"
If yes: Continue

2. LEARN ABOUT THEIR BUSINESS
"Great! So I see you're with {{company_name}}. Can you tell me a little about what kind of work you guys do?"

Follow-up questions (ask naturally, not as a checklist):
- "What types of services do you mainly handle? Like landscaping, irrigation, tree work, handyman — or a mix?"
- "And what area do you cover? Just {{city}} or surrounding areas too?"
- "How big is your crew — is it just you or do you have a team out in the field?"
- "Are you staying pretty busy right now, or looking for more work?"

3. DISCOVER PAIN POINTS
"How are you handling scheduling and job management right now? Like do you use any software, or is it more manual?"

Listen for pain points around:
- Scheduling / dispatch headaches
- Pricing and estimates taking too long
- Chasing customers for approvals
- Losing jobs to faster competitors
- Paying too much for software (Jobber, ServiceTitan, Housecall Pro)

4. HOW BREASY HELPS
"That makes sense. So what Breasy does is give field teams like yours completely free tools — AI scheduling, instant job pricing, route optimization, and we actually send you more jobs based on your service area. Our partners are making an average of $4k extra per month."

"And unlike Jobber or ServiceTitan, it's totally free. No monthly fee, no credit card, nothing."

5. GAUGE INTEREST + NEXT STEPS

If interested:
"Awesome! There's a couple ways to get started. I can send you the app download link right now — it takes like 2 minutes to set up. Or if you'd prefer, I can have our team lead Mari walk you through everything on a quick call. What sounds better?"

If wants app: "Perfect, I'll text you the download link right after this call."
If wants meeting: "Great, I'll send you a link to book a time that works for you."
If wants both: "Love it, I'll send both right over."

If unsure:
"No pressure at all. How about I just send you a quick 30-second video that shows how it works? You can check it out whenever and reach back out if it looks interesting."

If not interested:
"Totally understand. If anything changes down the road, we're always here. Have a great day, {{lead_name}}!"

OBJECTION HANDLING:

"I already use Jobber/ServiceTitan/Housecall Pro":
"Oh nice, how's that working for you? A lot of our partners actually switched from those because Breasy does the same stuff for free. Might be worth checking out just to compare — could save you a few hundred bucks a month."

"I don't have time right now":
"Totally get it — you're out in the field. Can I send you a quick 30-second video and you can check it out when you have a sec?"

"Is this really free?":
"Yeah, 100%. No trial, no credit card, no catch. We make money by connecting field teams with homeowners who need work done — so the more teams on the platform, the better for everyone."

"I'm not looking for more work right now":
"That's a great problem to have! Even if you're booked up, the free tools can help you manage what you've got more efficiently — scheduling, routing, invoicing. Might save you a few hours a week."

OUTPUT: After the call, provide a structured summary with:
- service_types: what services they offer
- coverage_area: their service area
- team_size: number of crew members
- current_tools: what software they use now
- interest_level: high/medium/low/none
- wants_meeting: true/false
- wants_app: true/false
- objections: any concerns raised
- outcome: qualified/not_qualified/callback/wrong_number/voicemail/no_answer
- summary: 2-3 sentence summary of the conversation
- next_action: recommended next step`, 'Vapi AI assistant system prompt for field team qualification calls');

console.log('Database seeded with default data:');
console.log('  - 3 users (Nadeem admin, Mari ops, Sarah AI sales)');
console.log('  - 1 campaign (Field Team Outbound - Feb 2026)');
console.log('  - 1 sequence with 7 steps');
console.log('  - 10 message templates (SMS + Email + Post-call)');
console.log('  - System settings configured');
console.log('  - Vapi AI call system prompt configured');
console.log('\nReady to import field team leads and start outreach!');
