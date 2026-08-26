import { useState } from 'react'
import type { LabRecord } from '../api/backend'
import { formatDate, formatTime } from '../lib/time'

const ACTION_STYLE: Record<string, string> = {
  opening: 'bg-green-100 text-green-800',
  closing: 'bg-red-100 text-red-800',
}

/** One record in the Records list; tap to expand full comment + snapshot. */
export default function RecordRow({ rec }: { rec: LabRecord }) {
  const [open, setOpen] = useState(false)
  // A partial closing reads amber rather than red.
  const badgeCls =
    rec.action === 'closing' && rec.partial
      ? 'bg-amber-100 text-amber-800'
      : ACTION_STYLE[rec.action]

  const firstCommentLine = rec.comment ? rec.comment.split('\n')[0] : ''

  return (
    <div className="border-t border-slate-100">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-3 py-3 text-left">
        <div className="flex items-center gap-2 text-sm">
          <span className="tabular-nums text-slate-500">
            {formatDate(rec.timestamp)} {formatTime(rec.timestamp)}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold capitalize ${badgeCls}`}>
            {rec.partial && rec.action === 'closing' ? 'partial close' : rec.action}
          </span>
          <span className="font-semibold">{rec.initials}</span>
          {rec.overnight && (
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-semibold text-violet-800">
              overnight
            </span>
          )}
          <span className="ml-auto text-slate-400">{open ? '▲' : '▼'}</span>
        </div>
        {firstCommentLine && !open && (
          <p className="mt-1 truncate text-sm text-slate-500">{firstCommentLine}</p>
        )}
      </button>

      {open && (
        <div className="space-y-3 bg-slate-50 px-3 py-3 text-sm">
          {rec.comment && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comment</div>
              <p className="whitespace-pre-wrap text-slate-700">{rec.comment}</p>
            </div>
          )}
          {(() => {
            const notDone = rec.items.filter((it) => !it.checked)
            return (
              <>
                {notDone.length > 0 && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Not done ({notDone.length})
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {notDone.map((it) => (
                        <li key={it.id} className="font-medium text-amber-900">
                          {it.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Checklist as submitted
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {rec.items.map((it) => (
                      <li
                        key={it.id}
                        className={
                          'flex items-start gap-2 ' +
                          (it.checked ? 'text-slate-700' : 'font-medium text-amber-900')
                        }
                      >
                        <span className={it.checked ? 'text-green-600' : 'text-amber-600'}>
                          {it.checked ? '✓' : '✗'}
                        </span>
                        <span>{it.label}</span>
                        {!it.checked && (
                          <span className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                            not done
                          </span>
                        )}
                      </li>
                    ))}
                    {rec.items.length === 0 && <li className="text-slate-400">No snapshot stored.</li>}
                  </ul>
                </div>
              </>
            )
          })()}
          {rec.flags && Object.keys(rec.flags).length > 0 && (
            <div className="text-xs text-amber-700">
              Flags: {JSON.stringify(rec.flags)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
