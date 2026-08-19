import type { AreaState } from '../api/backend'
import { formatTime, relativeTime, formatDate } from './time'

export type CardView = {
  label: string
  // Tailwind classes for the colour dot / accent.
  dot: string
  border: string
  openingEnabled: boolean
  closingEnabled: boolean
  openingReason: string | null // why disabled (null when enabled)
  closingReason: string | null
  summary: string // collapsed one-liner
  staleBanner: string | null // overnight "not closed" warning
}

export function deriveView(s: AreaState): CardView {
  const rec = s.lastRecord
  const who = rec ? rec.initials : ''
  const at = rec ? formatTime(rec.timestamp) : ''

  switch (s.state) {
    case 'open': {
      const stale = s.staleOpen && rec
      return {
        label: 'Open',
        dot: 'bg-green-500',
        border: 'border-green-500',
        openingEnabled: !!stale, // normally only Closing; stale re-enables Opening
        closingEnabled: true,
        openingReason: stale ? null : `Already open — recorded by ${who} at ${at}`,
        closingReason: null,
        summary: rec ? `Open · ${relativeTime(rec.timestamp)} · ${who}` : 'Open',
        staleBanner:
          stale && rec
            ? `This lab was not closed on ${formatDate(rec.timestamp)}. Last opened by ${who}.`
            : null,
      }
    }
    case 'closed':
      return {
        label: 'Closed',
        dot: 'bg-red-500',
        border: 'border-red-500',
        openingEnabled: true,
        closingEnabled: false,
        openingReason: null,
        closingReason: rec ? `Already closed — recorded by ${who} at ${at}` : null,
        summary: rec ? `Closed · ${relativeTime(rec.timestamp)} · ${who}` : 'Closed',
        staleBanner: null,
      }
    case 'partial':
      return {
        label: 'Partially closed',
        dot: 'bg-amber-500',
        border: 'border-amber-500',
        openingEnabled: true, // next working day
        closingEnabled: true, // finish the pending item
        openingReason: null,
        closingReason: null,
        summary: rec ? `Partially closed · ${relativeTime(rec.timestamp)} · ${who}` : 'Partially closed',
        staleBanner: null,
      }
    default: // unknown
      return {
        label: 'Unknown',
        dot: 'bg-slate-400',
        border: 'border-slate-300',
        openingEnabled: true,
        closingEnabled: false,
        openingReason: null,
        closingReason: 'No record yet — open the lab first',
        summary: 'No records yet',
        staleBanner: null,
      }
  }
}
