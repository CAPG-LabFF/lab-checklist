# NMR — staging validation & go-live

Additive feature: new `nmr_*` routes/functions and new tabs (`NMRSchedule`,
`NMRSubmissions`, `NMRCompletions`, `NMROptions`, `NMROptionsPublished`). Nothing
existing is touched. **Backend first**, because the new frontend calls routes that
must already exist.

Decisions baked in: solvent seed incl. **CDCl3** + **toluene-d8** (lab reviews the
list in `NMROptions`); quantity in **mg**; withdraw = submitter `cancelled` event;
NMR completed view is named **Completed**; **schedule read live** (00:00 publish is
only for `NMROptions`); completion status enum `note | done | reopened | cancelled`.

## A. Validate on a FRESH staging copy first

1. **File → Make a copy** of the current live Sheet. Deploy its script as a Web app
   (Execute as: Me / Anyone) → put that `/exec` in `.env.local` as `VITE_EXEC_URL`.
2. Paste this branch's [`apps-script/Code.gs`](../apps-script/Code.gs) → Save.
3. Run **`setupNmr()`** → confirm the five NMR tabs appear (seeded solvents +
   experiments in `NMROptions`, a Mon–Fri skeleton in `NMRSchedule`); `Records`,
   `Presence`, `Checklists` untouched.
4. Run **`publishNmrOptions()`** → first options snapshot.
5. `npm run dev` against staging and validate:
   - both forms write correct rows; required-field validation blocks submission;
   - **server rejects an invalid solvent even when the client is bypassed**
     (`route=nmr_submit` with a bogus solvent → error);
   - completion moves a sample **queue → Completed**; a **double completion is
     rejected naming who** did it; a note-only event keeps it in the queue; a
     withdraw removes it;
   - the schedule renders day-by-day on a phone and as a grid on desktop, and a
     same-day edit to `NMRSchedule` shows on reload (it's read live);
   - the existing **checklist, presence and records** flows are unaffected.

Clear `.env.local` when done (it's gitignored).

## B. Go live — backend first

1. **Live script:** paste `Code.gs` → Save → **Deploy → Manage deployments → edit
   the existing deployment → New version**. `/exec` unchanged. (The old frontend is
   still live and ignores the `nmr_*` routes, so this is invisible to users.)
2. Run **`setupNmr()`** and **`publishNmrOptions()`** on the live Sheet.
3. Verify the routes respond (read-only): `…/exec?route=nmr_options` returns JSON,
   `…/exec?route=nmr_schedule` returns the grid.
4. **Then the frontend:** merge `feature/nmr` → `main` → push. Verify the NMR tab on
   a phone: submit a sample, see it in Submitted, mark it done, see it in Completed.
5. **Protect** `NMRSchedule` and `NMROptions` (Data → Protect sheets and ranges),
   restricted to the lab account — the same way as `Checklists`.
6. **As the lab account**, run **`installNmrOptionsTrigger()`** (daily 00:00 options
   publish). Triggers belong to their creator, so it must be the lab account.
7. Extend the Sheet `README` tab and `HANDOVER.md` to cover editing the schedule and
   the options lists.

## Rollback
- **Frontend:** `git revert` the merge + push → the NMR tab disappears; the `nmr_*`
  routes simply go unused.
- **Backend:** Manage deployments → previous version. Leave the NMR tabs in place;
  the old code ignores them.

## Notes
- `NMRSchedule` is read live — no snapshot, no trigger — so same-day roster changes
  appear immediately (on the next app open/focus).
- Submissions & completions are append-only; the queue/Completed views are derived
  at read time (no mutable "done" column).
