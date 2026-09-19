// In-memory backend used ONLY during `npm run dev` while EXEC_URL is empty,
// so the whole UI is clickable before the Apps Script Web App exists.
// Never bundled into production: backend.ts dynamically imports it and only
// when import.meta.env.DEV is true.

import type { AreaState, LabRecord, SubmitInput, Area, PresenceEntry } from './backend'
import { lisbonDay } from '../lib/time'
import { CHECKLISTS } from '../config/checklists'

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
  // Mirror Code.gs: derive partial + the comment rule server-side, never trust
  // the client's flag. Lets the UI dev-run exercise the real acceptance rules.
  const anyUnchecked = record.items.some((it) => it.checked !== true)
  if (anyUnchecked && !(record.comment && record.comment.trim())) {
    return Promise.reject(new Error('A comment is required when any item is left unchecked.'))
  }
  const stored: LabRecord = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    area: record.area,
    action: record.action,
    partial: record.action === 'closing' && anyUnchecked, // derived, not from client
    overnight: false,
    initials: record.initials.toUpperCase(),
    comment: record.comment ?? '',
    items: record.items,
    flags: record.flags ?? {},
  }
  store.push(stored)
  return delay(stored)
}

// Published checklist config: the seed stands in for the Sheet snapshot in dev.
export function getConfig() {
  return delay({ publishedAt: new Date().toISOString().slice(0, 10), checklists: CHECKLISTS })
}

// ---- Presence mock (mirrors Code.gs computePresent, incl. the reset hour) ---

const RESET_HOUR = 4
type PEvent = { timestamp: string; date: string; initials: string; action: 'in' | 'out' }

function sessionDate(ms: number): string {
  return lisbonDay(new Date(ms - RESET_HOUR * 3600_000).toISOString())
}

// Seed: AB is currently in; GH forgot to check out two days ago (must NOT show);
// CD checked in then out (not present).
const presence: PEvent[] = [
  { timestamp: iso(3 * HOUR), date: lisbonDay(iso(3 * HOUR)), initials: 'AB', action: 'in' },
  { timestamp: iso(48 * HOUR), date: lisbonDay(iso(48 * HOUR)), initials: 'GH', action: 'in' },
  { timestamp: iso(2 * HOUR), date: lisbonDay(iso(2 * HOUR)), initials: 'CD', action: 'in' },
  { timestamp: iso(1 * HOUR), date: lisbonDay(iso(1 * HOUR)), initials: 'CD', action: 'out' },
]

function computePresent(now: number): PresenceEntry[] {
  const latest: Record<string, PEvent> = {}
  for (const e of presence) latest[e.initials] = e
  const nowSession = sessionDate(now)
  const today = lisbonDay(new Date(now).toISOString())
  const out: PresenceEntry[] = []
  for (const ini of Object.keys(latest)) {
    const r = latest[ini]
    if (r.action !== 'in') continue
    const ts = Date.parse(r.timestamp)
    if (sessionDate(ts) !== nowSession) continue
    out.push({ initials: ini, sinceYesterday: lisbonDay(new Date(ts).toISOString()) < today })
  }
  out.sort((a, b) => (a.initials < b.initials ? -1 : a.initials > b.initials ? 1 : 0))
  return out
}

export function getPresence() {
  return delay({ present: computePresent(Date.now()) })
}

export function togglePresence(initials: string, direction: 'in' | 'out') {
  const ini = initials.trim().toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(ini)) throw new Error('Initials must be 2–4 letters.')
  const present = computePresent(Date.now())
  const isIn = present.some((p) => p.initials === ini)
  if (direction === 'in' && isIn) throw new Error(`${ini} is already checked in.`)
  if (direction === 'out' && !isIn) throw new Error(`${ini} is not checked in.`)
  const now = Date.now()
  presence.push({
    timestamp: new Date(now).toISOString(),
    date: lisbonDay(new Date(now).toISOString()),
    initials: ini,
    action: direction,
  })
  return delay({ ok: true as const, present: computePresent(now) })
}

export function getPresenceHistory(cursor?: string) {
  const events = presence
    .map((e) => ({ date: e.date, initials: e.initials, action: e.action }))
    .reverse()
  const offset = cursor ? parseInt(cursor, 10) : 0
  const page = events.slice(offset, offset + 30)
  const next = offset + 30 < events.length ? String(offset + 30) : null
  return delay({ events: page, nextCursor: next })
}
