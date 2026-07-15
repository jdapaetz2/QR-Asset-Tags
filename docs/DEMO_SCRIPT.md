# Demo Script — Mulemark

A repeatable, **timed in-person walkthrough** (~12–15 min) of the core loop on the
**Northridge Rentals** demo org. This is the canonical demo script; for narrative framing and
talking points see [`PILOT_CUSTOMER_DEMO.md`](PILOT_CUSTOMER_DEMO.md), and for account setup see
[`ONBOARDING_RUNBOOK.md`](ONBOARDING_RUNBOOK.md).

> **One-sentence positioning:** *"A permanent QR tag on every machine turns the equipment itself
> into the support channel — your renter scans it and gets the right instructions, manuals, and a
> way to report damage, and you get a clean record of every scan, submission, and return."*

> **Model reminder:** Mulemark (the platform admin) owns QR/tag production. The customer
> manages content and submissions; we produce the durable tags.

---

## Before the demo

**Reset (start clean):**
- Reset the demo org so the seeded data is fresh. On a **local** environment: `supabase db reset`
  (re-applies migrations + `supabase/seed.sql`). On the **remote/hosted** demo DB: run
  `supabase/seed.sql` in the Supabase SQL editor — it is idempotent and demo-org-scoped, so it
  re-adds any missing demo rows without touching other data. (Editing `seed.sql` does **not**
  auto-update a remote DB; the manual run is the mechanism.)
- Undo any quick-start text edits you made in a previous demo (or just re-seed).
- If you submitted a live damage report last time, archive it so the inbox starts believable.

**Pre-check these screens (open tabs, confirm they load):**
- `/t/demo-ex017` on the **phone** you'll scan with — confirm it renders with Northridge branding.
- `/dashboard` (customer admin) — the **operations briefing**: nameplate band, the "N things need your
  attention" headline, the four BandStats, and the needs-attention queue. The **New submissions**
  BandStat and the nav **Submissions** badge should reflect the seeded new reports.
- `/dashboard/submissions` — inbox shows the seeded submissions, including a **resolved** damage thread
  on Excavator 017.
- `/dashboard/assets/{excavatorId}/timeline` — the Excavator's history has entries.
- `/dashboard/analytics` — ~60 days of scan activity is populated.
- `/owner/production` and `/owner/analytics` (platform admin) — load and show the demo assets.
- Two logins ready: platform admin and the Northridge customer admin.

**What to say before the scan (set the frame, 20 sec):** *"I'm going to do exactly what one of
your renters would do — pull out my phone and scan the tag on a machine. No app, no login. Watch
what they see."*

---

## The walkthrough (11 beats)

Each beat: **what to do → what to say → what the prospect should notice → [pause?]**

### 1. Scan the tag on a phone (`/t/demo-ex017`)
- **Do:** Scan the printed demo tag (or open the URL) on your phone, held up so they can see it.
- **Say:** "This tag is permanent and glued to the machine. It always lands here."
- **Notice:** Instant mobile page, the renter's brand (not ours), no login wall.
- **⏸ Pause** — let them read the screen for a beat. This is the emotional hook.

### 2. The renter page
- **Do:** Scroll the equipment page: quick start, safety, fuel/power, return notes, troubleshooting,
  support contact, and the action buttons.
- **Say:** "Everything a renter asks your counter by phone is already here — on the machine."
- **Notice:** It's genuinely useful content, not a marketing page; support number is one tap.

### 3. Submit a damage report with a photo (`/forms/demo-ex017/damage`)
- **Do:** Tap **Report Damage**, add a name + phone, a one-line description, urgency, and **attach a
  real photo** with the phone camera. Submit; show the confirmation + reference number.
- **Say:** "The machine is prefilled and locked — they can't misreport which unit. And they never
  see anyone else's reports."
- **Notice:** Photo capture works on a phone; the asset is fixed; a reference number comes back.
- **⏸ Pause** — "That report is now on your side. Let me switch hats to the office."

### 4. The dashboard briefing (`/dashboard`)
- **Do:** Log in as the customer admin. You land on the **operations briefing** — an iron nameplate
  band reading **"Northridge Rentals · Operations briefing"** with today's date, then the headline
  **"Good morning, [name]. N things need your attention."** (on a clean day it reads **"All clear,
  [name]."** with a green dot).
- **Say:** "This is the morning view. It tells you what needs you today, before you go looking for it."
- **Notice:**
  - the four **at-a-glance stats** in the band — **New submissions** (amber when there are any),
    **Scans · 7d** with a small sparkline, **Rented**, and **Assets ready** — each one clicks through to
    the matching filtered list;
  - the **needs-attention queue** below, with the top item already expanded: the machine's tag chip, an
    amber reason ("N open submissions" / "Open damage on a rented asset"), the quoted report with its
    photo, and quick actions.
- **Do:** From the expanded card, click **Open in submissions** (the single full-detail path) to jump
  straight to that machine's reports — or hit **Mark reviewed** first to clear it off the list.
- **⏸ Pause** — "Notice I never went looking for that damage report. The dashboard surfaced it."

### 5. The submission inbox (`/dashboard/submissions`)
- **Do:** From the briefing, land in the inbox. Point out the report you just filed sitting at the top
  alongside the seeded ones.
- **Say:** "This is your queue. New reports land here with the photo and contact info."
- **Notice:** Real-looking volume across machines; statuses (new / reviewed / resolved); filters.

### 6. Triage the report (`/dashboard/submissions/{id}`)
- **Do:** Open the report, view the photo, move status **new → reviewed → resolved**.
- **Say:** "Two clicks to work a report. Export to CSV any time." (Mention Unresolved filter.)
- **Notice:** It's a real workflow, not a black hole; the resolved seeded thread shows a closed loop.

### 7. Asset history / timeline (`/dashboard/assets/{excavatorId}/timeline`)
- **Do:** Open Excavator 017's timeline — scans, submissions, and its resolved damage history.
- **Say:** "Every machine builds a history: what happened, when, and how it was resolved."
- **Notice:** This unit has a **track record** — the deferred-maintenance conversation writes itself.
- **⏸ Pause** — this is the "condition history" value; let it land.

### 8. Analytics (`/dashboard/analytics`)
- **Do:** Show ~60 days of scan and submission counts.
- **Say:** "Scans are unlimited — you're never billed per scan. This just shows you engagement."
- **Notice:** Weekday-weighted, believable activity; not vanity round numbers.

### 9. Tag request / production (`/owner/production`, and the tag request queue)
- **Do:** Switch to the platform admin. Show a tag request in production and the production outputs:
  per-asset **QR SVG**, the **SVG sheet**, the **CSV** (`asset_code, asset_name, short_url,
  organization_name`), and the printable **production sheet** (size, material, mounting, code, URL).
- **Say:** "You don't design or print anything. You request tags; we produce durable metal tags and
  ship them ready to mount."
- **Notice:** The tag pipeline is real and owned by us — low effort for them.

### 10. Plan / covered-asset model (if asked)
- **Say:** "Pricing is per **covered asset** — an active machine with a tag assigned. Scans are
  unlimited, archived machines don't count, and disabling a tag doesn't dodge the count. No per-scan
  billing, no surprises." (Plan & covered-usage detail lives on **Settings** — `/dashboard/settings`.)
- **Notice:** Simple, predictable, aligned to their fleet size — not usage-metered.

### 11. Exports & domain trust (if asked)
- **Say:** "Your data is yours — assets, QR mapping, documents, and submissions all export to CSV
  when we enable it for you. And the tags encode a permanent domain we control for durability, so the
  same physical tag keeps working even as the content behind it changes."
- **Notice:** No lock-in anxiety; the permanence question has a real answer (see beat below on
  "what if you disappear").

---

## Objection handling (short answers)

- **"We already have rental software."** — "Great — keep it. This isn't a rental/booking system. It's
  the layer your *renter* touches on the machine: instructions, manuals, damage/return reports. It
  sits alongside what you have and feeds you a clean record; it doesn't replace your back office."
- **"Our customers won't scan."** — "Contractors already scan for parts and manuals. The tag is right
  where they hit a problem, and it beats calling your counter. And even if a renter never scans, *your
  staff* scan at return to log condition — the value doesn't depend on 100% renter adoption." (Then
  confirm their renter mix in discovery — see `OPEN_QUESTIONS.md`.)
- **"What if your company disappears?"** — "Fair. The tags encode a permanent URL, your content and
  submissions export to CSV, and nothing is locked in a proprietary format. The equipment info is
  yours to take. We also keep the QR domain stable specifically so printed tags don't break."
- **"Why not just use a normal QR code to a PDF/website?"** — "A static QR is frozen — change anything
  and you reprint every tag. Ours points at a permanent link you edit live: update the manual, the
  support number, publish/unpublish — same tag. Plus you get the report-back loop, the history, and
  the analytics a plain link can't give you."
- **"What if the page loads slowly during the demo?"** — see fallback below.

---

## Slow-network fallback

If the venue's mobile signal is weak during the live scan:

1. **Acknowledge it plainly** — "Looks like the signal in here is rough; let me show you why that
   still works in the field."
2. **Explain the lightweight page** — the public scan page is deliberately minimal (no app, no heavy
   assets, zero webfonts) so it loads on weak signal far better than a typical site.
3. **Show a cached / screenshot backup** — keep the `/t/demo-ex017` tab **already loaded** before the
   call, or have a screenshot/screen-recording of the renter page ready; switch to it and keep the
   story moving.
4. **Continue to the admin flow** — the dashboard briefing, inbox, triage, timeline, and analytics all
   run on your laptop; pivot there and finish the loop without depending on the room's cell coverage.

> Offline operation is a deliberate deferral (`ROADMAP_DEFERRED.md` #1). Before pitching any
> "works anywhere" story, confirm the prospect's yards/delivery radius actually have coverage
> (discovery check in `OPEN_QUESTIONS.md`).

---

## Reset between demos

Re-seed or archive the demo submissions so each demo starts clean, and revert any quick-start text
edits made during the walkthrough (see **Before the demo → Reset**).
