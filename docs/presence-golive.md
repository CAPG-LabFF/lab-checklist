# Presence ("In Lab") — staging validation & go-live

This feature is **additive**: it adds a `Presence` sheet, new `route` branches, and new
functions, and it changes nothing in the existing checklist flow. Still, treat go-live as a
safety-critical change to a live system. Do it when the lab is empty (evening/weekend).

## A. Develop & validate against a STAGING copy (before touching live)

1. In the **live** Sheet: **File → Make a copy** → name it `Lab Checklist Records (STAGING)`.
   The bound Apps Script is copied with it.
2. In the copy's script editor, paste the current [`apps-script/Code.gs`](../apps-script/Code.gs), Save.
3. Run **`setupPresence()`** → confirm a `Presence` tab appears with the header
   `id | timestamp | date | initials | action`.
4. **Deploy → New deployment → Web app** → *Execute as: Me*, *Who has access: Anyone*.
   Copy that **staging** `/exec` URL.
5. Point the branch at staging **without committing the URL**: create `.env.local` (gitignored):
   ```
   VITE_EXEC_URL=https://…STAGING…/exec
   ```
   `npm run dev` (and `npm run dev -- --host` for a real phone on the same Wi-Fi) now talks to
   staging. Validate: check in/out, double check-in rejection, the board, the history, CSV, and a
   forgotten check-out (add an `in` row dated yesterday directly in the staging `Presence` sheet
   and confirm it drops off after 04:00 Lisbon — or temporarily set `PRESENCE_RESET_HOUR` low).

Delete `.env.local` (or leave it — it never commits) when done. A `main` build always uses the
committed production URL.

## B. Go-live on the LIVE project — backend first, then frontend

Order matters: the new frontend calls endpoints that must already exist.

1. In the **live** script editor, **paste** the validated `Code.gs` → **Save**.
   *(You must paste before step 2 — `setupPresence` does not exist until the code is saved.)*
2. Run **`setupPresence()`** → confirm the `Presence` tab appears and **`Records` is untouched**.
3. **Deploy → Manage deployments → edit the EXISTING deployment → Version: New version → Deploy.**
   The `/exec` URL must not change. **Never create a New deployment** (it mints a new URL and
   breaks every printed QR code).
4. Smoke-test the live backend without writing junk: open `…/exec?route=presence` in a browser →
   it must return `{"present":[]}`. Then load the existing checklist app on a phone and confirm the
   four cards + Last Record still work.
5. Only now merge the frontend: `git checkout main && git merge feature/presence && git push`.
   The Action rebuilds; the **In Lab** tab appears.
6. Verify the new tab end-to-end on a real phone (check in on one device, see it on another).

Between steps 3 and 5 the live app runs the new backend with the old frontend — safe, because the
backend changes are purely additive.

## C. Rollback

- **Frontend:** `git revert -m 1 <merge-commit>` and push → Pages rebuilds in ~2 min. The In Lab
  tab disappears; the new backend endpoints simply go unused (harmless).
- **Backend:** **Deploy → Manage deployments → edit → Version: (previous version number) → Deploy.**
  One step, `/exec` URL preserved. The `Presence` tab can stay; nothing else reads it.
