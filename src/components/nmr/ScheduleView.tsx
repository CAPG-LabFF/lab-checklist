import type { NmrSchedule } from '../../api/backend'
import { useNmrSchedule } from '../../hooks/useNmr'
import { useMediaQuery } from '../../hooks/useMediaQuery'

const todayName = () =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Lisbon', weekday: 'long' }).format(new Date())

export default function ScheduleView() {
  const { schedule, loading, error, refresh } = useNmrSchedule()
  // Full grid only for mouse/desktop; touch devices (incl. desktop-mode phones)
  // always get the day-by-day list, never a pinch-zoom table.
  const fine = useMediaQuery('(pointer: fine)')

  if (!schedule && loading) return <p className="py-4 text-center text-slate-400">Loading schedule…</p>
  if (!schedule)
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        {error ?? 'Schedule unavailable.'} <button onClick={refresh} className="underline">Retry</button>
      </p>
    )
  if (!schedule.slots.length) return <p className="py-4 text-center text-slate-400">No schedule set.</p>

  return fine ? <Grid schedule={schedule} /> : <DayList schedule={schedule} />
}

function DayList({ schedule }: { schedule: NmrSchedule }) {
  const today = todayName()
  const ordered = schedule.days.includes(today)
    ? [today, ...schedule.days.filter((d) => d !== today)]
    : schedule.days
  return (
    <div className="space-y-3">
      {ordered.map((day) => (
        <div key={day} className="overflow-hidden rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-2">
            <span className="font-semibold text-slate-800">{day}</span>
            {day === today && (
              <span className="rounded bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white">Today</span>
            )}
          </div>
          <ul>
            {schedule.slots.map((s) => (
              <li key={s.time} className="flex gap-3 border-t border-slate-100 px-3 py-2 text-sm">
                <span className="w-14 shrink-0 font-medium tabular-nums text-slate-500">{s.time}</span>
                <span className="text-slate-800">{s.byDay[day] || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Grid({ schedule }: { schedule: NmrSchedule }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-500"></th>
            {schedule.days.map((d) => (
              <th key={d} className="border-b border-l border-slate-200 px-3 py-2 text-left font-semibold text-slate-700">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedule.slots.map((s) => (
            <tr key={s.time}>
              <td className="border-b border-slate-100 px-3 py-2 font-medium tabular-nums text-slate-500">{s.time}</td>
              {schedule.days.map((d) => (
                <td key={d} className="border-b border-l border-slate-100 px-3 py-2 text-slate-800">
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
