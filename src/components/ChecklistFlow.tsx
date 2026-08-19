import { useMemo, useState } from 'react'
import type { Area, ActionType, LabRecord, SubmittedItem } from '../api/backend'
import { submit } from '../api/backend'
import { CHECKLISTS, AREA_NAME, itemCount } from '../config/checklists'
import ConfirmModal from './ConfirmModal'

type Props = {
  area: Area
  action: ActionType
  initials: string
  extraFlags?: Record<string, unknown>
  onDone: (rec: LabRecord) => void
  onCancel: () => void
}

export default function ChecklistFlow({ area, action, initials, extraFlags, onDone, onCancel }: Props) {
  const procedure = CHECKLISTS[area][action]
  const total = useMemo(() => itemCount(area, action), [area, action])

  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [comment, setComment] = useState('')
  const [partial, setPartial] = useState(false)
  const [overnight, setOvernight] = useState(false)

  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkedCount = Object.values(checked).filter(Boolean).length
  const allChecked = checkedCount === total
  const commentRequired = (action === 'closing' && partial) || overnight
  const commentOk = !commentRequired || comment.trim().length > 0
  const canSubmit = allChecked && commentOk

  function toggle(id: string) {
    setChecked((c) => ({ ...c, [id]: !c[id] }))
  }

  async function doSubmit() {
    setSubmitting(true)
    setError(null)
    const items: SubmittedItem[] = procedure.flatMap((g) =>
      g.items.map((it) => ({ id: it.id, label: it.label, checked: true })),
    )
    try {
      const rec = await submit({
        area,
        action,
        partial: action === 'closing' ? partial : false,
        overnight,
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
          Comments
        </label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything the next person needs to know?"
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
        />
      </div>

      {/* Closing-only toggles */}
      {action === 'closing' && (
        <div className="space-y-2">
          <Toggle
            label="Lab partially closed"
            help="One or more items left pending — explain which in the comments."
            on={partial}
            onChange={setPartial}
          />
          <Toggle
            label="Overnight reaction running"
            help="A reaction is left running — note what and any safety detail in the comments."
            on={overnight}
            onChange={setOvernight}
          />
          {commentRequired && !commentOk && (
            <p className="text-sm font-medium text-amber-700">
              A comment is required when this is ticked.
            </p>
          )}
        </div>
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
          {allChecked ? 'Submit' : `${total - checkedCount} left`}
        </button>
      </div>

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

function Toggle({
  label, help, on, onChange,
}: { label: string; help: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0"
      />
      <span>
        <span className="font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{help}</span>
      </span>
    </label>
  )
}
