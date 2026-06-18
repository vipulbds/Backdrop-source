/**
 * ════════════════════════════════════════════════════════════════════
 * BACKDROPSOURCE — Sponsorship Specialists leads → Google Sheet
 * (Google Apps Script Web App)
 * ────────────────────────────────────────────────────────────────────
 * Captures the two lead forms on the "Sponsorship Specialists" page:
 *   • "Become a Sponsor"   → tab "Sponsors"
 *   • "I'm an Organiser"    → tab "Event Owners"
 * Each submission is routed to its own tab (by the "form" parameter),
 * columns are created automatically, and any uploaded file (brand brief /
 * event brief) is saved to Google Drive with a shareable link written
 * into the sheet.
 *
 * ── SETUP (≈ 3 minutes) ───────────────────────────────────────────────
 * 1. Create a NEW Google Sheet (sheets.new). Name it e.g.
 *    "BackdropSource — Sponsorship Leads".
 * 2. In that Sheet: Extensions → Apps Script.
 * 3. Delete the starter code, paste THIS whole file → Save (💾).
 * 4. ⭐ AUTHORIZE DRIVE (needed to store uploaded files):
 *    Function dropdown → pick "authorizeDrive" → Run ▶ → approve the
 *    Google prompt (asks for Drive + Sheets access). Do this ONCE.
 * 5. Deploy → New deployment → ⚙ → Web app:
 *       Execute as:      Me
 *       Who has access:  Anyone
 *    → Deploy → copy the Web app URL (ends in /exec).
 * 6. In Shopify theme editor → the "Sponsorship Specialists" section →
 *    "Lead form → Google Sheet" → paste that URL into "Lead form endpoint".
 *
 * ── CHANGING THE CODE LATER ───────────────────────────────────────────
 * After any edit: Deploy → Manage deployments → ✏️ Edit → Version:
 * "New version" → Deploy. The /exec URL stays the same.
 *
 * This script is self-contained — it has NO Shopify dependency and writes
 * only to the Sheet it is bound to.
 * ════════════════════════════════════════════════════════════════════
 */

// Optional: get an email on every new lead. Leave '' to disable.
var NOTIFY_EMAIL = '';

// Tab used if a submission arrives without a "form" parameter.
var DEFAULT_TAB = 'Leads';

// Drive folder where uploaded briefs are stored.
var UPLOAD_FOLDER = 'BackdropSource Sponsorship Uploads';

// Optional: if you ever run this as a STANDALONE script (not bound to the
// Sheet), paste the Sheet ID here. Leave '' when it's bound to the Sheet.
var SHEET_ID = '';

// Pretty column headers for known fields, and the order they appear in.
var LABELS = {
  timestamp: 'Timestamp',
  role: 'Type',
  name: 'Full Name',
  company: 'Company / Brand',
  email: 'Email',
  phone: 'Phone',
  phone_country: 'Phone Country',
  industry: 'Industry',
  event_name: 'Event Name',
  file_link: 'Uploaded File',
  file_name: 'File Name',
  file_type: 'File Type',
  source: 'Source',
  page: 'Page URL'
};
var ORDER = ['timestamp', 'role', 'name', 'company', 'email', 'phone',
  'phone_country', 'industry', 'event_name', 'file_link', 'file_name',
  'file_type', 'source', 'page'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // stop two submissions racing on the header row

    var p = (e && e.parameter) ? e.parameter : {};
    var tab = String(p.form || DEFAULT_TAB).trim() || DEFAULT_TAB;

    // ── File upload → Google Drive ──────────────────────────────────────
    // The form sends file_base64 + file_name + file_type. Save the file,
    // drop a shareable link in file_link, and never write the heavy blob.
    if (p.file_base64) {
      try {
        var it = DriveApp.getFoldersByName(UPLOAD_FOLDER);
        var folder = it.hasNext() ? it.next() : DriveApp.createFolder(UPLOAD_FOLDER);
        var bytes = Utilities.base64Decode(p.file_base64);
        var blob = Utilities.newBlob(bytes, p.file_type || 'application/octet-stream', p.file_name || 'upload');
        var file = folder.createFile(blob);
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e3) {}
        p.file_link = file.getUrl();
      } catch (e4) {
        p.file_link = 'upload failed: ' + e4;
      }
      delete p.file_base64; // keep file_name + file_type as columns; drop the raw blob
    }

    var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);

    // Existing headers, or start fresh with Timestamp first.
    var headers = sheet.getLastRow() > 0
      ? sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0]
      : ['Timestamp'];
    if (headers.indexOf('Timestamp') === -1) headers.unshift('Timestamp');

    // Add known fields (present in this submission) in the nice ORDER.
    var changed = false;
    ORDER.forEach(function (key) {
      if (key === 'timestamp' || p[key] === undefined) return;
      var label = LABELS[key] || key;
      if (headers.indexOf(label) === -1) { headers.push(label); changed = true; }
    });
    // Append any unexpected fields by their raw key (skip routing / blob keys).
    Object.keys(p).forEach(function (key) {
      if (key === 'form' || key === 'file_base64') return;
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

    // Build the row in header order.
    var row = headers.map(function (h) {
      if (h === 'Timestamp') return new Date();
      var key = keyForHeader(h);
      var v = p[key];
      return (v === undefined) ? '' : textSafe(v);
    });
    sheet.appendRow(row);

    if (NOTIFY_EMAIL) {
      try {
        var lines = headers.map(function (h) {
          if (h === 'Timestamp') return '';
          var k = keyForHeader(h);
          return p[k] ? (h + ': ' + p[k]) : '';
        }).filter(String);
        MailApp.sendEmail(NOTIFY_EMAIL, 'New ' + tab + ' lead — ' + (p.name || ''), lines.join('\n'));
      } catch (eMail) {}
    }

    return json({ ok: true, tab: tab });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// Reverse-map a pretty header back to its field key (raw key if unknown).
function keyForHeader(h) {
  for (var k in LABELS) { if (LABELS[k] === h) return k; }
  return h;
}

// Values starting with = + - @ are read by Sheets as a FORMULA (a phone like
// "+91 98765…" → #ERROR!). Prefix with an apostrophe so they stay plain text.
function textSafe(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('BackdropSource sponsorship-leads endpoint is live.');
}

/**
 * RUN THIS ONCE from the editor (select it in the function dropdown → Run ▶)
 * and approve the Google Drive + Sheets permission prompt. This grants the
 * scopes the web app needs to store uploaded briefs. After it succeeds,
 * Deploy a "New version" so the live /exec uses the authorised code.
 */
function authorizeDrive() {
  var it = DriveApp.getFoldersByName(UPLOAD_FOLDER);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(UPLOAD_FOLDER);
  SpreadsheetApp.getActiveSpreadsheet(); // touch Sheets scope too
  Logger.log('Authorised ✓  Upload folder: ' + folder.getUrl());
  return folder.getUrl();
}
