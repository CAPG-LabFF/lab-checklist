// ---------------------------------------------------------------------------
// backend.ts — the ONLY file that talks to the server.
//
// If the Apps Script Web App is ever replaced, only this file changes.
// The four exported functions are the entire contract the UI depends on.
//
// >>> PRODUCTION /exec URL lives here (the committed default for a `main` build).
// Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
// (Test account and lab account use the SAME repo, so only this line differs.)
//
// To develop against a STAGING copy without editing this file, put the staging
// URL in `.env.local` (gitignored) as VITE_EXEC_URL. In a dev run with no
// VITE_EXEC_URL set, EXEC_URL is empty so the in-memory mock is used — a dev
// server never silently talks to the live backend.
// ---------------------------------------------------------------------------
const PRODUCTION_EXEC_URL =
  'https://script.google.com/macros/s/AKfycbzXeLpwBSGsOWnsGOSGfret1-5yGaOux1_oceb3Mfc-V2Aqy4DVQ7DgM6VGwDVrDJD0bA/exec'

export const EXEC_URL: string =
  import.meta.env.VITE_EXEC_URL ?? (import.meta.env.PROD ? PRODUCTION_EXEC_URL : '')

// ---- Domain types ---------------------------------------------------------

export type Area = 'general' | 'big_lab' | 'small_lab_gc' | 'bromo_lab'
export type ActionType = 'opening' | 'closing'

/** A single checked item as submitted (snapshot). */
export type SubmittedItem = { id: string; label: string; checked: boolean }

/** One record exactly as stored in the Sheet. */
export type LabRecord = {
  id: string
  timestamp: string // ISO 8601 with offset, generated server-side
  area: Area
  action: ActionType
  partial: boolean
  overnight: boolean
  initials: string
  comment: string
  items: SubmittedItem[]
  flags: Record<string, unknown>
}

/** Derived state for one area, computed server-side from its latest record. */
export type AreaState = {
  area: Area
  state: 'unknown' | 'open' | 'closed' | 'partial'
  lastRecord: LabRecord | null
  /** true when open but the last record is from an earlier Lisbon calendar day. */
  staleOpen: boolean
}

// Sheet-driven checklist config (the published snapshot the app fetches).
// Structurally identical to the Procedure types in config/checklists.ts.
export type ConfigItem = { id: string; label: string }
export type ConfigGroup = { title: string; items: ConfigItem[] }
export type ConfigProcedure = ConfigGroup[]
export type PublishedConfig = {
  publishedAt: string
  checklists: Record<Area, Record<ActionType, ConfigProcedure>>
}

export type SubmitInput = Omit<LabRecord, 'id' | 'timestamp' | 'flags'> & {
  flags?: Record<string, unknown>
}

// ---- Transport ------------------------------------------------------------

class BackendNotConfigured extends Error {
  constructor() {
    super('EXEC_URL is not set in src/api/backend.ts')
    this.name = 'BackendNotConfigured'
  }
}

async function post<T>(payload: unknown): Promise<T> {
  if (!EXEC_URL) throw new BackendNotConfigured()
  // CORS workaround: send JSON as text/plain to avoid a preflight Apps Script
  // cannot answer; follow the 302 Apps Script issues on responses.
  const res = await fetch(EXEC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  // Apps Script returns HTTP 200 even for rejections, carrying { error }. Surface
  // it as a thrown error so callers see the message instead of a fake record.
  const data = (await res.json()) as T & { error?: string }
  if (data && data.error) throw new Error(data.error)
  return data as T
}

async function get<T>(params: Record<string, string>): Promise<T> {
  if (!EXEC_URL) throw new BackendNotConfigured()
  const url = new URL(EXEC_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { redirect: 'follow' })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  const data = (await res.json()) as T & { error?: string }
  if (data && data.error) throw new Error(data.error)
  return data as T
}

// In dev with no EXEC_URL set, fall back to an in-memory mock so the UI is
// fully clickable before the backend is deployed. Stripped from production.
const useMock = import.meta.env.DEV && !EXEC_URL
const mock = () => import('./devMock')

// ---- Public contract ------------------------------------------------------

/** Current derived state for all four areas. */
export async function getState(): Promise<AreaState[]> {
  if (useMock) return (await mock()).getState()
  return get<AreaState[]>({ route: 'state' })
}

/** Paged records for one area, newest first. `cursor` is opaque. */
export async function getRecords(
  area: Area,
  cursor?: string,
): Promise<{ records: LabRecord[]; nextCursor: string | null }> {
  if (useMock) return (await mock()).getRecords(area, cursor)
  return get({ route: 'records', area, ...(cursor ? { cursor } : {}) })
}

/** Append one record. Server generates id + timestamp and returns the stored row. */
export async function submit(record: SubmitInput): Promise<LabRecord> {
  if (useMock) return (await mock()).submit(record)
  return post<LabRecord>({ route: 'submit', record })
}

// Email subscriptions were removed. The Subscribers sheet and the Records
// `notified` column are intentionally left in place (append-only), just unused.

/** The current published checklist snapshot. Throws if none is available. */
export async function getConfig(): Promise<PublishedConfig> {
  if (useMock) return (await mock()).getConfig()
  return get({ route: 'config' })
}

// ---- Presence ("In Lab" board) --------------------------------------------
// Independent of the checklists. The server records times for traceability but
// never returns them; nothing here ever exposes a clock time.

export type PresenceEntry = { initials: string; sinceYesterday: boolean }
export type PresenceEvent = { date: string; initials: string; action: 'in' | 'out' }

/** Current board: who is checked in right now (derived server-side, no writes). */
export async function getPresence(): Promise<{ present: PresenceEntry[] }> {
  if (useMock) return (await mock()).getPresence()
  return get({ route: 'presence' })
}

/**
 * Check in or out. The server rejects an invalid toggle (already in / not in)
 * with an {error} body over HTTP 200, so we surface that explicitly here — the
 * generic post() cannot, since it only inspects the HTTP status.
 */
export async function togglePresence(
  initials: string,
  direction: 'in' | 'out',
): Promise<{ ok: true; present: PresenceEntry[] }> {
  if (useMock) return (await mock()).togglePresence(initials, direction)
  if (!EXEC_URL) throw new Error('EXEC_URL is not set')
  const res = await fetch(EXEC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ route: 'presence_toggle', initials, direction }),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  const data = await res.json()
  if (data && data.error) throw new Error(data.error)
  return data
}

/** Paged presence history, newest first — date + initials + action, no times. */
export async function getPresenceHistory(
  cursor?: string,
): Promise<{ events: PresenceEvent[]; nextCursor: string | null }> {
  if (useMock) return (await mock()).getPresenceHistory(cursor)
  return get({ route: 'presence_history', ...(cursor ? { cursor } : {}) })
}

// ---- NMR ------------------------------------------------------------------

export type NmrLab = 'CA' | 'PG'
export type NmrType = '1h' | 'long'
export type NmrCompStatus = 'note' | 'done' | 'reopened' | 'cancelled'

export type NmrSchedule = {
  days: string[]
  slots: { time: string; byDay: Record<string, string> }[]
}
export type NmrOptions = { publishedAt: string; solvents: string[]; experiments: string[] }

export type NmrSubmission = {
  id: string
  timestamp: string
  type: NmrType
  initials: string
  lab: NmrLab
  sample_name: string
  solvent: string
  experiments: string[]
  quantity: string
  mw: string
  notes: string
}
export type NmrCompletionEvent = {
  id: string
  timestamp: string
  submission_id: string
  operator: string
  notes: string
  status: NmrCompStatus
}
export type NmrQueueItem = { submission: NmrSubmission; events: NmrCompletionEvent[] }

export type NmrSubmitInput = {
  type: NmrType
  initials: string
  lab: NmrLab
  sample_name: string
  solvent: string
  experiments?: string[]
  quantity?: string
  mw?: string
  notes?: string
}

/** Live schedule grid (read directly — reflects same-day edits). */
export async function getNmrSchedule(): Promise<NmrSchedule> {
  if (useMock) return (await mock()).getNmrSchedule()
  return get({ route: 'nmr_schedule' })
}

/** Published solvent + experiment lists. */
export async function getNmrOptions(): Promise<NmrOptions> {
  if (useMock) return (await mock()).getNmrOptions()
  return get({ route: 'nmr_options' })
}

/** Append a submission. Server validates against the published options. */
export async function submitNmr(record: NmrSubmitInput): Promise<NmrSubmission> {
  if (useMock) return (await mock()).submitNmr(record)
  return post({ route: 'nmr_submit', record })
}

/** Pending queue, oldest first. */
export async function getNmrQueue(): Promise<{ queue: NmrQueueItem[] }> {
  if (useMock) return (await mock()).getNmrQueue()
  return get({ route: 'nmr_queue' })
}

/** Completed samples, newest first, paginated. */
export async function getNmrRecords(
  cursor?: string,
): Promise<{ records: NmrQueueItem[]; nextCursor: string | null }> {
  if (useMock) return (await mock()).getNmrRecords(cursor)
  return get({ route: 'nmr_records', ...(cursor ? { cursor } : {}) })
}

/** Append a completion event (note / done / reopened / cancelled). */
export async function completeNmr(event: {
  submission_id: string
  operator: string
  notes?: string
  status: NmrCompStatus
}): Promise<{ ok: true; event: NmrCompletionEvent }> {
  if (useMock) return (await mock()).completeNmr(event)
  return post({ route: 'nmr_complete', event })
}
