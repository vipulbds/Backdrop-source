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

// ── Per-owner Sponsor page link (auto-generated after an Event-Owner submits) ──
// When a Backdrop Owner completes the wizard (form="Event Owners"), this script:
//   1. stamps the row with a unique "event_id" (if the form didn't send one),
//   2. builds a Sponsor page link  SPONSOR_PAGE_URL?id=<event_id>  and writes it
//      into a "sponsor_link" column, and
//   3. e-mails that ready-to-share link + the event details to SALES_EMAIL.
// The Sponsor page (Shopify) reads ?id= and pulls that event's details from
// doGet?feed=event&id=<event_id>, then posts sponsor leads back to tab "Sponsor Leads".
// Set SPONSOR_PAGE_URL to your published Shopify page URL. Leave SALES_EMAIL '' to skip the email.
var SPONSOR_PAGE_URL = 'https://www.backdropsource.com/pages/sponsor-this-event';
var SALES_EMAIL      = 'sales@backdropsource.com';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // avoid two submissions racing on the header row

    var p = (e && e.parameter) ? e.parameter : {};
    var tab = String(p.form || DEFAULT_TAB).trim() || DEFAULT_TAB;

    // ── Event-Owner submissions: stamp a unique event_id + build the Sponsor link ──
    // The link is stored as the "sponsor_link" column and e-mailed to the sales team
    // after the row is written (see the MailApp block near the end of doPost).
    var sponsorLink = '';
    if (tab === 'Event Owners') {
      if (!p.event_id) {
        p.event_id = 'evt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      }
      if (SPONSOR_PAGE_URL) {
        sponsorLink = SPONSOR_PAGE_URL + (SPONSOR_PAGE_URL.indexOf('?') > -1 ? '&' : '?') + 'id=' + encodeURIComponent(p.event_id);
        p.sponsor_link = sponsorLink;
      }
    }

    // Optional logo / file upload → Google Drive (used by the Sponsor flow).
    // The form sends logo_base64 + logo_name + logo_type; we save the file to a
    // Drive folder, drop a shareable link into logo_link, and never write the
    // huge base64 blob into the sheet. We KEEP logo_name + logo_type so the file
    // name is tracked in its own column alongside the Drive link.
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
      delete p.logo_base64; // drop only the heavy raw blob; keep logo_name + logo_type as columns
    }

    // Optional EVENT IMAGE upload (Event-Owner wizard) → Google Drive. We store a DIRECT
    // image URL (lh3.googleusercontent.com) in the "image" column — the Sponsor marketplace
    // reads that column and shows it as the event photo once the row is Approved. (A normal
    // Drive "view" link can't render as an <img>/background, so we use the lh3 direct form.)
    if (p.image_base64) {
      try {
        var imgFolderName = 'BackdropSource Uploads';
        var iit = DriveApp.getFoldersByName(imgFolderName);
        var ifolder = iit.hasNext() ? iit.next() : DriveApp.createFolder(imgFolderName);
        var ibytes = Utilities.base64Decode(p.image_base64);
        var iblob = Utilities.newBlob(ibytes, p.image_type || 'image/jpeg', p.image_name || 'event-image.jpg');
        var ifile = ifolder.createFile(iblob);
        try { ifile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e7) {}
        p.image = 'https://lh3.googleusercontent.com/d/' + ifile.getId() + '=w1200';
      } catch (e8) {
        // leave p.image unset on failure → the sponsor page falls back to a default image
      }
      delete p.image_base64; // keep image_name + image_type as columns; drop the heavy blob
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Write the submission to its main tab (routed by the "form" param).
    appendSubmission(ss, tab, p);

    // SPONSOR LEADS: also copy the row into a PER-EVENT tab (same workbook) so the
    // sales team can follow up event-by-event. The common "Sponsor Leads" tab above
    // still keeps EVERY sponsor lead across all events (basic lead log).
    if (tab === 'Sponsor Leads') {
      var evTab = eventTabName(p);
      if (evTab && evTab !== tab) {
        try { appendSubmission(ss, evTab, p); } catch (eEvt) {}
      }
    }

    // Mirror the submission into Shopify as a Draft Order (Admin → Orders → Drafts).
    // Wrapped so a Shopify hiccup never blocks the Sheet write.
    try { createDraftOrder(p, tab); } catch (eDraft) {}

    // Auto-email the ready-to-share Sponsor link to the sales team (Event Owners only).
    // Wrapped so a mail hiccup never blocks the Sheet write.
    if (tab === 'Event Owners' && sponsorLink && SALES_EMAIL) {
      try {
        var subj = 'New event to sponsor: ' + (p.event_name || p.event_id);
        var body = [
          'A Backdrop Owner just completed the flow. Share this Sponsor link with brands:',
          '',
          sponsorLink,
          '',
          'Event:             ' + (p.event_name || '—'),
          'Date:              ' + (p.event_date || '—'),
          'Location / venue:  ' + (p.venue || p.event_location || '—'),
          'Expected audience: ' + (p.footfall || p.expected_audience || '—'),
          'Backdrop:          ' + (p.backdrop || '—') + (p.backdrop_size ? (' · ' + p.backdrop_size) : ''),
          'Sponsor slots:     ' + (p.sponsor_slots || '—'),
          '',
          'Owner:  ' + (p.full_name || '—') + '   ' + (p.email || '') + '   ' + (p.phone || '')
        ].join('\n');
        MailApp.sendEmail(SALES_EMAIL, subj, body);
      } catch (eSales) {}
    }

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

/**
 * GET endpoint.
 *   /exec?feed=events  → JSON { ok:true, events:[ {column:value, …}, … ] }
 *      Returns rows from the "Event Owners" tab whose "Approved" column = Yes
 *      (yes / true / approved / y / ✓ — case-insensitive). This is what the
 *      Sponsor marketplace page reads to AUTO-PUBLISH approved events.
 *      SAFETY: if there is no "Approved" column yet, NOTHING is published.
 *   /exec (anything else) → a plain "is live" string.
 */
/**
 * Append one submission (object p) to a tab, auto-creating the tab and any new
 * columns from the incoming field names (Timestamp first). Shared so a sponsor
 * lead can be written to BOTH the common "Sponsor Leads" tab and its per-event tab.
 */
function appendSubmission(ss, tabName, p) {
  var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);

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

  // Values beginning with = + - @ would be read by Sheets as a FORMULA
  // (e.g. "+91 98765…" → #ERROR!). Prefix those with a hidden apostrophe.
  function textSafe(v) {
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
    return v;
  }
  var row = headers.map(function (h) {
    if (h === 'Timestamp') return new Date();
    return p[h] !== undefined ? textSafe(p[h]) : '';
  });
  sheet.appendRow(row);
}

/**
 * Build a safe, stable tab name for a sponsor lead's event. Uses the event name
 * (readable for the sales team) + a short event_id suffix so two different events
 * that happen to share a name don't merge into one tab. Same event → same tab
 * every time. Returns '' if there is no event to key on.
 * Sheets tab rules: max 100 chars; cannot contain : \ / ? * [ ]
 */
function eventTabName(p) {
  var name = String(p.event_name || '').trim();
  var id = String(p.event_id || '').trim();
  if (!name && !id) return '';
  var base = (name || id).replace(/[:\\\/?*\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  var suffix = id ? (' #' + id.slice(-4)) : '';
  var maxBase = 100 - suffix.length;
  if (base.length > maxBase) base = base.slice(0, maxBase).trim();
  return (base + suffix).slice(0, 100);
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (p.feed === 'events') return eventsFeed();
  if (p.feed === 'event' && p.id) return eventById(p.id);   // one event by event_id → Sponsor page
  return ContentService.createTextOutput('BackdropSource forms endpoint is live.');
}

/**
 * Return ONE event (by event_id) from the "Event Owners" tab as JSON:
 *   { ok:true, event:{ column:value, … } }   or   { ok:false, event:null }
 * Used by the per-owner Sponsor page (…?id=<event_id>) to auto-fill the event
 * details. This is a PRIVATE share link, so it returns the row regardless of the
 * "Approved" gate (approval only governs the public marketplace feed above).
 * If several rows share an id, the most recent one wins.
 */
function eventById(id) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Event Owners');
    if (sheet && sheet.getLastRow() > 1) {
      var data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
      var headers = data[0].map(function (h) { return String(h).trim(); });
      var iId = headers.indexOf('event_id');
      if (iId !== -1) {
        for (var r = data.length - 1; r >= 1; r--) {   // latest match wins
          if (String(data[r][iId]).trim() === String(id).trim()) {
            var obj = {};
            headers.forEach(function (h, i) {
              if (!h) return;
              var v = data[r][i];
              if (v instanceof Date) {
                v = v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
              }
              obj[h] = v;
            });
            return ContentService
              .createTextOutput(JSON.stringify({ ok: true, event: obj }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err), event: null }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: 'not found', event: null }))
    .setMimeType(ContentService.MimeType.JSON);
}

function eventsFeed() {
  var out = [];
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Event Owners');
    if (sheet && sheet.getLastRow() > 1) {
      var data = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
      var headers = data[0].map(function (h) { return String(h).trim(); });
      var iApproved = headers.indexOf('Approved');
      var okVals = ['yes', 'true', 'approved', 'y', '✓', '1'];
      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        // Approval gate. No "Approved" column → publish nothing (safe default).
        if (iApproved === -1) break;
        var a = String(row[iApproved] == null ? '' : row[iApproved]).trim().toLowerCase();
        if (okVals.indexOf(a) === -1) continue;
        var obj = {};
        headers.forEach(function (h, i) {
          if (!h) return;
          var v = row[i];
          // Send dates as plain YYYY-MM-DD strings (the sheet may store Date objects).
          if (v instanceof Date) {
            v = v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2) + '-' + ('0' + v.getDate()).slice(-2);
          }
          obj[h] = v;
        });
        out.push(obj);
      }
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err), events: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, events: out }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * RUN THIS ONCE from the editor (select it in the function dropdown, press
 * Run ▶) and approve the Google Drive permission prompt. This grants the
 * Drive scope the web app needs to save uploaded sponsor logos. After it
 * runs successfully, Deploy a "New version" so the live /exec uses it.
 */
function authorizeDrive() {but why this page looks like that left side allign make it middle center allign 
  var name = 'BackdropSource Uploads';
  var it = DriveApp.getFoldersByName(name);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);
  Logger.log('Drive authorised ✓  Folder: ' + folder.getUrl());
  return folder.getUrl();
}
