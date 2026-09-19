import { useEffect, useState } from 'react'
import Home from './components/Home'
import Records from './components/Records'
import InLab from './components/InLab'
import NmrTab from './components/nmr/NmrTab'

// GitHub Pages has no SPA fallback, so we use the URL hash for routing — no
// router library needed.
type Tab = 'home' | 'records' | 'inlab' | 'nmr'

function currentTab(): Tab {
  if (window.location.hash === '#/records') return 'records'
  if (window.location.hash === '#/inlab') return 'inlab'
  if (window.location.hash === '#/nmr') return 'nmr'
  return 'home'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(currentTab())

  useEffect(() => {
    const onHash = () => setTab(currentTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex border-b border-slate-200 bg-white">
        <TabButton label="Home" active={tab === 'home'} href="#/home" />
        <TabButton label="Records" active={tab === 'records'} href="#/records" />
        <TabButton label="In Lab" active={tab === 'inlab'} href="#/inlab" />
        <TabButton label="NMR" active={tab === 'nmr'} href="#/nmr" />
      </header>

      <main className="flex-1">
        {tab === 'home' && <Home />}
        {tab === 'records' && <Records />}
        {tab === 'inlab' && <InLab />}
        {tab === 'nmr' && <NmrTab />}
      </main>
    </div>
  )
}

function TabButton({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <a
      href={href}
      className={
        'flex-1 py-4 text-center text-sm font-semibold ' +
        (active ? 'border-b-2 border-slate-900 text-slate-900' : 'text-slate-400')
      }
    >
      {label}
    </a>
  )
}

