# Lab Opening & Closing Checklist

A mobile-first web app for recording the **opening** and **closing** of lab areas. Users scan a QR
code posted in the lab, tick a checklist, add optional comments, and confirm. Every submission is
timestamped server-side and permanently logged to a Google Sheet.

- **No login.** Users self-identify with initials only.
- **€0/month.** Static site on GitHub Pages + Google Apps Script + a Google Sheet. No paid service.
- **Append-only.** Records can never be edited or deleted from the UI.

> ⚠️ **The site URL is printed on QR codes physically posted in the labs. Never rename the GitHub
> repository or the organisation — it changes the URL and breaks every printed code.** The repo name
> is baked into `vite.config.ts` (`base`) and the manifest.

New here? Read **[HANDOVER.md](HANDOVER.md)** first — it explains ownership, credentials, and the
day-to-day tasks (change a checklist item, fix a broken deploy).

---

## Architecture (and why)

| Layer | Tech | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind, static bundle | Loads in under a second; hosted **in the repo** via GitHub Pages, so code + deploy + docs live in one place a successor can find. |
| Backend | Google Apps Script Web App (`doGet`/`doPost`) | Free, no server, writes to a Sheet with `LockService` for safe concurrent appends. |
| Database | Google Sheet | Permanently readable/filterable/printable by anyone with the link. No dashboard, no vendor account, no expiry. |

**Security, stated honestly:** there is no login, so the Apps Script `/exec` URL is reachable by
anyone who finds it, and on a public repo it is findable. This is inherent to the "no login"
requirement and is an acceptable trade for a lab log: records are append-only and attributed, so any
nuisance entry is visible rather than destructive, and Google Sheets keeps its own revision history.

**No real-time push.** The app fetches state on load, on tab focus, and by polling every ~30s. Two
people are almost never on the page at once, so this covers the real need — but it is not true
real-time.

---

## Project layout

```
src/
  api/backend.ts        The ONLY file that talks to the server. EXEC_URL lives at the top.
  config/checklists.ts  THE ONE FILE to edit checklist items. Stable ids; labels are free to reword.
  components/           Home, AreaCard, ChecklistFlow, Records, SubscriptionBox, …
  hooks/                useInitials (localStorage), useAreaStates (cache + polling)
  lib/                  time (Europe/Lisbon), stateMachine, csv
apps-script/Code.gs     Paste this into the Sheet's Apps Script editor. The backend.
scripts/                generate-icons.mjs, generate-qr.mjs (run manually; see below)
docs/                   Backend setup + go-live/rollback notes (phase2 email doc is retired)
.github/workflows/      deploy.yml — builds and publishes to Pages on push to main
```

## Where the `/exec` URL is configured

One place only: the top of [`src/api/backend.ts`](src/api/backend.ts):

```ts
export const EXEC_URL = 'https://script.google.com/macros/s/AKfy…/exec'
```

This is the single value that differs between the test account and the lab account. Everything else
(including the printed QR path) stays the same.

---

## Local development

Requires Node 20+.

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173/lab-checklist/`. If `EXEC_URL` is **empty**, dev uses an
in-memory mock so you can click the whole UI without a backend. With a real `EXEC_URL` set, dev talks
to the live Sheet.

Type-check + production build:

```bash
npm run build
```

## Deployment (automatic)

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes `dist/` to
GitHub Pages. **One-time repo setting:** Settings → Pages → Source → **GitHub Actions** (not "Deploy
from a branch" — that serves the raw, un-built source and shows a blank page).

Note: GitHub caches `index.html` for ~10 minutes, so a fresh deploy can look unchanged briefly before
it points at the new assets. It self-heals.

### Rollback

- **Frontend (the published site):** revert the offending commit and push — Pages rebuilds in ~2 min.
  For a merged feature, `git revert -m 1 <merge-commit>`.
- **Backend (Apps Script):** **Deploy → Manage deployments → edit the existing deployment →
  Version: (previous version number) → Deploy.** One step, and the `/exec` URL is preserved so the
  QR codes keep working. Never roll back by creating a New deployment.

## Backend (Apps Script) — first-time setup and redeploys

Full steps are in [docs/phase1-backend-setup.md](docs/phase1-backend-setup.md) (core). (The Phase 2
email doc is retired — email subscriptions were removed.) The rule that matters most:

> **To update the backend, edit the EXISTING deployment → Version: New version.**
> Never create a *New deployment* — that mints a new `/exec` URL and breaks every printed QR code.

## Regenerating icons and QR codes

```bash
npm run icons                                        # PWA icons in public/
npm run qr                                           # QR sheet in qr/print.html (live URL)
npm run qr -- https://capg-labff.github.io/lab-checklist/   # or pass an explicit URL
```

`npm run qr` writes `qr/print.html` — open it and print (4 cards, one per lab). With no argument it
uses the live URL (`https://capg-labff.github.io/lab-checklist/`); pass an explicit URL to override.

## Editing the checklists

Checklists are edited in the Google Sheet's **`Checklists`** tab (not in code). A daily 00:00
Europe/Lisbon trigger validates the tab and publishes an atomic snapshot to `ChecklistsPublished`; the
app reads only that snapshot via `route=config`, caches it, and never renders an empty checklist. See
**HANDOVER.md** for the day-to-day steps and [docs/checklists-from-sheet-golive.md](docs/checklists-from-sheet-golive.md)
for setup/go-live.

`src/config/checklists.ts` is now the **non-authoritative seed** (it seeded the tab and holds the
shared TS types); `npm run seed:checklists` regenerates the seed rows, and `npm run diff:config -- <exec-url>`
checks a published snapshot against it item-for-item.

## Authorship

Built by Hugo Grilo, 2026, for the CAPG-FF lab.

Originally developed at github.com/hugogrilo13/lab-checklist and transferred
to the lab organisation in August 2026. Full authorship history is preserved
in the Git commit log.
