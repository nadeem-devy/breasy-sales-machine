# 9. SCALING STRATEGY

## Phase 1: MVP (Week 1-2) — 250 Leads

| Resource | Capacity | Cost/Month |
|----------|----------|------------|
| Bubble | Personal plan | $32 |
| Twilio SMS | 200/day (~4,000/mo) | ~$120 ($0.03/msg) |
| Twilio Voice (Vapi passthrough) | 75 calls/day | ~$75 ($0.05/min × 3min avg) |
| SendGrid | 500/day (~10,000/mo) | Free tier (100/day) or $20 |
| Vapi | 75 calls/day | ~$150 ($0.10/min × 3min avg) |
| **Total** | **250 leads/week** | **~$400/month** |

## Phase 2: Growth (Week 3-6) — 1,000 Leads

| Resource | Change | Cost/Month |
|----------|--------|------------|
| Bubble | Professional plan (more WF runs) | $115 |
| Twilio SMS | 500/day (~10,000/mo) | ~$300 |
| Twilio Voice | 150 calls/day | ~$150 |
| SendGrid | Essentials plan (50K emails) | $20 |
| Vapi | 150 calls/day | ~$300 |
| Dedicated phone number(s) | 2-3 numbers (rotation) | ~$6 |
| **Total** | **1,000 leads/week** | **~$900/month** |

## Phase 3: Scale (Week 7+) — 5,000+ Leads

| Resource | Change | Cost/Month |
|----------|--------|------------|
| Bubble | Production plan (priority WFs) | $349 |
| Twilio SMS | 2,000/day, 10DLC registration | ~$1,200 |
| Twilio Voice | 300 calls/day, multiple numbers | ~$300 |
| SendGrid | Pro (100K emails, dedicated IP) | $90 |
| Vapi | 300 calls/day, multiple assistants | ~$600 |
| Phone numbers | 5-10 numbers (rotation) | ~$20 |
| **Total** | **5,000 leads/week** | **~$2,500/month** |

## Scaling Levers

### 1. Twilio Number Rotation (Anti-Spam)
```
Problem: Single number sending 200+ SMS/day gets flagged by carriers
Solution: Rotate across multiple Twilio numbers

Implementation:
- Buy 3 Twilio numbers (Phase 2) or 10 (Phase 3)
- Store numbers in a SystemSetting list
- Before each SMS send:
  1. Get list of active Twilio numbers
  2. Count today's sends per number
  3. Pick number with lowest count
  4. Send from that number
  5. Store which number was used (on Activity record)

Rule of thumb: Max 100-150 SMS per number per day
```

### 2. SendGrid Warm-Up (Email Deliverability)
```
Week 1: 50 emails/day (warm up new domain/IP)
Week 2: 100 emails/day
Week 3: 250 emails/day
Week 4: 500 emails/day
Week 5+: Full capacity

Also:
- Set up SPF, DKIM, DMARC on sending domain
- Use a subdomain for outreach (e.g., hello@mail.breasy.com)
- Keep bounce rate under 2%, spam complaints under 0.1%
- Remove bounced emails immediately
```

### 3. Bubble Workflow Capacity
```
Problem: Bubble has limits on concurrent backend workflows

Solutions:
- Stagger batch processing (don't fire 500 WFs at once)
- Use 5-min recurring scheduler (not 1-min)
- Process 50 leads per batch
- Use "Schedule API Workflow on a list" with delays between items
  → Set delay: 2 seconds between each item in list
- Upgrade Bubble plan for higher WF capacity when needed
```

### 4. Vapi/Retell Concurrency
```
Problem: AI calls take 2-5 minutes each, can't do 75 simultaneously

Solution:
- Queue calls in Bubble
- Process 1-3 concurrent calls at a time
- Each call takes ~3 min avg → 20 calls/hour → 75 in 4 hours
- Schedule calls between 10am-5pm = 7 hours = up to 140 calls/day

Phase 2: Multiple Vapi assistants for parallel calls
Phase 3: Multiple Vapi phone numbers, 5-10 concurrent calls
```

### 5. Lead Volume Scaling

```
Phase 1: Manual CSV import + HubSpot sync (250/week)
Phase 2: Add Apollo.io or Instantly scraping (1,000/week)
Phase 3: Multi-source:
  - HubSpot sync (ongoing warm leads)
  - Apollo.io API (targeted scraping)
  - LinkedIn Sales Navigator export
  - Google Maps scraping (via Apify)
  - Referral/inbound from marketing
  - Partner list swaps
```

### 6. Multi-Campaign Support

```
Phase 1: 1 active campaign, 1 sequence
Phase 2: 3-5 campaigns (by industry/geography)
  - "Miami Restaurants Jan 2026"
  - "LA Retail Feb 2026"
  - Each with customized copy/sequences

Phase 3: Template library
  - 10+ sequence templates by industry
  - A/B tested, optimized copy per vertical
  - Clone & customize for new campaigns in minutes
```

### 7. Team Scaling

```
Phase 1: Solo operator (Nadeem)
  - Handles everything, system runs automatically
  - Reviews qualified leads, books meetings

Phase 2: +1 Sales Rep
  - Round-robin qualified leads between 2 reps
  - Rep dashboard shows their assigned leads only
  - Shared admin dashboard for overall metrics

Phase 3: Ops + Sales team
  - 1 Ops manager (monitors sequences, optimizes copy)
  - 2-3 Sales reps (handle qualified leads)
  - Role-based access in Bubble
  - Rep performance tracking (close rate, response time)
```

## Cost Per Acquisition Model

```
Phase 1 (250 leads/week):
  Monthly cost: ~$400
  Expected qualified/month: ~100 (10% of 1,000 leads)
  Expected customers/month: ~30 (3% conversion)
  Cost per qualified lead: $4
  Cost per customer: $13.33

Phase 2 (1,000 leads/week):
  Monthly cost: ~$900
  Expected qualified/month: ~400
  Expected customers/month: ~120
  Cost per qualified lead: $2.25
  Cost per customer: $7.50

Phase 3 (5,000 leads/week):
  Monthly cost: ~$2,500
  Expected qualified/month: ~2,000
  Expected customers/month: ~600
  Cost per qualified lead: $1.25
  Cost per customer: $4.17
```
