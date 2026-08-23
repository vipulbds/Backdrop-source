/**
 * ============================================================================
 *  BACKDROPSOURCE — VISITOR + TOUCHPOINT TRACKING  (Google Apps Script)
 * ============================================================================
 *  STANDALONE backend for the bds-visitors.liquid snippet. Separate from the
 *  unified lead/order script (usa-oct-apps-script.gs) — its own Web App, its
 *  own (or shared) spreadsheet. Every beacon carries `country` + `type`; this
 *  routes to the right tab and AUTO-CREATES tabs per country.
 *
 *  TABS (auto-created per country code)
 *    "<CC> Visits"    — one row per PAGEVIEW = the anonymous touchpoint journey.
 *                       Engagement (Time on Page / Max Scroll % / Clicks /
 *                       Form Started) is back-filled by the exit "engage" beacon.
 *    "<CC> Identify"  — append-only log of every consented identification
 *                       (a form submit or a Google sign-in) with the visitor id.
 *    "<CC> Visitors"  — one row per VISITOR (rolled-up profile). REBUILT from
 *                       the Visits + Identify tabs by buildVisitorProfiles(cc);
 *                       Name/Email/Phone are STITCHED in by matching Visitor ID.
 *
 *  DATA IN — all GET-beacon to this Web App's /exec URL:
 *    type=visit     → saveVisit_    (pageview row)
 *    type=engage    → saveEngage_   (fills engagement on the matching row)
 *    type=identify  → saveIdentify_ (name/email/phone the visitor gave)
 *
 *  SETUP
 *    1. Put SHEET_ID below (any Google Sheet you own; can be the SAME sheet as
 *       the unified script — tabs won't collide, names differ).
 *    2. Deploy > New deployment > Web app > Execute as: Me,
 *       Who has access: Anyone. Copy the /exec URL into bds-visitors.liquid.
 *    3. Add a time-driven trigger (Triggers > Add trigger) running
 *       runVisitorMaintenance every 10-15 min so "<CC> Visitors" profiles +
 *       colours stay fresh. (Pageviews log live regardless.)
 *    Re-deploy: Manage deployments > Edit (pencil) > Version: New version.
 *    Open the /exec URL to read the [VERSION] marker.
 * ============================================================================
 */

var VERSION = 'bds-visitors v1';

var CONFIG = {
  SHEET_ID: 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE',   // e.g. 15wnVR1TSrEnBuEg6QCLRUxJ3ptuTyOdlOriF28viAQ0
  ENGAGE_SCAN_ROWS: 500                            // how far back the engage beacon searches for its pageview row
};

// Per-country timezone (used only for the profile "Total Time" formatting / future use).
var COUNTRY_CFG = {
  USA: { tz: 'America/Chicago' },
  CA:  { tz: 'America/Toronto' },
  UK:  { tz: 'Europe/London' }
};

var VISIT_HEADERS = [
  'Timestamp', 'Visitor ID', 'Session ID', 'New Visitor', 'Visit No', 'Session Hit',
  'Page Title', 'Page Path', 'Page URL', 'Referrer', 'Source',
  'Device Type', 'Browser', 'OS', 'Screen', 'Viewport', 'Language', 'Timezone',
  'Country', 'Region', 'City',
  'Time on Page (s)', 'Max Scroll %', 'Clicks', 'Form Started',
  'GCLID', 'GBRAID', 'WBRAID', 'FBCLID', 'MSCLKID', 'LI FAT ID',
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'First Seen'
];

var IDENTIFY_HEADERS = [
  'Timestamp', 'Visitor ID', 'Session ID', 'Name', 'Email', 'Phone',
  'Method', 'Source', 'Page URL'
];

var VISITOR_HEADERS = [
  'Visitor ID', 'First Seen', 'Last Seen', 'Sessions', 'Pageviews', 'Total Time (s)',
  'First Source', 'Last Source', 'Landing Page', 'Last Page',
  'Device Type', 'Browser', 'OS', 'Country', 'Region', 'City', 'Language', 'Timezone',
  'Identified?', 'Name', 'Email', 'Phone', 'Identified Via'
];

/* ============================== WEB APP ================================== */

function doPost(e) {
  var data = {};
  try { if (e && e.postData && e.postData.contents) data = JSON.parse(e.postData.contents); }
  catch (err) { data = (e && e.parameter) ? e.parameter : {}; }
  if (e && e.parameter) Object.keys(e.parameter).forEach(function (k) { if (data[k] === undefined) data[k] = e.parameter[k]; });
  return route_(data);
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (p.type || p.visitor_id) return route_(p);
  return jsonOut_({ ok: true, version: VERSION, message: 'Backdropsource visitor tracking endpoint is live.' });
}

function route_(data) {
  var t = String(data.type || 'visit').toLowerCase();
  if (t === 'engage' || t === 'engagement') return saveEngage_(data);
  if (t === 'identify' || t === 'identity') return saveIdentify_(data);
  return saveVisit_(data);   // default: pageview
}

/* ------------------------------ PAGEVIEW -------------------------------- */
function saveVisit_(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var sheet = getTab_(tabName_(data, 'Visits'), VISIT_HEADERS);
    var v = {
      'Timestamp': tsOf_(data),
      'Visitor ID': data.visitor_id || '',
      'Session ID': data.session_id || '',
      'New Visitor': data.new_visitor || '',
      'Visit No': data.visit_no || '',
      'Session Hit': data.session_hit || '',
      'Page Title': data.page_title || '',
      'Page Path': data.page_path || '',
      'Page URL': data.page_url || '',
      'Referrer': data.referrer || '',
      'Source': data.source || classifySource_(data),
      'Device Type': data.device_type || '',
      'Browser': data.browser || '',
      'OS': data.os || '',
      'Screen': data.screen || '',
      'Viewport': data.viewport || '',
      'Language': data.language || '',
      'Timezone': data.timezone || '',
      'Country': data.country || '',
      'Region': data.region || '',
      'City': data.city || '',
      'Time on Page (s)': '', 'Max Scroll %': '', 'Clicks': '', 'Form Started': '',
      'GCLID': data.gclid || '', 'GBRAID': data.gbraid || '', 'WBRAID': data.wbraid || '',
      'FBCLID': data.fbclid || '', 'MSCLKID': data.msclkid || '', 'LI FAT ID': data.li_fat_id || '',
      'UTM Source': data.utm_source || '', 'UTM Medium': data.utm_medium || '', 'UTM Campaign': data.utm_campaign || '',
      'First Seen': data.first_seen || ''
    };
    appendByHeader_(sheet, v, VISIT_HEADERS);
    return jsonOut_({ ok: true, version: VERSION });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ---------------------------- ENGAGEMENT -------------------------------- */
/* Fill Time on Page / Max Scroll % / Clicks / Form Started on the most-recent
   matching pageview row (same visitor + session + path). Bounded reverse scan
   over the last ENGAGE_SCAN_ROWS rows so it stays fast as the tab grows. */
function saveEngage_(data) {
  var vid = String(data.visitor_id || ''); if (!vid) return jsonOut_({ ok: false, error: 'no visitor_id' });
  var sid = String(data.session_id || '');
  var path = String(data.page_path || '');
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var sheet = getTab_(tabName_(data, 'Visits'), VISIT_HEADERS);
    var last = sheet.getLastRow();
    if (last < 2) return jsonOut_({ ok: true, note: 'no rows' });
    var startRow = Math.max(2, last - CONFIG.ENGAGE_SCAN_ROWS + 1);
    var n = last - startRow + 1;
    var width = sheet.getLastColumn();
    var col = indexMap_(sheet.getRange(1, 1, 1, width).getValues()[0]);
    var vals = sheet.getRange(startRow, 1, n, width).getValues();
    for (var i = n - 1; i >= 0; i--) {
      var row = vals[i];
      if (String(row[col['Visitor ID']]) !== vid) continue;
      if (sid && col['Session ID'] != null && String(row[col['Session ID']]) !== sid) continue;
      if (path && col['Page Path'] != null && String(row[col['Page Path']]) !== path) continue;
      var rowNum = startRow + i;
      setMax_(sheet, rowNum, col['Time on Page (s)'], data.seconds);
      setMax_(sheet, rowNum, col['Max Scroll %'], data.scroll);
      setMax_(sheet, rowNum, col['Clicks'], data.clicks);
      if (col['Form Started'] != null && String(data.form_started || '') === 'Yes') sheet.getRange(rowNum, col['Form Started'] + 1).setValue('Yes');
      return jsonOut_({ ok: true, updated: rowNum });
    }
    return jsonOut_({ ok: true, note: 'no matching pageview in scan window' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ----------------------------- IDENTIFY --------------------------------- */
function saveIdentify_(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var sheet = getTab_(tabName_(data, 'Identify'), IDENTIFY_HEADERS);
    var v = {
      'Timestamp': tsOf_(data),
      'Visitor ID': data.visitor_id || '',
      'Session ID': data.session_id || '',
      'Name': data.name || '',
      'Email': data.email || '',
      'Phone': data.phone || '',
      'Method': data.method || 'form',
      'Source': data.source || classifySource_(data),
      'Page URL': data.page_url || ''
    };
    appendByHeader_(sheet, v, IDENTIFY_HEADERS);
    return jsonOut_({ ok: true, version: VERSION });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ===================== VISITOR PROFILE REBUILD ========================== */
/* Aggregate "<CC> Visits" into a one-row-per-visitor "<CC> Visitors" tab and
   stitch in the latest Name/Email/Phone from "<CC> Identify" by Visitor ID.
   Run buildAllVisitorProfiles() on the maintenance trigger (batched — cheaper
   than upserting per pageview). */

function buildAllVisitorProfiles() {
  var ss = getSpreadsheet_();
  ss.getSheets().forEach(function (sh) {
    var m = sh.getName().match(/^(\S+) Visits$/);
    if (m) { try { buildVisitorProfiles(m[1]); } catch (e) { Logger.log('profiles ' + m[1] + ': ' + e); } }
  });
}

function buildVisitorProfiles(cc) {
  cc = String(cc || '').toUpperCase();
  var visits = getTab_(cc + ' Visits', VISIT_HEADERS);
  var vals = visits.getDataRange().getValues();
  if (vals.length < 2) { Logger.log(cc + ': no visits yet.'); return; }
  var c = indexMap_(vals[0]);

  var prof = {}, order = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    var id = String(r[c['Visitor ID']] || ''); if (!id) continue;
    var ts = r[c['Timestamp']]; var when = (ts instanceof Date) ? ts : new Date(ts);
    var p = prof[id];
    if (!p) { p = prof[id] = { id: id, first: when, last: when, firstSeen: '', sessions: {}, pv: 0, secs: 0,
      firstSrc: '', lastSrc: '', landing: '', lastPage: '', dev: '', br: '', os: '', country: '', region: '', city: '', lang: '', tz: '' }; order.push(id); }
    p.pv++;
    var sid = String(r[c['Session ID']] || ''); if (sid) p.sessions[sid] = 1;
    var secs = Number(r[c['Time on Page (s)']]); if (!isNaN(secs)) p.secs += secs;
    if (r[c['First Seen']]) p.firstSeen = r[c['First Seen']];
    if (when <= p.first) { p.first = when; p.firstSrc = r[c['Source']] || p.firstSrc; p.landing = r[c['Page URL']] || p.landing; }
    if (when >= p.last)  { p.last = when; p.lastSrc = r[c['Source']] || p.lastSrc; p.lastPage = r[c['Page URL']] || p.lastPage;
      p.dev = r[c['Device Type']] || p.dev; p.br = r[c['Browser']] || p.br; p.os = r[c['OS']] || p.os;
      p.lang = r[c['Language']] || p.lang; p.tz = r[c['Timezone']] || p.tz; }
    if (r[c['Country']]) p.country = r[c['Country']];
    if (r[c['Region']]) p.region = r[c['Region']];
    if (r[c['City']]) p.city = r[c['City']];
  }

  // Join identities (latest per visitor).
  var idMap = {};
  var idSheet = getSpreadsheet_().getSheetByName(cc + ' Identify');
  if (idSheet) {
    var iv = idSheet.getDataRange().getValues();
    if (iv.length > 1) {
      var ic = indexMap_(iv[0]);
      for (var j = 1; j < iv.length; j++) {
        var iid = String(iv[j][ic['Visitor ID']] || ''); if (!iid) continue;
        var m = idMap[iid] || (idMap[iid] = { name: '', email: '', phone: '', via: {} });
        if (iv[j][ic['Name']]) m.name = iv[j][ic['Name']];
        if (iv[j][ic['Email']]) m.email = iv[j][ic['Email']];
        if (iv[j][ic['Phone']]) m.phone = iv[j][ic['Phone']];
        var via = String(iv[j][ic['Method']] || ''); if (via) m.via[via] = 1;
      }
    }
  }

  order.sort(function (a, b) { return prof[b].last - prof[a].last; });   // most recent first
  var out = [VISITOR_HEADERS];
  order.forEach(function (id) {
    var p = prof[id], m = idMap[id] || {};
    var identified = (m.email || m.name || m.phone) ? 'Yes' : 'No';
    var via = m.via ? Object.keys(m.via).join(', ') : '';
    out.push([
      id, p.firstSeen || p.first, p.last, Object.keys(p.sessions).length, p.pv, p.secs,
      p.firstSrc, p.lastSrc, p.landing, p.lastPage,
      p.dev, p.br, p.os, p.country, p.region, p.city, p.lang, p.tz,
      identified, m.name || '', m.email || '', m.phone || '', via
    ]);
  });
  writeTab_(cc + ' Visitors', out);
  Logger.log(cc + ': rebuilt ' + (out.length - 1) + ' visitor profile(s).');
}

/* Convenience: put this on a single 10-15 min time trigger. */
function runVisitorMaintenance() {
  try { buildAllVisitorProfiles(); } catch (e) { Logger.log('buildAllVisitorProfiles: ' + e); }
  try { formatAllVisitorTabs(); } catch (e) { Logger.log('formatAllVisitorTabs: ' + e); }
}

/* ========================= SHEET FORMATTING ============================= */
var HEADER_BG = '#1B2D55', HEADER_FG = '#FFFFFF';
var SRC_RULES = [
  ['Google', '#E8F0FE'], ['Microsoft', '#E6F4EA'], ['Bing', '#E6F4EA'],
  ['LinkedIn', '#DCE7F0'], ['Meta', '#EDE7F6'], ['Facebook', '#EDE7F6'],
  ['Referral', '#FEF7E0'], ['Direct', '#F1F3F4']
];
var DEVICE_COLORS = { 'Desktop': '#D6E4F7', 'Mobile': '#D4EDCB', 'Tablet': '#FBE0C4' };
var IDFLAG_COLORS = { 'Yes': '#CDEBD3', 'No': '#F1F3F4' };
// Colour Name/Email/Visitor ID cells BY VALUE so the same person always gets the
// same colour and duplicates/returning visitors stand out.
var VALUE_PALETTE = ['#D6E4F7','#E7DAF5','#FBE0C4','#D3EAF5','#FAF0C4','#D4EDCB',
  '#DCDDF6','#FADCE4','#CFEBE3','#FBD9CE','#E2E6EC','#F3D9EE','#D9EFDF','#EFE4C4',
  '#CFE0EF','#EAD7E1','#DCEFE9','#F6DBC9','#E8DFF5','#DDEAD2'];

function formatAllVisitorTabs() {
  var ss = getSpreadsheet_();
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    try {
      if (/ Visits$/.test(name)) formatTab_(sh, 'Device Type', DEVICE_COLORS, ['Visitor ID']);
      else if (/ Visitors$/.test(name)) formatTab_(sh, 'Identified?', IDFLAG_COLORS, ['Visitor ID', 'Email', 'Name']);
      else if (/ Identify$/.test(name)) formatTab_(sh, null, null, ['Visitor ID', 'Email', 'Name']);
    } catch (e) { Logger.log('format ' + name + ': ' + e); }
  });
}

function formatTab_(sh, catCol, catColors, valueCols) {
  if (sh.getLastRow() < 1) return;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = indexMap_(headers);
  var maxR = sh.getMaxRows() - 1;
  if (maxR < 1) return;

  sh.getRange(1, 1, 1, headers.length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sh.setFrozenRows(1);

  var rules = [];
  if (catCol && col[catCol] != null && catColors) {
    var catRange = sh.getRange(2, col[catCol] + 1, maxR, 1);
    Object.keys(catColors).forEach(function (k) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(catColors[k]).setRanges([catRange]).build());
    });
  }
  if (col['Source'] != null) {
    var srcRange = sh.getRange(2, col['Source'] + 1, maxR, 1);
    SRC_RULES.forEach(function (pr) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextContains(pr[0]).setBackground(pr[1]).setRanges([srcRange]).build());
    });
  }
  sh.setConditionalFormatRules(rules);

  (valueCols || []).forEach(function (h) { if (col[h] != null) colorByValue_(sh, col[h], maxR); });
}

function colorByValue_(sh, ci, maxR) {
  var range = sh.getRange(2, ci + 1, maxR, 1);
  var vals = range.getValues(), bg = [];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] || '').trim().toLowerCase();
    bg.push([v ? VALUE_PALETTE[colorHash_(v) % VALUE_PALETTE.length] : null]);
  }
  range.setBackgrounds(bg);
}
function colorHash_(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }

/* ============================== HELPERS ================================= */
function countryCode_(d) { var c = String((d && d.country) || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, ''); return c || 'XX'; }
function tabName_(d, kind) { return countryCode_(d) + ' ' + kind; }
function tsOf_(d) { return d.timestamp ? new Date(d.timestamp) : new Date(); }
function getSpreadsheet_() { return SpreadsheetApp.openById(CONFIG.SHEET_ID); }

function getTab_(name, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Append a row positioned to the sheet's ACTUAL header names, so column order never matters.
function appendByHeader_(sheet, v, fallbackHeaders) {
  var lastCol = sheet.getLastColumn();
  var hdr = (lastCol > 0) ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : (fallbackHeaders || []);
  if (!hdr.length) hdr = fallbackHeaders || [];
  var row = hdr.map(function (h) { var k = String(h).trim(); return (v[k] !== undefined) ? v[k] : ''; });
  sheet.appendRow(row);
}

// Overwrite a tab with a 2D array (first row = headers).
function writeTab_(name, rows) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  var w = 0; rows.forEach(function (r) { if (r.length > w) w = r.length; });
  var out = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(''); return r; });
  if (out.length) sheet.getRange(1, 1, out.length, w).setValues(out);
}

function indexMap_(headerRow) { var m = {}; headerRow.forEach(function (h, i) { m[h] = i; }); return m; }

// Set a cell only if the incoming numeric value is larger than what's there
// (engagement can arrive more than once; we keep the max scroll/time/clicks).
function setMax_(sheet, rowNum, ci, val) {
  if (ci == null || val === undefined || val === '') return;
  var num = Number(val); if (isNaN(num)) return;
  var cur = sheet.getRange(rowNum, ci + 1).getValue();
  var curNum = (cur === '' || cur == null) ? -1 : Number(cur);
  if (isNaN(curNum)) curNum = -1;
  if (num > curNum) sheet.getRange(rowNum, ci + 1).setValue(num);
}

function classifySource_(d) {
  if (d.gclid) return 'Google Ads (gclid)';
  if (d.gbraid) return 'Google Ads (gbraid)';
  if (d.wbraid) return 'Google Ads (wbraid)';
  if (d.msclkid) return 'Microsoft / Bing Ads';
  if (d.li_fat_id) return 'LinkedIn Ads';
  if (d.fbclid) return 'Meta / Facebook';
  var us = (d.utm_source || '').toLowerCase();
  if (us.indexOf('linkedin') !== -1) return 'LinkedIn (' + (d.utm_medium || 'utm') + ')';
  if (us.indexOf('facebook') !== -1 || us === 'fb' || us.indexOf('meta') !== -1 || us.indexOf('instagram') !== -1 || us === 'ig')
    return 'Meta / Facebook (' + (d.utm_medium || 'utm') + ')';
  if (d.utm_source) return d.utm_source + (d.utm_medium ? ' / ' + d.utm_medium : '');
  return 'Direct / Organic';
}

function jsonOut_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
