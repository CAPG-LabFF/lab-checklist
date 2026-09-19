// In-memory backend used ONLY during `npm run dev` while EXEC_URL is empty,
// so the whole UI is clickable before the Apps Script Web App exists.
// Never bundled into production: backend.ts dynamically imports it and only
// when import.meta.env.DEV is true.

import type { AreaState, LabRecord, SubmitInput, Area, PresenceEntry, NmrCompStatus } from './backend'
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

// ---- NMR mock (mirrors Code.gs validation + completion derivation) ----------

type NmrSub = {
  id: string; timestamp: string; type: '1h' | 'long'; initials: string; lab: 'CA' | 'PG'
  sample_name: string; solvent: string; experiments: string[]; quantity: string; mw: string; notes: string
}
type NmrComp = { id: string; timestamp: string; submission_id: string; operator: string; notes: string; status: NmrCompStatus }

const nmrSchedule = {
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  slots: [
    { time: '08:30', byDay: { Monday: 'Inês/Tiago', Tuesday: 'Inês', Wednesday: 'Tiago', Thursday: 'Inês', Friday: 'Inês' } },
    { time: '11:30', byDay: { Monday: 'Vale', Tuesday: 'Tiago', Wednesday: 'Vale', Thursday: 'Tiago', Friday: 'Vale' } },
  ],
}
const nmrOptions = {
  solvents: ['CDCl3', 'DMSO-d6', 'D2O', 'CD3OD (methanol-d4)', 'Acetone-d6', 'toluene-d8'],
  experiments: ['1H', '13C', 'COSY', 'HSQC', 'HMBC', 'NOESY'],
}
const nmrSubs: NmrSub[] = [
  { id: uuid(), timestamp: iso(5 * HOUR), type: '1h', initials: 'RP', lab: 'CA', sample_name: 'RP-114 crude', solvent: 'CDCl3', experiments: [], quantity: '', mw: '', notes: 'Might be dilute.' },
  { id: uuid(), timestamp: iso(2 * HOUR), type: 'long', initials: 'HG', lab: 'PG', sample_name: 'HG-22 pure', solvent: 'DMSO-d6', experiments: ['1H', '13C', 'HSQC'], quantity: '12', mw: '318.4', notes: '' },
]
const nmrComps: NmrComp[] = []

export function getNmrSchedule() { return delay(nmrSchedule) }
export function getNmrOptions() { return delay({ publishedAt: new Date().toISOString().slice(0, 10), ...nmrOptions }) }

export function submitNmr(record: any): Promise<NmrSub> {
  const initials = String(record.initials || '').trim().toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(initials)) return Promise.reject(new Error('Initials must be 2–4 letters.'))
  if (record.lab !== 'CA' && record.lab !== 'PG') return Promise.reject(new Error('Lab must be CA or PG.'))
  if (!String(record.sample_name || '').trim()) return Promise.reject(new Error('Sample name is required.'))
  if (!nmrOptions.solvents.includes(String(record.solvent))) return Promise.reject(new Error('Unknown solvent.'))
  let experiments: string[] = []
  if (record.type === 'long') {
    experiments = Array.isArray(record.experiments) ? record.experiments : []
    if (!experiments.length) return Promise.reject(new Error('Select at least one experiment.'))
    if (!String(record.quantity || '').trim()) return Promise.reject(new Error('Quantity (mg) is required.'))
    if (!String(record.mw || '').trim()) return Promise.reject(new Error('Molecular weight is required.'))
  }
  const stored: NmrSub = {
    id: uuid(), timestamp: new Date().toISOString(), type: record.type, initials, lab: record.lab,
    sample_name: String(record.sample_name).trim(), solvent: record.solvent, experiments,
    quantity: String(record.quantity || ''), mw: String(record.mw || ''), notes: String(record.notes || '').trim(),
  }
  nmrSubs.push(stored)
  return delay(stored)
}

function nmrStateMap() {
  const map: Record<string, { state: string; events: NmrComp[] }> = {}
  for (const c of nmrComps) {
    if (!map[c.submission_id]) map[c.submission_id] = { state: 'pending', events: [] }
    map[c.submission_id].events.push(c)
    if (['done', 'reopened', 'cancelled'].includes(c.status)) map[c.submission_id].state = c.status
  }
  return map
}

export function getNmrQueue() {
  const map = nmrStateMap()
  const queue = nmrSubs
    .filter((s) => { const st = map[s.id]?.state ?? 'pending'; return st === 'pending' || st === 'reopened' })
    .map((s) => ({ submission: s, events: map[s.id]?.events ?? [] }))
  return delay({ queue })
}

export function getNmrRecords(cursor?: string) {
  const map = nmrStateMap()
  const done = [...nmrSubs].reverse().filter((s) => map[s.id]?.state === 'done').map((s) => ({ submission: s, events: map[s.id].events }))
  const offset = cursor ? parseInt(cursor, 10) : 0
  const page = done.slice(offset, offset + 30)
  const next = offset + 30 < done.length ? String(offset + 30) : null
  return delay({ records: page, nextCursor: next })
}

export function completeNmr(event: any) {
  const operator = String(event.operator || '').trim().toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(operator)) return Promise.reject(new Error('Operator initials must be 2–4 letters.'))
  if (!['note', 'done', 'reopened', 'cancelled'].includes(event.status)) return Promise.reject(new Error('Invalid status.'))
  if (!nmrSubs.some((s) => s.id === event.submission_id)) return Promise.reject(new Error('Unknown submission.'))
  const m = nmrStateMap()[event.submission_id]
  const state = m?.state ?? 'pending'
  if (event.status === 'done' && state === 'done') {
    const who = [...(m?.events ?? [])].reverse().find((e) => e.status === 'done')?.operator ?? ''
    return Promise.reject(new Error('Already marked done by ' + who + '.'))
  }
  if (event.status === 'cancelled' && state === 'done') return Promise.reject(new Error('Already completed — cannot cancel.'))
  if (event.status === 'reopened' && state !== 'done') return Promise.reject(new Error('Only a completed sample can be reopened.'))
  const row: NmrComp = { id: uuid(), timestamp: new Date().toISOString(), submission_id: event.submission_id, operator, notes: String(event.notes || '').trim(), status: event.status as NmrCompStatus }
  nmrComps.push(row)
  return delay({ ok: true as const, event: row })
}
