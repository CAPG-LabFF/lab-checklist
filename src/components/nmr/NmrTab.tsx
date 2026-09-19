import { useState } from 'react'
import { useInitials } from '../../hooks/useInitials'
import { useNmrOptions } from '../../hooks/useNmr'
import InitialsBar from '../InitialsBar'
import ScheduleView from './ScheduleView'
import SubmissionForm from './SubmissionForm'
import SubmittedQueue from './SubmittedQueue'
import CompletedList from './CompletedList'

export default function NmrTab() {
  const { initials, setInitials, clear, valid } = useInitials()
  const { options } = useNmrOptions()

  return (
    <>
      <InitialsBar initials={initials} valid={valid} onChange={setInitials} onClear={clear} />
      <div className="space-y-3 p-4">
        <Section title="Schedule" defaultOpen>
          <ScheduleView />
        </Section>
        <Section title="Submission — 1H">
          <SubmissionForm type="1h" options={options} initials={initials} initialsValid={valid} />
        </Section>
        <Section title="Submission — Long experiments">
          <SubmissionForm type="long" options={options} initials={initials} initialsValid={valid} />
        </Section>
        <Section title="Submitted">
          <SubmittedQueue initials={initials} initialsValid={valid} />
        </Section>
        <Section title="Completed">
          <CompletedList initials={initials} initialsValid={valid} />
        </Section>
      </div>
    </>
  )
}

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center px-4 py-3 text-left">
        <span className="flex-1 font-semibold text-slate-900">{title}</span>
        <span className="text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="border-t border-slate-100 px-4 py-4">{children}</div>}
    </div>
  )
}
