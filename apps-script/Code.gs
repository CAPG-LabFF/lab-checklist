/**
 * Lab Opening & Closing Checklist — Apps Script backend.
 *
 * Owns: the Google Sheet (tab "Records"). Append-only. No edit/delete path.
 *
 * SETUP (one time):
 *  1. Create a Google Sheet in the DEDICATED lab Gmail account.
 *  2. Add a tab named exactly "Records" with the header row in COLUMNS below
 *     (run setupSheet() once from the editor to create it automatically).
 *  3. Extensions → Apps Script, paste this file, Save.
 *  4. Deploy → New deployment → Web app →
 *        Execute as: Me
 *        Who has access: Anyone
 *     Copy the /exec URL into src/api/backend.ts (EXEC_URL).
 *  5. After ANY code change: Deploy → Manage deployments → edit the EXISTING
 *     deployment → Version: New version. This keeps the /exec URL stable so the
 *     printed QR codes never change.
 *
 * Phase 2 will add: Subscribers tab, subscribe route, 5-minute MailApp trigger.
 */

var SHEET_NAME = 'Records'
var TIMEZONE = 'Europe/Lisbon'
var AREAS = ['general', 'big_lab', 'small_lab_gc', 'bromo_lab']
var ACTIONS = ['opening', 'closing']
var RECORDS_PAGE = 30

// Column order in the Records sheet. Do not reorder without updating rowToRecord/appendRow.
var COLUMNS = [
  'id',
  'timestamp',
  'area',
  'action',
  'partial',
  'overnight',
  'initials',
  'comment',
  'items_json',
  'flags_json',
  'notified',
]

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------

function doGet(e) {
  try {
    var route = (e && e.parameter && e.parameter.route) || 'state'
    if (route === 'state') return json(getState())
    if (route === 'records') return json(getRecords(e.parameter.area, e.parameter.cursor))
    return json({ error: 'Unknown route: ' + route }, 400)
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500)
  }
}

function doPost(e) {
  try {
    // CORS workaround: the client sends a JSON string as text/plain (no preflight).
    var body = JSON.parse(e.postData.contents)
    var route = body.route
    if (route === 'submit') return json(submitRecord(body.record))
    if (route === 'subscribe') return json({ error: 'Subscribe is Phase 2' }, 501)
    return json({ error: 'Unknown route: ' + route }, 400)
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500)
  }
}

// ---------------------------------------------------------------------------
// State (derived from each area's most recent record)
// ---------------------------------------------------------------------------

function getState() {
  var rows = readAllRecords()
  var latest = {} // area -> record (last wins, sheet is in chronological order)
  for (var i = 0; i < rows.length; i++) latest[rows[i].area] = rows[i]

  var today = dayString(new Date())
  return AREAS.map(function (area) {
    var rec = latest[area] || null
    var state = 'unknown'
    var staleOpen = false
    if (rec) {
      if (rec.action === 'opening') {
        state = 'open'
        // Edge case: opened on an earlier Lisbon calendar day, never closed.
        if (dayString(new Date(rec.timestamp)) < today) staleOpen = true
      } else {
        state = rec.partial ? 'partial' : 'closed'
      }
    }
    return { area: area, state: state, lastRecord: rec, staleOpen: staleOpen }
  })
}

// ---------------------------------------------------------------------------
// Records (paged, newest first)
// ---------------------------------------------------------------------------

function getRecords(area, cursor) {
  if (AREAS.indexOf(area) === -1) throw new Error('Unknown area: ' + area)
  var all = readAllRecords()
    .filter(function (r) { return r.area === area })
    .reverse() // newest first
  var offset = cursor ? parseInt(cursor, 10) : 0
  var page = all.slice(offset, offset + RECORDS_PAGE)
  var next = offset + RECORDS_PAGE < all.length ? String(offset + RECORDS_PAGE) : null
  return { records: page, nextCursor: next }
}

// ---------------------------------------------------------------------------
// Submit (validate → lock → append)
// ---------------------------------------------------------------------------

function submitRecord(record) {
  var v = validate(record)
  if (v) throw new Error(v)

  var lock = LockService.getScriptLock()
  try {
    lock.waitLock(10000) // 10s; two people submitting the same second serialize here
  } catch (e) {
    throw new Error('The system is busy (another submission is in progress). Please try again.')
  }
  try {
    var stored = {
      id: Utilities.getUuid(),
      timestamp: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      area: record.area,
      action: record.action,
      partial: !!record.partial,
      overnight: !!record.overnight,
      initials: String(record.initials).toUpperCase(),
      comment: record.comment ? String(record.comment) : '',
      items: record.items,
      flags: record.flags || {},
    }
    appendRow(stored)
    return stored
  } finally {
    lock.releaseLock()
  }
}

function validate(record) {
  if (!record) return 'Missing record.'
  if (AREAS.indexOf(record.area) === -1) return 'Invalid area.'
  if (ACTIONS.indexOf(record.action) === -1) return 'Invalid action.'

  var initials = record.initials ? String(record.initials).trim() : ''
  if (!/^[A-Za-z]{2,4}$/.test(initials)) return 'Initials must be 2–4 letters.'

  if (!Array.isArray(record.items) || record.items.length === 0) return 'No checklist items submitted.'
  for (var i = 0; i < record.items.length; i++) {
    var it = record.items[i]
    if (!it || typeof it.id !== 'string' || it.checked !== true)
      return 'Every checklist item must be checked.'
  }

  // partial/overnight only meaningful on closing, and each forces a comment.
  var partial = record.action === 'closing' && !!record.partial
  var overnight = !!record.overnight
  if ((partial || overnight) && !(record.comment && String(record.comment).trim()))
    return 'A comment is required when partial closing or an overnight reaction is reported.'

  return null // valid
}

// ---------------------------------------------------------------------------
// Sheet I/O
// ---------------------------------------------------------------------------

function sheet() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  if (!sh) throw new Error('Sheet tab "' + SHEET_NAME + '" not found. Run setupSheet() once.')
  return sh
}

function readAllRecords() {
  var sh = sheet()
  var lastRow = sh.getLastRow()
  if (lastRow < 2) return [] // header only
  var values = sh.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues()
  return values.map(rowToRecord)
}

function rowToRecord(row) {
  var m = {}
  for (var i = 0; i < COLUMNS.length; i++) m[COLUMNS[i]] = row[i]
  return {
    id: m.id,
    timestamp: m.timestamp,
    area: m.area,
    action: m.action,
    partial: m.partial === true || m.partial === 'TRUE',
    overnight: m.overnight === true || m.overnight === 'TRUE',
    initials: m.initials,
    comment: m.comment,
    items: safeParse(m.items_json, []),
    flags: safeParse(m.flags_json, {}),
  }
}

function appendRow(rec) {
  var row = [
    rec.id,
    rec.timestamp,
    rec.area,
    rec.action,
    rec.partial,
    rec.overnight,
    rec.initials,
    rec.comment,
    JSON.stringify(rec.items),
    JSON.stringify(rec.flags),
    false, // notified — Phase 2 email trigger flips this
  ]
  sheet().appendRow(row)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(obj, code) {
  // Apps Script Web Apps cannot set arbitrary status codes; errors carry {error}.
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

function safeParse(s, fallback) {
  if (s === '' || s == null) return fallback
  try { return JSON.parse(s) } catch (e) { return fallback }
}

/** Europe/Lisbon calendar day as yyyy-MM-dd, for the stale-open comparison. */
function dayString(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd')
}

/** Run ONCE from the editor to create the Records tab with headers. */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME)
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUMNS)
    sh.setFrozenRows(1)
  }
}
