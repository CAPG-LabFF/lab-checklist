type Props = {
  initials: string
  valid: boolean
  onChange: (v: string) => void
  onClear: () => void
}

export default function InitialsBar({ initials, valid, onChange, onClear }: Props) {
  return (
    <div className="sticky top-[57px] z-10 border-b border-slate-200 bg-white px-4 py-3">
      <label htmlFor="initials" className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
        Your initials
      </label>
      <div className="mt-1 flex items-center gap-3">
        <input
          id="initials"
          value={initials}
          onChange={(e) => onChange(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="e.g. JS"
          maxLength={4}
          className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-lg font-semibold tracking-widest focus:border-slate-900 focus:outline-none"
        />
        {initials && valid && (
          <button onClick={onClear} className="text-sm text-slate-500 underline">
            not you?
          </button>
        )}
        {initials && !valid && <span className="text-sm text-red-600">2–4 letters</span>}
      </div>
    </div>
  )
}
