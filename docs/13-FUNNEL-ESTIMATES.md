# 13. ESTIMATED NUMBERS — Full Funnel Model

## Campaign Assumptions

```
Campaign size:    250 leads
Duration:         2 weeks
Channels:         SMS (3 touches) + Email (3 touches) + AI Call (1 touch)
Total touches:    7 per lead
```

## Conservative Funnel (Week 1-2, before optimization)

```
STAGE                  COUNT    RATE         NOTES
────────────────────── ──────── ──────────── ────────────────────────────
Leads Imported           250    —            Starting pool
  ↓ Valid data           237    95%          ~5% bad phone/email
  ↓ Contacted (1+ msg)   225    95%          Some skip due to DNC/dedup
  ↓
SMS #1 Sent              225    —            First touch
  → Delivered            213    95%          ~5% undeliverable
  → Replied               15    7%           Industry avg 5-9% for cold
  → Opted Out              5    2.2%         Normal for cold outreach

Email #1 Sent            220    —            (minus opt-outs)
  → Opened                77    35%          Good for personalized cold
  → Clicked               17    22% of open  Video link click-through
  → Replied                4    2%           Lower than SMS for cold

SMS #2 Sent              200    —            (minus opt-outs + replied)
  → Delivered            190    95%
  → Replied               13    7%
  → Opted Out              3    1.5%

AI Call Made              75    —            75/day target met
  → Answered              30    40%          Industry avg 35-45%
  → Qualified             12    40% of ans.  Of those who answered
  → Callback               5    17% of ans.  Want to talk later
  → Not Interested         8    27% of ans.
  → Wrong Number           3    10% of ans.
  → Voicemail              2    —

Email #2 Sent            170    —            Remaining active leads
  → Opened                60    35%
  → Clicked               10    17% of open
  → Replied                3    2%

SMS #3 Sent              160    —            Final SMS push
  → Delivered            152    95%
  → Replied                8    5%           Lower rate by 3rd touch
  → Opted Out              2    1.3%

Email #3 (Breakup)       155    —            Last touch
  → Opened                50    32%
  → Replied                8    5%           Break-up emails convert well
```

## Conversion Summary (Conservative)

```
┌────────────────────────────┬────────┬──────────┐
│ Metric                     │ Count  │ Rate     │
├────────────────────────────┼────────┼──────────┤
│ Leads Imported             │ 250    │ 100%     │
│ Leads Contacted            │ 225    │ 90%      │
│ Total SMS Sent             │ 585    │ —        │
│ Total SMS Replies          │ 36     │ 6.5%     │
│ Total Emails Sent          │ 545    │ —        │
│ Total Emails Opened        │ 187    │ 34%      │
│ Total Email Replies        │ 15     │ 2.8%     │
│ AI Calls Made              │ 75     │ —        │
│ AI Calls Answered          │ 30     │ 40%      │
│ AI Calls Qualified         │ 12     │ 16%/made │
│                            │        │          │
│ Total Replies (all chan.)  │ 51     │ 20.4%    │
│ Engaged Leads (any action) │ 89     │ 36%      │
│ Qualified Leads            │ 25     │ 10%      │
│ Meetings Booked            │ 15     │ 60%/qual │
│ App Downloads              │ 25     │ 10%      │
│ Customers (closed)         │ 8      │ 3.2%     │
│                            │        │          │
│ Total Opt-Outs             │ 10     │ 4%       │
│ Total Dead/Invalid         │ 16     │ 6.4%     │
└────────────────────────────┴────────┴──────────┘
```

## How We Hit the Success Metrics

| Target | Path to Hit | Confidence |
|--------|-------------|-----------|
| **75 calls** | 75 calls in 1 day or spread over 2-3 days. At 20 calls/hr, need 4 hours of calling. | High |
| **25 qualified leads** | 12 from AI calls + 8 from SMS replies (engaged enough) + 5 from email replies/clicks. Need 250 leads minimum. | Medium-High |
| **25 app downloads** | Send app link to all 25 qualified leads + hot leads. Even at 50% download rate of 50 engaged leads = 25. Also include in SMS #3. | Medium-High |

### Qualified Lead Sources Breakdown

```
FROM AI CALLS:
  75 calls → 30 answered → 12 qualified via AI                    = 12

FROM SMS REPLIES:
  36 total replies → ~24 positive/neutral → 8 meet qual criteria   = 8

FROM EMAIL ENGAGEMENT:
  15 email replies → 5 meet qual criteria                          = 5
                                                                   ────
TOTAL QUALIFIED                                                    = 25
```

### App Download Sources Breakdown

```
FROM QUALIFIED LEADS (meeting link + app link sent):
  25 qualified → 15 download app (60%)                             = 15

FROM SMS #3 (app link in final SMS):
  160 received → 8 click → 5 download (62% of clickers)           = 5

FROM EMAIL LINKS (app link in emails):
  27 total link clicks → 5 download (19%)                          = 5
                                                                   ────
TOTAL APP DOWNLOADS                                                = 25
```

## Optimistic Funnel (After 4 weeks of optimization)

```
Same 250 leads, but with optimized copy and timing:

                         CONSERVATIVE    OPTIMISTIC     IMPROVEMENT
────────────────────── ───────────── ──────────────── ─────────────
SMS Reply Rate              6.5%          10%            +54%
Email Open Rate             34%           42%            +24%
Call Answer Rate            40%           48%            +20%
Call Qualify Rate            40%           50%           +25%
Overall Qualified           25 (10%)      38 (15%)      +52%
Meetings Booked             15            25             +67%
App Downloads               25            35             +40%
Customers                    8            14             +75%
```

## Monthly Projections (Scaling)

| Month | Leads/Week | Total Leads | Qualified | Meetings | Downloads | Customers |
|-------|-----------|-------------|-----------|----------|-----------|-----------|
| Month 1 | 250 | 1,000 | 100 | 60 | 100 | 30 |
| Month 2 | 500 | 2,000 | 250 | 150 | 250 | 75 |
| Month 3 | 1,000 | 4,000 | 520 | 310 | 520 | 155 |
| Month 6 | 2,000 | 8,000 | 1,200 | 720 | 1,200 | 360 |

*Assumes improving conversion rates as copy/sequences are optimized*

## Revenue Model (If Applicable)

```
Assuming:
  - Average customer lifetime value (LTV): $500
  - Average revenue per app download: $100 (first 3 months)
  - Close rate from meeting to customer: 50%

Month 1:
  30 customers × $500 = $15,000 LTV
  100 downloads × $100 = $10,000
  System cost: ~$400
  ROI: 6,150%

Month 3:
  155 customers × $500 = $77,500 LTV
  520 downloads × $100 = $52,000
  System cost: ~$900
  ROI: 14,288%
```

## Key Metrics to Watch for Forecast Accuracy

```
After first 50 leads, check:

□ SMS delivery rate — should be >93%
  If lower: phone data quality issue, fix source

□ SMS reply rate — should be >5%
  If lower: copy needs work, or wrong audience

□ Email open rate — should be >30%
  If lower: subject lines, deliverability, or data quality

□ Call answer rate — should be >35%
  If lower: wrong numbers, bad timing, or number flagged

□ Opt-out rate — should be <5%
  If higher: messaging too aggressive, wrong audience

Adjust projections after first 50 leads based on actual data.
```
