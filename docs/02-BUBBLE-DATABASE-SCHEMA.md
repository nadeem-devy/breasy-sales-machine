# 2. BUBBLE DATABASE SCHEMA

## Data Types (Tables)

---

### TABLE: Lead

| Field | Type | Description |
|-------|------|-------------|
| unique_id | text | Auto-generated unique ID |
| first_name | text | Lead first name |
| last_name | text | Lead last name |
| email | email | Primary email |
| phone | text | E.164 format (+1XXXXXXXXXX) |
| company_name | text | Business name |
| job_title | text | Role/title |
| industry | text | Industry vertical |
| city | text | City |
| state | text | State/Province |
| source | option set | hubspot / scraped / manual / referral |
| campaign | text | Campaign tag (e.g., "jan-2026-restaurants") |
| status | option set | new / contacted / engaged / qualified / converted / dead / dnc |
| pipeline_stage | option set | imported / sequence_active / replied / call_scheduled / call_completed / qualified / meeting_booked / app_downloaded / customer / lost |
| score | number | Current lead score (integer) |
| score_tier | option set | cold / warm / hot / qualified / dead |
| assigned_to | User | Sales rep assigned |
| sequence | Sequence | Current active sequence |
| current_step | number | Which step in the sequence (1-7) |
| sequence_status | option set | active / paused / completed / stopped |
| next_action_date | date | When next sequence step fires |
| sms_opt_out | yes/no | Has opted out of SMS |
| email_opt_out | yes/no | Has opted out of email |
| call_opt_out | yes/no | Has opted out of calls |
| last_contacted | date | Last outreach timestamp |
| last_reply_date | date | Last time lead replied |
| total_sms_sent | number | Count of SMS sent |
| total_emails_sent | number | Count of emails sent |
| total_calls_made | number | Count of AI calls made |
| replied | yes/no | Has ever replied |
| call_answered | yes/no | Has answered a call |
| call_qualified | yes/no | Qualified on AI call |
| app_downloaded | yes/no | Downloaded the app |
| meeting_booked | yes/no | Booked a meeting |
| video_link | text | Personalized video URL |
| app_download_link | text | UTM-tagged app store link |
| meeting_link | text | Calendly/Cal booking link |
| hubspot_id | text | HubSpot contact ID (for sync) |
| notes | text | Free-form notes |
| created_date | date | Import timestamp |
| modified_date | date | Last update timestamp |
| tags | list of texts | Flexible tagging |

---

### TABLE: Sequence

| Field | Type | Description |
|-------|------|-------------|
| name | text | Sequence name (e.g., "Restaurant Outreach v2") |
| description | text | What this sequence does |
| is_active | yes/no | Can be assigned to new leads |
| total_steps | number | Number of steps (default 7) |
| steps | list of SequenceStep | Ordered list of steps |
| target_industry | text | Which industry this targets |
| created_date | date | When created |

---

### TABLE: SequenceStep

| Field | Type | Description |
|-------|------|-------------|
| sequence | Sequence | Parent sequence |
| step_number | number | Order (1, 2, 3...) |
| channel | option set | sms / email / ai_call |
| delay_hours | number | Hours to wait after previous step |
| template | MessageTemplate | Which template to use |
| send_window_start | number | Earliest hour to send (e.g., 9) |
| send_window_end | number | Latest hour to send (e.g., 20) |
| send_days | list of texts | ["mon","tue","wed","thu","fri"] |
| skip_if_replied | yes/no | Skip this step if lead already replied |
| skip_if_score_above | number | Skip if score exceeds threshold |

---

### TABLE: MessageTemplate

| Field | Type | Description |
|-------|------|-------------|
| name | text | Template name |
| channel | option set | sms / email |
| subject | text | Email subject line (null for SMS) |
| body | text | Message body with merge tags |
| version | text | A/B test variant (A, B, C) |
| is_active | yes/no | Currently in use |
| send_count | number | Times sent |
| reply_count | number | Replies received |
| reply_rate | number | Calculated reply rate % |
| open_count | number | Email opens (email only) |
| click_count | number | Link clicks |

Merge tags supported:
- `{{first_name}}`
- `{{company_name}}`
- `{{video_link}}`
- `{{app_link}}`
- `{{meeting_link}}`
- `{{sender_name}}`
- `{{opt_out_link}}`

---

### TABLE: Activity

| Field | Type | Description |
|-------|------|-------------|
| lead | Lead | Which lead |
| type | option set | sms_sent / sms_delivered / sms_failed / sms_replied / email_sent / email_delivered / email_opened / email_clicked / email_replied / email_bounced / call_initiated / call_answered / call_no_answer / call_voicemail / call_qualified / call_not_qualified / opt_out / app_download / meeting_booked / score_change / stage_change / note_added |
| channel | option set | sms / email / call / system |
| direction | option set | outbound / inbound |
| content | text | Message content or call summary |
| metadata | text | JSON string for extra data (call duration, email subject, etc.) |
| score_before | number | Lead score before this event |
| score_after | number | Lead score after this event |
| created_date | date | When this happened |
| twilio_sid | text | Twilio message/call SID |
| sendgrid_id | text | SendGrid message ID |

---

### TABLE: AICallLog

| Field | Type | Description |
|-------|------|-------------|
| lead | Lead | Which lead was called |
| call_sid | text | Vapi/Retell call ID |
| twilio_sid | text | Twilio call SID |
| status | option set | initiated / ringing / answered / completed / no_answer / busy / failed / voicemail |
| duration_seconds | number | Call duration |
| outcome | option set | qualified / not_qualified / callback / wrong_number / voicemail / no_answer |
| transcript | text | Full call transcript |
| summary | text | AI-generated call summary |
| interest_level | option set | high / medium / low / none |
| wants_meeting | yes/no | Lead wants to book meeting |
| wants_app | yes/no | Lead wants app download link |
| objections | text | Key objections noted |
| next_action | text | Recommended follow-up |
| recording_url | text | Call recording URL |
| created_date | date | Call timestamp |

---

### TABLE: Campaign

| Field | Type | Description |
|-------|------|-------------|
| name | text | Campaign name |
| sequence | Sequence | Default sequence |
| source | text | Lead source for this campaign |
| start_date | date | Campaign start |
| end_date | date | Campaign end |
| total_leads | number | Leads imported |
| total_contacted | number | Leads contacted |
| total_qualified | number | Leads qualified |
| total_converted | number | Leads converted |
| is_active | yes/no | Currently running |

---

### TABLE: DailyMetric

| Field | Type | Description |
|-------|------|-------------|
| date | date | Metric date |
| campaign | Campaign | Optional campaign filter |
| leads_imported | number | New leads added |
| sms_sent | number | SMS sent |
| sms_delivered | number | SMS delivered |
| sms_replied | number | SMS replies received |
| emails_sent | number | Emails sent |
| emails_opened | number | Emails opened |
| emails_clicked | number | Email links clicked |
| emails_replied | number | Email replies |
| calls_made | number | AI calls made |
| calls_answered | number | Calls answered |
| calls_qualified | number | Calls that qualified |
| meetings_booked | number | Meetings scheduled |
| app_downloads | number | App downloads tracked |
| sms_opt_outs | number | SMS opt-outs |
| email_opt_outs | number | Email unsubs |

---

### TABLE: SystemSetting

| Field | Type | Description |
|-------|------|-------------|
| key | text | Setting name |
| value | text | Setting value |
| description | text | What this controls |

Key settings:
- `sms_daily_limit` → "200"
- `email_daily_limit` → "500"
- `calls_daily_limit` → "75"
- `send_window_start` → "9"
- `send_window_end` → "20"
- `send_timezone` → "America/New_York"
- `twilio_from_number` → "+1XXXXXXXXXX"
- `sendgrid_from_email` → "nadeem@breasy.com"
- `sendgrid_from_name` → "Nadeem from Breasy"
- `vapi_assistant_id` → "asst_xxxxx"
- `opt_out_keywords` → "STOP,UNSUBSCRIBE,QUIT,CANCEL"

---

### TABLE: User (Bubble built-in, extended)

| Field | Type | Description |
|-------|------|-------------|
| role | option set | admin / sales / ops |
| phone | text | For SMS notifications |
| daily_lead_cap | number | Max leads per day |
| notification_prefs | text | JSON preferences |
| assigned_leads | list of Lead | Current assigned leads |

---

## Option Sets

### LeadStatus
`new` | `contacted` | `engaged` | `qualified` | `converted` | `dead` | `dnc`

### PipelineStage
`imported` | `sequence_active` | `replied` | `call_scheduled` | `call_completed` | `qualified` | `meeting_booked` | `app_downloaded` | `customer` | `lost`

### ScoreTier
`cold` (0-20) | `warm` (21-40) | `hot` (41-60) | `qualified` (61+) | `dead` (<0)

### Channel
`sms` | `email` | `ai_call`

### ActivityType
(see Activity table above)

### CallOutcome
`qualified` | `not_qualified` | `callback` | `wrong_number` | `voicemail` | `no_answer`

### LeadSource
`hubspot` | `scraped` | `manual` | `referral`

---

## Relationships Diagram

```
Campaign 1──────────M Lead
Sequence  1──────────M SequenceStep
Sequence  1──────────M Lead (current sequence)
Lead      1──────────M Activity
Lead      1──────────M AICallLog
SequenceStep M───────1 MessageTemplate
User      1──────────M Lead (assigned_to)
Campaign  1──────────1 Sequence (default)
```
