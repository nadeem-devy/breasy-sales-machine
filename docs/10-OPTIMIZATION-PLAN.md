# 10. DAILY / WEEKLY OPTIMIZATION PLAN

## Daily Checklist (15 min/day)

### Morning (9:00 AM)

```
□ 1. Check Dashboard Overview
     - How many leads entered sequence yesterday?
     - Any errors (failed sends, bounced emails)?
     - Any qualified leads waiting for follow-up?

□ 2. Review Hot Leads
     - Open "Hot Leads" tab
     - Ensure AI calls are scheduled for all hot leads
     - Check if any hot leads replied overnight

□ 3. Review Qualified Leads
     - Check if all qualified leads have been contacted by reps
     - Reassign any that fell through the cracks
     - Follow up on meetings booked (confirmed?)

□ 4. Check Compliance
     - Review opt-out count (should be < 3% of sends)
     - Check for any bounce spikes (email list quality)
     - Verify send windows are being respected

□ 5. Green-Light Today's Sends
     - Confirm daily limits are set correctly
     - Check Twilio/SendGrid balance
     - Verify Vapi credits are sufficient
```

### Evening (5:00 PM)

```
□ 1. Check Day's Performance
     - SMS sent vs. replies
     - Emails sent vs. opens/clicks
     - Calls made vs. answered/qualified
     - Any new qualified leads or app downloads?

□ 2. Handle Replies
     - Respond to any unanswered lead replies
     - Resume paused sequences where appropriate
     - Update notes on leads with manual interactions

□ 3. Queue Tomorrow
     - Verify next day's batch is scheduled
     - Import new leads if pipeline is thin
```

## Weekly Review (Friday, 30 min)

### Performance Review

```
□ 1. Pull Weekly Numbers

  METRIC               THIS WEEK    LAST WEEK    CHANGE
  ─────────────────── ──────────── ──────────── ────────
  Leads imported          []           []         []
  SMS sent                []           []         []
  SMS reply rate          []%          []%        []
  Email open rate         []%          []%        []
  Email click rate        []%          []%        []
  Calls made              []           []         []
  Call answer rate        []%          []%        []
  Call qualify rate       []%          []%        []
  Leads qualified         []           []         []
  Meetings booked         []           []         []
  App downloads           []           []         []
  Opt-out rate            []%          []%        []

□ 2. A/B Test Review
  - Check which SMS/email variants are winning
  - Promote winners, create new challengers
  - Need minimum 100 sends per variant to declare winner

□ 3. Sequence Performance
  - Which step has highest drop-off?
  - Which step drives most replies?
  - Should we adjust delays?
  - Should we add/remove a step?

□ 4. Lead Source Quality
  - HubSpot leads: qualify rate vs. scraped leads
  - Which campaign is performing best?
  - Double down on best source, reduce worst
```

### Optimization Actions

```
□ 5. Copy Optimization
  - Rewrite worst-performing SMS (lowest reply rate)
  - Test new email subject line
  - Update AI call script based on common objections
  - Review call transcripts for patterns

□ 6. Timing Optimization
  - Check which send hours get best engagement
  - Adjust send windows if needed
  - Check which day of week performs best

□ 7. Lead Quality
  - Review dead/DNC leads — what went wrong?
  - Are we importing bad data? Tighten filters.
  - Score distribution: too many cold? Adjust scoring weights.

□ 8. Pipeline Health
  - How many leads are stuck in "active" with no engagement?
  - Move stale leads to nurture after 2 weeks
  - Clean up dead leads older than 30 days
```

## Monthly Review (First Monday, 1 hour)

```
□ 1. Full Funnel Analysis
  - Calculate true cost per qualified lead
  - Calculate true cost per customer
  - Compare to previous month

□ 2. Scoring Model Audit
  - Are qualified leads actually converting to customers?
  - If not: adjust scoring weights
  - If yes at low rate: tighten qualification criteria

□ 3. Channel ROI
  - Which channel drives most qualified leads per dollar?
  - SMS ROI vs. Email ROI vs. AI Call ROI
  - Shift budget to highest-performing channel

□ 4. Scaling Decision
  - Are we hitting daily limits? → Time to scale up
  - Is quality dropping as volume increases? → Slow down
  - Do we need more Twilio numbers? More Vapi capacity?

□ 5. Compliance Audit
  - Opt-out rate trend
  - Carrier filtering issues?
  - Email deliverability score
  - Any complaints received?

□ 6. System Health
  - Bubble WF errors in log?
  - API failures?
  - Webhook reliability?
  - Database growing too large? (Optimize queries)
```

## Optimization Playbook — What to Do When...

### SMS Reply Rate < 5%
```
1. Review message copy — is it too salesy?
2. Check delivery rate — are messages being filtered?
3. Test different opening lines (question vs. statement)
4. Shorten message length (under 160 chars)
5. Test different send times (try 10am, 1pm, 5pm)
6. Check if phone numbers are being flagged (rotate numbers)
7. Make CTA clearer and lower-commitment
```

### Email Open Rate < 30%
```
1. Test new subject lines (shorter, curiosity-driven)
2. Check spam score (use mail-tester.com)
3. Remove invalid emails (reduce bounce rate)
4. Warm up sending domain if new
5. Try different send times (Tue-Thu 10am tend to be best)
6. Use first name in subject line
7. Check "from" name (use personal name, not company)
```

### AI Call Answer Rate < 30%
```
1. Call at different times (try 10:30am and 2pm)
2. Send pre-call SMS: "Quick heads up — I'll be giving you
   a call in about 10 min about [topic]"
3. Use local area code number for calling
4. If 3 no-answers → stop calling, continue SMS/email only
5. Try calling on different days
```

### Opt-Out Rate > 5%
```
🚨 IMMEDIATE ACTION NEEDED:
1. STOP all sends — investigate immediately
2. Review recent messages for compliance issues
3. Check that send windows are correct
4. Reduce send frequency (increase delays)
5. Soften message tone
6. Ensure opt-out instructions are clear in every message
7. Review lead source quality (are we messaging wrong audience?)
```

### Qualified Leads Not Converting to Meetings
```
1. Review qualification criteria — too loose?
2. Check meeting link flow (is it working?)
3. Call qualified leads within 5 min of qualification
4. Add automated meeting reminders
5. Offer more flexible scheduling options
6. Reduce friction — "Pick any time" not "Is Thursday good?"
```

## Benchmarks to Target

| Metric | Week 1 | Week 4 | Week 8+ |
|--------|--------|--------|---------|
| SMS Reply Rate | 5% | 7% | 10%+ |
| Email Open Rate | 30% | 40% | 45%+ |
| Email Click Rate | 8% | 12% | 15%+ |
| Call Answer Rate | 30% | 40% | 45%+ |
| Call Qualify Rate | 30% | 40% | 50%+ |
| Overall Qualify Rate | 7% | 10% | 15%+ |
| Meeting Book Rate | 40% | 60% | 70%+ |
| Opt-Out Rate | <5% | <3% | <2% |
