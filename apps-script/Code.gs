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
 * Email subscriptions were removed. The "Subscribers" tab and the Records
 * `notified` column are intentionally left in place (append-only) but unused —
 * do not delete them. If a 5-minute notification trigger still exists in this
 * project, delete it by hand (clock icon), or it will fail every 5 minutes.
 */

var SHEET_NAME = 'Records'
var TIMEZONE = 'Europe/Lisbon'
var AREAS = ['general', 'big_lab', 'small_lab_gc', 'bromo_lab']
var ACTIONS = ['opening', 'closing']
var RECORDS_PAGE = 30

// ---- Presence ("In Lab" board) --------------------------------------------
// Independent of the checklists. Append-only, same discipline as Records.
var PRESENCE_NAME = 'Presence'
var PRESENCE_COLUMNS = ['id', 'timestamp', 'date', 'initials', 'action']
var PRESENCE_PAGE = 30
// Someone is "in the lab" if their most recent event is `in` and is more recent
// than the most recent occurrence of this hour (Europe/Lisbon). This only cleans
// up FORGOTTEN check-outs overnight; an explicit check-out works at any time.
// 04:00 (not midnight) so late workers are not dropped while still on site.
// Change this single value to move the reset time.
var PRESENCE_RESET_HOUR = 4

// ---- Sheet-driven checklists ----------------------------------------------
// The lab edits the `Checklists` tab. A daily trigger validates it and writes an
// atomic snapshot to `ChecklistsPublished`. The app ONLY reads the published
// snapshot — never the editable tab — so half-typed edits never go live.
var CHECKLISTS_NAME = 'Checklists'
// Row ORDER is display order (people reorder by dragging rows). No order column.
var CHECKLISTS_COLUMNS = ['id', 'area', 'procedure', 'group', 'label']
var PUBLISHED_NAME = 'ChecklistsPublished'
var PUBLISHED_COLUMNS = ['published_at', 'status', 'detail', 'checklists_json']
// Hour (Europe/Lisbon) the daily publish trigger runs. One place to change it.
var CONFIG_PUBLISH_HOUR = 0

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
    if (route === 'presence') return json(getPresence())
    if (route === 'presence_history') return json(getPresenceHistory(e.parameter.cursor))
    if (route === 'config') return json(getPublishedConfig())
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
    if (route === 'presence_toggle') return json(togglePresence(body.initials, body.direction))
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
    var anyUnchecked = false
    for (var j = 0; j < record.items.length; j++)
      if (record.items[j].checked !== true) anyUnchecked = true
    var stored = {
      id: Utilities.getUuid(),
      timestamp: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      area: record.area,
      action: record.action,
      // partial is DERIVED from the snapshot, never taken from the client flag.
      partial: record.action === 'closing' && anyUnchecked,
      overnight: false, // overnight toggle removed; column kept, always FALSE
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
  var anyUnchecked = false
  for (var i = 0; i < record.items.length; i++) {
    var it = record.items[i]
    // Items may now be checked OR unchecked, but must be well-formed.
    if (!it || typeof it.id !== 'string' || typeof it.checked !== 'boolean')
      return 'Malformed checklist item.'
    if (it.checked !== true) anyUnchecked = true
  }

  // A comment is mandatory whenever any item is left unchecked (any action).
  if (anyUnchecked && !(record.comment && String(record.comment).trim()))
    return 'A comment is required when any item is left unchecked.'

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

// ===========================================================================
// PRESENCE — "In Lab" board. Fully independent of the checklists.
// Append-only. Times are stored for traceability but NEVER returned to the UI.
// ===========================================================================

/** Idempotent: create the Presence tab + header only if absent. Safe to re-run. */
function setupPresence() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName(PRESENCE_NAME) || ss.insertSheet(PRESENCE_NAME)
  if (sh.getLastRow() === 0) {
    sh.appendRow(PRESENCE_COLUMNS)
    sh.setFrozenRows(1)
    // Keep timestamp + date as literal text so Sheets never re-interprets them.
    sh.getRange('B:C').setNumberFormat('@')
  }
}

function presenceSheet() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRESENCE_NAME)
  if (!sh) throw new Error('Tab "' + PRESENCE_NAME + '" not found. Run setupPresence() once.')
  return sh
}

function readPresenceRows() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PRESENCE_NAME)
  if (!sh) return []
  var last = sh.getLastRow()
  if (last < 2) return []
  return sh.getRange(2, 1, last - 1, PRESENCE_COLUMNS.length).getValues().map(function (row) {
    return {
      id: row[0],
      timestamp: row[1], // ISO 8601 string with offset
      date: String(row[2]),
      initials: String(row[3]).trim().toUpperCase(),
      action: String(row[4]).trim(),
    }
  })
}

/**
 * "Session date" of an instant: the Europe/Lisbon calendar day AFTER shifting
 * back by PRESENCE_RESET_HOUR hours. This maps the daily reset (e.g. 04:00) onto
 * a midnight boundary, so two instants share a session date iff no reset hour
 * falls between them. Done in epoch space then formatted in Lisbon, so DST is
 * handled by the tz database rather than by hand.
 */
function presenceSessionDate(instant) {
  var shifted = new Date(instant.getTime() - PRESENCE_RESET_HOUR * 3600 * 1000)
  return Utilities.formatDate(shifted, TIMEZONE, 'yyyy-MM-dd')
}

/**
 * THE single source of truth for who is present. Used by BOTH the board and the
 * check-in/out accept-reject, so the button label can never contradict the
 * server's verdict. Returns [{ initials, sinceYesterday }], sorted by initials.
 */
function computePresent(rows, now) {
  var latest = {} // initials -> most recent row (rows are chronological)
  for (var i = 0; i < rows.length; i++) latest[rows[i].initials] = rows[i]

  var nowSession = presenceSessionDate(now)
  var today = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd')

  var out = []
  for (var ini in latest) {
    if (!latest.hasOwnProperty(ini)) continue
    var r = latest[ini]
    if (r.action !== 'in') continue
    var ts = new Date(r.timestamp)
    if (presenceSessionDate(ts) !== nowSession) continue // forgotten check-out, past the reset
    var day = Utilities.formatDate(ts, TIMEZONE, 'yyyy-MM-dd')
    out.push({ initials: ini, sinceYesterday: day < today })
  }
  out.sort(function (a, b) { return a.initials < b.initials ? -1 : a.initials > b.initials ? 1 : 0 })
  return out
}

/** doGet route=presence → current board. Derived at read time; writes nothing. */
function getPresence() {
  return { present: computePresent(readPresenceRows(), new Date()) }
}

/** doPost route=presence_toggle → append one check-in/out. Validated under lock. */
function togglePresence(initials, direction) {
  var ini = String(initials || '').trim().toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(ini)) throw new Error('Initials must be 2–4 letters.')
  if (direction !== 'in' && direction !== 'out') throw new Error('Invalid direction.')

  var lock = LockService.getScriptLock()
  try {
    lock.waitLock(10000)
  } catch (e) {
    throw new Error('The system is busy. Please try again.')
  }
  try {
    var now = new Date()
    var rows = readPresenceRows()
    var present = computePresent(rows, now)
    var isIn = false
    for (var i = 0; i < present.length; i++) if (present[i].initials === ini) isIn = true

    if (direction === 'in' && isIn) throw new Error(ini + ' is already checked in.')
    if (direction === 'out' && !isIn) throw new Error(ini + ' is not checked in.')

    var iso = Utilities.formatDate(now, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
    var date = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd')
    presenceSheet().appendRow([Utilities.getUuid(), iso, date, ini, direction])

    // Recompute including the row we just added, so the client updates at once.
    rows.push({ timestamp: iso, initials: ini, action: direction })
    return { ok: true, present: computePresent(rows, now) }
  } finally {
    lock.releaseLock()
  }
}

/**
 * doGet route=presence_history → paginated raw events, newest first.
 * Returns date + initials + action only — NEVER the timestamp — so no clock
 * time can reach the UI or the app's CSV export.
 */
function getPresenceHistory(cursor) {
  var events = readPresenceRows()
    .map(function (r) { return { date: r.date, initials: r.initials, action: r.action } })
    .reverse()
  var offset = cursor ? parseInt(cursor, 10) : 0
  var page = events.slice(offset, offset + PRESENCE_PAGE)
  var next = offset + PRESENCE_PAGE < events.length ? String(offset + PRESENCE_PAGE) : null
  return { events: page, nextCursor: next }
}

// ===========================================================================
// SHEET-DRIVEN CHECKLISTS
// The lab edits `Checklists`; a daily trigger validates it and appends an atomic
// snapshot to `ChecklistsPublished`. The app reads only the snapshot (route=config).
// A typo can never empty a live checklist: on validation failure we keep the
// previous snapshot and log the failure.
// ===========================================================================

/** Run ONCE to create the two tabs (idempotent) with headers + dropdowns. */
function setupChecklists() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()

  var ed = ss.getSheetByName(CHECKLISTS_NAME) || ss.insertSheet(CHECKLISTS_NAME)
  if (ed.getLastRow() === 0) {
    ed.appendRow(CHECKLISTS_COLUMNS)
    ed.setFrozenRows(1)
  }
  // Dropdowns so `area` and `procedure` cannot be mistyped (rows 2..1000).
  var areaRule = SpreadsheetApp.newDataValidation().requireValueInList(AREAS, true).setAllowInvalid(false).build()
  var procRule = SpreadsheetApp.newDataValidation().requireValueInList(ACTIONS, true).setAllowInvalid(false).build()
  ed.getRange('B2:B1000').setDataValidation(areaRule)
  ed.getRange('C2:C1000').setDataValidation(procRule)

  var pub = ss.getSheetByName(PUBLISHED_NAME) || ss.insertSheet(PUBLISHED_NAME)
  if (pub.getLastRow() === 0) {
    pub.appendRow(PUBLISHED_COLUMNS)
    pub.setFrozenRows(1)
    pub.getRange('A:A').setNumberFormat('@') // keep timestamps as literal text
  }
}

function checklistsSheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHECKLISTS_NAME)
  if (!sh) throw new Error('Tab "' + CHECKLISTS_NAME + '" not found. Run setupChecklists() once.')
  return sh
}

function publishedSheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PUBLISHED_NAME)
  if (!sh) throw new Error('Tab "' + PUBLISHED_NAME + '" not found. Run setupChecklists() once.')
  return sh
}

/** Fill any blank `id` cells with a fresh unique id (never reused/renumbered). */
function assignMissingIds_() {
  var sh = checklistsSheet_()
  var last = sh.getLastRow()
  if (last < 2) return
  var idRange = sh.getRange(2, 1, last - 1, 1)
  var ids = idRange.getValues()
  var changed = false
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === '') {
      ids[i][0] = 'itm_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12)
      changed = true
    }
  }
  if (changed) idRange.setValues(ids)
}

function readChecklistRows_() {
  var sh = checklistsSheet_()
  var last = sh.getLastRow()
  if (last < 2) return []
  return sh.getRange(2, 1, last - 1, CHECKLISTS_COLUMNS.length).getValues().map(function (r) {
    return {
      id: String(r[0]).trim(),
      area: String(r[1]).trim(),
      procedure: String(r[2]).trim(),
      group: String(r[3]).trim(),
      label: String(r[4]).trim(),
    }
  })
}

/** Returns { ok:true } or { ok:false, error }. A typo must not empty a checklist. */
function validateChecklistRows_(rows) {
  var seen = {} // "area|procedure" -> count
  for (var a = 0; a < AREAS.length; a++)
    for (var p = 0; p < ACTIONS.length; p++) seen[AREAS[a] + '|' + ACTIONS[p]] = 0

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i]
    var n = i + 2 // sheet row number
    if (AREAS.indexOf(row.area) === -1) return { ok: false, error: 'Row ' + n + ': invalid area "' + row.area + '".' }
    if (ACTIONS.indexOf(row.procedure) === -1) return { ok: false, error: 'Row ' + n + ': invalid procedure "' + row.procedure + '".' }
    if (!row.label) return { ok: false, error: 'Row ' + n + ': label is empty.' }
    seen[row.area + '|' + row.procedure]++
  }
  for (var key in seen) {
    if (seen.hasOwnProperty(key) && seen[key] === 0)
      return { ok: false, error: 'No items for ' + key.replace('|', ' / ') + '. Every area + procedure needs at least one item.' }
  }
  return { ok: true }
}

/** Build the published snapshot: { area: { procedure: [ { title, items:[{id,label}] } ] } }.
 *  Row order = display order; consecutive rows with the same group are merged. */
function buildChecklistsSnapshot_(rows) {
  var out = {}
  for (var a = 0; a < AREAS.length; a++) {
    out[AREAS[a]] = {}
    for (var p = 0; p < ACTIONS.length; p++) out[AREAS[a]][ACTIONS[p]] = []
  }
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    var groups = out[r.area][r.procedure]
    var last = groups.length ? groups[groups.length - 1] : null
    if (!last || last.title !== r.group) {
      last = { title: r.group, items: [] }
      groups.push(last)
    }
    last.items.push({ id: r.id, label: r.label })
  }
  return out
}

/** TIME-DRIVEN daily. Validate the editable tab and, only if valid, append a
 *  snapshot. On failure, keep the previous snapshot and log the reason. */
function publishChecklists() {
  var lock = LockService.getScriptLock()
  try { lock.waitLock(15000) } catch (e) { throw new Error('Busy; another publish is running.') }
  try {
    assignMissingIds_()
    var rows = readChecklistRows_()
    var when = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")

    var v = rows.length === 0 ? { ok: false, error: 'Checklists tab is empty.' } : validateChecklistRows_(rows)
    if (!v.ok) {
      publishedSheet_().appendRow([when, 'FAILED', v.error, ''])
      return { ok: false, error: v.error }
    }
    var snapshot = buildChecklistsSnapshot_(rows)
    publishedSheet_().appendRow([when, 'ok', '', JSON.stringify(snapshot)])
    return { ok: true, publishedAt: when }
  } finally {
    lock.releaseLock()
  }
}

/** doGet route=config → newest OK snapshot. { publishedAt, checklists } or { error }. */
function getPublishedConfig() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PUBLISHED_NAME)
  if (!sh) return { error: 'No published checklist configuration.' }
  var last = sh.getLastRow()
  if (last < 2) return { error: 'No published checklist configuration.' }
  var values = sh.getRange(2, 1, last - 1, PUBLISHED_COLUMNS.length).getValues()
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][1]) === 'ok') {
      try {
        return { publishedAt: String(values[i][0]), checklists: JSON.parse(values[i][3]) }
      } catch (e) {
        // keep scanning older snapshots if one is somehow corrupt
      }
    }
  }
  return { error: 'No published checklist configuration.' }
}

/** Run ONCE to schedule the daily publish at CONFIG_PUBLISH_HOUR (de-dupes). */
function installChecklistsTrigger() {
  var triggers = ScriptApp.getProjectTriggers()
  for (var i = 0; i < triggers.length; i++)
    if (triggers[i].getHandlerFunction() === 'publishChecklists') ScriptApp.deleteTrigger(triggers[i])
  ScriptApp.newTrigger('publishChecklists').timeBased().everyDays(1).atHour(CONFIG_PUBLISH_HOUR).create()
}
