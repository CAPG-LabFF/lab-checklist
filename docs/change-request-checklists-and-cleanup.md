# Change request — Sheet-driven checklists, plus two pending removals

> The app is live and in daily use by the lab. Same discipline as the presence rollout: branch, staging, deliberate go-live.
> Nothing in sections A and B has been implemented yet. Answer the Open Questions before writing any code.

---

## A. Remove email subscriptions

Remove the feature entirely:

- The email subscription box on Home and any per-area or all-areas selection UI.
- The `subscribe` and `unsubscribe` actions in `doGet` / `doPost`.
- The notification function and all `MailApp` calls.
- Any related copy in the UI.

**Do not delete the `Subscribers` sheet tab and do not delete the `notified` column on `Records`.** Stop writing to them and leave the existing data alone. This is an append-only system and deletion is irreversible.

**Manual step that code cannot do, so state it clearly in your summary:** the 5-minute time-based trigger lives in the Apps Script project, not in the repo. If the notification function is removed while the trigger still exists, the trigger fails every five minutes and Google sends failure notices to the account that owns it. The trigger has to be deleted by hand in the Apps Script editor (clock icon, then delete), signed in as the owning account.

## B. "Partially closed" becomes derived, not declared

Remove the **"Lab partially closed"** and **"Overnight reaction running"** toggles from every area, opening and closing alike.

New rule for **closing**:

- A closing submission is allowed with some items left unchecked.
- If any item is unchecked, the record is partially closed (`partial = true`) and the card turns **amber**, exactly as today.
- If every item is checked, `partial = false` and the card turns **red**.
- A comment is **mandatory** whenever any item is left unchecked. The helper text should ask specifically what was left undone and why.

### This inverts an existing rule, so do not miss it

The app currently **disables Submit until every item is checked**. That gate has to be removed for closing, or the new behaviour is unreachable. Check every place that enforces completeness before allowing submission.

### Derivation, not a new field

Keep the `partial` column on `Records`. Stop setting it from a toggle and compute it as "any item in this submission is unchecked". Historical rows keep their meaning, and the state machine, card colours and Records page need no change in how they read `partial`.

Compute it in both places: in the client for the UI, and again server-side in `Code.gs` when writing the row. Never trust the client's flag alone. Validate server-side that a partial closing carries a non-empty comment and reject it with a clear message if it does not.

Keep the `overnight` column for historical rows and stop writing to it. Do not delete it. See Open Question 2.

## C. Checklists editable from the Sheet (new)

Today the checklists live in `src/config/checklists.ts` and changing one needs a code change and a deploy. The lab wants to add or remove an item by editing the Sheet, with the app picking the change up on a fixed daily schedule rather than instantly.

This is the riskiest change in this document, because it moves safety-critical content out of version-controlled code and into a spreadsheet that people can edit. Build it accordingly.

### The editable tab

A new tab, `Checklists`, with one row per checklist item:

| Column | Notes |
|---|---|
| `id` | Filled in automatically by the script when blank. **Never edited by hand, never reused, never renumbered.** Historical records reference these. |
| `area` | `general`, `big_lab`, `small_lab_gc`, `bromo_lab`. Use a data validation dropdown so it cannot be typed wrong. |
| `procedure` | `opening` or `closing`. Dropdown as well. |
| `group` | The section heading, for example `Turn OFF Rotavaps`. |
| `label` | The item text the user sees. |
| `active` | `TRUE` / `FALSE`, optional. See Open Question 6. |

**Row order is display order.** People reorder items by dragging rows, which matches how they already think about the Sheet. Do not add a numeric order column.

Note that `group` was not mentioned in the request, but the existing checklists are organised into groups, so the tab needs it or that structure is lost.

### Publishing, not live reading

Do **not** have the app read the `Checklists` tab directly. A half-typed row would go live the moment someone paused mid-edit.

Instead: a **daily time-based trigger** reads `Checklists`, validates it, and writes an atomic snapshot to a separate published location (a `ChecklistsPublished` tab, or Script Properties as JSON). The app only ever reads the published snapshot. One edit session therefore goes live as one coherent version, at a predictable moment, identical for everyone.

### Validation before publishing (the part that matters most)

A typo in the Sheet must never be able to empty or corrupt a live safety checklist. Before publishing, validate that:

- every row has a valid `area` and `procedure`,
- every row has a non-empty `label`,
- every one of the eight `area` + `procedure` combinations has at least one item.

**If validation fails, do not publish.** Keep the previous snapshot in place and record the failure somewhere visible. A broken edit should mean "yesterday's checklist stays", never "today there is no checklist".

### Archive

Keep every published snapshot with its publication date. A deleted row is then still recoverable, and it stays possible to see what the checklist looked like on any given date. This is what makes row deletion safe.

### Client behaviour

- Fetch the published config and cache it in `localStorage` alongside its publication date.
- Refetch on load and on focus when the date has changed.
- If the fetch fails, fall back to the cached config.
- **Never render an empty checklist.** If no valid config is available from either source, show an error and block submission rather than let someone "complete" a closing with zero items.

### Protecting the tab

The lab's concern is accidental edits. Use **Data → Protect sheets and ranges** on the `Checklists` tab, restricted to named accounts. Everyone else can still view it. This is a Sheet setting rather than code, so include it in the go-live steps and in `HANDOVER.md`.

### History is unaffected

`items_json` already snapshots the checklist exactly as submitted, so editing the checklist never rewrites past records. Confirm this still holds after the change.

### Migration

Seed the `Checklists` tab from the current `src/config/checklists.ts`, then verify that the first published snapshot matches the current checklists **item for item** before pointing the app at it. A migration that silently drops an item from a safety checklist is the worst possible outcome here, so diff it explicitly rather than eyeballing it.

Decide and tell me what happens to `src/config/checklists.ts` afterwards: removed, or kept as the seed and documented as no longer authoritative.

## Open questions

Answer these before coding.

1. **Opening.** The partial concept only exists for closing. What should happen if items are left unchecked on an **opening**? Still require all items, allow it with a mandatory comment but no colour change, or something else? The state machine has no "partially open" colour, so this needs a decision rather than a guess.
2. **Overnight reactions, a regression to confirm.** Today the overnight toggle forces a comment, which guarantees an overnight reaction gets written down. After change B, someone with a reaction running can tick every item, including "All overnight reactions are registered", and submit with no comment at all. The structured signal disappears and nothing forces the detail to be recorded. Confirm this is understood and accepted, or propose keeping a comment mandatory whenever that specific item is present.
3. **Confirmation modal.** The current wording ends "...except for any item explicitly reported in the comments." Does that still work when items are visibly unchecked, or should it change?
4. **`Subscribers` data.** The tab will hold email addresses for a feature that no longer exists. Leave it, or archive and clear it by hand?
5. **Who may edit `Checklists`?** Names or accounts are needed for the sheet protection.
6. **Removing an item: delete the row, or set `active = FALSE`?** The request was row deletion. That works, and the snapshot archive keeps it recoverable, but `active = FALSE` is reversible in one cell and leaves the history visible in the tab itself. Which do they want?
7. **Publish hour.** The request says 00:00. Consider 03:00 instead, so that anyone working late is not handed a different checklist mid-session. The presence board already resets at 04:00, so the small hours are the established quiet window.

## Shipping order

**Ship this in two steps, not one.** A and B are subtractive and quick. C changes where safety-critical content lives and deserves its own rollout.

### Step 1: changes A and B

Frontend first, backend second. That is the reverse of the presence rollout, and deliberately so: that rule existed because the new frontend called endpoints that had to exist first. Nothing new is called here, the frontend only stops calling things and relaxes a gate. Removing backend endpoints first would break any still-cached old frontend.

1. Branch, then develop against the staging `/exec` via `.env.local`.
2. Validate: closing fully checked goes red with no comment required; closing with one item unchecked goes amber and blocks submission without a comment; the server rejects a partial closing with an empty comment even if the client is bypassed; the presence tab and opening flow are unaffected.
3. Merge to `main`, push, verify on a real phone.
4. Update `Code.gs` on the live project: paste, then **Manage deployments → edit existing → New version**. The `/exec` URL must not change.
5. Delete the email trigger by hand.
6. Confirm a real submission still writes correctly and no failure notices arrive.

### Step 2: change C

Backend first this time, because the frontend will be calling a new published-config endpoint that has to exist already.

1. Build and seed `Checklists` on staging, publish, and diff against the current config item for item.
2. Validate the failure paths explicitly: an invalid row does not publish, a fetch failure falls back to cache, an empty config blocks submission instead of allowing an empty closing.
3. Go live backend first, then frontend, then apply the sheet protection and create the daily trigger as the lab account.

**Rollback for both steps:** frontend via `git revert` and push, backend via Manage deployments and the previous version number.
