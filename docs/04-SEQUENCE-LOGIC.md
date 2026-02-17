# 4. SEQUENCE LOGIC — SMS + Email + AI Call Timing

## Default 7-Step Sequence: "Breasy Restaurant Outreach v1"

```
STEP  CHANNEL    DELAY         SEND WINDOW        SKIP CONDITIONS
───── ────────── ───────────── ────────────────── ──────────────────────
 1    SMS        T+0 (immed.)  9am-8pm Mon-Fri    None
 2    Email      T+3 hours     8am-9pm Mon-Fri    Skip if replied
 3    SMS        T+24 hours    10am-6pm Mon-Fri   Skip if replied
 4    AI Call    T+48 hours    10am-5pm Mon-Fri   Skip if score > 60
 5    Email      T+72 hours    8am-9pm Mon-Sat    Skip if replied
 6    SMS        T+96 hours    10am-6pm Mon-Fri   Skip if replied
 7    Email      T+120 hours   8am-9pm Mon-Sat    Skip if score > 40
```

## Timing Rules

### Send Windows
- **SMS:** 9:00 AM – 8:00 PM local time (TCPA compliance)
- **Email:** 8:00 AM – 9:00 PM local time
- **AI Calls:** 10:00 AM – 5:00 PM local time (best answer rates)
- **Weekend:** Email only on Saturday (10am-2pm). No SMS/calls on weekends.

### If Outside Window
When a step is scheduled outside the send window:
1. Push to the next valid send window
2. Example: Step scheduled for 9:30 PM Friday → pushed to 9:00 AM Monday
3. Store adjusted time in `next_action_date`

### Delay Calculation
```
next_action_date = last_step_executed_time + delay_hours

IF next_action_date falls outside send window:
  next_action_date = next available send window start

IF next_action_date falls on excluded day:
  next_action_date = next valid day at send_window_start
```

## Throttling Rules

### Daily Caps (Per Account)
| Channel | Daily Limit | Per-Minute Limit | Reason |
|---------|-------------|-------------------|--------|
| SMS | 200/day | 1 per second | Twilio rate limits + carrier filtering |
| Email | 500/day | 10 per second | SendGrid warm-up + deliverability |
| AI Calls | 75/day | 1 concurrent | Vapi concurrency + quality |

### Throttling Implementation in Bubble

```
Before sending any message:

1. Count today's Activities where:
   - type = "[channel]_sent"
   - created_date ≥ start of today

2. IF count >= daily_limit:
   - Push to tomorrow's queue
   - Set next_action_date = tomorrow at send_window_start
   - Log "Daily limit reached for [channel]"

3. IF count < daily_limit:
   - Execute send
   - Increment counter
```

### Batch Processing
The Sequence Scheduler (runs every 5 min) processes leads in batches:

```
Batch size: 50 leads per run
Processing order:
  1. Hot leads first (score 41-60)
  2. Warm leads (score 21-40)
  3. Cold leads (score 0-20)

Between batches: 5-minute gap (Bubble recurring workflow)
This means: max 600 sends per hour (50 × 12 runs)
Actual pace: ~3-4 per minute (with API call time)
```

## Sequence Interrupts

These events PAUSE or STOP the sequence immediately:

### Pause Triggers (human takes over)
| Event | Action | Resume? |
|-------|--------|---------|
| Lead replies to SMS | Pause sequence, alert sales | Manual resume by rep |
| Lead replies to email | Pause sequence, alert sales | Manual resume by rep |
| Lead answers AI call + qualified | Pause, route to sales | Moves to booking flow |
| Lead books a meeting | Pause entire sequence | Moves to pre-meeting nurture |

### Stop Triggers (lead exits sequence)
| Event | Action | Resume? |
|-------|--------|---------|
| Lead texts STOP | Stop all SMS + calls permanently | Never (DNC) |
| Lead unsubscribes email | Stop email only | SMS/calls may continue |
| 3 consecutive no-answers on calls | Stop calls only | SMS/email continue |
| Lead marked as wrong number | Stop everything | Never |
| Lead downloads app | Stop outreach, start onboarding | Different sequence |
| Lead score drops below -20 | Stop everything | Never |

### Skip Logic
| Condition | What Happens |
|-----------|-------------|
| Lead already replied | Skip remaining SMS/email steps, prioritize call |
| Lead already qualified | Skip to meeting booking step |
| Lead score > 60 | Skip AI call (already qualified via engagement) |
| Lead score > 40 at step 7 | Skip break-up email (still engaged) |

## A/B Testing Framework

### How It Works
Each MessageTemplate has a `version` field (A or B).

```
When sending a message:
1. Check if template has multiple active versions
2. Assign version based on lead's unique_id:
   - IF last digit of unique_id is even → Version A
   - IF last digit of unique_id is odd → Version B
3. Track sends + replies per version
4. After 100 sends per version: compare reply rates
5. Winner becomes the only active version
6. Create new challenger (Version B) to test against winner
```

### What to A/B Test
| Element | Version A | Version B |
|---------|-----------|-----------|
| SMS #1 opening line | Question hook | Statement hook |
| Email #1 subject | Pain-focused | Benefit-focused |
| SMS #2 social proof | Revenue stat | Customer quote |
| AI Call opening | Warm intro | Direct value prop |
| Email CTA | "Book a call" | "See a 2-min demo" |

## Sequence Variants by Lead Source

### HubSpot Leads (warmer — they've shown prior interest)
- Start at Step 1 but with warmer messaging
- Shorter delays (T+2hrs, T+18hrs instead of T+3, T+24)
- Reference their prior interaction: "I saw you checked out Breasy..."

### Scraped Leads (cold — no prior interaction)
- Standard 7-step sequence
- Longer delays to avoid feeling aggressive
- More value-first messaging, no assumptions

### Referral Leads (warmest)
- 3-step sequence only: SMS → Call → Email
- Mention referrer by name
- Fastest path to booking
