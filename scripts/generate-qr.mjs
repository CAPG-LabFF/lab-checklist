// Generates a QR code (SVG) for the app URL plus a printable sheet of cards to
// post in each lab.
//
//   npm run qr                       # uses the default URL below
//   npm run qr -- https://capgff.github.io/lab-checklist/
//
// IMPORTANT: the URL you encode is what gets physically posted. When the site
// moves to the lab org, regenerate with the lab URL. The repo name never
// changes, so only the host differs.
import QRCode from 'qrcode'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const DEFAULT_URL = 'https://hugogrilo13.github.io/lab-checklist/'
const url = process.argv[2] || DEFAULT_URL

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'qr')
mkdirSync(OUT, { recursive: true })

const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
writeFileSync(join(OUT, 'qr.svg'), svg)

const card = `
    <div class="card">
      <div class="qr">${svg}</div>
      <h2>Lab Opening &amp; Closing</h2>
      <p class="sub">Scan to record the opening or closing of this lab.</p>
      <p class="loc">Location: ______________________</p>
      <p class="url">${url}</p>
    </div>`

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Lab Checklist QR</title>
<style>
  @page { margin: 12mm; }
  body { font-family: system-ui, sans-serif; margin: 0; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; padding: 8mm; }
  .card { border: 1.5px dashed #94a3b8; border-radius: 8px; padding: 8mm; text-align: center; page-break-inside: avoid; }
  .qr svg { width: 55mm; height: 55mm; }
  h2 { margin: 4mm 0 1mm; font-size: 15pt; }
  .sub { margin: 0 0 3mm; color: #334155; font-size: 10pt; }
  .loc { margin: 3mm 0 1mm; font-size: 10pt; color: #0f172a; }
  .url { margin: 0; font-size: 8pt; color: #64748b; word-break: break-all; }
  @media print { .hint { display: none; } }
  .hint { padding: 8mm; color: #64748b; font-size: 10pt; }
</style></head>
<body>
  <div class="hint">Print this page (Ctrl/Cmd+P). Four identical cards — one per lab. Encoded URL: <b>${url}</b></div>
  <div class="sheet">${card}${card}${card}${card}</div>
</body></html>`

writeFileSync(join(OUT, 'print.html'), html)
console.log('Encoded URL:', url)
console.log('Wrote qr/qr.svg and qr/print.html')
