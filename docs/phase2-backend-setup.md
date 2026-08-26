# Phase 2 — Backend setup (Records already works; this enables emails)

> ⚠️ **RETIRED.** Email subscriptions were removed from the app. This document is kept only as a
> historical record of how the (now-deleted) notification feature was set up. The Records-page setup
> notes below still apply; the email/subscriber steps do not. See
> [partial-rework-golive.md](partial-rework-golive.md) for the removal.

The Records page reads through the **existing** deployment, so it works as soon as you push the
Phase 2 frontend. These steps only enable **email notifications + subscriptions**.

Do them in the account that owns the Sheet + Apps Script.

## 1. Update the code
- Sheet → **Extensions → Apps Script**.
- Replace the file contents with the current [`apps-script/Code.gs`](../apps-script/Code.gs) and **Save**.

## 2. Create the Subscribers tab
- In the editor, run function **`setupSubscribers`** → authorize if asked.
- A **Subscribers** tab appears (`id, email, areas, token, created_at, active`).

## 3. Schedule the 5-minute email job
- Run function **`installNotificationTrigger`** once → authorize if asked.
- Confirm under the clock icon (**Triggers**) that `sendPendingNotifications` is set to run every 5 min.
- Safe to run again — it removes any duplicate before creating one.

## 4. Redeploy (KEEP THE SAME /exec URL)
- **Deploy → Manage deployments → edit the existing deployment → Version: New version → Deploy.**
- Do **not** create a New deployment (that changes the `/exec` URL and breaks the QR codes).
- `EXEC_URL` in the app does not change.

## 5. Make the Sheet readable for the successor (Open Question 4)
- Sheet → **Share** → General access → **Anyone with the link → Viewer**.
- This lets a successor read the full history with only the link, no account password.
- Writes are unaffected (they only go through the locked Apps Script).

## Verify
1. On the site, scroll to **Email notifications**, subscribe your own email to **All areas**.
   - Check the **Subscribers** tab gets a row with `active = TRUE` and a `token`.
2. Record any opening/closing.
   - Within ~5 minutes you receive an email; the subject looks like
     `[Lab] Big Lab closed by JS — 18:42`, partial/overnight shown prominently, full comment in the body.
   - The record's `notified` cell flips to `TRUE` in the Records tab.
3. Click **Unsubscribe** in the email → friendly confirmation page, and the row's `active` flips to `FALSE`.

## Quota note
A consumer Google account allows **100 email recipients/day** (`MailApp`). The job checks
`getRemainingDailyQuota()` and defers (leaving `notified = FALSE` to retry) if it runs low, so a
quota crunch delays but never drops notifications. With < 10 subscribers you are far under the limit.

## Add / remove a subscriber by hand
- **Add:** append a row to Subscribers — `id` (any unique text), `email`, `areas` (`all` or
  comma-separated keys: `general,big_lab,small_lab_gc,bromo_lab`), `token` (any unique text),
  `created_at` (any date), `active` = `TRUE`.
- **Remove:** set that row's `active` to `FALSE` (keep the row for history), or delete the row.
