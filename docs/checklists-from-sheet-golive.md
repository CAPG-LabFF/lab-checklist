# Sheet-driven checklists — staging validation & go-live (Step 2 / section C)

The lab edits the **`Checklists`** tab. A daily trigger (00:00 Europe/Lisbon) validates it and appends
an atomic snapshot to **`ChecklistsPublished`**. The app reads **only** the snapshot (`route=config`),
so half-typed edits never go live, and a typo can never empty a live checklist.

Decisions baked in: edit access = **lab account only**; removing an item = **delete the row**
(recoverable from the snapshot archive); publish at **00:00**; `src/config/checklists.ts` kept as the
**non-authoritative seed**; no `active` column.

> **Backend first, then frontend** — the reverse of Step 1. The new frontend calls `route=config`,
> which must exist and already return a valid snapshot before the frontend goes live.

## A. Validate on a FRESH staging copy first

1. **File → Make a copy** of the *current live* Sheet → e.g. `Lab Checklist (STAGING C)`. Deploy its
   script as a Web app (Execute as: Me / Anyone) → put that `/exec` in `.env.local` as `VITE_EXEC_URL`.
2. Paste this branch's [`apps-script/Code.gs`](../apps-script/Code.gs) into the copy's script → Save.
3. Run **`setupChecklists()`** → confirm a `Checklists` tab (with `area`/`procedure` dropdowns) and a
   `ChecklistsPublished` tab appear. `Records` and `Presence` untouched.
   Also run **`setupReadmeTab()`** → creates a plain-language `README` tab explaining how to edit the
   checklists. Re-runnable any time to refresh it.
4. Generate the seed: `npm run seed:checklists` → **`checklists-seed.tsv`**. Paste it into the
   `Checklists` tab **starting at cell A2** (row 1 is the header). 75 rows.
5. Run **`publishChecklists()`** → it writes the first `ok` snapshot to `ChecklistsPublished`.
6. **Diff it — the critical migration check:** `npm run diff:config -- <staging /exec>` must print
   **PASS** (matches `checklists.ts` item-for-item). If it prints MISMATCH, fix the tab and republish;
   do **not** proceed.
7. Validate the failure paths explicitly:
   - Blank a `label` in a row → run `publishChecklists()` → returns `FAILED`, a FAILED row is logged,
     and `route=config` still returns the **previous** good snapshot (yesterday's checklist stays).
   - `npm run dev` against staging, then kill the network / use a bogus URL → app falls back to the
     cached config.
   - Point at a Sheet whose `ChecklistsPublished` has no `ok` row → app shows "Checklist configuration
     unavailable" and **disables recording** (never an empty checklist).
8. `npm run dev` against staging → edit a row, `publishChecklists()`, reload → the change appears.

Clear `.env.local` (or leave it; gitignored) when done.

## B. Go live — backend first

1. **Live script:** paste this branch's `Code.gs` → Save → **Deploy → Manage deployments → edit the
   existing deployment → New version**. `/exec` URL unchanged. (The old static-checklist frontend is
   still live and unaffected — it doesn't call `route=config`.)
2. Run **`setupChecklists()`** and **`setupReadmeTab()`** on the live Sheet.
3. Paste `checklists-seed.tsv` into the live `Checklists` tab at **A2**.
4. Run **`publishChecklists()`** on the live Sheet.
5. `npm run diff:config -- <live /exec>` → must print **PASS** before the frontend switches over.
6. **Protect the tab:** Data → Protect sheets and ranges → `Checklists` → restrict editing to the
   **lab account only**; everyone else view-only.
7. Run **`installChecklistsTrigger()`** (signed in as the lab account) → confirm the daily 00:00
   `publishChecklists` trigger under the clock icon.
8. **Then the frontend:** merge `feature/checklists-from-sheet` → `main` → push. The app now reads
   `route=config`. Verify on a phone: flows render; edit a test row + `publishChecklists()` (or wait
   for 00:00) + reload → the change appears.

## Rollback

- **Frontend first:** `git revert` the merge + push → back to the static-checklist frontend (which
  ignores `route=config`).
- **Backend (only if needed, and only after the frontend is reverted):** Manage deployments →
  previous version. Leave the `Checklists` / `ChecklistsPublished` tabs in place; the old code ignores
  them.

## Notes
- History is unaffected: `items_json` still snapshots each submission, so editing the checklist never
  rewrites past records.
- Deleting a row is safe — every published snapshot is archived with its date in `ChecklistsPublished`.
- New rows get an `id` filled in automatically on the next publish; **never edit or reuse ids**.
