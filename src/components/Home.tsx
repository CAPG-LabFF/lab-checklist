import { useCallback, useEffect, useState } from 'react'
import type { AreaState, Area, ActionType } from '../api/backend'
import { getState } from '../api/backend'
import { AREAS, AREA_NAME } from '../config/checklists'
import { lisbonDay } from '../lib/time'
import { useInitials } from '../hooks/useInitials'
import InitialsBar from './InitialsBar'
import AreaCard from './AreaCard'
import ChecklistFlow from './ChecklistFlow'
import SubscriptionBox from './SubscriptionBox'

type Flow = { area: Area; action: ActionType; extraFlags?: Record<string, unknown> }

export default function Home() {
  const { initials, setInitials, clear, valid } = useInitials()

  const [states, setStates] = useState<AreaState[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Area | null>(null)
  const [flow, setFlow] = useState<Flow | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setStates(await getState())
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load state.')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function startFlow(area: Area, action: ActionType) {
    const s = states?.find((x) => x.area === area)
    const extraFlags =
      action === 'opening' && s?.staleOpen && s.lastRecord
        ? { stale_open_from: lisbonDay(s.lastRecord.timestamp) }
        : undefined
    setFlow({ area, action, extraFlags })
    window.scrollTo(0, 0)
  }

  async function onDone(action: ActionType, area: Area) {
    setFlow(null)
    setExpanded(null)
    setToast(`${AREA_NAME[area]} — ${action} recorded`)
    setTimeout(() => setToast(null), 3500)
    await refresh()
  }

  if (flow) {
    return (
      <div className="p-4">
        <ChecklistFlow
          area={flow.area}
          action={flow.action}
          initials={initials}
          extraFlags={flow.extraFlags}
          onDone={() => onDone(flow.action, flow.area)}
          onCancel={() => setFlow(null)}
        />
      </div>
    )
  }

  return (
    <>
      <InitialsBar initials={initials} valid={valid} onChange={setInitials} onClear={clear} />

      <div className="space-y-3 p-4">
        {loadError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError} <button onClick={refresh} className="underline">Retry</button>
          </div>
        )}

        {!states && !loadError && (
          <div className="py-16 text-center text-slate-400">Loading…</div>
        )}

        {states &&
          AREAS.map(({ key }) => {
            const s = states.find((x) => x.area === key)
            if (!s) return null
            return (
              <AreaCard
                key={key}
                state={s}
                expanded={expanded === key}
                hasInitials={valid}
                onToggle={() => setExpanded((e) => (e === key ? null : key))}
                onAction={(action) => startFlow(key, action)}
              />
            )
          })}

        {states && <SubscriptionBox />}
      </div>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          ✓ {toast}
        </div>
      )}
    </>
  )
}
