# Feature brief — NMR submission tab

> The app is live and in daily use. Same discipline as the presence and Sheet-driven checklist rollouts: branch, staging, backend first, deliberate go-live.
> Answer the Open Questions before writing any code.

---

## 1. Safety rules (unchanged)

- **Additive only.** Add new functions and new `action` branches to the existing routers. Do not modify any existing function, route, or sheet tab.
- Do not touch `Records`, `Presence`, `Checklists` or `ChecklistsPublished`.
- Do not change `base` in `vite.config.ts`, the repo name, or anything affecting the published URL.
- Never create a new Apps Script deployment. Updates go through **Manage deployments → edit existing → New version**.
- All work on a branch. `main` is what the lab is using right now.

## 2. What we are building

A fourth top-level tab, **NMR**, where lab members submit samples for NMR analysis and the people who run the instrument work through the queue. Five collapsible sections, same pattern as the Home cards.

This is a shared work queue, not a safety record. It is lower stakes than the checklists, but it has one property the rest of the app does not: **state changes after submission**. A sample moves from pending to done, and the operator adds notes to someone else's record. Section 5 covers how to do that without breaking the append-only model.

## 3. Identity

Reuse the **same initials** from `localStorage` that the rest of the app uses. No new identity system.

Initials are already unique by lab rule, so they are a safe key for "my samples".

## 4. Sheet tabs

Four new tabs. All new, none replacing anything.

### `NMRSchedule` — editable grid

Shaped like the paper timetable the lab already uses: one row per time slot, one column per weekday, each cell holding whoever is on the instrument. No colours.

```
              | Monday | Tuesday | Wednesday | Thursday | Friday
    08:30     | Inês/Tiago | Inês | Tiago    | Inês     | Inês
    11:30     | Vale   | Tiago   | Vale      | Tiago    | Vale
```

Adding a row adds a time slot. A blank cell means nobody is assigned. Keep the grid shape rather than flattening it to a list: it matches how the lab already reads this, and it is what they will edit.

### `NMRSubmissions` — append-only

| Column | Notes |
|---|---|
| `id` | UUID, server-side |
| `timestamp` | ISO 8601, server-side. Never trust the phone's clock. |
| `type` | `1h` or `long` |
| `initials` | uppercase |
| `lab` | `CA` or `PG` |
| `sample_name` | free text |
| `solvent` | one of the configured solvents |
| `experiments` | comma-separated, `long` only |
| `quantity` | `long` only. See Open Question 3 for the unit. |
| `mw` | molecular weight, `long` only |
| `notes` | submitter's observations |

### `NMRCompletions` — append-only

| Column | Notes |
|---|---|
| `id` | UUID |
| `timestamp` | server-side |
| `submission_id` | references `NMRSubmissions.id` |
| `operator` | initials of whoever ran it |
| `notes` | operator's notes back to the submitter |
| `status` | `done` or `reopened`. See section 5. |

### `NMROptions` — Sheet-editable lists

The solvent list and the experiment list go here, not in code. The lab has just built and validated a Sheet-driven config mechanism for the checklists; reuse it rather than hardcoding two more lists that will need a deploy to change. Same publish, validate and archive machinery, same protection, same daily trigger.

A lab changes its solvent stock. Being able to add one without a code change is exactly the problem that mechanism already solves.

## 5. Completion without breaking append-only

**Do not add a mutable "done" column to `NMRSubmissions`.** Ticking a checkbox appends a row to `NMRCompletions` instead.

The two views are then derived at read time:

- **Submitted** = submissions whose latest completion event is absent or `reopened`.
- **Records** = submissions whose latest completion event is `done`.

This keeps the whole system append-only, and it records who marked a sample done and when, which a boolean column would throw away. Unticking is an appended `reopened` event, not a deletion.

**Concurrency.** Two operators may be looking at the queue at once. Wrap writes in `LockService` like the existing routes. If a sample is already marked done, return a clear message naming who did it rather than silently writing a duplicate.

## 6. The five sections

### Schedule
Read-only display of the published `NMRSchedule`. See section 7 for the phone layout.

### Submission 1H
Initials (prefilled), lab (`CA` / `PG`), sample name, solvent, observations. Submit.

### Submission Long Experiments
The same, plus a multi-select for experiments (`1H`, `13C`, `COSY`, `HSQC`, `HMBC`, `NOESY`), quantity and molecular weight.

Both forms: validate required fields before allowing submission, show a success confirmation only after the write is acknowledged, and preserve the entered data if the write fails. Lab Wi-Fi is unreliable and retyping a form is worse than retyping initials.

### Submitted
The working queue, for whoever is running the instrument.

- **Oldest first.** This is a queue and fairness matters.
- Each row shows every field the submitter entered, plus how long it has been waiting.
- A checkbox marks it done.
- An operator notes field, which is how the operator tells the submitter that the shimming failed or the sample was too dilute.
- Clear visual distinction between 1H and long experiments.
- Empty state: "No samples waiting."

**Notes before done.** An operator will often want to leave a note without marking the sample complete, or leave a note as they complete it. Make sure both are possible, rather than notes only being reachable through the checkbox.

### Records
Completed samples, newest first, readable by everyone.

- Shows the original submission, who ran it, when, and the operator's notes.
- A filter or toggle for **"my samples"**, matched on initials. This is the thing a submitter actually opens the tab for.
- Paginated like the existing Records page.
- Read-only. No edit or delete controls.

## 7. Phone layout

The schedule is the hard part: five weekday columns will not fit a 375px screen as a table.

Default to a **day-by-day list on narrow screens** (today first, then the rest of the week), and render the full grid only where there is room. Do not ship a five-column table that has to be pinch-zoomed, and do not ship a horizontally scrolling table as the only option.

Everything else follows the existing patterns: large tap targets, collapsible sections, fetch on load and on focus.

## 8. API

Additive routes only:

- `doGet(route=nmr_schedule)` — the published schedule
- `doGet(route=nmr_queue)` — pending submissions
- `doGet(route=nmr_records)` — completed, paginated
- `doGet(route=nmr_options)` — solvents and experiment types
- `doPost(action=nmr_submit)` — a new submission, server-side timestamp, `LockService`
- `doPost(action=nmr_complete)` — appends a completion event

Validate server-side, never trusting the client: the solvent must be in the configured list, experiments must be from the configured set, `lab` must be `CA` or `PG`, required fields must be non-empty.

## 9. Open questions

1. **Solvent names.** The list as given reads `CDCI3`, which is almost certainly meant to be **CDCl3** (chloroform-d, lowercase L, not a capital i). Confirm before this goes into a dropdown that a chemistry lab will use for years.
2. **Toluene.** The list says `Toluene-d3`. The common NMR solvent is **toluene-d8**. Which does the lab actually stock?
3. **Quantity unit.** `quantity` for long experiments: milligrams? Confirm, and put the unit in the field label so nobody has to guess.
4. **Can a submitter withdraw a sample?** Someone submits, then realises the sample is wrong. Today there is no way to remove it from the queue and the operator wastes a slot. Options: a submitter-initiated cancel event, or the operator marks it done with a note. Which?
5. **Naming.** There is already a top-level `Records` tab for the checklists. A second section called `Records` inside NMR will be ambiguous in conversation and in the handover docs. Suggest `Completed` or `Results` for the NMR one.
6. **Schedule publishing.** Same daily 00:00 publish as the checklists, or should a schedule edit appear immediately? Consistency argues for the same mechanism and it is already built. But a schedule change is often same-day (someone is ill), and a roster showing the wrong person all day is a real annoyance. Consider publishing the schedule on a shorter cycle, or on demand.
7. **Anyone can mark anything done.** There is no login, so any user can tick any sample. That is inherent to the no-login design and is probably fine in a small lab where the completion event records who did it. Confirm the lab is comfortable with it.
8. **Retention.** `NMRSubmissions` will grow much faster than the checklist records. Is there an archiving expectation, or does it just grow?

## 10. Shipping

Build in two internal stages, one go-live.

**Stage 1:** the four tabs, the options config, the two submission forms, and the schedule display.
**Stage 2:** the queue, completion events, and the records view.

Then go live backend first, because the new frontend calls routes that must already exist:

1. Branch `feature/nmr`, develop against a fresh staging copy via `.env.local`.
2. Validate on staging: both forms write correct rows; completion moves a sample from queue to records; a double completion is rejected with a clear message; server-side validation rejects an invalid solvent even when the client is bypassed; the schedule renders correctly on a phone; the existing checklist, presence and records flows are untouched.
3. Paste `Code.gs` into production, run the setup functions, seed `NMROptions` and `NMRSchedule`, publish, verify the routes respond.
4. Merge to `main`, push, verify on a real phone.
5. Apply sheet protection to `NMRSchedule` and `NMROptions`, and create the schedule publish trigger.
6. Extend the Sheet `README` tab to cover editing the schedule and the options lists, and update `HANDOVER.md`.

**Rollback:** frontend via `git revert` and push, backend via Manage deployments and the previous version number.
