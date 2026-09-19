import { useCallback, useEffect, useRef, useState } from 'react'
import type { NmrQueueItem } from '../../api/backend'
import { getNmrRecords } from '../../api/backend'
import { formatDateTime } from '../../lib/time'

type Props = { initials: string; initialsValid: boolean }

export default function CompletedList({ initials, initialsValid }: Props) {
  const [records, setRecords] = useState<NmrQueueItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState(false)
  const inFlight = useRef(false)

  const loadPage = useCallback(async (reset: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const res = await getNmrRecords(reset ? undefined : cursor ?? undefined)
      setRecords((prev) => (reset ? res.records : [...prev, ...res.records]))
      setCursor(res.nextCursor)
      setLoaded(true)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load completed samples.')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [cursor])

  useEffect(() => {
    loadPage(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = mine && initialsValid ? records.filter((r) => r.submission.initials === initials) : records

  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={mine}
          onChange={(e) => setMine(e.target.checked)}
          disabled={!initialsValid}
          className="h-4 w-4"
        />
        <span className={initialsValid ? 'text-slate-700' : 'text-slate-400'}>
          My samples only{initialsValid ? ` (${initials})` : ' — enter initials'}
        </span>
      </label>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error} <button onClick={() => loadPage(true)} className="underline">Retry</button>
        </p>
      )}

      {loaded && shown.length === 0 && !loading && (
        <p className="py-6 text-center text-slate-400">
          {mine ? 'None of your samples are completed yet.' : 'No completed samples yet.'}
        </p>
      )}

      <div className="space-y-2">
        {shown.map((item) => (
          <CompletedRow key={item.submission.id} item={item} />
        ))}
      </div>

      {loading && <p className="py-3 text-center text-sm text-slate-400">Loading…</p>}
      {cursor && !loading && (
        <button
          onClick={() => loadPage(false)}
          className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600"
        >
          Load more
        </button>
      )}
    </div>
  )
}

function CompletedRow({ item }: { item: NmrQueueItem }) {
  const s = item.submission
  const isLong = s.type === 'long'
  const done = [...item.events].reverse().find((e) => e.status === 'done')
  const notes = item.events.filter((e) => e.notes)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="px-3 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={'rounded px-1.5 py-0.5 text-xs font-bold ' + (isLong ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800')}>
            {isLong ? 'LONG' : '1H'}
          </span>
          <span className="font-semibold text-slate-900">{s.sample_name}</span>
          <span className="text-slate-400">·</span>
          <span className="font-medium">{s.initials}</span>
          <span className="text-slate-400">·</span>
          <span>{s.lab}</span>
        </div>
        <div className="mt-1 text-slate-600">
          Solvent: <span className="text-slate-800">{s.solvent}</span>
          {isLong && s.experiments.length > 0 && <> · {s.experiments.join(', ')}</>}
          {isLong && (s.quantity || s.mw) && <> · {s.quantity} mg · MW {s.mw}</>}
        </div>
        {done && (
          <div className="mt-1 text-xs text-slate-500">
            Run by <span className="font-semibold">{done.operator}</span> · {formatDateTime(done.timestamp)}
          </div>
        )}
        {notes.length > 0 && (
          <div className="mt-2 space-y-0.5 rounded-lg bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
            {notes.map((e) => (
              <div key={e.id}>
                <span className="font-semibold">{e.operator}</span>: {e.notes}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
