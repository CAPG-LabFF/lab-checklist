import { useState } from 'react'
import type { PresenceEvent } from '../api/backend'
import { togglePresence, getPresenceHistory } from '../api/backend'
import { useInitials } from '../hooks/useInitials'
import { usePresence } from '../hooks/usePresence'
import { downloadCsv } from '../lib/csv'
import { presenceToCsv, presenceCsvFilename } from '../lib/presenceCsv'
import InitialsBar from './InitialsBar'

const TRANSPARENCY =
  'Check-in and check-out times are recorded for safety traceability. They are never displayed and are never used to track hours worked.'

export default function InLab() {
  const { initials, setInitials, clear, valid } = useInitials()
  const { present, refreshing, error, refresh, setPresent } = usePresence()

  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const meIn = !!present && valid && present.some((p) => p.initials === initials)
  const count = present?.length ?? 0

  async function onToggle() {
    if (!valid) return
    setToggling(true)
    setToggleError(null)
    try {
      const res = await togglePresence(initials, meIn ? 'out' : 'in')
      setPresent(res.present)
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : 'Could not save. Try again.')
      refresh() // resync in case our view was stale
    } finally {
      setToggling(false)
    }
  }

  return (
    <>
      <InitialsBar initials={initials} valid={valid} onChange={setInitials} onClear={clear} />

      <div className="space-y-5 p-4">
        {/* Primary action */}
        <div>
          <button
            onClick={onToggle}
            disabled={!valid || toggling}
            className={
              'min-h-[64px] w-full rounded-2xl text-xl font-bold text-white disabled:opacity-40 ' +
              (meIn ? 'bg-slate-700' : 'bg-green-600')
            }
          >
            {toggling ? 'Saving…' : meIn ? 'Check out' : 'Check in'}
          </button>
          {!valid && (
            <p className="mt-1 text-center text-sm text-slate-500">Enter your initials above first.</p>
          )}
          {toggleError && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-700">
              {toggleError}
            </p>
          )}
        </div>

        {/* Board */}
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-bold">
              {count === 0 ? 'Nobody is currently checked in.' : `${count} ${count === 1 ? 'person' : 'people'} in the lab`}
            </h2>
            {refreshing && <span className="text-xs text-slate-400">Refreshing…</span>}
          </div>

          {!present && !error && <p className="py-6 text-center text-slate-400">Loading…</p>}
          {error && !present && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error} <button onClick={refresh} className="underline">Retry</button>
            </p>
          )}

          {present && present.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {present.map((p) => (
                <span
                  key={p.initials}
                  className="flex items-center gap-1.5 rounded-xl bg-green-100 px-3 py-2 text-lg font-bold text-green-900"
                >
                  {p.initials}
                  {p.sinceYesterday && (
                    <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                      since yesterday
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Transparency notice — plainly worded, not hidden */}
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">{TRANSPARENCY}</p>

        <History />
      </div>
    </>
  )
}

// ---- History (dates + initials only) --------------------------------------

type DayGroup = { date: string; initials: string[] }

function groupByDay(events: PresenceEvent[]): DayGroup[] {
  const map = new Map<string, Set<string>>()
  const order: string[] = []
  for (const e of events) {
    if (e.action !== 'in') continue // "present that day" = anyone who checked in
    if (!map.has(e.date)) {
      map.set(e.date, new Set())
      order.push(e.date)
    }
    map.get(e.date)!.add(e.initials)
  }
  return order.map((date) => ({ date, initials: [...map.get(date)!].sort() }))
}

function History() {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<PresenceEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  async function loadPage(reset = false) {
    setLoading(true)
    setError(null)
    try {
      const res = await getPresenceHistory(reset ? undefined : cursor ?? undefined)
      setEvents((prev) => (reset ? res.events : [...prev, ...res.events]))
      setCursor(res.nextCursor)
      setLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.')
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded) loadPage(true)
  }

  async function exportCsv() {
    setExporting(true)
    setError(null)
    try {
      const all: PresenceEvent[] = []
      let c: string | undefined = undefined
      do {
        const res = await getPresenceHistory(c)
        all.push(...res.events)
        c = res.nextCursor ?? undefined
      } while (c)
      downloadCsv(presenceCsvFilename(), presenceToCsv(all))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const days = groupByDay(events)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button onClick={toggle} className="flex w-full items-center px-4 py-3 text-left">
        <span className="flex-1 font-semibold text-slate-900">History</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          <div className="flex justify-end bg-slate-50 px-3 py-2">
            <button
              onClick={exportCsv}
              disabled={exporting}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 text-sm text-red-700">
              {error} <button onClick={() => loadPage(true)} className="underline">Retry</button>
            </div>
          )}

          {loaded && days.length === 0 && !loading && (
            <p className="px-3 py-6 text-center text-sm text-slate-400">No history yet.</p>
          )}

          {days.map((d) => (
            <div key={d.date} className="border-t border-slate-100 px-3 py-3">
              <div className="text-sm font-semibold text-slate-700">{d.date}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {d.initials.map((ini) => (
                  <span key={ini} className="rounded bg-slate-100 px-2 py-0.5 text-sm font-medium text-slate-700">
                    {ini}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {loading && <p className="px-3 py-4 text-center text-sm text-slate-400">Loading…</p>}

          {cursor && !loading && (
            <button
              onClick={() => loadPage(false)}
              className="w-full border-t border-slate-100 py-3 text-sm font-medium text-slate-600"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
