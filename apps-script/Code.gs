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
 * PHASE 2 SETUP (email notifications), do these once after pasting this file:
 *  A. Run setupSubscribers() from the editor to create the "Subscribers" tab.
 *  B. Run installNotificationTrigger() ONCE to schedule the 5-minute email job.
 *     (Authorize when prompted. Running it again is safe — it de-dupes.)
 *  C. Redeploy: Deploy → Manage deployments → edit existing → New version.
 */

var SHEET_NAME = 'Records'
var SUBSCRIBERS_NAME = 'Subscribers'
var TIMEZONE = 'Europe/Lisbon'
var AREAS = ['general', 'big_lab', 'small_lab_gc', 'bromo_lab']
var AREA_LABELS = {
  general: 'General',
  big_lab: 'Big Lab',
  small_lab_gc: 'Small Lab / GC Room',
  bromo_lab: 'Bromo Lab',
}
var ACTIONS = ['opening', 'closing']
var RECORDS_PAGE = 30

// Column order in the Subscribers sheet.
var SUB_COLUMNS = ['id', 'email', 'areas', 'token', 'created_at', 'active']

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
    if (route === 'unsubscribe') return unsubscribePage(e.parameter.token)
    if (route === 'presence') return json(getPresence())
    if (route === 'presence_history') return json(getPresenceHistory(e.parameter.cursor))
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
    if (route === 'subscribe') return json(subscribeEmail(body.email, body.areas))
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

// ===========================================================================
// PHASE 2 — Subscribers + email notifications
// ===========================================================================

/** Run ONCE from the editor to create the Subscribers tab with headers. */
function setupSubscribers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sh = ss.getSheetByName(SUBSCRIBERS_NAME) || ss.insertSheet(SUBSCRIBERS_NAME)
  if (sh.getLastRow() === 0) {
    sh.appendRow(SUB_COLUMNS)
    sh.setFrozenRows(1)
  }
}

function subscribersSheet() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBSCRIBERS_NAME)
  if (!sh) throw new Error('Tab "' + SUBSCRIBERS_NAME + '" not found. Run setupSubscribers() once.')
  return sh
}

/** Add or update a subscriber. `areas` is 'all' or an array of area keys. */
function subscribeEmail(email, areas) {
  email = String(email || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.')

  var areasStr
  if (areas === 'all') {
    areasStr = 'all'
  } else if (Array.isArray(areas) && areas.length) {
    for (var i = 0; i < areas.length; i++)
      if (AREAS.indexOf(areas[i]) === -1) throw new Error('Unknown area: ' + areas[i])
    areasStr = areas.join(',')
  } else {
    throw new Error('Choose at least one area (or all areas).')
  }

  var lock = LockService.getScriptLock()
  lock.waitLock(10000)
  try {
    var sh = subscribersSheet()
    var last = sh.getLastRow()
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, SUB_COLUMNS.length).getValues() : []
    // Update in place if this email already exists.
    for (var r = 0; r < rows.length; r++) {
      if (String(rows[r][1]).trim().toLowerCase() === email) {
        sh.getRange(r + 2, 3).setValue(areasStr) // areas
        sh.getRange(r + 2, 6).setValue(true) // reactivate
        return { ok: true, updated: true }
      }
    }
    sh.appendRow([
      Utilities.getUuid(),
      email,
      areasStr,
      Utilities.getUuid(), // unsubscribe token
      Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      true,
    ])
    return { ok: true, updated: false }
  } finally {
    lock.releaseLock()
  }
}

/** doGet route=unsubscribe&token=… — flips active to FALSE, returns a friendly page. */
function unsubscribePage(token) {
  var msg = 'Link not recognised. You may already be unsubscribed.'
  if (token) {
    var sh = subscribersSheet()
    var last = sh.getLastRow()
    var rows = last > 1 ? sh.getRange(2, 1, last - 1, SUB_COLUMNS.length).getValues() : []
    for (var r = 0; r < rows.length; r++) {
      if (String(rows[r][3]) === String(token)) {
        sh.getRange(r + 2, 6).setValue(false)
        msg = 'You have been unsubscribed from lab notifications for ' + rows[r][1] + '.'
        break
      }
    }
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui;max-width:32rem;margin:3rem auto;padding:0 1rem;text-align:center">' +
      '<h2>Lab Checklist</h2><p>' + msg + '</p></div>',
  )
}

/**
 * TIME-DRIVEN: runs every 5 minutes. Sends one email per unnotified record to
 * matching active subscribers, then flips notified=TRUE. Decoupled from submit
 * so email trouble never blocks a submission.
 */
function sendPendingNotifications() {
  var sh = sheet()
  var last = sh.getLastRow()
  if (last < 2) return
  var values = sh.getRange(2, 1, last - 1, COLUMNS.length).getValues()
  var notifiedCol = COLUMNS.indexOf('notified') + 1

  var subs = readSubscribers()
  if (!subs.length) {
    // Still mark as notified so we don't rescan forever once someone subscribes.
    for (var n = 0; n < values.length; n++)
      if (values[n][notifiedCol - 1] !== true) sh.getRange(n + 2, notifiedCol).setValue(true)
    return
  }

  for (var i = 0; i < values.length; i++) {
    if (values[i][notifiedCol - 1] === true) continue
    var rec = rowToRecord(values[i])

    if (MailApp.getRemainingDailyQuota() < 5) {
      Logger.log('Mail quota nearly exhausted — deferring remaining notifications.')
      return // leave notified=FALSE; next run retries
    }

    var recipients = subs.filter(function (s) {
      return s.active && (s.areas === 'all' || s.areas.split(',').indexOf(rec.area) !== -1)
    })
    for (var k = 0; k < recipients.length; k++) {
      try {
        MailApp.sendEmail({
          to: recipients[k].email,
          subject: emailSubject(rec),
          htmlBody: emailBody(rec, recipients[k].token),
        })
      } catch (e) {
        Logger.log('Email to ' + recipients[k].email + ' failed: ' + e)
      }
    }
    sh.getRange(i + 2, notifiedCol).setValue(true)
  }
}

function readSubscribers() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBSCRIBERS_NAME)
  if (!sh) return []
  var last = sh.getLastRow()
  if (last < 2) return []
  return sh.getRange(2, 1, last - 1, SUB_COLUMNS.length).getValues().map(function (row) {
    return {
      email: String(row[1]).trim(),
      areas: String(row[2]).trim(),
      token: String(row[3]),
      active: row[5] === true || row[5] === 'TRUE',
    }
  })
}

function emailSubject(rec) {
  var label = AREA_LABELS[rec.area] || rec.area
  var verb = rec.action === 'closing' ? (rec.partial ? 'partially closed' : 'closed') : 'opened'
  var time = Utilities.formatDate(new Date(rec.timestamp), TIMEZONE, 'HH:mm')
  return '[Lab] ' + label + ' ' + verb + ' by ' + rec.initials + ' — ' + time
}

function emailBody(rec, token) {
  var label = AREA_LABELS[rec.area] || rec.area
  var when = Utilities.formatDate(new Date(rec.timestamp), TIMEZONE, 'EEE d MMM yyyy, HH:mm')
  var flags = []
  if (rec.action === 'closing' && rec.partial) flags.push('<b style="color:#b45309">PARTIAL CLOSING</b>')
  if (rec.overnight) flags.push('<b style="color:#6d28d9">OVERNIGHT REACTION RUNNING</b>')
  var unsub = ScriptApp.getService().getUrl() + '?route=unsubscribe&token=' + encodeURIComponent(token)

  return (
    '<div style="font-family:system-ui;max-width:36rem">' +
    '<h2 style="margin:0 0 .5rem">' + label + ' — ' + rec.action + '</h2>' +
    '<p style="margin:.25rem 0"><b>By:</b> ' + rec.initials + '<br><b>When:</b> ' + when + '</p>' +
    (flags.length ? '<p style="margin:.5rem 0">' + flags.join('<br>') + '</p>' : '') +
    (rec.comment
      ? '<p style="margin:.5rem 0"><b>Comment:</b><br>' +
        String(rec.comment).replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</p>'
      : '') +
    '<hr style="margin:1rem 0;border:none;border-top:1px solid #ddd">' +
    '<p style="font-size:12px;color:#888"><a href="' + unsub + '">Unsubscribe</a></p></div>'
  )
}

/** Run ONCE to schedule sendPendingNotifications every 5 minutes (de-dupes). */
function installNotificationTrigger() {
  var triggers = ScriptApp.getProjectTriggers()
  for (var i = 0; i < triggers.length; i++)
    if (triggers[i].getHandlerFunction() === 'sendPendingNotifications')
      ScriptApp.deleteTrigger(triggers[i])
  ScriptApp.newTrigger('sendPendingNotifications').timeBased().everyMinutes(5).create()
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
