import { useCallback, useEffect, useRef, useState } from 'react'
import type { NmrQueueItem } from '../../api/backend'
import { getNmrQueue, completeNmr } from '../../api/backend'

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

  const [open, setOpen] = useState(false)
  const noteCount = item.events.filter((e) => e.notes).length

  return (
    <div className={'overflow-hidden rounded-lg border-l-4 border border-slate-200 bg-white ' + (isLong ? 'border-l-violet-500' : 'border-l-sky-500')}>
      {/* Compact one-line summary — the list stays scannable at 20–30 samples. */}
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
        <span className={'shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ' + (isLong ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800')}>
          {isLong ? 'LONG' : '1H'}
        </span>
        <span className="truncate font-semibold text-slate-900">{s.sample_name}</span>
        <span className="shrink-0 text-slate-500">{s.initials} · {s.lab}</span>
        {noteCount > 0 && <span className="shrink-0 rounded bg-slate-100 px-1 text-xs text-slate-500" title="operator notes">✎{noteCount}</span>}
        <span className="ml-auto shrink-0 text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-3">
          <div className="text-sm text-slate-600">
            Solvent: <span className="text-slate-800">{s.solvent}</span>
            {isLong && s.experiments.length > 0 && <> · {s.experiments.join(', ')}</>}
            {isLong && (s.quantity || s.mw) && <> · {s.quantity} mg · MW {s.mw}</>}
          </div>
          {s.notes && <p className="whitespace-pre-wrap text-sm text-slate-700">“{s.notes}”</p>}

          {noteCount > 0 && (
            <div className="space-y-0.5 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
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
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
          />
          {err && <p className="text-xs font-medium text-red-700">{err}</p>}

          <div className="flex flex-wrap gap-2">
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
      )}
    </div>
  )
}
