// Verifies a published checklist snapshot matches src/config/checklists.ts
// item-for-item (id, label, group, and order). Run this after seeding + first
// publish on staging, BEFORE pointing the app at route=config.
//
//   npm run diff:config -- https://script.google.com/macros/s/…/exec
//
// Exit code 0 = identical; 1 = mismatch (prints exactly what differs).
import { CHECKLISTS, AREAS } from '../src/config/checklists.ts'

const ACTIONS = ['opening', 'closing']
const url = process.argv[2]
if (!url) {
  console.error('Usage: node scripts/diff-config.mjs <exec-url>')
  process.exit(1)
}

const res = await fetch(url + '?route=config', { redirect: 'follow' })
const data = await res.json()
if (!data || data.error) {
  console.error('Could not read published config:', data && data.error)
  process.exit(1)
}
const live = data.checklists || {}

const flat = (proc) => (proc || []).flatMap((g) => g.items.map((it) => `${g.title} :: ${it.id} :: ${it.label}`))
const mismatches = []
for (const { key: area } of AREAS) {
  for (const action of ACTIONS) {
    const A = flat(CHECKLISTS[area][action])
    const B = flat(live[area] && live[area][action])
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      if (A[i] !== B[i]) {
        mismatches.push(`${area}/${action}[${i}]\n    seed: ${A[i] || '(missing)'}\n    live: ${B[i] || '(missing)'}`)
      }
    }
  }
}

if (mismatches.length) {
  console.error(`MISMATCH — ${mismatches.length} difference(s):\n` + mismatches.join('\n'))
  process.exit(1)
}
console.log(`PASS — published config matches checklists.ts item-for-item (published ${data.publishedAt}).`)
