# Lab Opening & Closing Checklist — Claude Code project brief

> **How to use this file:** save it as `PROJECT.md` in an empty folder, open Claude Code there, and start with:
> *"Read PROJECT.md. Answer the Open Questions section back to me first, then propose a phased build plan. Do not start Phase 2 until Phase 1 works end-to-end on a real phone."*

---

## 1. What we are building

A mobile-first web app that lab users open by scanning a QR code posted in each lab. They record the **opening** or **closing** of a lab area by ticking a checklist, adding optional comments, and confirming. Every submission is timestamped and permanently logged.

This is a safety and traceability record. Speed matters: a routine submission should take **under 30 seconds** on a phone, one-handed, with gloves on.

## 2. Hard constraints

| Constraint | Requirement |
|---|---|
| Authentication | **None.** No accounts, no passwords. Users self-identify with initials only. |
| Cost | **€0/month forever.** No credit card anywhere in the stack. |
| Freshness | Opening the page must always show the **current true state**. |
| Devices | Phones first (iOS Safari + Android Chrome). Desktop should work but is secondary. |
| Data integrity | Records are **append-only**. No editing, no deleting from the UI. |
| Language | All user-facing text in **English**. |
| Timezone | Europe/Lisbon for all display. Store ISO 8601 with offset. |

## 3. Stack, hosting and ownership

### Ownership — read this first

**Nothing in this project may depend on one named person or on the institution's IT.** The original author is leaving the lab. Every account below must be a **dedicated, lab-owned account**, created for this system alone, with its credentials written into the lab's SOP folder or shared password manager — never a personal account, never an institutional one that an admin can revoke or lock down.

Two accounts, both free, both handed over as a unit:

1. **A dedicated Gmail account** (e.g. `xxxlab.checklist@gmail.com`). Owns the Sheet and the Apps Script. A consumer Google account is deliberate: it has no Workspace admin who can block anonymous Web App deployment, and it cannot be disabled when someone leaves the institution.
2. **A GitHub organisation** (free), registered to that same email. Owns the repository and publishes the site.

### Frontend

React + TypeScript + Vite + Tailwind CSS, built to a static bundle and published with **GitHub Pages**. Pages is the right host here specifically *because* of the handover: the hosting is the repository, so the code, the deployment and the documentation all live in one place a successor can find without asking anyone. No third account, no dashboard, nothing to renew.

<cite index="68-1">On the free plan the repository must be public</cite> — that is fine, and section 3's security note below explains why. Include a web manifest + icons for "Add to Home Screen".

### Backend

**Google Apps Script Web App** (`doGet` / `doPost`) writing to a **Google Sheet**, owned by the dedicated Gmail account.

### Why GitHub cannot also be the database

Writing records into the repository via the GitHub API would require a write token embedded in public JavaScript. Anyone could then rewrite or delete the entire history, which destroys the append-only guarantee this system exists to provide — and the token would eventually expire, leaving the app dead with nobody who knows why. GitHub hosts the code and the site; the Sheet holds the data.

### Security, stated honestly

There is no login, so the Apps Script `/exec` URL is reachable by anyone who finds it, and on a public repo it is findable. Hiding it behind a build-time secret would not help — it ends up in the published JavaScript either way. This is inherent to the "no login" requirement, and it is an acceptable trade for a lab log: records are append-only and attributed, so any nuisance entry is visible rather than destructive, and Google Sheets keeps its own revision history if anything ever needs restoring. **Do not** pretend otherwise in the README.

Why this combination: the frontend is a static site, so it loads in under a second — unlike an Apps Script–served page, which renders inside a sandboxed iframe and takes several seconds. The backend is a Sheet, so the data is permanently accessible, filterable and printable by anyone with the link, with no dashboard, no vendor account, no inactivity pause, and no expiry. Email notifications are a single `MailApp` call with no third-party service and no DNS setup.

**The trade-off, stated plainly:** there is no websocket push. The app fetches state on load, on tab focus, and by polling every ~30s while open. Two people are almost never on the page simultaneously, so this covers the real need — but it is not true real-time, and you should know that going in.

### Critical implementation details (do not rediscover these the hard way)

- **CORS on POST.** A browser `fetch` POST to an Apps Script Web App triggers a preflight that Apps Script cannot answer. Avoid it by sending the body as a JSON *string* with `Content-Type: 'text/plain;charset=utf-8'` and parsing it server-side with `JSON.parse(e.postData.contents)`. Also set `redirect: 'follow'` — Apps Script 302-redirects responses.
- **Concurrency.** Two people submitting at the same second can corrupt an append. Wrap every write in `LockService.getScriptLock()` with a timeout, and return a clear error if the lock cannot be acquired.
- **Deployment.** Deploy → New deployment → Web app → *Execute as: Me* → *Who has access: **Anyone***. After code changes, edit the **existing** deployment and set Version: New version — this keeps the `/exec` URL stable so the printed QR codes never need reprinting.
- **Swappable data layer.** Put every backend call behind one module, `src/api/backend.ts`, exposing `getState()`, `getRecords(area, cursor)`, `submit(record)`, `subscribe(email, areas)`. If Apps Script ever has to be replaced, only this file changes.
- **Perceived speed.** Cache the last known state in `localStorage` and render it instantly on load, with a subtle "refreshing" indicator, then reconcile with the server response. The user should never see an empty screen.
- **Vite base path.** A GitHub Pages project site is served from `https://<org>.github.io/<repo>/`, not from the domain root. Set `base: '/<repo>/'` in `vite.config.ts` or every asset 404s.
- **No SPA fallback.** GitHub Pages does not rewrite unknown paths to `index.html`. Use **hash routing**, or no router at all — this is a two-tab app and component state is enough.
- **Stable URL.** The QR codes are printed and physically posted in the labs. Renaming the repository or the organisation breaks every one of them. State this in the README in bold.

## 4. Data model

### Sheet `Records` (append-only)

| Column | Notes |
|---|---|
| `id` | UUID generated server-side |
| `timestamp` | ISO 8601, **generated server-side**. Never trust the phone's clock. |
| `area` | `general` \| `big_lab` \| `small_lab_gc` \| `bromo_lab` |
| `action` | `opening` \| `closing` |
| `partial` | TRUE/FALSE — only meaningful when `action = closing` |
| `overnight` | TRUE/FALSE — overnight reaction left running |
| `initials` | uppercase, 2–4 chars |
| `comment` | free text |
| `items_json` | snapshot of the checklist exactly as submitted |
| `flags_json` | e.g. `{"stale_open_from":"2026-08-18"}` |
| `notified` | TRUE/FALSE — used by the email trigger |

`items_json` stores the checklist **as it was at submission time**, so editing the checklist config later never rewrites history.

If `partial` or `overnight` is TRUE, `comment` must be non-empty — enforce in the UI **and** validate again server-side.

### Sheet `Subscribers`

`id`, `email`, `areas` (comma-separated area keys, or `all`), `token` (for unsubscribe), `created_at`, `active`.

## 5. State machine (the trickiest part — get it right)

Each area's state derives from its **most recent record**:

| Last record | State | Card colour | Buttons enabled |
|---|---|---|---|
| *(none)* | Unknown | Grey | Opening only |
| `opening` | Open | **Green** | Closing only |
| `closing`, `partial = FALSE` | Closed | **Red** | Opening only |
| `closing`, `partial = TRUE` | Partially closed | **Amber** | **Both** — *Closing* to finish the pending item, *Opening* for the next working day |

**Edge case — the lab was never closed.** If the state is `Open` but the last record is from an **earlier calendar day** (Europe/Lisbon), also enable *Opening* and show a warning banner:

> ⚠️ This lab was not closed on {date}. Last opened by {initials}.

If the user proceeds, write `flags_json: {"stale_open_from":"<date>"}` on the new record so the gap stays visible in Records.

Disabled buttons must state **why** (e.g. *"Already open — recorded by JS at 08:14"*), never be silently unclickable.

## 6. Screens

### Header (persistent)
Two tabs: **Home** | **Records**. Nothing else. No hamburger menu.

### Home

1. **Initials field**, pinned at the top. Required before any submission. 2–4 characters, auto-uppercased. Persist to `localStorage` so returning users never retype it, with a small "not you?" link to clear it.
2. **Four collapsible cards**, in this order: General, Big Lab, Small Lab / GC Room, Bromo Lab. Collapsed, each still shows: area name, state colour, state label, and a one-line summary — *"Closed 14h ago · JS"*.
3. **Expanded card:** `Opening` / `Closing` buttons (≥56px tall), enabled per the state machine, plus a collapsible **Last Record** panel (date, time, action, initials, partial/overnight badges, full comment).
4. **Checklist view.** Items are grouped under headers (see section 7). Render each group as a titled block with a `2/4` progress counter, and each item as a **full-width tappable row** — the whole row toggles, not a small checkbox. A running total at the top: *"9 / 14 checked"*.
   - **No "check all" button**, and no group-level tick. Each item is a physical action and gets its own tap. The longest list is 14 items; large rows make that roughly 15 seconds.
   - Submit stays disabled until every item is checked.
   - Below the list: a **Comments** textarea — *"Anything the next person needs to know?"*
   - On *Closing* only: a **"Lab partially closed"** toggle and an **"Overnight reaction running"** toggle. Either one makes the comment mandatory, with helper text explaining what to write.
   - A **Cancel** control returns to the card without saving.
5. **Confirmation modal** on submit, with a checkbox the user must tick, using this exact wording:
   > I confirm that I have personally checked the items above and that the lab is safe to leave unattended, except for any item explicitly reported in the comments.

   Then `Confirm` / `Cancel`. The timestamp is attached automatically on write — never shown as an editable field.
6. **After submit:** success toast, card collapses, colour and Last Record update immediately.
7. **Email subscription box** at the bottom: email field + a choice of *All areas* or specific areas, and a confirmation message on success.

### Records

The same four collapsible containers. Inside each, all submissions for that area, **newest first**:

- Row: date + time · action badge (green/red/amber) · initials · partial/overnight badges · first line of the comment.
- Tap a row to expand: full comment plus the checklist snapshot as submitted.
- Lazy-load in pages of ~30.
- A **date-range filter** and a **CSV export** per area.
- Read-only for everyone. No edit or delete controls anywhere.

## 7. Checklists — the real content

Put all of this in **one file**, `src/config/checklists.ts`, so items can be added, removed or reworded without touching any other code. Item `id`s are stable and never reused. Mirror the same config server-side (or have the server accept the client's snapshot and validate only the `id`s it knows).

```ts
export type Item  = { id: string; label: string };
export type Group = { title: string; items: Item[] };
export type Procedure = Group[];
```

### General — Opening
- **N2 Generator Room** — Turn ON the Air Compressor · Turn ON the Ventilation Fan · Turn ON the Cooler
- **Big Lab** — Open the Gas Valve taps

### General — Closing
- **N2 Generator Room** — Turn OFF the Air Compressor · Turn OFF the Ventilation Fan · Turn OFF the Cooler
- **Mass Room** — Check LC-MS is 0.01 mL/min and UV is OFF · Check spectrophotometer and fluorimeter are OFF · Check Ultrasounds is OFF
- **Big Lab** — Turn OFF the Gas Valve taps · Turn OFF the scales
- **Cluster** — Lock the Cluster
- **All other labs** — Confirm the other labs have been closed

### Big Lab — Opening
- **Air Conditioning** — Turn ON the AC and check it is not dripping
- **Turn ON Rotavaps** — Water Bath · Pumps · Rotavap · Water Tap / Chiller
- **Windows** — Pull up curtains
- **Fumehoods** — Raise exhaustion from 2 to 5

### Big Lab — Closing
- **Air Conditioning** — Turn OFF the AC and check it is not dripping
- **Turn OFF Rotavaps** — Water Bath · Pumps · Rotavap · Water Tap / Chiller
- **Windows** — Close windows · Roll down curtains
- **Fumehoods** — Reduce exhaustion from 5 to 2
- **Water / Gas Taps** — No temperature in reaction plates · All overnight reactions are registered
- **UV Lamp** — Check the UV Lamp is turned OFF
- **Distillation Systems** — Check water distillation · Check acetone distillation · Check big rotavap

### Small Lab / GC Room — Opening
- **Air Conditioning** — Turn ON the AC and check it is not dripping
- **Turn ON Rotavaps** — Water Bath · Pumps · Rotavap · Water Tap / Chiller
- **Windows** — Pull up curtains
- **Fumehoods** — Raise exhaustion from 2 to 5
- **GC Room** — Check AC is ON and not dripping

### Small Lab / GC Room — Closing
- **Air Conditioning** — Turn OFF the AC and check it is not dripping
- **Turn OFF Rotavaps** — Water Bath · Pumps · Rotavap · Water Tap / Chiller
- **Windows** — Close windows · Roll down curtains
- **Fumehoods** — Reduce exhaustion from 5 to 2
- **Water / Gas Taps** — No temperature in reaction plates · All overnight reactions are registered
- **GC Room** — Check AC is ON and not dripping *(see Open Question 1 — transcribed as given)* · Turn OFF computers and screens

### Bromo Lab — Opening
- **Air Conditioning** — Turn ON the AC and check it is not dripping
- **Turn ON Rotavaps** — Water Bath · Pumps · Rotavap · Water Tap / Chiller
- **Fumehoods** — Turn ON the exhaustion

### Bromo Lab — Closing
- **Air Conditioning** — Turn OFF the AC and check it is not dripping
- **Turn OFF Rotavaps** — Water Bath · Pumps · Rotavap · Water Tap / Chiller
- **UV Lamp** — Check the UV Lamp is turned OFF
- **Fumehoods** — Turn OFF the exhaustion
- **Water / Gas Taps** — No temperature in reaction plates · All overnight reactions are registered
- **Small Equipment** — Turn OFF the CombiFlash · Turn OFF the Ultrasounds

## 8. Email notifications

Included from the start, not deferred.

- On submission, the row is written with `notified = FALSE` and the response returns immediately — **the user never waits for an email to send**.
- A **time-based trigger every 5 minutes** picks up unnotified rows, sends via `MailApp.sendEmail()` to the matching subscribers, and flips the flag. This keeps email failures fully decoupled from submissions.
- Subject line: `[Lab] Big Lab closed by JS — 18:42`. Include partial/overnight status prominently and the full comment in the body.
- Every email carries a one-click unsubscribe link (`doGet` with the subscriber's `token`).
- Guard the quota: `MailApp.getRemainingDailyQuota()` before a batch. The limit is 100 recipients/day on a consumer Google account and 1,500/day on Workspace — far above expected volume, but log a warning if it runs low.

## 9. Poor-connectivity behaviour

Lab Wi-Fi is unreliable.

- Never show a success confirmation before the write is acknowledged by the server.
- If the write fails, show a clear **"Not saved — retry"** state with all entered data preserved.
- Retry with backoff on transient failures.

## 10. Build in phases

**Phase 1 — core loop.** Sheet + Apps Script backend (`doGet` state, `doPost` submit, LockService), the Home page, four cards, state machine, full checklists, comments, confirmation modal. Prove it end-to-end on a real phone.

**Phase 2 — Records + emails.** Records page with expansion, filters, CSV export; `Subscribers` sheet, subscription box, the 5-minute notification trigger, unsubscribe.

**Phase 3 — polish.** PWA manifest and icons, `localStorage` state cache, refetch on focus + 30s polling, `noindex` meta tag, offline/retry handling, empty and loading states, a script that generates the printable QR codes, and a README.

## 11. Acceptance criteria

- [ ] Opening a lab is visible on a **second device** within ~30s, or immediately on refresh.
- [ ] With a lab open, the Opening button is disabled and states why.
- [ ] A partial closing turns the card amber and leaves both buttons available.
- [ ] Submitting without initials, or with unchecked items, is impossible.
- [ ] Ticking "partially closed" or "overnight reaction" without a comment is impossible.
- [ ] A lab left open overnight triggers the warning banner the next morning and flags the record.
- [ ] Two simultaneous submissions both land, in order, with no lost or overwritten row.
- [ ] Records shows the exact checklist as submitted, even after `checklists.ts` is edited.
- [ ] Nothing in the UI can edit or delete an existing record.
- [ ] A subscriber receives an email within 5 minutes and can unsubscribe in one click.
- [ ] The whole flow completes in under 30 seconds on a phone.
- [ ] Total running cost: €0.

## 12. Open questions — answer these before coding

1. **GC Room, closing checklist.** It reads *"Check if AC is ON and not dripping"* — identical to the opening item. Is the GC Room AC deliberately left running overnight (plausible if instruments run unattended), or should this read *OFF*? Transcribed as given for now.
2. **Water / Gas Taps group.** The group is titled "Check water/gas taps" but neither sub-item actually checks a tap. Should there be an explicit *"Water and gas taps are closed"* item?
3. **How many email subscribers are expected?** A consumer Google account allows 100 email *recipients* per day. At roughly eight submissions a day, that binds at about twelve people subscribed to all areas. If more are expected, add a **daily digest** option alongside per-submission alerts, and default new subscribers to the digest.
4. **Sheet visibility.** Set the Sheet to "anyone with the link can view" so a successor can read the full history without needing the account password? Recommended — it makes the data survivable independently of the credentials.

## 13. What I want back from you

1. Answers or pushback on section 12 **before** any code.
2. A phased plan naming exactly what I must do manually (create the Sheet, deploy the Web App, connect the repo, set the QR URL).
3. A `README.md` written for someone comfortable with Apps Script but new to React — including where the Web App `/exec` URL is configured and how to redeploy without breaking the printed QR codes.
4. A **`HANDOVER.md`** in the repository root. This is the most important file in the project and it is written for a successor who has never spoken to the author. It must cover: which two accounts own the system and where their credentials are kept; how to open the Sheet and read the history; how to add, reword or remove a checklist item (edit one file, push, Pages redeploys); how to add or remove an email subscriber manually; how to redeploy the Apps Script without changing the `/exec` URL; what to do if the site or the emails stop working; and a note that the account should be signed into at least once a year so Google does not treat it as dormant.
