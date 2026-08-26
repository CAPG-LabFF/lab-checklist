# Remove email + derive "partially closed" — go-live

Two changes ship together:
1. **Email subscriptions removed** (subscription box, `subscribe`/`unsubscribe` routes, the notifier,
   all `MailApp` calls). The `Subscribers` tab and the Records `notified` column are **left in place,
   unused** — never deleted.
2. **"Partially closed" is derived**, not declared. The partial/overnight toggles are gone; a closing
   with any unchecked item is `partial = true` (amber). Comment is mandatory when anything is
   unchecked, and on any closing whose list carries "All overnight reactions are registered".

## Order: frontend first, backend second

The reverse of the presence rollout — and deliberately so. Nothing new is *called*; the frontend
only stops calling `subscribe`/`unsubscribe` and relaxes the completeness gate. So a cached old
frontend keeps working against the new backend, but a new frontend would break against an old backend
if we removed endpoints first.

1. Branch `feature/partial-rework`; develop against the **staging** `/exec` via `.env.local`. Validate:
   - closing with everything checked → red, no comment required
   - closing with one item unchecked → amber, comment required, submission blocked without one
   - a Big/Small/Bromo closing fully checked still requires a comment (overnight item present)
   - the server rejects a partial closing with an empty comment even if the client is bypassed
   - Records shows the unchecked items ("Not done") on an amber record
   - the **In Lab** tab and the **opening** flow are unaffected
2. Merge `feature/partial-rework` → `main`, push. Verify on a real phone.
3. **Delete the 5-minute email trigger by hand FIRST** — Apps Script editor → clock icon (Triggers)
   → delete `sendPendingNotifications`, signed in as the account that owns it.
   > Do this *before* step 4, not after. If the new `Code.gs` (which no longer contains
   > `sendPendingNotifications`) is deployed while the trigger still exists, the trigger fails every
   > five minutes and Google emails a failure notice to the owner. Deleting the trigger first closes
   > that window entirely.
4. Update `Code.gs` on the **live** project: paste, **Deploy → Manage deployments → edit existing →
   New version**. The `/exec` URL must not change.
5. Confirm a real submission still writes correctly (open/close a lab on a phone, check the row) and
   that **no failure emails** arrive over the next ~10 minutes.

## Rollback

- **Frontend:** `git revert` the merge and push → Pages rebuilds (~2 min).
- **Backend:** **Manage deployments → edit → previous version → Deploy.** `/exec` URL preserved.
- If rolled back to the emailing backend, the trigger will have been deleted — re-create it only if
  you actually want emails again (`installNotificationTrigger` no longer exists in the new code, so a
  rollback of `Code.gs` is required first).

## Data left behind (intentional)

- `Subscribers` tab: holds email addresses for the retired feature. Code never touches it. Archive +
  clear it by hand if you want data minimisation.
- Records `notified` column: still written as `FALSE` on every new row to preserve the column layout.
  Nothing reads it.
