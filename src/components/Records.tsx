import { useState } from 'react'
import type { Area, LabRecord } from '../api/backend'
import { getRecords } from '../api/backend'
import { AREAS, AREA_NAME } from '../config/checklists'
import { lisbonDay } from '../lib/time'
import { recordsToCsv, downloadCsv, csvFilename } from '../lib/csv'
import RecordRow from './RecordRow'

export default function Records() {
  return (
    <div className="space-y-3 p-4">
      {AREAS.map(({ key }) => (
        <RecordsArea key={key} area={key} />
      ))}
    </div>
  )
}

function RecordsArea({ area }: { area: Area }) {
  const [expanded, setExpanded] = useState(false)
  const [records, setRecords] = useState<LabRecord[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [exporting, setExporting] = useState(false)

  async function loadPage(reset = false) {
    setLoading(true)
    setError(null)
    try {
      const startCursor = reset ? undefined : cursor ?? undefined
      const res = await getRecords(area, startCursor)
      setRecords((prev) => (reset ? res.records : [...prev, ...res.records]))
      setCursor(res.nextCursor)
      setLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load records.')
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next && !loaded) loadPage(true)
  }

  const filtered = records.filter((r) => {
    const day = lisbonDay(r.timestamp)
    if (from && day < from) return false
    if (to && day > to) return false
    return true
  })

  async function exportCsv() {
    setExporting(true)
    setError(null)
    try {
      // Page through everything for a complete export, then apply the date filter.
      const all: LabRecord[] = []
      let c: string | undefined = undefined
      do {
        const res = await getRecords(area, c)
        all.push(...res.records)
        c = res.nextCursor ?? undefined
      } while (c)
      const toExport = all.filter((r) => {
        const day = lisbonDay(r.timestamp)
        if (from && day < from) return false
        if (to && day > to) return false
        return true
      })
      downloadCsv(csvFilename(area), recordsToCsv(toExport))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button onClick={toggle} className="flex w-full items-center px-4 py-3 text-left">
        <span className="flex-1 font-semibold text-slate-900">{AREA_NAME[area]}</span>
        <span className="text-slate-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {/* Filter + export controls */}
          <div className="flex flex-wrap items-end gap-2 bg-slate-50 px-3 py-3 text-sm">
            <label className="flex flex-col">
              <span className="text-xs text-slate-500">From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1" />
            </label>
            <label className="flex flex-col">
              <span className="text-xs text-slate-500">To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1" />
            </label>
            {(from || to) && (
              <button onClick={() => { setFrom(''); setTo('') }} className="py-1 text-slate-500 underline">
                clear
              </button>
            )}
            <button
              onClick={exportCsv}
              disabled={exporting}
              className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 text-sm text-red-700">
              {error} <button onClick={() => loadPage(true)} className="underline">Retry</button>
            </div>
          )}

          {loaded && filtered.length === 0 && !loading && (
            <p className="px-3 py-6 text-center text-sm text-slate-400">
              {records.length === 0 ? 'No records yet.' : 'No records in this date range.'}
            </p>
          )}

          {filtered.map((rec) => (
            <RecordRow key={rec.id} rec={rec} />
          ))}

          {loading && <p className="px-3 py-4 text-center text-sm text-slate-400">Loading…</p>}

          {cursor && !loading && (
            <button onClick={() => loadPage(false)}
              className="w-full border-t border-slate-100 py-3 text-sm font-medium text-slate-600">
              Load more
            </button>
          )}
        </div>
      )}
    </div>
  )
}
