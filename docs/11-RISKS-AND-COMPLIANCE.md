# 11. RISKS + COMPLIANCE SAFEGUARDS

## Compliance Framework

### SMS Compliance (TCPA + CTIA)

| Requirement | Implementation |
|-------------|---------------|
| **Opt-out in every message** | Every SMS ends with "Reply STOP to opt out" |
| **Immediate opt-out processing** | Webhook processes STOP within seconds, stops all SMS/calls |
| **Confirmation of opt-out** | Auto-reply: "You've been unsubscribed. Reply START to re-subscribe." |
| **Send window restrictions** | SMS only between 9am-8pm in recipient's timezone |
| **No weekend SMS** | Sequence scheduler excludes Sat/Sun for SMS |
| **10DLC Registration** | Register brand + campaign with carriers (required for A2P SMS) |
| **Content compliance** | No SHAFT content (Sex, Hate, Alcohol, Firearms, Tobacco) |
| **Message throughput** | Respect carrier rate limits (varies by registration) |
| **Consent basis** | Existing business relationship or prior expressed interest |

#### 10DLC Registration Steps (Required Before Scaling)
```
1. Register your Brand with The Campaign Registry (TCR)
   - Company name, EIN, website, contact info
   - Through Twilio's console → Messaging → Compliance

2. Register your Campaign
   - Use case: "Marketing" or "Mixed"
   - Sample messages (submit your actual SMS copy)
   - Estimated volume: match your daily caps

3. Wait for approval (3-15 business days)

4. Once approved:
   - Higher throughput limits
   - Better deliverability
   - Lower filtering risk

Cost: ~$4/month brand fee + $1.50/month per campaign
```

### Email Compliance (CAN-SPAM + GDPR-lite)

| Requirement | Implementation |
|-------------|---------------|
| **Physical address in email** | Footer includes business address |
| **Unsubscribe link** | Every email has one-click unsubscribe (SendGrid built-in) |
| **Process unsubs within 10 days** | Webhook processes immediately (same-day) |
| **Accurate "From" name** | Use real person name: "Nadeem from Breasy" |
| **Accurate subject line** | No deceptive subjects |
| **SPF/DKIM/DMARC** | Set up on sending domain before launch |
| **Bounce handling** | Remove hard bounces immediately |
| **Suppression list** | Maintain global unsubscribe list |

#### Email Domain Setup
```
1. Use a subdomain: mail.breasy.com or hello.breasy.com
   (Protects main domain reputation)

2. Add DNS records:
   SPF:   TXT "v=spf1 include:sendgrid.net ~all"
   DKIM:  CNAME (provided by SendGrid)
   DMARC: TXT "v=DMARC1; p=none; rua=mailto:dmarc@breasy.com"

3. Verify domain in SendGrid console

4. Warm up over 2-4 weeks (see Scaling Strategy)
```

### AI Call Compliance (TCPA + FTC)

| Requirement | Implementation |
|-------------|---------------|
| **Call window** | Calls only 10am-5pm recipient's local time |
| **No robocall to wireless** | Use conversational AI (not pre-recorded) |
| **Identify as AI when asked** | Script includes honest response to "are you a robot?" |
| **Respect DNC requests** | Verbal "don't call me" processed immediately |
| **Recording disclosure** | "This call may be recorded for quality purposes" at start |
| **One-ring compliance** | Let phone ring minimum 4 times before hanging up |
| **Call frequency** | Max 3 call attempts per lead |
| **Caller ID** | Show real, callable number (no spoofing) |

---

## Risk Matrix

### High Risk — Must Address Before Launch

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| **Carrier SMS filtering** | Messages not delivered, number blocked | High | 10DLC registration, number rotation, clean content, gradual ramp-up |
| **Twilio account suspension** | All SMS/calls stop | Medium | Follow Twilio AUP strictly, register 10DLC, keep opt-out rate <3% |
| **Email deliverability collapse** | Emails go to spam | Medium | Warm up domain, SPF/DKIM/DMARC, monitor reputation, clean list |
| **TCPA lawsuit** | $500-$1,500 per violation | Low | Strict opt-out processing, send windows, consent documentation |
| **Lead data quality** | Wasted sends, high bounce rate | High | Validate phone/email on import, dedup, remove invalids quickly |

### Medium Risk — Monitor Closely

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| **Bubble workflow limits** | Sequences delayed or skipped | Medium | Batch processing, upgrade plan, monitor WF usage |
| **Vapi/Retell downtime** | AI calls fail | Low | Fallback to SMS, retry logic, monitor status page |
| **HubSpot sync issues** | Duplicate leads, missing data | Medium | Robust dedup, error logging, manual reconciliation weekly |
| **AI call quality** | Bad conversations, brand damage | Medium | Test scripts weekly, review transcripts, refine prompts |
| **Rep response time too slow** | Qualified leads go cold | Medium | Escalation rules, SLA monitoring, auto-reassign |

### Low Risk — Track

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| **API cost overruns** | Budget exceeded | Low | Daily caps, cost tracking, alerts at 80% budget |
| **Data breach** | Legal/reputation damage | Very Low | Bubble security, no sensitive data in custom fields |
| **Competitor copies approach** | Reduced effectiveness | Low | Continuously optimize, build relationship equity |

---

## Safeguards Built Into the System

### 1. Automatic Kill Switches

```
IF opt-out rate > 5% in any 24-hour period:
  → PAUSE all SMS sends
  → Alert admin immediately
  → Require manual review before resuming

IF email bounce rate > 5% in any 24-hour period:
  → PAUSE all email sends
  → Alert admin
  → Review lead list quality

IF Twilio error rate > 10%:
  → PAUSE SMS sends
  → Check account status
  → Alert admin

IF daily spend exceeds $X threshold:
  → PAUSE all sends
  → Alert admin
```

### 2. Rate Limiting (Defense in Depth)

```
Layer 1: SystemSetting daily caps (SMS: 200, Email: 500, Calls: 75)
Layer 2: Per-number SMS cap (100-150 per number per day)
Layer 3: Per-lead contact limits:
  - Max 3 SMS per lead per week
  - Max 3 emails per lead per week
  - Max 3 call attempts per lead total
Layer 4: Batch size limit (50 per scheduler run)
Layer 5: Twilio/SendGrid built-in rate limits
```

### 3. Data Protection

```
- Phone numbers stored in E.164 format only
- No SSN, credit card, or sensitive PII stored
- API keys stored in Bubble's built-in secret manager
- Webhook endpoints use Bubble's built-in authentication
- Admin-only access to settings and bulk operations
- Audit trail: every action logged in Activity table
```

### 4. Quality Gates

```
Before ANY message is sent:
  ✓ Lead is not on suppression list
  ✓ Lead has not opted out of this channel
  ✓ Lead status is not "dead" or "dnc"
  ✓ Current time is within send window
  ✓ Current day is an active send day
  ✓ Daily limit for this channel has not been reached
  ✓ Lead has not been contacted on this channel today already
  ✓ Message content has been validated (no empty merge tags)

ANY check failure → Skip this send, log reason, move to next lead
```

### 5. Human Override Points

```
The system automates everything EXCEPT:
  - Responding to lead replies (human reviews)
  - Closing deals (human handles qualified leads)
  - Approving new sequences/copy (human writes/approves)
  - Resuming paused sequences (human decides)
  - Overriding DNC status (never automated — admin only)
  - Budget increases (human approves)
```

---

## Compliance Checklist — Pre-Launch

```
□ Twilio 10DLC brand registration submitted
□ Twilio 10DLC campaign registration submitted
□ SMS opt-out flow tested end-to-end
□ Email SPF/DKIM/DMARC configured and verified
□ Email unsubscribe flow tested
□ Sending domain warmed up (or warm-up plan in place)
□ Send windows verified for target timezone
□ AI call script reviewed for compliance language
□ Call recording disclosure confirmed in script
□ Privacy policy updated on website
□ Opt-out keywords list comprehensive (STOP, QUIT, etc.)
□ Suppression list initialized (if transferring from other tools)
□ Daily limits configured and tested
□ Kill switch thresholds set
□ Admin alerts configured (SMS + email to admin)
□ Audit trail (Activity log) verified
□ Webhook endpoints tested (Twilio, SendGrid, Vapi)
□ Error handling tested (what happens when API fails?)
□ Team trained on compliance requirements
```
