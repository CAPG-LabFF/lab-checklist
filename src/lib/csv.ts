import type { LabRecord } from '../api/backend'

const HEADERS = [
  'id',
  'timestamp',
  'area',
  'action',
  'partial',
  'overnight',
  'initials',
  'comment',
  'items',
] as const

function escape(value: string): string {
  // Quote if it contains a comma, quote, or newline; double internal quotes.
  if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"'
  return value
}

function itemsToText(rec: LabRecord): string {
  // "✓ Label; ✓ Label" — the snapshot as submitted.
  return rec.items.map((it) => `${it.checked ? '✓' : '✗'} ${it.label}`).join('; ')
}

/** Build a CSV string from records (already filtered/ordered by the caller). */
export function recordsToCsv(records: LabRecord[]): string {
  const rows = [HEADERS.join(',')]
  for (const r of records) {
    rows.push(
      [
        r.id,
        r.timestamp,
        r.area,
        r.action,
        String(r.partial),
        String(r.overnight),
        r.initials,
        r.comment ?? '',
        itemsToText(r),
      ]
        .map((v) => escape(String(v)))
        .join(','),
    )
  }
  return rows.join('\r\n')
}

/** Trigger a browser download of a CSV file. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Human-readable filename, e.g. "records-big_lab-2026-08-19.csv". */
export function csvFilename(area: string): string {
  return `records-${area}-${new Date().toISOString().slice(0, 10)}.csv`
}
