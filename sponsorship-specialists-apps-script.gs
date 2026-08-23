/**
 * ════════════════════════════════════════════════════════════════════
 * BACKDROPSOURCE — Sponsorship Specialists leads → Google Sheet
 * (Google Apps Script Web App)
 * ────────────────────────────────────────────────────────────────────
 * Both forms save into ONE Google Sheet, each on its own TAB:
 *   • "Become a Sponsor" → tab "Sponsors"
 *   • "I'm an Organiser"  → tab "Event Owners"
 * Works whether the page sends a GET (query string) or POST (JSON body) —
 * both are handled. Columns auto-create; uploaded files go to Drive.
 *
 * ── SETUP ──────────────────────────────────────────────────────────────
 * 1. In your Google Sheet → Extensions → Apps Script.
 * 2. Delete the starter code, paste THIS whole file → Save (💾).
 * 3. SHEET_ID below is already set to your sheet.
 * 4. Run "authorizeDrive" once (Run ▶, approve the prompt).
 * 5. Deploy → Manage deployments → ✏️ Edit → Version: "New version" → Deploy.
 *    (⚠ ALWAYS pick "New version" after editing, or the OLD code keeps running.)
 *
 * ── HOW TO CONFIRM THE NEW CODE IS LIVE ────────────────────────────────
 * Open the /exec URL in a browser. It must show:  [VERSION v5]
 * If it shows an older version (or no version), your New-version deploy
 * didn't take — redeploy. Then /exec?test=1&form=Sponsors writes a test row.
 * ════════════════════════════════════════════════════════════════════
 */

var VERSION = 'v7';                 // bump shows in /exec so you can confirm the deploy
var NOTIFY_EMAIL = '';              // optional: email on each lead; '' = off
var DEFAULT_TAB = 'Leads';          // tab when no "form" is sent
var UPLOAD_FOLDER = 'BackdropSource Sponsorship Uploads';
var SHEET_ID = '1UV5xj_Zh9CrLnSXvCWY0AwfGFkeubVPQV5WnboH1_bU';

var LABELS = {
  timestamp: 'Timestamp', role: 'Type', name: 'Full Name', company: 'Company / Brand',
  email: 'Email', phone: 'Phone', phone_country: 'Phone Country', industry: 'Industry',
  event_name: 'Event Name', file_link: 'Uploaded File', file_name: 'File Name',
  file_type: 'File Type', source: 'Source', page: 'Page URL'
};
var ORDER = ['timestamp','role','name','company','email','phone','phone_country',
  'industry','event_name','file_link','file_name','file_type','source','page'];

function getSS() {
  return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/* Read incoming fields from ANY body format: JSON, urlencoded, or query/form params. */
function readParams(e) {
  var out = {};
  // 1) merge query-string / form params if present
  if (e && e.parameter) { for (var k in e.parameter) out[k] = e.parameter[k]; }
  // 2) parse the raw POST body
  if (e && e.postData && e.postData.contents) {
    var c = ('' + e.postData.contents).trim();
    if (c.charAt(0) === '{') {
      try { var o = JSON.parse(c); for (var j in o) out[j] = o[j]; } catch (x) {}
    } else if (c.indexOf('=') > -1) {           // urlencoded body
      c.split('&').forEach(function (pair) {
        var kv = pair.split('=');
        if (kv[0]) out[decodeURIComponent(kv[0].replace(/\+/g, ' '))] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
      });
    }
  }
  return out;
}

/* POST → always a submission. Capture diagnostics if the body arrived empty. */
function doPost(e) {
  var p = readParams(e);
  if (!p.name && !p.email && !p.form) {
    p._dbg_method = 'POST';
    p._dbg_ctype = (e && e.postData && e.postData.type) || '(none)';
    p._dbg_len = (e && e.postData && e.postData.length) || 0;
    p._dbg_raw = (e && e.postData && e.postData.contents) ? ('' + e.postData.contents).slice(0, 200) : '(empty body)';
    p._dbg_params = (e && e.parameter) ? Object.keys(e.parameter).join('|') : '(none)';
  }
  return save(p);
}

/* GET → if it carries lead fields, save it; otherwise show the health check. */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (p.name || p.email || p.form) { return save(p); }   // real submission via GET

  var out = 'BackdropSource sponsorship-leads endpoint is live.  [VERSION ' + VERSION + ']';
  try {
    var ss = getSS();
    out += ss ? '\n✓ Connected to sheet: "' + ss.getName() + '"'
              : '\n✗ NO spreadsheet connected — set SHEET_ID + deploy New version.';
    if (ss && p.test) {
      var tab = String(p.form || DEFAULT_TAB).trim() || DEFAULT_TAB;
      var sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
      sh.appendRow([new Date(), 'TEST row ✓ [' + VERSION + ']']);
      out += '\n✓ Wrote a TEST row to tab "' + tab + '".';
    }
    if (p.drivetest) {   // …/exec?drivetest=1  → confirms Drive (file upload) permission
      try {
        var dit = DriveApp.getFoldersByName(UPLOAD_FOLDER);
        var dfolder = dit.hasNext() ? dit.next() : DriveApp.createFolder(UPLOAD_FOLDER);
        var tf = dfolder.createFile('bds-drive-test.txt', 'Drive works ✓', 'text/plain');
        try { tf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (eShare) {}
        out += '\n✓ DRIVE OK → ' + tf.getUrl();
      } catch (eD) {
        out += '\n✗ DRIVE ERROR — run authorizeDrive once, then redeploy New version: ' + eD;
      }
    }
  } catch (err) { out += '\n✗ ERROR: ' + err; }
  return ContentService.createTextOutput(out);
}

/* Shared writer used by both GET and POST. */
function save(p) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    p = p || {};
    var tab = String(p.form || DEFAULT_TAB).trim() || DEFAULT_TAB;

    // Optional file upload (POST JSON only) → Drive → shareable link.
    if (p.file_base64) {
      try {
        var it = DriveApp.getFoldersByName(UPLOAD_FOLDER);
        var folder = it.hasNext() ? it.next() : DriveApp.createFolder(UPLOAD_FOLDER);
        var bytes = Utilities.base64Decode(p.file_base64);
        var blob = Utilities.newBlob(bytes, p.file_type || 'application/octet-stream', p.file_name || 'upload');
        var file = folder.createFile(blob);
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e3) {}
        p.file_link = file.getUrl();
      } catch (e4) { p.file_link = 'upload failed: ' + e4; }
      delete p.file_base64;
    }

    var ss = getSS();
    if (!ss) return json({ ok: false, error: 'No spreadsheet (set SHEET_ID).' });
    var sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);

    var headers = sheet.getLastRow() > 0
      ? sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0]
      : ['Timestamp'];
    if (headers.indexOf('Timestamp') === -1) headers.unshift('Timestamp');

    var changed = false;
    ORDER.forEach(function (key) {
      if (key === 'timestamp' || p[key] === undefined) return;
      var label = LABELS[key] || key;
      if (headers.indexOf(label) === -1) { headers.push(label); changed = true; }
    });
    Object.keys(p).forEach(function (key) {
      if (key === 'form' || key === 'file_base64' || key === 'test') return;
      var label = LABELS[key] || key;
      if (headers.indexOf(label) === -1) { headers.push(label); changed = true; }
    });

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else if (changed) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    var row = headers.map(function (h) {
      if (h === 'Timestamp') return new Date();
      var v = p[keyForHeader(h)];
      return (v === undefined) ? '' : textSafe(v);
    });
    sheet.appendRow(row);

    if (NOTIFY_EMAIL) {
      try {
        var lines = headers.map(function (h) {
          if (h === 'Timestamp') return '';
          var v = p[keyForHeader(h)];
          return v ? (h + ': ' + v) : '';
        }).filter(String);
        MailApp.sendEmail(NOTIFY_EMAIL, 'New ' + tab + ' lead — ' + (p.name || ''), lines.join('\n'));
      } catch (eMail) {}
    }

    return json({ ok: true, tab: tab, version: VERSION });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function keyForHeader(h) { for (var k in LABELS) { if (LABELS[k] === h) return k; } return h; }
function textSafe(v) { return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v; }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* Run ONCE from the editor to grant Drive + Sheets permission, then redeploy. */
function authorizeDrive() {
  var it = DriveApp.getFoldersByName(UPLOAD_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(UPLOAD_FOLDER);
  getSS();
  Logger.log('Authorised ✓  Folder: ' + folder.getUrl());
  return folder.getUrl();
}
