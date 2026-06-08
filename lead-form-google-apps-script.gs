/**
 * ════════════════════════════════════════════════════════════════════
 * BACKDROPSOURCE — Forms → Google Sheet (Google Apps Script Web App)
 * ────────────────────────────────────────────────────────────────────
 * One endpoint for ALL BackdropSource forms (landing lead modal, the
 * Event-Owner wizard, and the future Sponsor flow). Each submission is
 * routed to its own tab and columns are created automatically — so you
 * never have to touch this script again when a form adds a new field.
 *
 * Routing: the form sends a "form" parameter = the tab name.
 *   - Landing lead modal   → no "form" sent → tab "Leads"
 *   - Event-Owner wizard   → form="Event Owners" → tab "Event Owners"
 * Columns are built from the incoming field names, with Timestamp first.
 *
 * ── SETUP / UPDATE ────────────────────────────────────────────────────
 * 1. Open your Sheet → Extensions → Apps Script.
 * 2. Replace ALL the code with THIS file → Save (💾).
 * 3. ⭐ AUTHORIZE GOOGLE DRIVE (needed for sponsor logo uploads):
 *    In the function dropdown pick "authorizeDrive" → Run ▶ → approve the
 *    permission prompt (it asks for Google Drive access). Do this ONCE.
 *    (Running doGet does NOT grant Drive — it must be authorizeDrive.)
 * 4. Deploy → Manage deployments → (your Web app) → ✏️ Edit →
 *    Version: "New version" → Deploy.   (The /exec URL stays the same.)
 *    First time instead: Deploy → New deployment → Web app →
 *      Execute as: Me · Who has access: Anyone → Deploy → copy /exec URL.
 * 5. Paste the /exec URL into the section's "Lead form endpoint" setting
 *    (already pre-filled if you used the built-in default).
 *
 * ── OPTION C: SHOW SUBMISSIONS IN SHOPIFY (Draft Orders) ───────────────
 * Every submission can also appear in Shopify Admin → Orders → Drafts.
 * 6. In Shopify admin → Settings → Apps and sales channels →
 *    "Develop apps" → Allow custom app development → "Create an app".
 *    Name it e.g. "BackdropSource Forms".
 * 7. In that app → "Configuration" → Admin API integration → enable scope
 *    write_draft_orders  (read_draft_orders optional) → Save.
 * 8. "API credentials" → Install app → reveal the Admin API access token
 *    (starts with shpat_). Copy it.
 * 9. Fill SHOPIFY_DOMAIN (your-store.myshopify.com) and SHOPIFY_TOKEN below,
 *    Save, then Deploy a "New version" (Manage deployments → Edit → Deploy).
 *    Leave them '' to stay Sheet-only.
 * ════════════════════════════════════════════════════════════════════
 */

// Optional: email yourself on every new submission. Leave '' to disable.
var NOTIFY_EMAIL = '';
// Tab used when a form doesn't send a "form" parameter.
var DEFAULT_TAB = 'Leads';

// ── Shopify Draft Orders (Option C) ──────────────────────────────────────
// Mirror EVERY submission into Shopify admin → Orders → Drafts (even unpaid
// leads), keeping your custom forms. Fill BOTH values to enable; leave '' to
// disable (the Sheet still works on its own).
//   SHOPIFY_DOMAIN : your-store.myshopify.com   (the admin domain, NOT the public .com)
//   SHOPIFY_TOKEN  : Admin API access token from a custom app (starts with shpat_)
// Setup steps are in the header comment above.
var SHOPIFY_DOMAIN      = '';
var SHOPIFY_TOKEN       = '';
var SHOPIFY_API_VERSION = '2024-10';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // avoid two submissions racing on the header row

    var p = (e && e.parameter) ? e.parameter : {};
    var tab = String(p.form || DEFAULT_TAB).trim() || DEFAULT_TAB;

    // Optional logo / file upload → Google Drive (used by the Sponsor flow).
    // The form sends logo_base64 + logo_name + logo_type; we save the file to a
    // Drive folder, drop a shareable link into logo_link, and never write the
    // huge base64 blob into the sheet.
    if (p.logo_base64) {
      try {
        var folderName = 'BackdropSource Uploads';
        var it = DriveApp.getFoldersByName(folderName);
        var folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);
        var bytes = Utilities.base64Decode(p.logo_base64);
        var blob = Utilities.newBlob(bytes, p.logo_type || 'application/octet-stream', p.logo_name || 'upload');
        var file = folder.createFile(blob);
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e3) {}
        p.logo_link = file.getUrl();
      } catch (e4) {
        p.logo_link = 'upload failed: ' + e4;
      }
      delete p.logo_base64; delete p.logo_type; delete p.logo_name;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(tab) || ss.insertSheet(tab);

    // Current headers (or start a fresh set with Timestamp first).
    var headers = sheet.getLastRow() > 0
      ? sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0]
      : ['Timestamp'];
    if (headers.indexOf('Timestamp') === -1) headers.unshift('Timestamp');

    // Add any new incoming fields as columns (skip the routing key "form").
    var changed = false;
    Object.keys(p).forEach(function (k) {
      if (k === 'form') return;
      if (headers.indexOf(k) === -1) { headers.push(k); changed = true; }
    });

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else if (changed) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    // Build the row in header order.
    // Values that begin with = + - @ would be read by Sheets as a FORMULA
    // (e.g. a phone like "+91 98765…" → #ERROR!). Prefix those with a hidden
    // apostrophe so Sheets stores them as plain text.
    function textSafe(v) {
      if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
      return v;
    }
    var row = headers.map(function (h) {
      if (h === 'Timestamp') return new Date();
      return p[h] !== undefined ? textSafe(p[h]) : '';
    });
    sheet.appendRow(row);

    // Mirror the submission into Shopify as a Draft Order (Admin → Orders → Drafts).
    // Wrapped so a Shopify hiccup never blocks the Sheet write.
    try { createDraftOrder(p, tab); } catch (eDraft) {}

    if (NOTIFY_EMAIL) {
      var lines = Object.keys(p)
        .filter(function (k) { return k !== 'form'; })
        .map(function (k) { return k + ': ' + p[k]; });
      MailApp.sendEmail(NOTIFY_EMAIL, 'New ' + tab + ' submission', lines.join('\n'));
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, tab: tab }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * Create a Shopify Draft Order from a submission, so it shows in
 * Admin → Orders → Drafts with all the event/slot/brand/logo details.
 * No-op if SHOPIFY_DOMAIN / SHOPIFY_TOKEN aren't set.
 */
function createDraftOrder(p, tab) {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) return;

  // Price: sponsor slot price first, else owner total potential, else 0.
  var price = money(p.slot_price) || money(p.total_potential) || '0.00';

  // Human-readable line-item title.
  var bits = [];
  if (p.event_name) bits.push(p.event_name);
  if (p.slot) bits.push(p.slot);
  var kind = (tab === 'Sponsors') ? 'Sponsorship'
           : (tab === 'Event Owners') ? 'Event listing'
           : 'Lead';
  var title = kind + (bits.length ? ' — ' + bits.join(' · ') : '');

  // Every field becomes an order note attribute (skip routing key + raw file).
  var attrs = [];
  Object.keys(p).forEach(function (k) {
    if (k === 'form' || k === 'logo_base64') return;
    var v = p[k]; if (v === '' || v == null) return;
    attrs.push({ name: k, value: String(v).slice(0, 600) });
  });

  var draft = {
    line_items: [{ title: title, price: price, quantity: 1 }],
    note: 'Submitted via the ' + tab + ' form (BackdropSource sponsorship platform).',
    tags: 'BackdropSource, ' + tab,
    note_attributes: attrs
  };
  if (p.email) draft.email = p.email;

  UrlFetchApp.fetch(
    'https://' + SHOPIFY_DOMAIN + '/admin/api/' + SHOPIFY_API_VERSION + '/draft_orders.json',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
      payload: JSON.stringify({ draft_order: draft }),
      muteHttpExceptions: true
    }
  );
}

// Pull a numeric price string ("$1,200" → "1200") or null.
function money(v) {
  if (!v) return null;
  var m = String(v).replace(/[^0-9.]/g, '');
  return m ? m : null;
}

function doGet() {
  return ContentService.createTextOutput('BackdropSource forms endpoint is live.');
}

/**
 * RUN THIS ONCE from the editor (select it in the function dropdown, press
 * Run ▶) and approve the Google Drive permission prompt. This grants the
 * Drive scope the web app needs to save uploaded sponsor logos. After it
 * runs successfully, Deploy a "New version" so the live /exec uses it.
 */
function authorizeDrive() {
  var name = 'BackdropSource Uploads';
  var it = DriveApp.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  Logger.log('Drive authorised ✓  Folder: ' + folder.getUrl());
  return folder.getUrl();
}
