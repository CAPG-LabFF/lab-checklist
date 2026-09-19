import { useMemo, useState } from 'react'
import type { Area, ActionType, LabRecord, SubmittedItem, ConfigProcedure } from '../api/backend'
import { submit } from '../api/backend'
import { AREA_NAME } from '../config/checklists'
import ConfirmModal from './ConfirmModal'

type Props = {
  area: Area
  action: ActionType
  // The checklist to render, from the published config (never the static seed).
  procedure: ConfigProcedure
  initials: string
  extraFlags?: Record<string, unknown>
  onDone: (rec: LabRecord) => void
  onCancel: () => void
}

export default function ChecklistFlow({ area, action, procedure, initials, extraFlags, onDone, onCancel }: Props) {
  const total = useMemo(() => procedure.reduce((n, g) => n + g.items.length, 0), [procedure])

  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [comment, setComment] = useState('')

  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkedCount = Object.values(checked).filter(Boolean).length
  const anyUnchecked = checkedCount < total
  // A closing with anything unchecked is a partial closing (amber). Openings are
  // never "partial" — they stay green — but still need a comment when incomplete.
  const partial = action === 'closing' && anyUnchecked
  const commentRequired = anyUnchecked
  const commentOk = !commentRequired || comment.trim().length > 0
  const canSubmit = commentOk

  const helper = 'Say exactly what was left undone and why.'

  function toggle(id: string) {
    setChecked((c) => ({ ...c, [id]: !c[id] }))
  }

  async function doSubmit() {
    setSubmitting(true)
    setError(null)
    // Full snapshot INCLUDING unchecked items, so the server can derive `partial`
    // and Records can show what was skipped.
    const items: SubmittedItem[] = procedure.flatMap((g) =>
      g.items.map((it) => ({ id: it.id, label: it.label, checked: !!checked[it.id] })),
    )
    try {
      const rec = await submit({
        area,
        action,
        partial, // server re-derives; sent for an immediate optimistic update
        overnight: false, // overnight toggle removed; kept as a column, always false
        initials,
        comment: comment.trim(),
        items,
        flags: extraFlags,
      })
      onDone(rec)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'connection failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{AREA_NAME[area]}</h2>
          <p className="text-sm capitalize text-slate-500">{action}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">
            {checkedCount} <span className="text-slate-400">/ {total}</span>
          </div>
          <div className="text-xs text-slate-400">checked</div>
        </div>
      </div>

      {procedure.map((group) => {
        const done = group.items.filter((it) => checked[it.id]).length
        return (
          <div key={group.title} className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
              <h3 className="text-sm font-semibold text-slate-700">{group.title}</h3>
              <span className="text-xs font-medium tabular-nums text-slate-500">
                {done}/{group.items.length}
              </span>
            </div>
            <ul>
              {group.items.map((it) => {
                const on = !!checked[it.id]
                return (
                  <li key={it.id}>
                    <button
                      onClick={() => toggle(it.id)}
                      className={
                        'flex w-full items-center gap-3 border-t border-slate-100 px-3 py-3 text-left ' +
                        (on ? 'bg-green-50' : 'active:bg-slate-100')
                      }
                    >
                      <span
                        className={
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ' +
                          (on ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300')
                        }
                        aria-hidden
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className={on ? 'text-slate-500 line-through' : 'text-slate-800'}>
                        {it.label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {/* Comments */}
      <div>
        <label htmlFor="comment" className="text-sm font-semibold text-slate-700">
          Comments{commentRequired && <span className="text-amber-700"> (required)</span>}
        </label>
        {commentRequired && helper && <p className="mt-0.5 text-xs text-amber-700">{helper}</p>}
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything the next person needs to know?"
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
        />
      </div>

      {/* What this submission will be recorded as */}
      {partial && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {total - checkedCount} item{total - checkedCount === 1 ? '' : 's'} unchecked — this will be
          recorded as <b>partially closed</b> (amber).
        </p>
      )}

      {/* Actions */}
      <div className="sticky bottom-0 flex gap-3 bg-slate-100/95 py-3">
        <button
          onClick={onCancel}
          className="rounded-xl border border-slate-300 px-5 py-4 font-semibold text-slate-700"
        >
          Cancel
        </button>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSubmit}
          className="flex-1 rounded-xl bg-slate-900 py-4 text-lg font-semibold text-white disabled:opacity-40"
        >
          Submit
        </button>
      </div>
      {!commentOk && (
        <p className="-mt-2 text-center text-sm font-medium text-amber-700">
          A comment is required before you can submit.
        </p>
      )}

      {showConfirm && (
        <ConfirmModal
          submitting={submitting}
          error={error}
          onConfirm={doSubmit}
          onCancel={() => {
            if (!submitting) {
              setShowConfirm(false)
              setError(null)
            }
          }}
        />
      )}
    </div>
  )
}
