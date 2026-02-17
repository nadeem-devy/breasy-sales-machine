# 1. SYSTEM ARCHITECTURE — Breasy Outbound Sales Machine

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LEAD SOURCES                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │   HubSpot    │  │  Scraped     │  │   Manual     │              │
│  │   API Sync   │  │  CSV Upload  │  │   Entry      │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         └──────────────────┼──────────────────┘                     │
│                            ▼                                        │
│              ┌─────────────────────────┐                            │
│              │   LEAD INTAKE ENGINE    │                            │
│              │  • Dedup by phone/email │                            │
│              │  • Normalize fields     │                            │
│              │  • Assign initial score │                            │
│              │  • Tag source/campaign  │                            │
│              └────────────┬────────────┘                            │
│                           ▼                                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    SEQUENCE ENGINE (Bubble)                          │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    OUTREACH SEQUENCE                         │    │
│  │                                                             │    │
│  │  T+0 min    ──►  SMS #1 (Intro + Value Hook)               │    │
│  │  T+3 hrs    ──►  Email #1 (Pain + Video Link)              │    │
│  │  T+24 hrs   ──►  SMS #2 (Social Proof + CTA)               │    │
│  │  T+48 hrs   ──►  AI Voice Call (Qualify + Book)             │    │
│  │  T+72 hrs   ──►  Email #2 (Case Study + Urgency)           │    │
│  │  T+96 hrs   ──►  SMS #3 (Final Push + App Link)            │    │
│  │  T+120 hrs  ──►  Email #3 (Break-up Email)                 │    │
│  │                                                             │    │
│  │  ⚡ INTERRUPTS:                                             │    │
│  │  • Reply detected → pause sequence, alert sales            │    │
│  │  • Call answered → update score, route accordingly          │    │
│  │  • Opt-out received → immediate stop, flag DNC             │    │
│  │  • App downloaded → move to onboarding sequence            │    │
│  │                                                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     EXTERNAL SERVICES                               │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐                  │
│  │  Twilio   │    │ SendGrid │    │  Vapi/Retell │                  │
│  │          │    │          │    │              │                  │
│  │ • SMS    │    │ • Email  │    │ • AI Calls   │                  │
│  │ • Inbound│    │ • Opens  │    │ • Transcripts│                  │
│  │ • Status │    │ • Clicks │    │ • Outcomes   │                  │
│  └────┬─────┘    └────┬─────┘    └──────┬───────┘                  │
│       │               │                 │                           │
│       └───────────────┼─────────────────┘                           │
│                       ▼                                             │
│         ┌──────────────────────────┐                                │
│         │   WEBHOOK HANDLER        │                                │
│         │   (Bubble Backend WF)    │                                │
│         │   • Delivery status      │                                │
│         │   • Reply capture        │                                │
│         │   • Call outcome         │                                │
│         │   • Email events         │                                │
│         └────────────┬─────────────┘                                │
│                      ▼                                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     LEAD SCORING ENGINE                              │
│                                                                     │
│  INPUT SIGNALS:                    SCORE ACTIONS:                    │
│  • SMS delivered      +1           0-20  → Cold (continue seq)      │
│  • Email opened       +3           21-40 → Warm (prioritize call)   │
│  • Link clicked       +5           41-60 → Hot (alert sales NOW)    │
│  • SMS replied        +10          61+   → Qualified (route + book) │
│  • Call answered      +10                                           │
│  • Call qualified     +20          NEGATIVE:                        │
│  • App downloaded     +25          • Opt-out      → -100 (DNC)     │
│  • Meeting booked     +30          • Wrong number → -50            │
│  • Negative response  -15          • No answer x3 → -10            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       ROUTING ENGINE                                │
│                                                                     │
│  Score 61+ (Qualified)                                              │
│    └──► Notify sales rep (SMS + Bubble notification)                │
│    └──► Auto-send meeting booking link                              │
│    └──► Move to "Qualified" pipeline stage                          │
│    └──► Create HubSpot deal (API push)                              │
│                                                                     │
│  Score 41-60 (Hot)                                                  │
│    └──► Priority AI call queue                                      │
│    └──► Notify ops team                                             │
│    └──► Fast-track sequence (skip delays)                           │
│                                                                     │
│  Score 21-40 (Warm)                                                 │
│    └──► Continue sequence normally                                  │
│    └──► Schedule AI call at next window                             │
│                                                                     │
│  Score 0-20 (Cold)                                                  │
│    └──► Continue automated sequence                                 │
│    └──► If no engagement by step 5 → move to nurture                │
│                                                                     │
│  Score <0 (Dead/DNC)                                                │
│    └──► Stop all outreach immediately                               │
│    └──► Add to suppression list                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       DASHBOARD                                     │
│                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │  Leads In   │ │  Messages   │ │   Calls     │ │ Conversions │  │
│  │  Pipeline   │ │  Sent/Open  │ │  Made/Qual  │ │ Downloads   │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  FUNNEL VIEW: Import → Contact → Engage → Qualify → Convert │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐                        │
│  │  Lead Table      │  │  Activity Feed   │                        │
│  │  (sortable,      │  │  (real-time log   │                        │
│  │   filterable)    │  │   of all actions) │                        │
│  └──────────────────┘  └──────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow Summary

```
Lead Source → Intake → Dedup → Score → Sequence Engine →
  ├── SMS (Twilio) → Webhook → Update Lead
  ├── Email (SendGrid) → Webhook → Update Lead
  ├── AI Call (Vapi) → Webhook → Update Lead
  └── Score recalculated after each event →
        ├── Route to Sales (if qualified)
        ├── Book Meeting (if hot)
        ├── Continue Sequence (if warm/cold)
        └── Stop + DNC (if opted out)
```

## Integration Map

| System | Direction | Method | Purpose |
|--------|-----------|--------|---------|
| HubSpot | IN/OUT | API Plugin | Import leads, push deal updates |
| Twilio | OUT/IN | API + Webhooks | Send SMS, receive replies/status |
| SendGrid | OUT/IN | API + Webhooks | Send email, track opens/clicks |
| Vapi/Retell | OUT/IN | API + Webhooks | Make AI calls, get transcripts |
| Calendly/Cal | OUT | URL embed | Meeting booking |
| App Store | Track | Deep link + UTM | Track app downloads |
