// ---------------------------------------------------------------------------
// backend.ts — the ONLY file that talks to the server.
//
// If the Apps Script Web App is ever replaced, only this file changes.
// The four exported functions are the entire contract the UI depends on.
//
// >>> SET THIS after deploying the Apps Script Web App. <<<
// Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone,
// then paste the /exec URL here. It is the single place the URL lives.
// (Test account and lab account use the SAME repo, so only this line differs
//  between them.)
// ---------------------------------------------------------------------------
export const EXEC_URL = '' // e.g. 'https://script.google.com/macros/s/AKfy.../exec'

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
  return (await res.json()) as T
}

async function get<T>(params: Record<string, string>): Promise<T> {
  if (!EXEC_URL) throw new BackendNotConfigured()
  const url = new URL(EXEC_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { redirect: 'follow' })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  return (await res.json()) as T
}

// ---- Public contract ------------------------------------------------------

/** Current derived state for all four areas. */
export function getState(): Promise<AreaState[]> {
  return get<AreaState[]>({ route: 'state' })
}

/** Paged records for one area, newest first. `cursor` is opaque. */
export function getRecords(
  area: Area,
  cursor?: string,
): Promise<{ records: LabRecord[]; nextCursor: string | null }> {
  return get({ route: 'records', area, ...(cursor ? { cursor } : {}) })
}

/** Append one record. Server generates id + timestamp and returns the stored row. */
export function submit(record: SubmitInput): Promise<LabRecord> {
  return post<LabRecord>({ route: 'submit', record })
}

/** Subscribe an email to per-submission alerts for the given areas ('all' or keys). */
export function subscribe(
  email: string,
  areas: Area[] | 'all',
): Promise<{ ok: true }> {
  return post({ route: 'subscribe', email, areas })
}
