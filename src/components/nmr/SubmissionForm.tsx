import { useState } from 'react'
import type { NmrLab, NmrOptions, NmrType } from '../../api/backend'
import { submitNmr } from '../../api/backend'

type Props = {
  type: NmrType
  options: NmrOptions | null
  initials: string
  initialsValid: boolean
}

export default function SubmissionForm({ type, options, initials, initialsValid }: Props) {
  const isLong = type === 'long'
  const [lab, setLab] = useState<NmrLab | ''>('')
  const [sampleName, setSampleName] = useState('')
  const [solvent, setSolvent] = useState('')
  const [experiments, setExperiments] = useState<Set<string>>(new Set())
  const [quantity, setQuantity] = useState('')
  const [mw, setMw] = useState('')
  const [notes, setNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!options) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Solvent list unavailable — try again shortly.</p>
  }

  function toggleExp(x: string) {
    setExperiments((p) => {
      const n = new Set(p)
      n.has(x) ? n.delete(x) : n.add(x)
      return n
    })
  }

  const baseValid = initialsValid && !!lab && sampleName.trim().length > 0 && !!solvent
  const longValid = !isLong || (experiments.size > 0 && quantity.trim() !== '' && mw.trim() !== '')
  const canSubmit = baseValid && longValid && !submitting

  function resetSample() {
    setSampleName('')
    setSolvent('')
    setExperiments(new Set())
    setQuantity('')
    setMw('')
    setNotes('')
  }

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await submitNmr({
        type,
        initials,
        lab: lab as NmrLab,
        sample_name: sampleName.trim(),
        solvent,
        experiments: isLong ? [...experiments] : undefined,
        quantity: isLong ? quantity.trim() : undefined,
        mw: isLong ? mw.trim() : undefined,
        notes: notes.trim(),
      })
      setDone(true)
      resetSample() // keep lab + initials for the next sample
    } catch (e) {
      // Preserve everything entered; lab Wi-Fi is flaky and retyping is worse.
      setError(e instanceof Error ? e.message : 'Not saved — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
        ✓ Sample submitted. It's now in the queue.
        <button onClick={() => setDone(false)} className="ml-2 font-semibold underline">
          Submit another
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!initialsValid && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Enter your initials at the top first.</p>
      )}

      <Field label="Lab">
        <div className="flex gap-2">
          {(['CA', 'PG'] as NmrLab[]).map((l) => (
            <button
              key={l}
              onClick={() => setLab(l)}
              className={
                'flex-1 rounded-lg border py-2 font-semibold ' +
                (lab === l ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600')
              }
            >
              {l}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Sample name">
        <input
          value={sampleName}
          onChange={(e) => setSampleName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
          placeholder="e.g. RP-114 crude"
        />
      </Field>

      <Field label="Solvent">
        <select
          value={solvent}
          onChange={(e) => setSolvent(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:border-slate-900 focus:outline-none"
        >
          <option value="">Choose…</option>
          {options.solvents.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      {isLong && (
        <>
          <Field label="Experiments">
            <div className="grid grid-cols-3 gap-2">
              {options.experiments.map((x) => (
                <label
                  key={x}
                  className={
                    'flex items-center gap-1.5 rounded-lg border px-2 py-2 text-sm ' +
                    (experiments.has(x) ? 'border-slate-900 bg-slate-100' : 'border-slate-300')
                  }
                >
                  <input type="checkbox" checked={experiments.has(x)} onChange={() => toggleExp(x)} className="h-4 w-4" />
                  <span>{x}</span>
                </label>
              ))}
            </div>
          </Field>
          <div className="flex gap-3">
            <Field label="Quantity (mg)">
              <input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
              />
            </Field>
            <Field label="Molecular weight">
              <input
                value={mw}
                onChange={(e) => setMw(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
              />
            </Field>
          </div>
        </>
      )}

      <Field label="Observations">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
          placeholder="Anything the operator should know?"
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">Not saved — {error}</p>
      )}

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="min-h-[52px] w-full rounded-xl bg-slate-900 text-lg font-semibold text-white disabled:opacity-40"
      >
        {submitting ? 'Submitting…' : 'Submit sample'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}
