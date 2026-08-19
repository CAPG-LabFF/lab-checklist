import { useState } from 'react'

const WORDING =
  'I confirm that I have personally checked the items above and that the lab is safe to leave unattended, except for any item explicitly reported in the comments.'

type Props = {
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ submitting, error, onConfirm, onCancel }: Props) {
  const [ticked, setTicked] = useState(false)

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold">Confirm submission</h2>

        <label className="mt-4 flex gap-3 rounded-lg bg-slate-50 p-3 text-sm">
          <input
            type="checkbox"
            checked={ticked}
            onChange={(e) => setTicked(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>{WORDING}</span>
        </label>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            Not saved — {error} Your entries are kept; tap Confirm to retry.
          </p>
        )}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!ticked || submitting}
            className="flex-1 rounded-xl bg-slate-900 py-3 font-semibold text-white disabled:opacity-40"
          >
            {submitting ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
