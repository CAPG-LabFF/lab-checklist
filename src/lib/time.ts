// All display in Europe/Lisbon. Storage is ISO 8601 with offset (server-side).

const TZ = 'Europe/Lisbon'

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

/** "18 Aug 2026, 18:42" */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

/** "18:42" */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso))
}

/** "18 Aug 2026" */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso))
}

/** Europe/Lisbon calendar day as "yyyy-MM-dd" (for the stale_open_from flag). */
export function lisbonDay(iso: string): string {
  // en-CA yields ISO-style yyyy-MM-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso))
}

/** Coarse "14h ago" / "3d ago" / "just now" — enough for the summary line. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.round((Date.now() - then) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.round(diffH / 24)
  return `${diffD}d ago`
}
