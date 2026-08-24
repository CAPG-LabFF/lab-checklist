import type { PresenceEvent } from '../api/backend'

// Deliberately date + initials + action ONLY — never a timestamp. Exact times
// live in the Sheet and require account access; they are never exported here.
export function presenceToCsv(events: PresenceEvent[]): string {
  const rows = ['date,initials,action']
  for (const e of events) rows.push([e.date, e.initials, e.action].join(','))
  return rows.join('\r\n')
}

export function presenceCsvFilename(): string {
  return `presence-${new Date().toISOString().slice(0, 10)}.csv`
}
