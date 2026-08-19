import type { AreaState, ActionType } from '../api/backend'
import { AREA_NAME } from '../config/checklists'
import { deriveView } from '../lib/stateMachine'
import LastRecordPanel from './LastRecordPanel'

type Props = {
  state: AreaState
  expanded: boolean
  hasInitials: boolean
  onToggle: () => void
  onAction: (action: ActionType) => void
}

export default function AreaCard({ state, expanded, hasInitials, onToggle, onAction }: Props) {
  const v = deriveView(state)

  return (
    <div className={`overflow-hidden rounded-xl border-l-4 bg-white shadow-sm ${v.border}`}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className={`h-3 w-3 shrink-0 rounded-full ${v.dot}`} aria-hidden />
        <span className="flex-1">
          <span className="block font-semibold text-slate-900">{AREA_NAME[state.area]}</span>
          <span className="block text-sm text-slate-500">{v.summary}</span>
        </span>
        <span className="text-sm font-medium text-slate-400">{v.label}</span>
        <span className="text-slate-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4">
          {v.staleBanner && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ {v.staleBanner}
            </div>
          )}

          {!hasInitials && (
            <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Enter your initials at the top before recording.
            </div>
          )}

          <div className="flex gap-3">
            <ActionButton
              label="Opening"
              tone="green"
              enabled={v.openingEnabled && hasInitials}
              reason={v.openingReason}
              onClick={() => onAction('opening')}
            />
            <ActionButton
              label="Closing"
              tone="red"
              enabled={v.closingEnabled && hasInitials}
              reason={v.closingReason}
              onClick={() => onAction('closing')}
            />
          </div>

          <LastRecordPanel rec={state.lastRecord} />
        </div>
      )}
    </div>
  )
}

function ActionButton({
  label, tone, enabled, reason, onClick,
}: {
  label: string
  tone: 'green' | 'red'
  enabled: boolean
  reason: string | null
  onClick: () => void
}) {
  const toneCls = tone === 'green' ? 'bg-green-600' : 'bg-red-600'
  return (
    <div className="flex-1">
      <button
        onClick={onClick}
        disabled={!enabled}
        className={`min-h-[56px] w-full rounded-xl text-lg font-semibold text-white ${toneCls} disabled:cursor-not-allowed disabled:bg-slate-300`}
      >
        {label}
      </button>
      {!enabled && reason && (
        <p className="mt-1 text-center text-xs text-slate-500">{reason}</p>
      )}
    </div>
  )
}
