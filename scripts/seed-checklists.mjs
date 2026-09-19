// Generates the initial `Checklists` tab rows from src/config/checklists.ts.
// Output: checklists-seed.tsv — paste it into the Checklists tab starting at A2
// (row 1 is the header created by setupChecklists()). Row order = display order.
//
//   npm run seed:checklists
//
// Uses EXISTING ids from checklists.ts so historical records stay valid.
// Requires Node 22.6+ (native TypeScript type-stripping for the .ts import).
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { CHECKLISTS, AREAS } from '../src/config/checklists.ts'

const ACTIONS = ['opening', 'closing']
const here = dirname(fileURLToPath(import.meta.url))

const rows = []
for (const { key: area } of AREAS) {
  for (const action of ACTIONS) {
    for (const group of CHECKLISTS[area][action]) {
      for (const item of group.items) {
        rows.push([item.id, area, action, group.title, item.label])
      }
    }
  }
}

const tsv = rows.map((r) => r.join('\t')).join('\n')
const outPath = join(here, '..', 'checklists-seed.tsv')
writeFileSync(outPath, tsv + '\n')

console.log(`Wrote ${rows.length} rows to ${outPath}`)
for (const { key: area, name } of AREAS) {
  const o = CHECKLISTS[area].opening.reduce((n, g) => n + g.items.length, 0)
  const c = CHECKLISTS[area].closing.reduce((n, g) => n + g.items.length, 0)
  console.log(`  ${name}: opening ${o}, closing ${c}`)
}
