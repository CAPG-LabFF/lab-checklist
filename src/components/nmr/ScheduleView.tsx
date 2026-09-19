import { useNmrSchedule } from '../../hooks/useNmr'

// Guard: if the backend still returns a raw time Date (e.g. "Sat Dec 30 1899
// 08:30:00 GMT…") pull out the HH:mm; otherwise show the label as-is ("Manhã").
function cleanSlot(t: string): string {
  if (/\b1899\b|GMT/.test(t)) {
    const m = t.match(/(\d{1,2}:\d{2})/)
    return m ? m[1] : t
  }
  return t
}

export default function ScheduleView() {
  const { schedule, loading, error, refresh } = useNmrSchedule()

  if (!schedule && loading) return <p className="py-4 text-center text-slate-400">Loading schedule…</p>
  if (!schedule)
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? 'Schedule unavailable.'} <button onClick={refresh} className="underline">Retry</button>
      </p>
    )
  if (!schedule.slots.length) return <p className="py-4 text-center text-slate-400">No schedule set.</p>

  // One compact table: a column per weekday, a row per slot. Scrolls sideways on
  // a narrow phone rather than becoming a long list.
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-slate-200 px-2 py-1.5 text-left"></th>
            {schedule.days.map((d) => (
              <th
                key={d}
                className="border-b border-l border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-700"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedule.slots.map((s) => (
            <tr key={s.time}>
              <th className="whitespace-nowrap border-b border-slate-100 px-2 py-1.5 text-left font-semibold text-slate-500">
                {cleanSlot(s.time)}
              </th>
              {schedule.days.map((d) => (
                <td key={d} className="whitespace-nowrap border-b border-l border-slate-100 px-2 py-1.5 text-slate-800">
                  {s.byDay[d] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
