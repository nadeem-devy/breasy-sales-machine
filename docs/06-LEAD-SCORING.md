# 6. LEAD SCORING LOGIC

## Scoring Model

### Engagement Signals (Positive)

| Signal | Points | Rationale |
|--------|--------|-----------|
| SMS delivered | +1 | Confirms valid number |
| Email delivered | +1 | Confirms valid email |
| Email opened | +3 | Showing interest |
| Email opened 2+ times | +2 (bonus) | Re-engaging with content |
| Email link clicked | +5 | Active interest |
| Video link clicked | +7 | High intent — watching demo |
| SMS reply (positive/neutral) | +10 | Engaged enough to respond |
| Call answered | +10 | Willing to talk |
| Call lasted 60+ seconds | +5 (bonus) | Real conversation happened |
| Call qualified by AI | +20 | Meets qualification criteria |
| Wants meeting (from call) | +15 | High intent |
| Wants app download (from call) | +10 | Active interest |
| Meeting booked | +30 | Pipeline conversion |
| App downloaded | +25 | Product engagement |
| Visited website (if tracked) | +3 | Interest signal |

### Negative Signals

| Signal | Points | Rationale |
|--------|--------|-----------|
| SMS undeliverable | -5 | Bad data / wrong number |
| Email bounced (hard) | -10 | Invalid email |
| Negative reply ("not interested") | -15 | Explicit rejection |
| Call — no answer (1st time) | 0 | Normal, no penalty |
| Call — no answer (2nd time) | -3 | Pattern forming |
| Call — no answer (3rd time) | -7 | Likely avoiding |
| Call — wrong number | -50 | Bad data, stop all contact |
| Opt-out (STOP) | -100 | DNC, stop immediately |
| Email spam complaint | -100 | DNC for email |
| Call — explicit "do not call" | -100 | DNC for calls |

### Decay Rule (Inactivity)

```
Every 7 days with NO engagement:
  IF lead is in active sequence AND score > 10:
    score = score - 3 (decay)

Purpose: Prevents stale leads from clogging "warm" tier
Implementation: Weekly scheduled workflow scans for inactive leads
```

## Score Tiers & Actions

```
┌────────────┬──────────┬─────────────────────────────────────────┐
│ Tier       │ Score    │ System Action                           │
├────────────┼──────────┼─────────────────────────────────────────┤
│ Dead/DNC   │ < 0      │ STOP all outreach immediately           │
│            │          │ Add to suppression list                  │
│            │          │ No further contact ever                  │
├────────────┼──────────┼─────────────────────────────────────────┤
│ Cold       │ 0 – 20   │ Continue automated sequence              │
│            │          │ Standard delays between steps            │
│            │          │ No human intervention needed             │
│            │          │ If still cold after sequence → nurture   │
├────────────┼──────────┼─────────────────────────────────────────┤
│ Warm       │ 21 – 40  │ Continue sequence (shorter delays)       │
│            │          │ Ensure AI call step happens              │
│            │          │ Ops team can see in dashboard            │
│            │          │ May prioritize for earlier call           │
├────────────┼──────────┼─────────────────────────────────────────┤
│ Hot        │ 41 – 60  │ PRIORITY: Move to front of call queue    │
│            │          │ Notify ops team immediately              │
│            │          │ Shorten remaining sequence delays to 50% │
│            │          │ Fast-track to AI call if not done yet     │
├────────────┼──────────┼─────────────────────────────────────────┤
│ Qualified  │ 61+      │ ALERT: Notify sales rep via SMS + app    │
│            │          │ Pause automated sequence                 │
│            │          │ Auto-send meeting booking link            │
│            │          │ Create HubSpot deal                      │
│            │          │ Assign to sales rep (round-robin)        │
│            │          │ Human takes over from here               │
└────────────┴──────────┴─────────────────────────────────────────┘
```

## Scoring Examples — Typical Lead Journeys

### Journey 1: Fast Qualifier (3 days)
```
Day 1: SMS delivered (+1) → Email delivered (+1) → Email opened (+3)
       Running score: 5 (Cold)

Day 1: Video link clicked (+7)
       Running score: 12 (Cold)

Day 2: SMS #2 delivered (+1) → Lead replies "tell me more" (+10)
       Running score: 23 (Warm) → Sequence paused, rep notified

Day 3: AI call → answered (+10) → qualified (+20) → wants meeting (+15)
       Running score: 68 (Qualified!) → Sales alert, meeting link sent
```

### Journey 2: Slow Burn (5 days)
```
Day 1: SMS delivered (+1) → Email opened (+3)
       Score: 4 (Cold)

Day 2: SMS #2 delivered (+1)
       Score: 5 (Cold)

Day 3: AI call → no answer (0)
       Score: 5 (Cold)

Day 4: Email #2 opened (+3) → Link clicked (+5)
       Score: 13 (Cold)

Day 5: SMS #3 delivered (+1) → Lead replies "what does it cost?" (+10)
       Score: 24 (Warm) → Sequence paused, rep notified
```

### Journey 3: Dead Lead (2 days)
```
Day 1: SMS delivered (+1) → Lead replies "STOP" (-100)
       Score: -99 (Dead) → DNC list, all outreach stopped
```

### Journey 4: No Engagement (5 days → nurture)
```
Day 1: SMS delivered (+1), Email delivered (+1)
       Score: 2

Day 2: SMS delivered (+1)
       Score: 3

Day 3: Call → no answer (0)
       Score: 3

Day 4: Email delivered (+1)
       Score: 4

Day 5: SMS delivered (+1), Email delivered (+1)
       Score: 6 (Cold) → Sequence complete → Move to monthly nurture list
```

## Implementation in Bubble

### Score Calculator Workflow

```
Trigger: Called by any webhook or action that affects scoring

Input: Lead (thing), event_type (text), bonus_points (number, optional)

Step 1: Look up points for event_type from scoring table
        (Store scoring rules in SystemSetting or Option Set)

Step 2: old_score = Lead's score

Step 3: new_score = old_score + points + bonus_points

Step 4: Determine new tier:
        new_tier =
          IF new_score < 0   → "dead"
          IF new_score ≤ 20  → "cold"
          IF new_score ≤ 40  → "warm"
          IF new_score ≤ 60  → "hot"
          IF new_score > 60  → "qualified"

Step 5: Make changes to Lead:
        - score = new_score
        - score_tier = new_tier

Step 6: Create Activity:
        - type = "score_change"
        - score_before = old_score
        - score_after = new_score
        - content = "[event_type]: score [old] → [new] ([tier])"

Step 7: IF old_tier ≠ new_tier:
        → Run Routing Engine (W12)
        → Log tier change
```
