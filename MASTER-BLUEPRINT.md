# BREASY SALES MACHINE — Master Blueprint

## All-in-One Outbound Automation Platform

**Built for:** Breasy / NextAutomation
**Stack:** Bubble.io + Twilio + SendGrid + Vapi
**Target:** 75 calls, 25 qualified leads, 25 app downloads per campaign

---

## Quick Links to All Sections

| # | Section | File |
|---|---------|------|
| 1 | [System Architecture](docs/01-SYSTEM-ARCHITECTURE.md) | Data flow, integration map, routing engine |
| 2 | [Bubble Database Schema](docs/02-BUBBLE-DATABASE-SCHEMA.md) | 9 tables, all fields, relationships, option sets |
| 3 | [Workflows](docs/03-WORKFLOWS.md) | 15 workflows with step-by-step logic |
| 4 | [Sequence Logic](docs/04-SEQUENCE-LOGIC.md) | 7-step sequence, timing, throttling, A/B testing |
| 5 | [Copy & Scripts](docs/05-COPY-AND-SCRIPTS.md) | SMS, Email, AI call scripts (all variants) |
| 6 | [Lead Scoring](docs/06-LEAD-SCORING.md) | Point values, tier definitions, journey examples |
| 7 | [Routing Rules](docs/07-ROUTING-RULES.md) | Decision tree, rep assignment, escalation |
| 8 | [Dashboard & KPIs](docs/08-DASHBOARD-KPIS.md) | 5 pages, layout wireframes, 16 KPIs |
| 9 | [Scaling Strategy](docs/09-SCALING-STRATEGY.md) | 3 phases, cost model, scaling levers |
| 10 | [Optimization Plan](docs/10-OPTIMIZATION-PLAN.md) | Daily/weekly/monthly checklists, playbooks |
| 11 | [Risks & Compliance](docs/11-RISKS-AND-COMPLIANCE.md) | TCPA, CAN-SPAM, 10DLC, safeguards |
| 12 | [Implementation Roadmap](docs/12-IMPLEMENTATION-ROADMAP.md) | Day-by-day build plan, go-live checklist |
| 13 | [Funnel Estimates](docs/13-FUNNEL-ESTIMATES.md) | Full funnel math, projections, revenue model |

## Supporting Files

| File | Purpose |
|------|---------|
| [scripts/vapi-assistant-config.json](scripts/vapi-assistant-config.json) | Vapi AI assistant configuration (paste into Vapi) |
| [templates/email-templates.html](templates/email-templates.html) | 3 HTML email templates ready for SendGrid |

---

## The System in 60 Seconds

```
IMPORT LEADS (HubSpot sync or CSV upload)
    ↓
AUTOMATED 7-STEP SEQUENCE runs over 5 days:
    SMS → Email → SMS → AI CALL → Email → SMS → Email
    ↓
EVERY interaction scores the lead (0-100+)
    ↓
ROUTING:
    Cold (0-20)   → keep automating
    Warm (21-40)  → ensure AI call happens
    Hot (41-60)   → priority call, alert ops
    Qualified (61+) → ALERT SALES, book meeting, send app
    ↓
DASHBOARD tracks everything in real-time
```

## Success Metrics Per 250-Lead Campaign

| Metric | Target | How |
|--------|--------|-----|
| Calls Made | 75 | AI calls via Vapi, 4 hours of calling |
| Qualified Leads | 25 | 12 from calls + 8 from SMS + 5 from email |
| App Downloads | 25 | 15 from qualified + 10 from engaged leads |

## Monthly Cost

| Phase | Leads/Week | Monthly Cost | Cost/Qualified Lead |
|-------|-----------|-------------|-------------------|
| MVP | 250 | ~$400 | ~$4 |
| Growth | 1,000 | ~$900 | ~$2.25 |
| Scale | 5,000 | ~$2,500 | ~$1.25 |

## Build Timeline

| Phase | Days | What You Get |
|-------|------|-------------|
| Foundation | Day 1-2 | Accounts, database, API connections |
| MVP | Day 3-5 | SMS outreach + scoring + replies working |
| Full Channels | Day 6-10 | Email + AI calls + full 7-step sequence |
| Dashboard | Day 11-14 | Analytics, routing, HubSpot sync |
| Optimize | Day 15-21 | A/B testing, scaling, multi-campaign |

---

## How to Use This Blueprint

1. **Read Section 12 first** — it tells you exactly what to build each day
2. **Set up accounts** (Bubble, Twilio, SendGrid, Vapi) on Day 1
3. **Build the database** (Section 2) in Bubble on Day 1
4. **Follow the workflows** (Section 3) step by step
5. **Copy the SMS/Email/AI scripts** (Section 5) into your templates
6. **Configure Vapi** using the JSON config in scripts/
7. **Launch with 50 leads** first, monitor for 48 hours
8. **Scale to 250 leads** once everything is stable
9. **Optimize weekly** using Section 10 checklists
10. **Scale up** using Section 9 when ready

---

*Built by Nadeem's AI Senior Automation Architect*
*System designed for maximum conversions with minimal manual work*
