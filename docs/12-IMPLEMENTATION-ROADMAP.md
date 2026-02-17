# 12. IMPLEMENTATION ORDER — MVP → Full System

## Phase 0: Foundation (Day 1-2)

**Goal:** Set up accounts, configure integrations, build database.

```
DAY 1 — Accounts & Config
─────────────────────────
□ Create Bubble app (or use existing)
□ Set up all Data Types (tables) in Bubble editor
  - Lead, Sequence, SequenceStep, MessageTemplate,
    Activity, AICallLog, Campaign, DailyMetric,
    SystemSetting, User extensions
□ Create all Option Sets
□ Set up Twilio account
  - Buy phone number
  - Get Account SID + Auth Token
  - Configure SMS webhook URL
  - Start 10DLC registration (takes days to approve)
□ Set up SendGrid account
  - Create API key
  - Verify sending domain (SPF/DKIM/DMARC)
  - Configure event webhook URL
  - Set up domain authentication
□ Set up Vapi account
  - Create API key
  - Buy phone number through Vapi
  - Note: Don't build assistant yet (Phase 2)

DAY 2 — Store Config & Test Connections
───────────────────────────────────────
□ Create SystemSetting records for all config values
□ Install Bubble API Connector plugin
□ Configure Twilio API calls:
  - POST /Messages (send SMS)
  - GET /Messages/{sid} (check status)
□ Configure SendGrid API call:
  - POST /v3/mail/send (send email)
□ Test each API: send test SMS, test email
□ Set up webhook backend workflows (empty for now):
  - /api/1.1/wf/twilio-webhook
  - /api/1.1/wf/sendgrid-webhook
  - /api/1.1/wf/vapi-webhook
□ Build Settings page (admin only)
```

## Phase 1: MVP — Manual + SMS Only (Day 3-5)

**Goal:** Import leads, send SMS sequences, capture replies. Prove the engine works.

```
DAY 3 — Lead Import + Basic UI
───────────────────────────────
□ Build CSV Upload page:
  - File uploader
  - Parse CSV (use Bubble CSV plugin)
  - Create Lead records with validation
  - Display success/error summary
□ Build basic Lead List page:
  - Repeating group showing all leads
  - Sort by created_date
  - Click to view lead detail
□ Build basic Lead Detail page:
  - Show all lead fields
  - Activity timeline (empty for now)
□ Create default Sequence: "Breasy SMS Only v1"
  - Step 1: SMS #1 (T+0, immediate)
  - Step 2: SMS #2 (T+24hrs)
  - Step 3: SMS #3 (T+96hrs)
□ Create MessageTemplates for all 3 SMS messages
□ Write W3: Lead Intake workflow (dedup, normalize, assign sequence)

DAY 4 — Sequence Engine + SMS Sending
──────────────────────────────────────
□ Build W4: Sequence Scheduler (recurring every 5 min)
  - Search leads with next_action_date ≤ now
  - Get next step
  - Check send window
  - Check daily limits
□ Build W5: Send SMS workflow
  - Merge tags
  - Twilio API call
  - Create Activity
  - Update Lead counters
□ Build W8: Twilio Webhook (delivery + inbound)
  - Parse delivery status → create Activity
  - Parse inbound SMS → check opt-out → create Activity
□ Build W13: Opt-Out Handler
  - Flag lead as opted out
  - Stop sequence
  - Send confirmation
□ Test end-to-end: Import 5 test leads → SMS sends → replies captured

DAY 5 — Scoring + Notifications
────────────────────────────────
□ Build W11: Score Calculator
  - Accept event type, calculate points
  - Update lead score + tier
□ Build W12: Routing Engine (basic version)
  - Just notifications for now:
  - Score > 40 → Bubble notification
  - Reply received → Bubble notification
□ Update Lead List page:
  - Color-coded score badges
  - Filter by status/tier
  - Sort by score
□ Update Lead Detail page:
  - Activity timeline populated
  - Score history visible
□ Import 50 REAL leads and start SMS-only sequence
□ Monitor for 24 hours
```

**MVP Milestone:** At this point you have a working SMS outreach machine with scoring and reply capture.

## Phase 2: Add Email + AI Calls (Day 6-10)

```
DAY 6-7 — Email Integration
────────────────────────────
□ Build W6: Send Email workflow
  - Merge tags in subject + body
  - SendGrid API call
  - Create Activity
□ Build W9: SendGrid Webhook
  - Handle: delivered, open, click, bounce, unsubscribe
  - Update Activities + Lead + Scoring
□ Create Email templates (3 emails)
□ Update default Sequence to 7 steps (SMS + Email mixed)
□ Create SequenceStep records for full 7-step sequence
□ Test email flow end-to-end
□ Start email warm-up (low volume, increase over days)

DAY 8-9 — AI Voice Calls
─────────────────────────
□ Build Vapi AI Assistant:
  - Upload system prompt (from Section 5)
  - Configure function calls (log_call_outcome)
  - Set voice (natural, warm female voice)
  - Test with your own phone number
  - Refine script based on test calls
□ Build W7: Initiate AI Call workflow
  - Check prerequisites (valid phone, within window, not called 3x)
  - Vapi API call to start call
  - Create AICallLog + Activity
□ Build W10: Vapi Webhook
  - Parse call outcome, transcript, structured data
  - Update AICallLog
  - Create Activities
  - Trigger Score Calculator
  - If wants_meeting → auto-send meeting link SMS
  - If wants_app → auto-send app link SMS
□ Test 10 AI calls (use your team's numbers first)
□ Refine AI script based on real conversations

DAY 10 — Full Sequence Live
────────────────────────────
□ Update sequence to include AI call at Step 4
□ Verify all 7 steps fire correctly in sequence
□ Test all interrupt conditions:
  - Reply pauses sequence ✓
  - Opt-out stops everything ✓
  - Call qualified routes to sales ✓
□ Import 100 new leads on full 7-step sequence
□ Monitor closely for 48 hours
```

## Phase 3: Dashboard + Routing (Day 11-14)

```
DAY 11-12 — Dashboard
─────────────────────
□ Build Overview Dashboard page:
  - KPI cards (leads, messages, calls, qualified)
  - Funnel visualization
  - Today's activity summary
□ Build Analytics page:
  - Channel performance tables
  - A/B test results display
  - Daily trend chart (using Bubble chart plugin)
□ Build W14: Daily Metrics Rollup workflow
□ Add "Hot Leads" and "Qualified" quick-filter tabs

DAY 13-14 — Advanced Routing
─────────────────────────────
□ Full Routing Engine:
  - Round-robin sales rep assignment
  - SMS + email alerts to reps
  - Escalation timers (30 min, 2 hours)
□ Meeting booking integration:
  - Generate Calendly/Cal.com links with prefilled data
  - Send meeting link SMS after qualification
  - Track meeting bookings (webhook or manual update)
□ HubSpot sync back (W15):
  - Push qualified leads to HubSpot
  - Create deals in pipeline
□ App download tracking:
  - UTM-tagged deep links
  - Track app installs via link click tracking
  - Manual "mark as downloaded" button as backup
```

## Phase 4: Optimization + Scale (Day 15-21)

```
DAY 15-17 — A/B Testing + Optimization
───────────────────────────────────────
□ Implement A/B testing framework:
  - Template versioning (A/B)
  - Auto-assign variant based on lead ID
  - Track sends + replies per variant
  - Dashboard shows winner
□ Create Version B copies for all messages
□ Set up pre-call SMS ("heads up, calling you in 10 min")
□ Optimize AI call script based on transcript review
□ Adjust scoring weights based on real data

DAY 18-21 — Scale Prep
───────────────────────
□ Buy additional Twilio numbers (3 total)
□ Implement number rotation logic
□ Increase daily caps based on 10DLC approval
□ Create industry-specific sequence variants
□ Build campaign management UI:
  - Create new campaigns
  - Assign sequences to campaigns
  - Campaign-level reporting
□ Load test: process 500 leads in a day
□ Document operational runbook
```

## Phase 5: Mature Operations (Week 4+)

```
□ Weekly optimization cadence established
□ A/B tests running continuously
□ Multiple campaigns active simultaneously
□ Team members onboarded (if applicable)
□ HubSpot integration fully bidirectional
□ Monthly business reviews using dashboard data
□ Cost-per-acquisition tracking in dashboard
□ Consider adding: WhatsApp, LinkedIn outreach, retargeting
```

---

## Implementation Priority Matrix

| Feature | Business Impact | Build Effort | Priority |
|---------|----------------|-------------|----------|
| SMS sending + replies | Critical | 1 day | P0 — Day 3-4 |
| Lead import (CSV) | Critical | 0.5 day | P0 — Day 3 |
| Sequence scheduler | Critical | 1 day | P0 — Day 4 |
| Opt-out handling | Critical (compliance) | 0.5 day | P0 — Day 4 |
| Lead scoring | High | 0.5 day | P0 — Day 5 |
| Email integration | High | 1 day | P1 — Day 6-7 |
| AI voice calls | High | 2 days | P1 — Day 8-9 |
| Dashboard overview | Medium | 1 day | P2 — Day 11 |
| Analytics | Medium | 1 day | P2 — Day 12 |
| Sales routing | Medium | 1 day | P2 — Day 13 |
| HubSpot import | Medium | 0.5 day | P2 — Day 14 |
| HubSpot sync back | Low | 0.5 day | P3 — Day 14 |
| A/B testing | Medium | 1 day | P3 — Day 15 |
| Number rotation | Medium | 0.5 day | P3 — Day 18 |
| Multi-campaign | Low | 1 day | P3 — Day 19 |
| Meeting reminders | Low | 0.5 day | P3 — Day 20 |

---

## Go-Live Checklist

```
BEFORE sending to real leads:

□ All API connections tested and working
□ SMS sends + delivers correctly
□ Email sends + opens tracked correctly
□ Opt-out flow tested (SMS STOP → confirmed unsubscribed)
□ Email unsubscribe flow tested
□ Send windows verified (no messages outside hours)
□ Daily limits verified (stops at cap)
□ Score calculator tested (correct points awarded)
□ Lead detail page shows correct timeline
□ Webhook URLs are publicly accessible
□ Error handling works (API failure doesn't crash sequence)
□ Test with 10 real phone numbers (team + friends)
□ Review all message copy one final time
□ Twilio number not flagged or rate-limited
□ SendGrid domain authenticated and not blacklisted
□ Admin monitoring set up (daily check-in plan)
□ Backup plan if system fails (manual follow-up list)
```
