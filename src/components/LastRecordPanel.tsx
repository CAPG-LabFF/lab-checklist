import { useState } from 'react'
import type { LabRecord } from '../api/backend'
import { formatDateTime } from '../lib/time'

/** Collapsible "Last Record" panel shown inside an expanded card. */
export default function LastRecordPanel({ rec }: { rec: LabRecord | null }) {
  const [open, setOpen] = useState(false)
  if (!rec) return null

  return (
    <div className="mt-3 rounded-lg border border-slate-200">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-600"
      >
        <span>Last record</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-200 px-3 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium capitalize">{rec.action}</span>
            <span className="text-slate-400">·</span>
            <span>{formatDateTime(rec.timestamp)}</span>
            <span className="text-slate-400">·</span>
            <span className="font-semibold">{rec.initials}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {rec.partial && <Badge color="amber">Partial</Badge>}
            {rec.overnight && <Badge color="violet">Overnight</Badge>}
          </div>
          {rec.comment && <p className="whitespace-pre-wrap text-slate-700">{rec.comment}</p>}
        </div>
      )}
    </div>
  )
}

function Badge({ color, children }: { color: 'amber' | 'violet'; children: React.ReactNode }) {
  const cls =
    color === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-violet-100 text-violet-800'
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
}
