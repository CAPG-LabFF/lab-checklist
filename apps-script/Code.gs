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

// ---- NMR submission queue -------------------------------------------------
// NMRSchedule is read LIVE (route=nmr_schedule) so same-day roster changes show
// at once. NMROptions (solvents + experiment types) uses the same daily-publish
// snapshot mechanism as the checklists, since it is validated config that rarely
// changes. Submissions and completions are append-only.
var NMR_SCHEDULE_NAME = 'NMRSchedule'
var NMR_SUBMISSIONS_NAME = 'NMRSubmissions'
var NMR_SUB_COLUMNS = ['id', 'timestamp', 'type', 'initials', 'lab', 'sample_name', 'solvent', 'experiments', 'quantity', 'mw', 'notes']
var NMR_COMPLETIONS_NAME = 'NMRCompletions'
var NMR_COMP_COLUMNS = ['id', 'timestamp', 'submission_id', 'operator', 'notes', 'status']
var NMR_OPTIONS_NAME = 'NMROptions'
var NMR_OPTIONS_COLUMNS = ['kind', 'value'] // kind = solvent | experiment
var NMR_OPTIONS_PUBLISHED_NAME = 'NMROptionsPublished'
var NMR_LABS = ['CA', 'PG']
var NMR_TYPES = ['1h', 'long']
// Completion event types (append-only). note/cancelled added beyond done/reopened
// so operators can annotate without completing and submitters can withdraw.
var NMR_COMP_STATUSES = ['note', 'done', 'reopened', 'cancelled']
var NMR_RECORDS_PAGE = 30

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
    if (route === 'nmr_schedule') return json(getNmrSchedule())
    if (route === 'nmr_options') return json(getNmrOptions())
    if (route === 'nmr_queue') return json(getNmrQueue())
    if (route === 'nmr_records') return json(getNmrRecords(e.parameter.cursor))
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
    if (route === 'nmr_submit') return json(nmrSubmit(body.record))
    if (route === 'nmr_complete') return json(nmrComplete(body.event))
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

/**
 * Idempotent: (re)builds a plain-language `README` tab that teaches a lab member
 * how to edit the Checklists tab safely. Reproducible from code — re-run any time
 * to refresh it. Run on staging first, then production. Editor-run only (no HTTP
 * route), so it needs no redeployment.
 */
function setupReadmeTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName('README') || ss.insertSheet('README')
  sh.clear()
  var existing = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)
  for (var i = 0; i < existing.length; i++) existing[i].remove()

  var TITLE = 'How to edit the Checklists tab — please read first'

  // Content blocks, in order. { t: text, h: true for a bold heading }. The
  // string EXAMPLE_MARKER is replaced by a small real table.
  var EXAMPLE_MARKER = '@@EXAMPLE@@'
  var blocks = [
    { t: 'The most important thing first', h: true },
    { t: 'Changes you make in the Checklists tab do NOT appear in the app straight away. They go live at the next daily update, at midnight (00:00, Lisbon time). If you change something and it has not appeared yet, that is normal — wait for the nightly update, or ask whoever manages the system to run the update now. This is the single most common thing people mistake for a bug.' },

    { t: 'What this tab is', h: true },
    { t: 'The Checklists tab is the master list of every item people tick off when they open or close a lab. Editing it changes what appears on everyone’s phone (after the nightly update). This page explains how to edit it safely. You do not need to understand anything technical.' },

    { t: 'The columns, one by one', h: true },
    { t: 'id  —  Leave this BLANK on a new row. The system fills it in automatically at the next update. Never type in it, never change it, never delete it, and never reuse an old one. Past records point to these ids, so changing an id would scramble old history.' },
    { t: 'area  —  Which lab the item belongs to. Always choose from the dropdown in the cell. Never type it by hand.' },
    { t: 'procedure  —  Whether the item is for "opening" or "closing". Always choose from the dropdown. Never type it by hand.' },
    { t: 'group  —  The section heading the item appears under (for example, "Turn OFF Rotavaps"). Type it EXACTLY the same as the other rows in that section — same spelling, same capitalisation. If it does not match, the item will appear in a little section of its own.' },
    { t: 'label  —  The words the person reads on their phone (for example, "Check the UV Lamp is turned OFF").' },

    { t: 'Row order is the order on the phone', h: true },
    { t: 'Items appear in the same order as the rows here. To place a new item where you want it to show up, put its row in that position (you can drag rows up and down to reorder them).' },

    { t: 'A worked example', h: true },
    { t: 'Here is one filled-in row. Notice the id is left blank — the system will fill it in:' },
    { t: EXAMPLE_MARKER },

    { t: 'How to add an item', h: true },
    { t: 'Add a new row where you want it to appear. Leave id blank. Choose area and procedure from the dropdowns. Type the group (matching the section heading exactly) and the label. That is all — it goes live at the next nightly update.' },

    { t: 'How to reword an item', h: true },
    { t: 'Edit the label cell only. Leave the id exactly as it is. Changing the wording keeps the same item, and keeping the id keeps the history correct.' },

    { t: 'How to remove an item', h: true },
    { t: 'Delete the whole row. That is all. Records that already used that item are not affected (see "Your past records are safe" below).' },

    { t: 'If you make a mistake, nothing breaks', h: true },
    { t: 'Before each nightly update the system checks the whole tab. If anything is filled in wrongly, it does NOT publish — the previous day’s checklist simply stays in force until the problem is fixed. A mistake here only delays a change; it never breaks the app and never leaves a lab with an empty checklist. So do not be afraid to edit.' },

    { t: 'Two things never to do', h: true },
    { t: '1.  Never leave any lab with no items for opening, or no items for closing. Every lab needs at least one opening item and one closing item, or the update will refuse to publish.' },
    { t: '2.  Never edit or clear the id column.' },

    { t: 'Your past records are safe', h: true },
    { t: 'Every time someone submits a checklist, the app stores its own copy of exactly what the list looked like at that moment. Editing this tab only changes the list from now on — it never rewrites or affects records that were already submitted.' },

    { t: '"My change did not appear" — what to check', h: true },
    { t: '1.  Has the nightly update run since you made the change? Changes only appear after the 00:00 update (or after someone runs the update by hand).' },
    { t: '2.  Is there an invalid row somewhere? If any row is wrong, the whole update is held back and the old checklist stays. Look for a blank label, an area or procedure that was typed instead of chosen from the dropdown, or a lab left with no items — fix it, then wait for the next update.' },

    { t: 'Who may edit this tab', h: true },
    { t: 'Only the lab account, and anyone it has explicitly shared editing with. If you cannot edit and think you should be able to, that is deliberate — ask whoever holds the lab account.' },

    { t: 'Anything beyond checklist edits', h: true },
    { t: 'See the file HANDOVER.md in the project’s code repository. It covers the accounts, the app, the "In Lab" board, and what to do if the site or the daily updates ever stop working.' },
  ]

  // Title row (frozen).
  sh.getRange(1, 1).setValue(TITLE)
  var row = 3 // leave row 2 blank as breathing space under the title
  var headingRows = []
  for (var b = 0; b < blocks.length; b++) {
    if (blocks[b].t === EXAMPLE_MARKER) {
      // A small real table with the actual column headers.
      sh.getRange(row, 1, 1, 5).setValues([CHECKLISTS_COLUMNS])
      sh.getRange(row + 1, 1, 1, 5).setValues([['', 'big_lab', 'closing', 'UV Lamp', 'Check the UV Lamp is turned OFF']])
      sh.getRange(row, 1, 1, 5).setFontWeight('bold').setBackground('#e8eaed')
      sh.getRange(row, 1, 2, 5).setBorder(true, true, true, true, true, true)
      sh.getRange(row, 1, 2, 5).setVerticalAlignment('middle')
      sh.getRange(row + 1, 1).setBackground('#fff8e1') // highlight the blank id cell
      row += 3 // table (2 rows) + a blank spacer
    } else {
      var cell = sh.getRange(row, 1)
      cell.setValue(blocks[b].t)
      if (blocks[b].h) headingRows.push(row)
      row += 1
    }
  }

  // Layout + typography for spreadsheet reading.
  sh.setFrozenRows(1)
  sh.setColumnWidth(1, 760)
  sh.setColumnWidths(2, 4, 150)
  sh.getRange(1, 1, row, 6).setWrap(true).setVerticalAlignment('top')
  sh.getRange(1, 1).setFontSize(15).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff')
  sh.setRowHeight(1, 40)
  for (var h = 0; h < headingRows.length; h++) {
    sh.getRange(headingRows[h], 1).setFontWeight('bold').setFontSize(12)
  }

  // Prevent accidental edits. Warning-only so it can never lock out whoever
  // operates the sheet and needs no account email. To hard-lock to the lab
  // account only, add an editor restriction the same way as the Checklists tab
  // (Data -> Protect sheets and ranges), done once from the lab account.
  sh.protect().setDescription('README (generated by setupReadmeTab) — do not edit by hand').setWarningOnly(true)
}

// ===========================================================================
// NMR — sample submission queue
// Additive; independent of everything above. Submissions + completions are
// append-only. NMROptions uses the daily-publish snapshot; NMRSchedule is read
// live. Views (queue / completed) are derived at read time from completion events.
// ===========================================================================

/** Idempotent: create all NMR tabs, seed default options + a starter schedule. */
function setupNmr() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()

  ss.getSheetByName(NMR_SUBMISSIONS_NAME) || nmrHeaderTab_(ss, NMR_SUBMISSIONS_NAME, NMR_SUB_COLUMNS)
  ss.getSheetByName(NMR_COMPLETIONS_NAME) || nmrHeaderTab_(ss, NMR_COMPLETIONS_NAME, NMR_COMP_COLUMNS)

  // NMROptions (editable) + its published archive.
  var opt = ss.getSheetByName(NMR_OPTIONS_NAME)
  if (!opt) {
    opt = nmrHeaderTab_(ss, NMR_OPTIONS_NAME, NMR_OPTIONS_COLUMNS)
    var kindRule = SpreadsheetApp.newDataValidation().requireValueInList(['solvent', 'experiment'], true).setAllowInvalid(false).build()
    opt.getRange('A2:A1000').setDataValidation(kindRule)
    var seed = []
    // Standard NMR solvents — the lab should review/edit these in the tab.
    var solvents = ['CDCl3', 'DMSO-d6', 'D2O', 'CD3OD (methanol-d4)', 'Acetone-d6', 'C6D6 (benzene-d6)', 'CD3CN (acetonitrile-d3)', 'CD2Cl2 (DCM-d2)', 'toluene-d8', 'THF-d8']
    var experiments = ['1H', '13C', 'COSY', 'HSQC', 'HMBC', 'NOESY']
    for (var s = 0; s < solvents.length; s++) seed.push(['solvent', solvents[s]])
    for (var x = 0; x < experiments.length; x++) seed.push(['experiment', experiments[x]])
    opt.getRange(2, 1, seed.length, 2).setValues(seed)
  }
  if (!ss.getSheetByName(NMR_OPTIONS_PUBLISHED_NAME)) {
    var pub = nmrHeaderTab_(ss, NMR_OPTIONS_PUBLISHED_NAME, PUBLISHED_COLUMNS)
    pub.getRange('A:A').setNumberFormat('@')
  }

  // NMRSchedule (grid). Seed a Mon–Fri skeleton with a couple of slots to edit.
  if (!ss.getSheetByName(NMR_SCHEDULE_NAME)) {
    var sch = ss.insertSheet(NMR_SCHEDULE_NAME)
    sch.getRange(1, 1, 3, 6).setValues([
      ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      ['08:30', '', '', '', '', ''],
      ['11:30', '', '', '', '', ''],
    ])
    sch.setFrozenRows(1)
    sch.setFrozenColumns(1)
    sch.getRange('1:1').setFontWeight('bold')
    sch.getRange('A:A').setFontWeight('bold')
  }
}

function nmrHeaderTab_(ss, name, columns) {
  var sh = ss.insertSheet(name)
  sh.appendRow(columns)
  sh.setFrozenRows(1)
  return sh
}

// ---- NMROptions: validate + publish (mirrors the checklist publisher) ------

/** TIME-DRIVEN daily. Validate NMROptions and append a snapshot if valid. */
function publishNmrOptions() {
  var lock = LockService.getScriptLock()
  try { lock.waitLock(15000) } catch (e) { throw new Error('Busy; another publish is running.') }
  try {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NMR_OPTIONS_NAME)
    var when = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX")
    var pub = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NMR_OPTIONS_PUBLISHED_NAME)
    if (!sh || !pub) throw new Error('Run setupNmr() first.')

    var last = sh.getLastRow()
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, NMR_OPTIONS_COLUMNS.length).getValues() : []
    var solvents = [], experiments = []
    for (var i = 0; i < rows.length; i++) {
      var kind = String(rows[i][0]).trim(), value = String(rows[i][1]).trim()
      if (!kind && !value) continue // skip blank rows
      if (kind !== 'solvent' && kind !== 'experiment') { pub.appendRow([when, 'FAILED', 'Row ' + (i + 2) + ': kind must be solvent or experiment.', '']); return { ok: false } }
      if (!value) { pub.appendRow([when, 'FAILED', 'Row ' + (i + 2) + ': value is empty.', '']); return { ok: false } }
      ;(kind === 'solvent' ? solvents : experiments).push(value)
    }
    if (!solvents.length || !experiments.length) {
      pub.appendRow([when, 'FAILED', 'Need at least one solvent and one experiment.', ''])
      return { ok: false }
    }
    pub.appendRow([when, 'ok', '', JSON.stringify({ solvents: solvents, experiments: experiments })])
    return { ok: true, publishedAt: when }
  } finally {
    lock.releaseLock()
  }
}

/** doGet route=nmr_options → newest published { solvents, experiments }. */
function getNmrOptions() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NMR_OPTIONS_PUBLISHED_NAME)
  if (!sh || sh.getLastRow() < 2) return { error: 'No published NMR options.' }
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, PUBLISHED_COLUMNS.length).getValues()
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][1]) === 'ok') {
      try { var o = JSON.parse(values[i][3]); return { publishedAt: String(values[i][0]), solvents: o.solvents, experiments: o.experiments } } catch (e) {}
    }
  }
  return { error: 'No published NMR options.' }
}

function installNmrOptionsTrigger() {
  var triggers = ScriptApp.getProjectTriggers()
  for (var i = 0; i < triggers.length; i++)
    if (triggers[i].getHandlerFunction() === 'publishNmrOptions') ScriptApp.deleteTrigger(triggers[i])
  ScriptApp.newTrigger('publishNmrOptions').timeBased().everyDays(1).atHour(CONFIG_PUBLISH_HOUR).create()
}

// ---- NMRSchedule: read live and parse the grid -----------------------------

/** doGet route=nmr_schedule → { days:[...], slots:[{time, byDay:{day:who}}] }. */
function getNmrSchedule() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NMR_SCHEDULE_NAME)
  if (!sh) return { days: [], slots: [] }
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn()
  if (lastRow < 2 || lastCol < 2) return { days: [], slots: [] }
  var grid = sh.getRange(1, 1, lastRow, lastCol).getValues()
  var days = []
  for (var c = 1; c < lastCol; c++) days.push(String(grid[0][c]).trim())
  var slots = []
  for (var r = 1; r < lastRow; r++) {
    var time = String(grid[r][0]).trim()
    if (!time) continue
    var byDay = {}
    for (var c2 = 1; c2 < lastCol; c2++) byDay[days[c2 - 1]] = String(grid[r][c2]).trim()
    slots.push({ time: time, byDay: byDay })
  }
  return { days: days, slots: slots }
}

// ---- NMR submissions -------------------------------------------------------

function rowToNmrSubmission_(row) {
  return {
    id: String(row[0]), timestamp: String(row[1]), type: String(row[2]), initials: String(row[3]),
    lab: String(row[4]), sample_name: String(row[5]), solvent: String(row[6]),
    experiments: String(row[7]) ? String(row[7]).split(',').map(function (s) { return s.trim() }).filter(Boolean) : [],
    quantity: String(row[8]), mw: String(row[9]), notes: String(row[10]),
  }
}

function readNmrSubmissions_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NMR_SUBMISSIONS_NAME)
  if (!sh || sh.getLastRow() < 2) return []
  return sh.getRange(2, 1, sh.getLastRow() - 1, NMR_SUB_COLUMNS.length).getValues().map(rowToNmrSubmission_)
}

/** doPost route=nmr_submit → validate against published options, then append. */
function nmrSubmit(record) {
  if (!record) throw new Error('Missing submission.')
  if (NMR_TYPES.indexOf(record.type) === -1) throw new Error('Invalid type.')
  var initials = String(record.initials || '').trim().toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(initials)) throw new Error('Initials must be 2–4 letters.')
  if (NMR_LABS.indexOf(record.lab) === -1) throw new Error('Lab must be CA or PG.')
  var sampleName = String(record.sample_name || '').trim()
  if (!sampleName) throw new Error('Sample name is required.')

  var opts = getNmrOptions()
  if (opts.error) throw new Error('NMR options are not published yet.')
  if (opts.solvents.indexOf(String(record.solvent).trim()) === -1) throw new Error('Unknown solvent.')

  var experiments = []
  var quantity = '', mw = ''
  if (record.type === 'long') {
    experiments = Array.isArray(record.experiments) ? record.experiments : []
    if (!experiments.length) throw new Error('Select at least one experiment.')
    for (var i = 0; i < experiments.length; i++)
      if (opts.experiments.indexOf(experiments[i]) === -1) throw new Error('Unknown experiment: ' + experiments[i])
    quantity = String(record.quantity || '').trim()
    mw = String(record.mw || '').trim()
    if (!quantity) throw new Error('Quantity (mg) is required.')
    if (!mw) throw new Error('Molecular weight is required.')
  }

  var lock = LockService.getScriptLock()
  try { lock.waitLock(10000) } catch (e) { throw new Error('The system is busy. Please try again.') }
  try {
    var stored = {
      id: Utilities.getUuid(),
      timestamp: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      type: record.type, initials: initials, lab: record.lab, sample_name: sampleName,
      solvent: String(record.solvent).trim(), experiments: experiments.join(','),
      quantity: quantity, mw: mw, notes: String(record.notes || '').trim(),
    }
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NMR_SUBMISSIONS_NAME).appendRow([
      stored.id, stored.timestamp, stored.type, stored.initials, stored.lab, stored.sample_name,
      stored.solvent, stored.experiments, stored.quantity, stored.mw, stored.notes,
    ])
    stored.experiments = experiments
    return stored
  } finally {
    lock.releaseLock()
  }
}

// ---- NMR completions (append-only) + derived views -------------------------

function readNmrCompletions_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NMR_COMPLETIONS_NAME)
  if (!sh || sh.getLastRow() < 2) return []
  return sh.getRange(2, 1, sh.getLastRow() - 1, NMR_COMP_COLUMNS.length).getValues().map(function (row) {
    return { id: String(row[0]), timestamp: String(row[1]), submission_id: String(row[2]), operator: String(row[3]), notes: String(row[4]), status: String(row[5]) }
  })
}

/** Map submission_id -> { state, events[] }. State = last done/reopened/cancelled
 *  event (note events annotate but don't change state). Row order = chronological. */
function nmrCompletionMap_() {
  var comps = readNmrCompletions_()
  var map = {}
  for (var i = 0; i < comps.length; i++) {
    var c = comps[i]
    if (!map[c.submission_id]) map[c.submission_id] = { state: 'pending', events: [] }
    map[c.submission_id].events.push(c)
    if (c.status === 'done' || c.status === 'reopened' || c.status === 'cancelled') map[c.submission_id].state = c.status
  }
  return map
}

/** doGet route=nmr_queue → pending submissions (oldest first) + their events. */
function getNmrQueue() {
  var map = nmrCompletionMap_()
  var out = []
  var subs = readNmrSubmissions_() // chronological (oldest first) — queue order
  for (var i = 0; i < subs.length; i++) {
    var m = map[subs[i].id]
    var state = m ? m.state : 'pending'
    if (state === 'pending' || state === 'reopened') out.push({ submission: subs[i], events: m ? m.events : [] })
  }
  return { queue: out }
}

/** doGet route=nmr_records → completed submissions (newest first, paginated). */
function getNmrRecords(cursor) {
  var map = nmrCompletionMap_()
  var subs = readNmrSubmissions_()
  var done = []
  for (var i = subs.length - 1; i >= 0; i--) { // newest first
    var m = map[subs[i].id]
    if (m && m.state === 'done') done.push({ submission: subs[i], events: m.events })
  }
  var offset = cursor ? parseInt(cursor, 10) : 0
  var page = done.slice(offset, offset + NMR_RECORDS_PAGE)
  var next = offset + NMR_RECORDS_PAGE < done.length ? String(offset + NMR_RECORDS_PAGE) : null
  return { records: page, nextCursor: next }
}

/** doPost route=nmr_complete → append a completion event (note/done/reopened/cancelled). */
function nmrComplete(event) {
  if (!event) throw new Error('Missing event.')
  if (NMR_COMP_STATUSES.indexOf(event.status) === -1) throw new Error('Invalid status.')
  var operator = String(event.operator || '').trim().toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(operator)) throw new Error('Operator initials must be 2–4 letters.')
  var subId = String(event.submission_id || '').trim()
  if (!subId) throw new Error('Missing submission_id.')

  var lock = LockService.getScriptLock()
  try { lock.waitLock(10000) } catch (e) { throw new Error('The system is busy. Please try again.') }
  try {
    // Validate submission exists and check current state for conflicts.
    var subs = readNmrSubmissions_()
    var exists = false
    for (var i = 0; i < subs.length; i++) if (subs[i].id === subId) { exists = true; break }
    if (!exists) throw new Error('Unknown submission.')

    var m = nmrCompletionMap_()[subId]
    var state = m ? m.state : 'pending'
    if (event.status === 'done' && state === 'done') {
      var who = ''
      for (var e = m.events.length - 1; e >= 0; e--) if (m.events[e].status === 'done') { who = m.events[e].operator; break }
      throw new Error('Already marked done by ' + who + '.')
    }
    if (event.status === 'cancelled' && state === 'done') throw new Error('Already completed — cannot cancel.')
    if (event.status === 'reopened' && state !== 'done') throw new Error('Only a completed sample can be reopened.')

    var row = {
      id: Utilities.getUuid(),
      timestamp: Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      submission_id: subId, operator: operator, notes: String(event.notes || '').trim(), status: event.status,
    }
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(NMR_COMPLETIONS_NAME).appendRow([
      row.id, row.timestamp, row.submission_id, row.operator, row.notes, row.status,
    ])
    return { ok: true, event: row }
  } finally {
    lock.releaseLock()
  }
}
