# 3. WORKFLOWS — Step-by-Step

## Overview of All Workflows

| # | Workflow | Type | Trigger |
|---|---------|------|---------|
| W1 | Lead Import (HubSpot) | Backend | Scheduled (every 30 min) or Manual |
| W2 | Lead Import (CSV) | Page | Button click on Upload page |
| W3 | Lead Intake & Dedup | Backend | When Lead is created |
| W4 | Sequence Scheduler | Backend | Recurring (every 5 min) |
| W5 | Send SMS | Backend API | Called by Sequence Scheduler |
| W6 | Send Email | Backend API | Called by Sequence Scheduler |
| W7 | Initiate AI Call | Backend API | Called by Sequence Scheduler |
| W8 | Twilio SMS Webhook | Backend API | Twilio POST (delivery + inbound) |
| W9 | SendGrid Webhook | Backend API | SendGrid POST (events) |
| W10 | Vapi/Retell Webhook | Backend API | Vapi POST (call ended) |
| W11 | Score Calculator | Backend | Called after any Activity created |
| W12 | Routing Engine | Backend | Called when score changes |
| W13 | Opt-Out Handler | Backend | Called by SMS/Email webhooks |
| W14 | Daily Metrics Rollup | Backend | Scheduled (midnight) |
| W15 | HubSpot Sync Back | Backend | When lead reaches "qualified" |

---

## W1: Lead Import (HubSpot)

**Trigger:** Scheduled every 30 minutes OR manual button press

```
Step 1: GET HubSpot contacts API
        Endpoint: /crm/v3/objects/contacts/search
        Filter: last_modified > last_sync_timestamp
        Limit: 100 per batch

Step 2: FOR EACH contact in response:

  Step 2a: Search Leads where phone = contact.phone
           OR email = contact.email

  Step 2b: IF match found → Skip (already imported)

  Step 2c: IF no match → Create new Lead:
           - first_name = contact.firstname
           - last_name = contact.lastname
           - email = contact.email
           - phone = format_e164(contact.phone)
           - company_name = contact.company
           - job_title = contact.jobtitle
           - source = "hubspot"
           - hubspot_id = contact.id
           - status = "new"
           - pipeline_stage = "imported"
           - score = 0
           - score_tier = "cold"
           - campaign = current active campaign

Step 3: Update SystemSetting "last_hubspot_sync" = current date/time

Step 4: Create Activity:
        - type = "note_added"
        - content = "Imported X leads from HubSpot"
```

---

## W2: Lead Import (CSV Upload)

**Trigger:** Admin clicks "Upload Leads" button, selects CSV

```
Step 1: User uploads CSV file via Bubble file uploader

Step 2: Parse CSV using Bubble CSV plugin or backend workflow
        Required columns: first_name, last_name, email, phone, company_name
        Optional: job_title, industry, city, state

Step 3: FOR EACH row in CSV:

  Step 3a: Validate phone (must be 10+ digits)
           Validate email (must contain @)
           → Skip invalid rows, log to error list

  Step 3b: Search Leads where phone = row.phone OR email = row.email
           → Skip duplicates

  Step 3c: Create Lead with fields from CSV
           - source = "scraped"
           - status = "new"
           - pipeline_stage = "imported"
           - score = 0
           - campaign = selected campaign

Step 4: Display summary: "Imported X leads, Y duplicates skipped, Z errors"

Step 5: Auto-assign imported leads to selected sequence
```

---

## W3: Lead Intake & Dedup (runs on every new Lead)

**Trigger:** When a Lead is created

```
Step 1: Normalize phone number to E.164 format
        Remove spaces, dashes, parentheses
        Add +1 if missing (US)

Step 2: Check for duplicates (backup dedup):
        Search Leads where phone = this Lead's phone
        AND unique_id ≠ this Lead's unique_id
        → If found: mark this lead as "dead", add note "Duplicate of [original]"

Step 3: Generate personalized links:
        - video_link = "https://breasy.com/demo?lead={{unique_id}}"
        - app_download_link = "https://breasy.app.link?utm_source=outreach&utm_campaign={{campaign}}&utm_content={{unique_id}}"
        - meeting_link = "https://calendly.com/breasy/demo?name={{first_name}}&email={{email}}"

Step 4: Assign to sequence (if not already assigned):
        - Set sequence = Campaign's default sequence
        - Set current_step = 0
        - Set sequence_status = "active"
        - Set next_action_date = Current date/time (immediate start)

Step 5: Create Activity:
        - type = "note_added"
        - content = "Lead imported and assigned to sequence: [sequence name]"
```

---

## W4: Sequence Scheduler (THE CORE ENGINE)

**Trigger:** Recurring every 5 minutes

```
Step 1: Get current time and day-of-week

Step 2: Search Leads WHERE:
        - sequence_status = "active"
        - next_action_date ≤ Current date/time
        - status ≠ "dead" AND status ≠ "dnc"
        - sms_opt_out = no (if next step is SMS)
        - email_opt_out = no (if next step is Email)
        - call_opt_out = no (if next step is Call)
        LIMIT: 50 per batch (throttling)

Step 3: FOR EACH Lead in results:

  Step 3a: Get next SequenceStep:
           Search SequenceStep where:
           - sequence = Lead's sequence
           - step_number = Lead's current_step + 1

  Step 3b: IF no next step exists →
           Set Lead's sequence_status = "completed"
           Set Lead's pipeline_stage = "lost" (if not already engaged)
           CONTINUE to next lead

  Step 3c: Check send window:
           Current hour (in lead's timezone or default timezone)
           must be between step's send_window_start and send_window_end
           Current day must be in step's send_days
           → IF outside window: Set next_action_date to next valid window
           → CONTINUE to next lead

  Step 3d: Check skip conditions:
           IF step.skip_if_replied = yes AND Lead.replied = yes → Skip step
           IF step.skip_if_score_above exists AND Lead.score > threshold → Skip step
           → If skipping: increment current_step, recalculate next_action_date

  Step 3e: Check daily limits:
           Count today's Activities of this channel type
           IF count >= SystemSetting daily limit → STOP processing this channel

  Step 3f: EXECUTE based on channel:
           IF channel = "sms" → Schedule "Send SMS" backend workflow
           IF channel = "email" → Schedule "Send Email" backend workflow
           IF channel = "ai_call" → Schedule "Initiate AI Call" backend workflow

  Step 3g: Update Lead:
           - current_step = current_step + 1
           - next_action_date = Current date/time + next step's delay_hours
           - last_contacted = Current date/time
           - pipeline_stage = "sequence_active" (if still "imported")
```

---

## W5: Send SMS

**Trigger:** Called by Sequence Scheduler

**Input:** Lead, MessageTemplate

```
Step 1: Build message body:
        Replace {{first_name}} with Lead's first_name
        Replace {{company_name}} with Lead's company_name
        Replace {{video_link}} with Lead's video_link
        Replace {{app_link}} with Lead's app_download_link
        Replace {{meeting_link}} with Lead's meeting_link
        Replace {{sender_name}} with "Nadeem"
        Append "\nReply STOP to opt out" (compliance)

Step 2: Call Twilio API:
        POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
        Body:
        - From: SystemSetting "twilio_from_number"
        - To: Lead's phone
        - Body: built message
        - StatusCallback: https://yourapp.bubbleapps.io/api/1.1/wf/twilio-webhook

Step 3: IF API success:
        Create Activity:
        - lead = this Lead
        - type = "sms_sent"
        - channel = "sms"
        - direction = "outbound"
        - content = message body
        - twilio_sid = API response SID

        Update Lead:
        - total_sms_sent + 1
        - status = "contacted" (if was "new")

        Update MessageTemplate:
        - send_count + 1

Step 4: IF API fails:
        Create Activity:
        - type = "sms_failed"
        - content = error message
        Log error for review
```

---

## W6: Send Email

**Trigger:** Called by Sequence Scheduler

**Input:** Lead, MessageTemplate

```
Step 1: Build email:
        Replace all merge tags in subject and body
        Add tracking pixel (SendGrid handles this)
        Add unsubscribe link in footer

Step 2: Call SendGrid API:
        POST https://api.sendgrid.com/v3/mail/send
        Body:
        - from: {email: setting, name: setting}
        - to: [{email: Lead's email, name: Lead's first_name}]
        - subject: built subject
        - content: [{type: "text/html", value: built body}]
        - tracking_settings: {click_tracking: {enable: true}, open_tracking: {enable: true}}
        - custom_args: {lead_id: Lead's unique_id}

Step 3: IF success:
        Create Activity:
        - type = "email_sent"
        - channel = "email"
        - direction = "outbound"
        - content = subject line
        - sendgrid_id = response message_id

        Update Lead:
        - total_emails_sent + 1
        - status = "contacted" (if was "new")

Step 4: IF fail → Log error, create failed Activity
```

---

## W7: Initiate AI Call

**Trigger:** Called by Sequence Scheduler

**Input:** Lead

```
Step 1: Check call prerequisites:
        - Lead has valid phone number
        - Lead has not opted out of calls
        - Current time is within call window (9am-7pm local)
        - Lead has not been called 3+ times already with no answer

Step 2: Call Vapi API:
        POST https://api.vapi.ai/call/phone
        Body:
        {
          "assistantId": SystemSetting "vapi_assistant_id",
          "phoneNumberId": "your_vapi_phone_id",
          "customer": {
            "number": Lead's phone,
            "name": Lead's first_name
          },
          "assistantOverrides": {
            "variableValues": {
              "lead_name": Lead's first_name,
              "company_name": Lead's company_name,
              "industry": Lead's industry
            }
          },
          "serverUrl": "https://yourapp.bubbleapps.io/api/1.1/wf/vapi-webhook"
        }

Step 3: Create AICallLog:
        - lead = this Lead
        - call_sid = response.id
        - status = "initiated"

Step 4: Create Activity:
        - type = "call_initiated"
        - channel = "call"
        - direction = "outbound"

Step 5: Update Lead:
        - total_calls_made + 1
```

---

## W8: Twilio SMS Webhook

**Trigger:** POST from Twilio (delivery receipts + inbound SMS)

**Endpoint:** `/api/1.1/wf/twilio-webhook`

```
CASE 1: Delivery Status Update (has MessageSid + MessageStatus)

  Step 1: Find Activity where twilio_sid = MessageSid

  Step 2: IF MessageStatus = "delivered":
          Create new Activity: type = "sms_delivered"

  Step 3: IF MessageStatus = "failed" or "undelivered":
          Create Activity: type = "sms_failed"
          Add note with error code

CASE 2: Inbound SMS Reply (has From + Body)

  Step 1: Normalize incoming "From" number to E.164

  Step 2: Find Lead where phone = From number
          → IF not found: log unknown inbound, STOP

  Step 3: Check for opt-out keywords:
          IF Body contains "STOP" or "UNSUBSCRIBE" or "QUIT" or "CANCEL":
          → Run Opt-Out Handler (W13)
          → Reply "You've been unsubscribed. Reply START to re-subscribe."
          → STOP

  Step 4: This is a genuine reply:
          Create Activity:
          - type = "sms_replied"
          - channel = "sms"
          - direction = "inbound"
          - content = Body text

  Step 5: Update Lead:
          - replied = yes
          - last_reply_date = now
          - status = "engaged"
          - sequence_status = "paused"  ← PAUSE the sequence

  Step 6: Run Score Calculator (add +10)

  Step 7: Notify assigned sales rep:
          - Bubble notification
          - SMS to rep: "[Lead name] just replied to SMS: [first 100 chars]"
```

---

## W9: SendGrid Webhook

**Trigger:** POST from SendGrid (event webhooks)

**Endpoint:** `/api/1.1/wf/sendgrid-webhook`

```
Step 1: Parse event array from SendGrid POST body

Step 2: FOR EACH event:

  Find Lead by custom_args.lead_id

  SWITCH event.event:

    CASE "delivered":
      Create Activity: type = "email_delivered"

    CASE "open":
      Create Activity: type = "email_opened"
      Update MessageTemplate: open_count + 1
      Run Score Calculator (+3)

    CASE "click":
      Create Activity: type = "email_clicked"
      Activity content = event.url (which link was clicked)
      Update MessageTemplate: click_count + 1
      Run Score Calculator (+5)

    CASE "bounce":
      Create Activity: type = "email_bounced"
      IF hard bounce: mark Lead email as invalid, pause email steps

    CASE "unsubscribe" or "spamreport":
      Run Opt-Out Handler for email

    CASE "reply" (if using SendGrid Inbound Parse):
      Similar to SMS reply flow — pause sequence, notify rep
```

---

## W10: Vapi/Retell Call Webhook

**Trigger:** POST from Vapi when call ends

**Endpoint:** `/api/1.1/wf/vapi-webhook`

```
Step 1: Find AICallLog where call_sid = request.call.id

Step 2: Update AICallLog:
        - status = map Vapi status (answered/no-answer/etc.)
        - duration_seconds = request.call.duration
        - transcript = request.artifact.transcript
        - recording_url = request.artifact.recordingUrl

Step 3: Parse AI analysis from Vapi response:
        (Vapi can return structured data via function calls)
        - outcome = qualified / not_qualified / callback / wrong_number
        - interest_level = high / medium / low
        - wants_meeting = true/false
        - wants_app = true/false
        - objections = extracted text
        - summary = AI summary

Step 4: Update AICallLog with parsed data

Step 5: Create Activity based on outcome:

  IF call answered:
    Activity type = "call_answered"
    Run Score Calculator (+10)

    IF outcome = "qualified":
      Activity type = "call_qualified"
      Run Score Calculator (+20)
      Update Lead: call_qualified = yes

    IF outcome = "not_qualified":
      Activity type = "call_not_qualified"

    IF outcome = "wrong_number":
      Update Lead: status = "dead", score = -50
      Stop sequence

    IF outcome = "callback":
      Schedule follow-up call in 24 hours

  IF call NOT answered:
    Activity type = "call_no_answer"
    IF Lead has 3+ no-answers → reduce score, consider removing from call sequence

Step 6: IF wants_meeting = true:
        Send SMS with meeting link immediately
        Create Activity: "Sent meeting booking link"

Step 7: IF wants_app = true:
        Send SMS with app download link immediately
        Create Activity: "Sent app download link"

Step 8: Run Routing Engine
```

---

## W11: Score Calculator

**Trigger:** Called after any scoring event

**Input:** Lead, event_type, points

```
Score Table:
  sms_delivered    → +1
  email_opened     → +3
  email_clicked    → +5
  sms_replied      → +10
  call_answered    → +10
  call_qualified   → +20
  app_downloaded   → +25
  meeting_booked   → +30
  negative_reply   → -15
  opt_out          → -100
  wrong_number     → -50
  no_answer (3x)   → -10

Step 1: Record score_before = Lead's current score

Step 2: Calculate new score = score + points

Step 3: Determine new tier:
        IF score < 0    → "dead"
        IF score 0-20   → "cold"
        IF score 21-40  → "warm"
        IF score 41-60  → "hot"
        IF score 61+    → "qualified"

Step 4: Update Lead:
        - score = new score
        - score_tier = new tier

Step 5: Create Activity:
        - type = "score_change"
        - score_before = old score
        - score_after = new score
        - content = "Score changed from X to Y (reason: event_type)"

Step 6: IF tier changed → Run Routing Engine
```

---

## W12: Routing Engine

**Trigger:** Called when lead score tier changes

```
CASE: Lead becomes "qualified" (score 61+)

  Step 1: Update Lead pipeline_stage = "qualified"

  Step 2: Assign to sales rep:
          - Round-robin among Users with role = "sales"
          - OR assign to rep with fewest active qualified leads

  Step 3: Notify sales rep immediately:
          - Bubble in-app notification
          - SMS: "🔥 New qualified lead: [Name] from [Company]. Score: [X]. Call them NOW."
          - Email with full lead details + transcript

  Step 4: Auto-send meeting booking link to lead:
          SMS: "Hey {{first_name}}, great chatting! Book a quick call with our team: {{meeting_link}}"

  Step 5: Push to HubSpot:
          Create/Update contact + Create Deal in pipeline

CASE: Lead becomes "hot" (score 41-60)

  Step 1: Update pipeline_stage = "call_scheduled"
  Step 2: Move to front of AI call queue (set next_action_date = now)
  Step 3: Notify ops team: "Hot lead alert: [Name] — prioritize for call"

CASE: Lead becomes "warm" (score 21-40)

  Step 1: Continue sequence as normal
  Step 2: Ensure AI call step hasn't been skipped

CASE: Lead becomes "dead" (score < 0)

  Step 1: Set sequence_status = "stopped"
  Step 2: Set status = "dead" or "dnc"
  Step 3: Remove from all active queues
  Step 4: IF opt-out: Add to suppression list
```

---

## W13: Opt-Out Handler

**Trigger:** Called when opt-out detected

```
Step 1: Determine channel:
        IF SMS opt-out:
          Set Lead sms_opt_out = yes
          Set Lead call_opt_out = yes (calls go to same number)
        IF Email opt-out:
          Set Lead email_opt_out = yes

Step 2: Check if ALL channels opted out:
        IF sms_opt_out AND email_opt_out:
          Set sequence_status = "stopped"
          Set status = "dnc"
          Set score = -100

Step 3: IF only one channel:
        Remove that channel's remaining steps from sequence
        Continue with other channels if applicable

Step 4: Create Activity:
        - type = "opt_out"
        - content = "Opted out of [channel]"

Step 5: Log for compliance records

Step 6: Send confirmation reply (SMS only):
        "You've been unsubscribed and won't receive further messages from this number."
```

---

## W14: Daily Metrics Rollup

**Trigger:** Scheduled at 11:59 PM daily

```
Step 1: Count today's Activities by type
Step 2: Create DailyMetric record with all counts
Step 3: Calculate conversion rates
Step 4: IF any metric is significantly below baseline → alert admin
```

---

## W15: HubSpot Sync Back

**Trigger:** When Lead reaches "qualified" status

```
Step 1: Check if Lead has hubspot_id
Step 2: IF yes: Update HubSpot contact via API
        - Update lifecycle_stage, lead_status
        - Add note with call transcript
        - Create deal in pipeline
Step 3: IF no hubspot_id: Create new HubSpot contact
        - Store returned ID as hubspot_id
```
