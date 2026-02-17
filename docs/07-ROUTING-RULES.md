# 7. ROUTING RULES

## Routing Decision Tree

```
Score Tier Changes
       │
       ▼
┌──────────────────┐     ┌──────────────────────────────────────┐
│  Score < 0       │────►│  DEAD / DNC                          │
│  (Dead)          │     │  • Stop ALL outreach immediately     │
│                  │     │  • Add to suppression list            │
│                  │     │  • Log reason (opt-out / wrong #)     │
│                  │     │  • Remove from all queues             │
│                  │     │  • No human action needed             │
└──────────────────┘     └──────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────────────────────────┐
│  Score 0-20      │────►│  COLD                                │
│  (Cold)          │     │  • Continue automated sequence        │
│                  │     │  • No human involvement               │
│                  │     │  • Standard timing/delays             │
│                  │     │  • If sequence ends → monthly nurture  │
└──────────────────┘     └──────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────────────────────────┐
│  Score 21-40     │────►│  WARM                                │
│  (Warm)          │     │  • Continue sequence                  │
│                  │     │  • Visible to ops in dashboard        │
│                  │     │  • Ensure AI call step fires          │
│                  │     │  • IF replied: pause + notify rep     │
└──────────────────┘     └──────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────────────────────────┐
│  Score 41-60     │────►│  HOT                                 │
│  (Hot)           │     │  • Move to front of call queue        │
│                  │     │  • Cut remaining delays by 50%        │
│                  │     │  • Notify ops team immediately         │
│                  │     │  • IF not called yet → call NOW        │
│                  │     │  • Add to "Hot Leads" dashboard view   │
└──────────────────┘     └──────────────────────────────────────┘

┌──────────────────┐     ┌──────────────────────────────────────┐
│  Score 61+       │────►│  QUALIFIED                           │
│  (Qualified)     │     │  • PAUSE automated sequence           │
│                  │     │  • Assign to sales rep (round-robin)  │
│                  │     │  • Alert rep: SMS + notification       │
│                  │     │  • Auto-send meeting link to lead      │
│                  │     │  • Create HubSpot deal                │
│                  │     │  • Pipeline stage = "qualified"        │
│                  │     │  • HUMAN TAKES OVER                   │
└──────────────────┘     └──────────────────────────────────────┘
```

## Sales Rep Assignment (Round-Robin)

```
When a lead reaches "qualified":

Step 1: Get all Users where role = "sales" AND is_active = yes

Step 2: For each rep, count assigned_leads where:
        - status = "qualified"
        - modified_date is within last 7 days

Step 3: Assign to rep with LOWEST active qualified count

Step 4: Update Lead:
        - assigned_to = selected rep

Step 5: Notify rep:
        a) Bubble in-app notification:
           "New qualified lead: [Name] from [Company]"
           With link to lead detail page

        b) SMS to rep's phone:
           "New qualified lead: [Name] from [Company].
            Score: [X]. Phone: [number].
            Call them ASAP! View: [bubble lead URL]"

        c) Email to rep:
           Subject: "Qualified Lead — [Name] from [Company]"
           Body: Full lead details + call transcript + score history
```

## Event-Based Routing (Beyond Score Tiers)

### When Lead Replies to SMS/Email

```
ANY reply (not opt-out):
  1. Pause sequence immediately
  2. Set pipeline_stage = "replied"
  3. Notify assigned rep (or duty rep if unassigned)
  4. Rep has 30 minutes to respond
  5. IF rep doesn't respond in 30 min:
     → Escalate to next available rep
     → Send Bubble notification + SMS reminder
  6. Rep manually resumes sequence OR takes over conversation
```

### When Lead Books a Meeting

```
  1. Set pipeline_stage = "meeting_booked"
  2. Run Score Calculator (+30)
  3. Pause all outreach
  4. Notify assigned rep with meeting details
  5. Schedule pre-meeting reminder:
     → 24 hrs before: SMS to lead "Looking forward to our call tomorrow!"
     → 1 hr before: SMS to lead "Just a reminder — we're chatting in an hour: {{meeting_link}}"
  6. Create HubSpot deal (if not already created)
```

### When Lead Downloads App

```
  1. Set pipeline_stage = "app_downloaded"
  2. Set app_downloaded = yes
  3. Run Score Calculator (+25)
  4. Pause current outreach sequence
  5. Start "Onboarding Sequence":
     T+0:  SMS "Welcome to Breasy! Here's how to set up in 5 min: [setup guide link]"
     T+24: Email "3 things to do first in your Breasy app"
     T+72: SMS "How's it going with the app? Need any help?"
  6. Notify sales/ops: "[Name] downloaded the app — follow up on activation"
```

### When AI Call Qualifies Lead

```
  1. Set call_qualified = yes
  2. Run Score Calculator (+20)
  3. This usually pushes lead to "qualified" tier
  4. Routing Engine handles the rest (see qualified section above)
  5. ALSO: If lead said "wants_meeting" → send meeting link immediately
  6. ALSO: If lead said "wants_app" → send app link immediately
```

### When AI Call Gets "Callback" Outcome

```
  1. Do NOT mark as qualified or not qualified
  2. Schedule follow-up AI call in 24 hours
  3. Set next_action_date = preferred_callback_time (if provided)
  4. Add note: "Requested callback at [time]"
  5. Continue rest of sequence normally
```

## Escalation Rules

| Condition | Escalation |
|-----------|-----------|
| Qualified lead not contacted by rep in 30 min | Re-assign to next rep |
| Qualified lead not contacted by rep in 2 hours | Alert admin |
| Hot lead in queue for 24+ hours without call | Alert admin |
| Rep has 10+ uncontacted qualified leads | Redistribute to other reps |
| Lead replies after hours (8pm-9am) | Queue for first thing in morning |

## Pipeline Stage Transitions

```
imported → sequence_active    (first outreach sent)
sequence_active → replied     (any reply received)
sequence_active → call_scheduled  (AI call queued)
call_scheduled → call_completed   (AI call done)
call_completed → qualified    (score 61+ or AI qualified)
any → meeting_booked          (meeting scheduled)
any → app_downloaded          (app installed)
meeting_booked → customer     (deal closed)
any → lost                    (sequence complete, no engagement)
any → dead                    (bad data, wrong number)
any → dnc                     (opted out)
```

## Suppression List Management

Leads on suppression list are NEVER contacted again:

```
Add to suppression list when:
  - Lead texts STOP / UNSUBSCRIBE / QUIT / CANCEL
  - Lead emails unsubscribe
  - Lead says "do not call" on phone
  - Lead reports spam
  - Lead marked as "wrong number"

Check suppression BEFORE every send:
  - Before SMS: check phone against suppression list
  - Before Email: check email against suppression list
  - Before Call: check phone against suppression list
  - This is in ADDITION to the per-lead opt-out flags
```
