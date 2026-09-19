import { useCallback, useEffect, useRef, useState } from 'react'
import type { NmrQueueItem } from '../../api/backend'
import { getNmrQueue, completeNmr } from '../../api/backend'

function waited(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h}h ${min % 60}m` : `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

type Props = { initials: string; initialsValid: boolean }

export default function SubmittedQueue({ initials, initialsValid }: Props) {
  const [queue, setQueue] = useState<NmrQueueItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const r = await getNmrQueue()
      setQueue(r.queue)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the queue.')
    } finally {
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  if (!queue && error)
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error} <button onClick={refresh} className="underline">Retry</button>
      </p>
    )
  if (!queue) return <p className="py-4 text-center text-slate-400">Loading…</p>
  if (queue.length === 0) return <p className="py-6 text-center text-slate-400">No samples waiting.</p>

  return (
    <div className="space-y-3">
      {!initialsValid && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Enter your initials at the top to mark samples done or add notes.
        </p>
      )}
      {queue.map((item) => (
        <QueueRow key={item.submission.id} item={item} initials={initials} initialsValid={initialsValid} onChanged={refresh} />
      ))}
    </div>
  )
}

function QueueRow({
  item,
  initials,
  initialsValid,
  onChanged,
}: {
  item: NmrQueueItem
  initials: string
  initialsValid: boolean
  onChanged: () => void
}) {
  const s = item.submission
  const isLong = s.type === 'long'
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function act(status: 'done' | 'note' | 'cancelled') {
    if (!initialsValid) return
    if (status === 'note' && !note.trim()) {
      setErr('Type a note first.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await completeNmr({ submission_id: s.id, operator: initials, status, notes: note.trim() })
      setNote('')
      onChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={'overflow-hidden rounded-xl border-l-4 bg-white shadow-sm ' + (isLong ? 'border-violet-500' : 'border-sky-500')}>
      <div className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={'rounded px-1.5 py-0.5 text-xs font-bold ' + (isLong ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800')}>
            {isLong ? 'LONG' : '1H'}
          </span>
          <span className="font-semibold text-slate-900">{s.sample_name}</span>
          <span className="text-slate-400">·</span>
          <span className="font-medium">{s.initials}</span>
          <span className="text-slate-400">·</span>
          <span>{s.lab}</span>
          <span className="ml-auto text-xs text-slate-500">waiting {waited(s.timestamp)}</span>
        </div>

        <div className="mt-1 text-sm text-slate-600">
          Solvent: <span className="text-slate-800">{s.solvent}</span>
          {isLong && s.experiments.length > 0 && <> · {s.experiments.join(', ')}</>}
          {isLong && (s.quantity || s.mw) && <> · {s.quantity} mg · MW {s.mw}</>}
        </div>
        {s.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">“{s.notes}”</p>}

        {item.events.filter((e) => e.notes).length > 0 && (
          <div className="mt-2 space-y-0.5 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
            {item.events
              .filter((e) => e.notes)
              .map((e) => (
                <div key={e.id}>
                  <span className="font-semibold">{e.operator}</span>
                  {e.status === 'reopened' ? ' (reopened)' : ''}: {e.notes}
                </div>
              ))}
          </div>
        )}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Operator note (e.g. shimming failed, too dilute)…"
          className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
        />
        {err && <p className="mt-1 text-xs font-medium text-red-700">{err}</p>}

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => act('done')}
            disabled={!initialsValid || busy}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? '…' : 'Mark done'}
          </button>
          <button
            onClick={() => act('note')}
            disabled={!initialsValid || busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"
          >
            Add note
          </button>
          <button
            onClick={() => act('cancelled')}
            disabled={!initialsValid || busy}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-500 disabled:opacity-40"
          >
            Withdraw
          </button>
        </div>
      </div>
    </div>
  )
}
