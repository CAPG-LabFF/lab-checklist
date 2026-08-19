// In-memory backend used ONLY during `npm run dev` while EXEC_URL is empty,
// so the whole UI is clickable before the Apps Script Web App exists.
// Never bundled into production: backend.ts dynamically imports it and only
// when import.meta.env.DEV is true.

import type { AreaState, LabRecord, SubmitInput, Area } from './backend'

function iso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString()
}
const uuid = () => 'dev-' + Math.random().toString(36).slice(2, 10)
const HOUR = 3600_000

// Seed: one of each state, incl. a stale-open lab from yesterday.
const store: LabRecord[] = [
  {
    id: uuid(), timestamp: iso(2 * HOUR), area: 'general', action: 'closing',
    partial: false, overnight: false, initials: 'JS', comment: 'All good.',
    items: [], flags: {},
  },
  {
    id: uuid(), timestamp: iso(30 * HOUR), area: 'big_lab', action: 'opening',
    partial: false, overnight: false, initials: 'AM', comment: '',
    items: [], flags: {},
  },
  {
    id: uuid(), timestamp: iso(3 * HOUR), area: 'small_lab_gc', action: 'closing',
    partial: true, overnight: false, initials: 'RP', comment: 'Rotavap still running for MC.',
    items: [], flags: {},
  },
  // bromo_lab: no records → Unknown
]

function delay<T>(v: T): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), 250))
}

export function getState(): Promise<AreaState[]> {
  const areas: Area[] = ['general', 'big_lab', 'small_lab_gc', 'bromo_lab']
  const today = new Date().toISOString().slice(0, 10)
  return delay(
    areas.map((area) => {
      const recs = store.filter((r) => r.area === area)
      const rec = recs.length ? recs[recs.length - 1] : null
      let state: AreaState['state'] = 'unknown'
      let staleOpen = false
      if (rec) {
        if (rec.action === 'opening') {
          state = 'open'
          if (rec.timestamp.slice(0, 10) < today) staleOpen = true
        } else state = rec.partial ? 'partial' : 'closed'
      }
      return { area, state, lastRecord: rec, staleOpen }
    }),
  )
}

export function getRecords(area: Area, cursor?: string) {
  const all = store.filter((r) => r.area === area).reverse()
  const offset = cursor ? parseInt(cursor, 10) : 0
  const page = all.slice(offset, offset + 30)
  const next = offset + 30 < all.length ? String(offset + 30) : null
  return delay({ records: page, nextCursor: next })
}

export function submit(record: SubmitInput): Promise<LabRecord> {
  const stored: LabRecord = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    area: record.area,
    action: record.action,
    partial: !!record.partial,
    overnight: !!record.overnight,
    initials: record.initials.toUpperCase(),
    comment: record.comment ?? '',
    items: record.items,
    flags: record.flags ?? {},
  }
  store.push(stored)
  return delay(stored)
}

export function subscribe() {
  return delay({ ok: true as const })
}
