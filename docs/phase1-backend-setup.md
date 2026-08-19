# Phase 1 — Backend setup (do this to reach the real-phone gate)

You do these five steps once, in the **dedicated Gmail account** (for the test run, your own Gmail is fine — you'll repeat it later for the lab account). Nothing here costs money.

## 1. Create the Sheet
- Go to <https://sheets.google.com> → blank spreadsheet.
- Name it e.g. **Lab Checklist Records**.

## 2. Add the Apps Script
- In the Sheet: **Extensions → Apps Script**.
- Delete the sample `myFunction`, paste the entire contents of [`apps-script/Code.gs`](../apps-script/Code.gs).
- **Save** (disk icon).

## 3. Create the Records tab
- In the Apps Script editor, pick the function **`setupSheet`** in the toolbar dropdown → **Run**.
- First run asks for authorization → *Review permissions* → choose the account → *Advanced* → *Go to (project) → Allow*. (This is Google warning you it's an unverified personal script — expected.)
- Back in the Sheet, a **Records** tab appears with the header row frozen.

## 4. Deploy as a Web App
- Apps Script editor → **Deploy → New deployment**.
- Gear icon → **Web app**.
- **Execute as: Me**
- **Who has access: Anyone**  ← required; there is no login.
- **Deploy** → copy the **Web app URL** ending in `/exec`.

## 5. Wire the URL into the app
- Open [`src/api/backend.ts`](../src/api/backend.ts).
- Set the top line:
  ```ts
  export const EXEC_URL = 'https://script.google.com/macros/s/AKfy…/exec'
  ```
- Save. (With a real URL set, the app uses the real backend; the dev mock is bypassed.)

## Then: the Phase 1 gate
- Commit + push. The GitHub Action rebuilds and Pages serves the real app.
- On a **real phone**, open `https://hugogrilo13.github.io/lab-checklist/` and:
  - Record an opening → confirm the Sheet gets a row with a server timestamp.
  - Open the same URL on a **second device** → the new state shows within ~30s / on refresh.
  - Record a partial closing → card turns amber, both buttons stay available.
- When that passes, Phase 1 is done and we start Phase 2.

## Redeploying later (IMPORTANT — keeps the QR codes valid)
After any change to `Code.gs`:
**Deploy → Manage deployments → (pencil/edit the existing deployment) → Version: New version → Deploy.**
Never "New deployment" for updates — that mints a *new* `/exec` URL and breaks every printed QR code.
