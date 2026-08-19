import { useState } from 'react'
import type { Area } from '../api/backend'
import { subscribe } from '../api/backend'
import { AREAS } from '../config/checklists'

export default function SubscriptionBox() {
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState<'all' | 'specific'>('all')
  const [picked, setPicked] = useState<Set<Area>>(new Set())
  const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  function togglePick(area: Area) {
    setPicked((p) => {
      const next = new Set(p)
      next.has(area) ? next.delete(area) : next.add(area)
      return next
    })
  }

  async function onSubmit() {
    setError(null)
    if (mode === 'specific' && picked.size === 0) {
      setError('Pick at least one area, or choose All areas.')
      return
    }
    setStatus('saving')
    try {
      await subscribe(email.trim(), mode === 'all' ? 'all' : Array.from(picked))
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not subscribe.')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        ✓ Subscribed. You'll get an email when a lab is opened or closed. Every email has a
        one-click unsubscribe link.
      </div>
    )
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">Email notifications</h2>
      <p className="mt-0.5 text-sm text-slate-500">Get notified when a lab is opened or closed.</p>

      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
      />

      <div className="mt-3 flex gap-2 text-sm">
        <ModeButton label="All areas" active={mode === 'all'} onClick={() => setMode('all')} />
        <ModeButton label="Specific areas" active={mode === 'specific'} onClick={() => setMode('specific')} />
      </div>

      {mode === 'specific' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {AREAS.map(({ key, name }) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <input type="checkbox" checked={picked.has(key)} onChange={() => togglePick(key)} className="h-4 w-4" />
              <span>{name}</span>
            </label>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={status === 'saving' || !email.trim()}
        className="mt-3 w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white disabled:opacity-40"
      >
        {status === 'saving' ? 'Subscribing…' : 'Subscribe'}
      </button>
    </div>
  )
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        'flex-1 rounded-lg border px-3 py-2 font-medium ' +
        (active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600')
      }
    >
      {label}
    </button>
  )
}
