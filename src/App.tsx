import { useEffect, useState } from 'react'

// Two-tab app. GitHub Pages has no SPA fallback, so we use the URL hash for
// routing — no router library needed.
type Tab = 'home' | 'records'

function currentTab(): Tab {
  return window.location.hash === '#/records' ? 'records' : 'home'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(currentTab())

  useEffect(() => {
    const onHash = () => setTab(currentTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-10 flex border-b border-slate-200 bg-white">
        <TabButton label="Home" active={tab === 'home'} href="#/home" />
        <TabButton label="Records" active={tab === 'records'} href="#/records" />
      </header>

      <main className="flex-1 p-4">
        {tab === 'home' ? <HomePlaceholder /> : <RecordsPlaceholder />}
      </main>
    </div>
  )
}

function TabButton({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <a
      href={href}
      className={
        'flex-1 py-4 text-center text-base font-semibold ' +
        (active ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400')
      }
    >
      {label}
    </a>
  )
}

function HomePlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
      <p className="font-medium text-slate-700">Scaffold ready.</p>
      <p className="mt-1 text-sm">Home screen (cards, state machine, checklists) lands in Phase 1.</p>
    </div>
  )
}

function RecordsPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">
      <p className="font-medium text-slate-700">Records</p>
      <p className="mt-1 text-sm">Built in Phase 2.</p>
    </div>
  )
}
