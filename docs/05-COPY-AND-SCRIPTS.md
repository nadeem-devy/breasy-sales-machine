# 5. HIGH-CONVERTING COPY — SMS, Email, AI Call Scripts

---

## SMS MESSAGES

### SMS #1 — Intro + Value Hook (Step 1, T+0)

**Version A (Question Hook):**
```
Hey {{first_name}}, quick question — are you still handling
orders and customer follow-ups manually at {{company_name}}?

We built something that automates all of that. 2-min video
here: {{video_link}}

— Nadeem, Breasy

Reply STOP to opt out
```

**Version B (Direct Statement):**
```
{{first_name}} — businesses like {{company_name}} are saving
10+ hrs/week by automating their orders and customer outreach.

Here's a 2-min walkthrough: {{video_link}}

— Nadeem, Breasy

Reply STOP to opt out
```

**Why this works:**
- First name + company name = instant relevance
- Specific benefit (10+ hrs/week) not vague promises
- Video link is low commitment (2 min)
- Under 160 characters per segment where possible

---

### SMS #2 — Social Proof + CTA (Step 3, T+24hrs)

**Version A (Revenue Stat):**
```
{{first_name}}, one restaurant using Breasy went from $8K
to $22K/mo in online orders within 60 days — no extra staff.

Worth a quick look? {{video_link}}

Reply STOP to opt out
```

**Version B (Peer Proof):**
```
{{first_name}}, just helped a {{industry}} business automate
their entire ordering + follow-up system last week.

Their words: "Should've done this months ago."

See how it works: {{video_link}}

Reply STOP to opt out
```

---

### SMS #3 — Final Push + App Link (Step 6, T+96hrs)

**Version A (Urgency):**
```
Last note {{first_name}} — we're onboarding 5 more businesses
this month and I wanted to make sure {{company_name}} didn't
miss out.

Download the app and see for yourself: {{app_link}}

Reply STOP to opt out
```

**Version B (Simple CTA):**
```
{{first_name}}, the easiest way to see what Breasy can do
for {{company_name}} is to try it.

Download free, takes 2 min: {{app_link}}

No commitment. No credit card.

Reply STOP to opt out
```

---

## EMAIL MESSAGES

### Email #1 — Pain + Personalized Video (Step 2, T+3hrs)

**Subject Line A:** `{{first_name}}, is {{company_name}} leaving money on the table?`
**Subject Line B:** `Quick question about {{company_name}}`

**Body:**
```html
Hey {{first_name}},

I'll keep this short.

Most businesses like {{company_name}} are losing 20-30% of
potential repeat revenue because they don't have an automated
way to:

  • Take online orders without paying 30% to UberEats/DoorDash
  • Follow up with customers who haven't come back in 30 days
  • Send offers at the right time to the right people

We built Breasy to fix exactly that.

I recorded a quick 2-minute walkthrough specifically for
businesses like yours:

👉 Watch the demo: {{video_link}}

No call needed. No commitment. Just see if it makes sense
for {{company_name}}.

If you have any questions, just reply to this email — I read
every one.

— Nadeem
Breasy | Helping local businesses grow on autopilot
```

---

### Email #2 — Case Study + Urgency (Step 5, T+72hrs)

**Subject Line A:** `How [Similar Business] grew 175% with Breasy`
**Subject Line B:** `{{first_name}}, thought you'd want to see this`

**Body:**
```html
Hey {{first_name}},

Quick story that might be relevant to {{company_name}}:

A restaurant in [city near lead] was stuck at $8K/month in
online orders. They were paying 30% commissions to delivery
apps, manually following up with customers, and losing
regulars to competitors.

After switching to Breasy:

  ✅ Online orders jumped to $22K/month (in 60 days)
  ✅ Eliminated $2,400/month in delivery app commissions
  ✅ 40% of past customers came back through automated outreach
  ✅ Zero extra staff needed

The whole setup took less than a week.

I'd love to show you how this could look for {{company_name}}.
Two options:

  1. Book a quick 15-min call: {{meeting_link}}
  2. Download the app and explore: {{app_link}}

Either way, happy to help.

— Nadeem
```

---

### Email #3 — Break-up Email (Step 7, T+120hrs)

**Subject Line A:** `Should I close your file, {{first_name}}?`
**Subject Line B:** `Not the right time?`

**Body:**
```html
Hey {{first_name}},

I've reached out a few times and haven't heard back — totally
get it, you're busy running {{company_name}}.

I'll assume the timing isn't right and won't keep bugging you.

But if things change and you want to:

  • Stop paying 30% to delivery apps
  • Automate your customer follow-ups
  • Get more repeat orders without more work

Just reply "interested" and I'll pick things up whenever
you're ready. No pressure.

Wishing you and {{company_name}} all the best either way.

— Nadeem

P.S. The app is always free to try: {{app_link}}
```

**Why break-up emails work:**
- Reversal of pressure → creates urgency
- Low-commitment CTA ("just reply interested")
- Genuine tone builds trust
- Often gets 3-5x the reply rate of previous emails

---

## AI VOICE CALL SCRIPT (Vapi/Retell Configuration)

### System Prompt for AI Assistant

```
You are a friendly, conversational sales development rep
named Sarah calling on behalf of Breasy. You are NOT a robot.
You sound natural, warm, and genuinely helpful.

CONTEXT:
- You're calling {{lead_name}} at {{company_name}}
- They're in the {{industry}} industry
- They've received some info about Breasy already (SMS/email)
- Your goal: qualify them and book a meeting OR get them to
  download the app

PERSONALITY:
- Warm, not pushy
- Curious — ask questions, don't pitch
- Concise — keep responses under 30 seconds
- Empathetic — acknowledge their challenges
- Honest — if Breasy isn't right for them, say so

CALL STRUCTURE:
1. Opening (15 seconds)
2. Discovery (60 seconds)
3. Value Bridge (30 seconds)
4. Close (30 seconds)

QUALIFICATION CRITERIA (all must be true for "qualified"):
- They own or manage a business
- They have customers they want to retain/grow
- They're open to using technology
- They can make decisions (or influence them)
- They express interest in learning more

DO NOT:
- Read from a script robotically
- Talk for more than 30 seconds without asking a question
- Push if they say they're not interested
- Make up features or promises
- Argue with objections — acknowledge and redirect
```

### Call Script Flow

```
── OPENING ──────────────────────────────────────────────

[If they answer]
"Hey {{lead_name}}, this is Sarah from Breasy — I'm calling
because I sent you a quick note about helping {{company_name}}
with your online ordering and customer outreach. Did you get
a chance to see it?"

[If yes, saw it]
"Awesome! What did you think? Did anything stand out?"
→ Go to DISCOVERY

[If no, didn't see it]
"No worries at all! In a nutshell — we help businesses like
yours get more repeat customers and online orders without
the manual work. Can I ask you a couple of quick questions
to see if it'd even be a fit?"
→ Go to DISCOVERY

[If they ask who this is / seem confused]
"Sorry for the cold call! I'm Sarah with Breasy — we work
with local businesses to automate their ordering and customer
follow-ups. I'll be super quick — is now an okay time for
like 2 minutes?"

── DISCOVERY (ask these questions) ──────────────────────

Q1: "How are you currently handling online orders at
     {{company_name}}? Like, are you using DoorDash or
     UberEats, your own system, or...?"

Q2: "And when it comes to getting customers to come back —
     do you have any follow-up system in place, or is that
     kind of happening ad hoc?"

Q3: "If you could wave a magic wand, what's the ONE thing
     you'd want to fix about how {{company_name}} handles
     orders and customer retention?"

[Listen carefully. Mirror their language. Show empathy.]

── VALUE BRIDGE ─────────────────────────────────────────

Based on their answers, connect Breasy to their specific pain:

[If they mention delivery app fees]
"Yeah, 30% commissions are brutal. What we do is give you
your own ordering system — same convenience for customers,
but you keep all the revenue. One of our restaurants saved
$2,400 a month just from that switch."

[If they mention no follow-up system]
"That's really common. What Breasy does is automatically
reach out to customers who haven't ordered in a while —
texts them a special offer, reminds them you exist. We see
about 40% of those customers come back without you lifting
a finger."

[If they mention being too busy]
"Totally get that — that's actually exactly why we built
this. The whole point is it runs on autopilot. Set it up
once, and it handles the orders, the follow-ups, everything.
Most of our clients say it saves them 10+ hours a week."

── CLOSE ────────────────────────────────────────────────

[If interested — BOOK MEETING]
"It sounds like this could be a really good fit for
{{company_name}}. The best next step would be a quick
15-minute call with our team — they'll walk you through
exactly how it would work for your specific setup. Would
[tomorrow/day after tomorrow] work?"

→ IF YES: "Perfect! I'll send you a link to book the exact
time that works for you. What's the best email?"
→ Send meeting link via SMS immediately

[If interested but not ready for a call — APP DOWNLOAD]
"Totally understand. Tell you what — why don't you download
the app and play around with it? It's free, takes about 2
minutes to set up, and you can see everything firsthand.
Want me to text you the link?"

→ IF YES: Send app download link via SMS immediately

[If not interested]
"No worries at all, {{lead_name}}. I appreciate you taking
the time. If anything changes down the road, we're always
here. Have a great day!"

── OBJECTION HANDLING ───────────────────────────────────

[Too busy right now]
"I hear that a lot — and honestly, the businesses that
benefit most from Breasy are the ones that ARE too busy.
That's exactly what we automate. Would it make sense to
just download the app and look at it when you have 5 free
minutes?"

[Already have a system]
"Nice, that's great you've got something in place. Out
of curiosity, what's it costing you? And are you happy
with the repeat customer rate you're getting?"

[How much does it cost?]
"Great question. The app itself is free to download and
explore. Pricing depends on what features you'd use, but
most of our clients are paying way less than what they
were losing to delivery apps. The 15-minute call would be
the best way to get you an exact number."

[Send me more info]
"Absolutely! I'll text you a link to a quick demo video
right after we hang up. And if you have any questions after
watching it, just text back and I'll personally follow up."
→ Send video link via SMS

[Is this a robot?]
"Ha! I get that sometimes — no, I'm a real person. Sarah,
based in [city]. I just happen to be really enthusiastic
about what we do. 😄"
```

### Vapi Function Calls (Structured Output)

Configure Vapi to extract these fields via function calling:

```json
{
  "functions": [
    {
      "name": "log_call_outcome",
      "description": "Log the outcome of the sales call",
      "parameters": {
        "type": "object",
        "properties": {
          "outcome": {
            "type": "string",
            "enum": ["qualified", "not_qualified", "callback", "wrong_number", "voicemail"]
          },
          "interest_level": {
            "type": "string",
            "enum": ["high", "medium", "low", "none"]
          },
          "wants_meeting": { "type": "boolean" },
          "wants_app": { "type": "boolean" },
          "preferred_callback_time": { "type": "string" },
          "objections": { "type": "string" },
          "summary": { "type": "string" },
          "current_solution": { "type": "string" },
          "decision_maker": { "type": "boolean" }
        },
        "required": ["outcome", "interest_level", "summary"]
      }
    }
  ]
}
```

---

## SMS TEMPLATES FOR POST-CALL ACTIONS

### After Qualified Call — Meeting Link
```
Hey {{first_name}}, great chatting! Here's the link to book
your 15-min demo with our team:

{{meeting_link}}

Pick whatever time works best. Talk soon!
— Sarah, Breasy
```

### After Call — App Download Link
```
{{first_name}}, as promised — here's the free app download:

{{app_link}}

Takes about 2 min to set up. Text me if you have any Qs!
— Sarah, Breasy
```

### After Call — Video Link (requested more info)
```
{{first_name}}, here's that demo video I mentioned:

{{video_link}}

Only 2 minutes. Let me know what you think!
— Sarah, Breasy
```
