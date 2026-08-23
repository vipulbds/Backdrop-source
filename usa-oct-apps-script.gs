/**
 * ============================================================================
 *  BACKDROPSOURCE — UNIFIED MULTI-COUNTRY TRACKING  (Google Apps Script)
 * ============================================================================
 *  ONE sheet + ONE script for ALL country stores (USA, CA, UK … up to 11).
 *  Bound to the sheet in CONFIG.SHEET_ID. Every beacon carries `country` +
 *  `type`; this script routes it to the right tab and AUTO-CREATES tabs, so
 *  adding a new country later needs ZERO changes here — just the snippet in
 *  that store's theme + the pixel in its Customer events.
 *
 *  TABS (auto-created per country)
 *    "<CC> Lead"   — every lead / engagement touchpoint (2D Mockup, Custom
 *                    Size, Bulk Enquiry, Contact Us, Newsletter, WhatsApp,
 *                    Phone Call, Email Click) with a Touchpoint column + Source.
 *    "<CC> Order"  — Add-to-Cart + Purchase (Stage column) + value + Source.
 *  e.g. "USA Lead", "USA Order", "CA Lead", "CA Order", "UK Lead", "UK Order".
 *
 *  DATA IN
 *    - bds-tracking.liquid (snippet in each store theme) → leads (type=lead).
 *    - bds-pixel.js (Custom Pixel in each store) → orders (type=order / add_to_cart).
 *    Both GET-beacon to this Web App's /exec URL.
 *
 *  OFFLINE-CONVERSION UPLOADS (optional, per country)
 *    buildUploads('USA') refreshes that country's four import tabs from its
 *    "<CC> Order" PURCHASE rows:
 *       "<CC> Ads Upload"  (Google, gclid) · "<CC> Bing Upload" (msclkid)
 *       "<CC> Meta Upload" (hashed email)  · "<CC> LinkedIn Upload" (hashed email + li_fat_id)
 *
 *  DEPLOY
 *    Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
 *    The /exec URL stays the same. Open it to read the [VERSION] marker.
 * ============================================================================
 */

var VERSION = 'bds-unified v18';

var CONFIG = {
  SHEET_ID: '15wnVR1TSrEnBuEg6QCLRUxJ3ptuTyOdlOriF28viAQ0',
  DEFAULT_CURRENCY: 'USD',
  CAMPAIGN_MAP_TAB: 'Campaign Map'   // ID -> friendly name lookup (you fill it)
};

// Per-country timezone + default currency (used only for the upload tabs'
// time/currency formatting). Unknown countries fall back to UTC / USD.
var COUNTRY_CFG = {
  USA: { tz: 'America/Chicago',   currency: 'USD' },
  CA:  { tz: 'America/Toronto',   currency: 'CAD' },
  UK:  { tz: 'Europe/London',     currency: 'GBP' },
  AU:  { tz: 'Australia/Sydney',  currency: 'AUD' },
  NZ:  { tz: 'Pacific/Auckland',  currency: 'NZD' },
  IN:  { tz: 'Asia/Kolkata',      currency: 'INR' },
  UAE: { tz: 'Asia/Dubai',        currency: 'AED' },
  FR:  { tz: 'Europe/Paris',      currency: 'EUR' },
  ES:  { tz: 'Europe/Madrid',     currency: 'EUR' },
  DE:  { tz: 'Europe/Berlin',     currency: 'EUR' }
};

// Per-store Admin API — used only by backfillOrderNames() to fill the friendly
// order #name (e.g. "#1001") that the checkout pixel can't provide.
// SETUP per store: Shopify admin > Settings > Apps and sales channels > Develop
// apps > Create an app > Admin API scopes: tick read_orders > Install > reveal
// the "Admin API access token" (starts shpat_) and paste it below. Use the
// store's *.myshopify.com domain (Settings > Domains shows it).
// domain is used token-FREE by linkOrderNumbers() (clickable order links). token
// is only for the optional backfillOrderNames() text lookup — but Shopify blocked
// new custom apps on 2026-01-01, so most stores can't get a shpat_; leave the
// token as-is and rely on the clickable links instead.
var SHOPS = {
  USA: { domain: 'bdsus.myshopify.com',                  token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  UK:  { domain: 'backdropsourceuk.myshopify.com',       token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  CA:  { domain: 'backdropsource-v1-0.myshopify.com',    token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  AU:  { domain: 'mousestored.myshopify.com',            token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  NZ:  { domain: 'backdropsourcenz.myshopify.com',       token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  IN:  { domain: 'backdropsource-india.myshopify.com',   token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  UAE: { domain: 'backdropsourceuae.myshopify.com',      token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  FR:  { domain: 'backdropsourcefrance.myshopify.com',   token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  ES:  { domain: 'backdropsource-spain.myshopify.com',   token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' },
  DE:  { domain: 'backdropsourcegermany.myshopify.com',  token: 'PASTE_shpat_TOKEN_HERE', apiVersion: '2025-10' }
};

/* NOTE ON HEADERS: if you ever add a column, append it at the END. repairHeaders()
   rewrites the label row starting at column A, so inserting a column in the
   middle would silently shift every existing row's data.
   Cross-border journey / abandoned-checkout tracking lives in its OWN sheet +
   script (cross-border-apps-script.gs) so this workbook stays untouched. */
var LEAD_HEADERS = [
  'Timestamp', 'Touchpoint', 'Status',
  'Name', 'Email', 'Phone', 'Source',
  'GCLID', 'GBRAID', 'WBRAID', 'FBCLID', 'MSCLKID', 'LI FAT ID',
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'Page URL'
];

var ORDER_HEADERS = [
  'Timestamp', 'Stage', 'Order ID', 'Order Number',
  'Product', 'Quantity', 'Value', 'Currency', 'Source',
  'GCLID', 'GBRAID', 'WBRAID', 'FBCLID', 'MSCLKID', 'LI FAT ID',
  'UTM Source', 'UTM Medium', 'UTM Campaign',
  'Email', 'Name', 'Phone', 'Page URL',
  'Uploaded At', 'Upload Result', 'Staff', 'Status'
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
  if (p.type || p.touchpoint || p.email || p.name || p.order_id || p.conversion_name) return route_(p);
  return jsonOut_({ ok: true, version: VERSION, message: 'Backdropsource unified tracking endpoint is live.' });
}

function route_(data) {
  var t = String(data.type || 'lead').toLowerCase();
  if (t === 'order' || t === 'add_to_cart' || t === 'draft_order' || data.order_id) return saveOrder_(data);
  return saveLead_(data);
}

function saveLead_(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var sheet = getTab_(tabName_(data, 'Lead'), LEAD_HEADERS);
    var v = {
      'Timestamp': tsOf_(data),
      'Touchpoint': data.touchpoint || data.conversion_name || 'Lead',
      'Status': 'Lead',
      'Name':  data.name  || '',
      'Email': data.email || '',
      'Phone': data.phone || '',
      'Source': classifySource_(data),
      'GCLID': data.gclid || '', 'GBRAID': data.gbraid || '', 'WBRAID': data.wbraid || '',
      'FBCLID': data.fbclid || '', 'MSCLKID': data.msclkid || '', 'LI FAT ID': data.li_fat_id || '',
      'UTM Source': data.utm_source || '', 'UTM Medium': data.utm_medium || '', 'UTM Campaign': data.utm_campaign || '',
      'Page URL': data.page_url || ''
    };
    appendByHeader_(sheet, v, LEAD_HEADERS);
    return jsonOut_({ ok: true, version: VERSION });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

function saveOrder_(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var sheet = getTab_(tabName_(data, 'Order'), ORDER_HEADERS);
    var t = String(data.type || '').toLowerCase();
    var stage = (t === 'add_to_cart') ? 'Add to Cart' : (t === 'draft_order') ? 'Draft Order' : 'Purchase';
    var orderId = String(data.order_id || '').replace(/[^0-9]/g, '');   // numeric — matches the pixel (numeric) AND Flow (gid://…/123)
    var cc = countryCode_(data);
    var v = {
      'Timestamp': tsOf_(data),
      'Stage': stage,
      'Order ID': orderId,
      'Order Number': data.order_number || data.order_name || '',
      'Product': data.product || '',
      'Quantity': data.quantity || '',
      'Value': data.value || data.order_value || '',
      'Currency': data.currency || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || CONFIG.DEFAULT_CURRENCY,
      'Source': classifySource_(data),
      'GCLID': data.gclid || '', 'GBRAID': data.gbraid || '', 'WBRAID': data.wbraid || '',
      'FBCLID': data.fbclid || '', 'MSCLKID': data.msclkid || '', 'LI FAT ID': data.li_fat_id || '',
      'UTM Source': data.utm_source || '', 'UTM Medium': data.utm_medium || '', 'UTM Campaign': data.utm_campaign || '',
      'Email': data.email || '', 'Name': data.name || '', 'Phone': data.phone || '',
      'Page URL': data.page_url || '',
      'Staff': data.staff || data.staff_name || data.created_by || '',
      'Status': prettyStatus_(data.status)
    };

    // De-dupe / MERGE on Order ID + Stage: if this order already has a row, fill
    // its EMPTY cells from the incoming data instead of adding a duplicate. This
    // lets the pixel row (ad attribution, no staff) and the Flow "order created"
    // row (staff name, no attribution) combine into ONE complete row — whichever
    // arrives first. (Draft ids ≠ order ids, so a draft that converts still logs both.)
    if (orderId) {
      var existing = sheet.getDataRange().getValues();
      var hmap = indexMap_(existing[0]);
      var idCol = hmap['Order ID'], stCol = hmap['Stage'];
      for (var r = 1; r < existing.length; r++) {
        if (String(existing[r][idCol]).replace(/[^0-9]/g, '') === orderId &&
            String(existing[r][stCol]).toLowerCase() === stage.toLowerCase()) {
          var merged = false;
          ORDER_HEADERS.forEach(function (h) {
            var ci = hmap[h]; if (ci == null) return;
            var cur = existing[r][ci];
            var inc = v[h];
            if (inc === undefined || inc === '') return;
            // Status always updates (Open -> Invoice sent -> Completed); everything else fills empties only.
            if ((cur === '' || cur == null) || h === 'Status') {
              sheet.getRange(r + 1, ci + 1).setValue(inc); merged = true;
            }
          });
          return jsonOut_({ ok: true, version: VERSION, merged: merged });
        }
      }
    }
    appendByHeader_(sheet, v, ORDER_HEADERS);
    return jsonOut_({ ok: true, version: VERSION });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ===================== OFFLINE-CONVERSION UPLOAD TABS ==================== */
/* Build a country's four import tabs from its "<CC> Order" PURCHASE rows.
   Run buildUploads('USA') manually or on a daily time-trigger.            */

function buildUploadsUSA() { buildUploads('USA'); }
function buildUploadsCA()  { buildUploads('CA'); }
function buildUploadsUK()  { buildUploads('UK'); }

function buildUploads(cc) {
  cc = String(cc || '').toUpperCase();
  var orders = getTab_(cc + ' Order', ORDER_HEADERS);
  var values = orders.getDataRange().getValues();
  if (values.length < 2) { Logger.log(cc + ': no orders yet.'); return; }
  var col = indexMap_(values[0]);
  var cfg = COUNTRY_CFG[cc] || { tz: 'Etc/UTC', currency: CONFIG.DEFAULT_CURRENCY };

  var google = [['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency']];
  var bing   = [['Microsoft Click Id', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency Code']];
  var meta   = [['email', 'phone', 'event_name', 'event_time', 'value', 'currency', 'order_id']];
  var linked = [['SHA256 Email', 'li_fat_id', 'Conversion Name', 'Conversion Time (epoch ms)', 'Conversion Value', 'Currency']];

  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[col['Stage']]).toLowerCase() !== 'purchase') continue;
    var when = r[col['Timestamp']];
    var dt = (when instanceof Date) ? when : new Date(when);
    var val = r[col['Value']] || 0;
    var curr = r[col['Currency']] || cfg.currency;
    var email = r[col['Email']];

    if (r[col['GCLID']]) google.push([r[col['GCLID']], 'Purchase', Utilities.formatDate(dt, cfg.tz, 'yyyy-MM-dd HH:mm:ssXXX'), val, curr]);
    if (r[col['MSCLKID']]) bing.push([r[col['MSCLKID']], 'Purchase', Utilities.formatDate(dt, cfg.tz, "yyyy-MM-dd'T'HH:mm:ssXXX"), val, curr]);
    if (email && (r[col['FBCLID']] || /meta|facebook|instagram/i.test(String(r[col['Source']]))))
      meta.push([sha256_(normEmail_(email)), sha256_(normPhone_(r[col['Phone']])), 'Purchase', Math.round(dt.getTime() / 1000), val, curr, r[col['Order ID']] || '']);
    if (email && (r[col['LI FAT ID']] || /linkedin/i.test(String(r[col['Source']]))))
      linked.push([sha256_(normEmail_(email)), r[col['LI FAT ID']] || '', 'Purchase', dt.getTime(), val, curr]);
  }

  writeTab_(cc + ' Ads Upload', google, ['Parameters:TimeZone=' + Utilities.formatDate(new Date(), cfg.tz, 'XXX')]);
  writeTab_(cc + ' Bing Upload', bing);
  writeTab_(cc + ' Meta Upload', meta);
  writeTab_(cc + ' LinkedIn Upload', linked);
  Logger.log(cc + ' uploads rebuilt: G=' + (google.length - 1) + ' B=' + (bing.length - 1) + ' M=' + (meta.length - 1) + ' L=' + (linked.length - 1));
  // NOTE: a UK gclid that converts on the CA store lands in CA's upload tab here.
  // The cross-border sheet's "Ad Account Routing" tab lists those so you can move
  // them to the account that actually owns the click. See cross-border-apps-script.gs.
}

/* ============ ORDER #NAME BACKFILL (Admin API, optional) ================ */
/* Fills the friendly order name (#1001) into each "<CC> Order" tab's
   "Order Number" column, since the checkout pixel only gives the numeric id.
   Run manually or on a time trigger (e.g. every 15 min). Only runs for stores
   whose SHOPS entry has a token + real domain. */
function backfillOrderNames() {
  Object.keys(SHOPS).forEach(function (cc) { backfillOrderNamesForCountry_(cc); });
}
function backfillOrderNamesForCountry_(cc) {
  var cfg = SHOPS[cc];
  if (!cfg || !cfg.token || cfg.token.indexOf('PASTE_') === 0 || cfg.domain.indexOf('YOUR-') === 0) return;   // not configured
  var sheet = getTab_(cc + ' Order', ORDER_HEADERS);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  var col = indexMap_(values[0]);
  var filled = 0;
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[col['Stage']]).toLowerCase() !== 'purchase') continue;
    var num = String(r[col['Order Number']] || '').trim();
    if (num.charAt(0) === '#') continue;                     // already has friendly #name
    var id = String(r[col['Order ID']] || '').replace(/[^0-9]/g, '');   // numeric id (strips gid:// too)
    if (!id) continue;
    var name = fetchOrderName_(cfg, id);
    if (name) { sheet.getRange(i + 1, col['Order Number'] + 1).setValue(name); filled++; }
  }
  Logger.log(cc + ': filled ' + filled + ' order name(s).');
}
function fetchOrderName_(cfg, id) {
  try {
    var url = 'https://' + cfg.domain + '/admin/api/' + (cfg.apiVersion || '2025-10') + '/orders/' + id + '.json?fields=id,name';
    var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { 'X-Shopify-Access-Token': cfg.token } });
    var code = res.getResponseCode();
    if (code !== 200) { Logger.log('order ' + id + ' → HTTP ' + code + ': ' + res.getContentText().slice(0, 200)); return ''; }
    var j = JSON.parse(res.getContentText());
    return (j.order && j.order.name) || '';
  } catch (e) { Logger.log('order ' + id + ' → ' + e); return ''; }
}

/* ============ ORDER LINKS (token-FREE — makes Order Number clickable) ===== */
/* Turns each "<CC> Order" purchase row's "Order Number" cell into a link that
   opens that order in Shopify admin (where the real #1001 is shown). Needs only
   the store domain — NO token/app/OAuth. If backfillOrderNames() already wrote a
   #name, that becomes the link label; otherwise the label is "Order <id>". */
function linkOrderNumbers() {
  Object.keys(SHOPS).forEach(function (cc) {
    var cfg = SHOPS[cc];
    var handle = String((cfg && cfg.domain) || '').replace('.myshopify.com', '');
    if (!handle || handle.indexOf('YOUR-') === 0) return;
    var sheet = getTab_(cc + ' Order', ORDER_HEADERS);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    var col = indexMap_(values[0]);
    var onCol = col['Order Number'];
    if (onCol == null) return;
    var n = values.length - 1;
    var formulas = sheet.getRange(2, onCol + 1, n, 1).getFormulas();
    var linked = 0;
    for (var i = 0; i < n; i++) {
      var r = values[i + 1];
      var stage = String(r[col['Stage']]).toLowerCase();
      if (stage !== 'purchase' && stage !== 'draft order') continue;
      if (formulas[i][0] && formulas[i][0].indexOf('HYPERLINK') !== -1) continue;   // already a link
      var id = String(r[col['Order ID']] || '').replace(/[^0-9]/g, '');
      if (!id) continue;
      var disp = String(r[onCol] || '');
      var label = (disp && disp.charAt(0) === '#') ? disp : ((stage === 'draft order' ? 'Draft ' : 'Order ') + id);
      var path = (stage === 'draft order') ? 'draft_orders' : 'orders';
      var url = 'https://admin.shopify.com/store/' + handle + '/' + path + '/' + id;
      sheet.getRange(i + 2, onCol + 1).setFormula('=HYPERLINK("' + url + '","' + label + '")');
      linked++;
    }
    Logger.log(cc + ': linked ' + linked + ' order(s).');
  });
}

/* DIAGNOSTIC — run this once, then open Executions (left menu) to see the result.
   It hits each configured store's Admin API and logs the HTTP status so you can
   tell exactly what's wrong:
     200 + an order  → working (backfill will fill #names)
     401             → wrong/expired token
     403             → app missing read_orders scope OR protected-customer-data access
     404             → wrong domain or API version
   Also confirms UrlFetch authorization (first run prompts you to allow it). */
function testAdminAPI() {
  Object.keys(SHOPS).forEach(function (cc) {
    var cfg = SHOPS[cc];
    if (!cfg.token || cfg.token.indexOf('PASTE_') === 0 || cfg.domain.indexOf('YOUR-') === 0) {
      Logger.log(cc + ': not configured — skipped'); return;
    }
    var url = 'https://' + cfg.domain + '/admin/api/' + (cfg.apiVersion || '2025-10') + '/orders.json?limit=1&status=any&fields=id,name';
    try {
      var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, headers: { 'X-Shopify-Access-Token': cfg.token } });
      Logger.log(cc + '  [' + cfg.domain + ']  HTTP ' + res.getResponseCode() + '  →  ' + res.getContentText().slice(0, 300));
    } catch (e) { Logger.log(cc + '  ERROR: ' + e); }
  });
}

/* ================= CAMPAIGN ID -> NAME (Campaign Map tab) ================ */
/* Google Shopping/Pmax put utm_campaign={campaignid} (a number) in the URL.
   Maintain a "Campaign Map" tab (col A = Campaign ID, col B = Campaign Name),
   then run resolveCampaignNames() to replace numeric UTM Campaign cells in
   every "<CC> Lead"/"<CC> Order" tab with the readable name.
   Get the id<->name list from Google Ads: Campaigns > add the "Campaign ID"
   column > copy both columns into the map tab. (Works for Bing/Meta ids too.) */
function resolveCampaignNames() {
  var map = loadCampaignMap_();
  if (!map) { Logger.log('Campaign Map tab created — paste Campaign ID / Name rows into it, then run again.'); return; }
  var ss = getSpreadsheet_();
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (!/ (Lead|Order)$/.test(name)) return;         // only lead/order tabs
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return;
    var ci = indexMap_(values[0])['UTM Campaign'];
    if (ci == null) return;
    for (var i = 1; i < values.length; i++) {
      var raw = String(values[i][ci] || '').trim();
      if (raw && /^\d+$/.test(raw) && map[raw]) sh.getRange(i + 1, ci + 1).setValue(map[raw]);
    }
  });
}
function loadCampaignMap_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(CONFIG.CAMPAIGN_MAP_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.CAMPAIGN_MAP_TAB);
    sh.appendRow(['Campaign ID', 'Campaign Name']);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold');
    sh.setFrozenRows(1);
    return null;
  }
  var v = sh.getDataRange().getValues(), m = {};
  for (var i = 1; i < v.length; i++) {
    var id = String(v[i][0] || '').trim(), nm = String(v[i][1] || '').trim();
    if (id && nm) m[id] = nm;
  }
  return m;
}

/* ONE-TIME REPAIR — run this once to fix drifted/corrupted tabs. For every
   "<CC> Lead"/"<CC> Order" tab it: clears the sheet, deletes stray columns,
   rewrites the correct header row at column A, and re-applies the colours.
   ⚠️ This ERASES the rows in those tabs (fine for test data). Do NOT run it
   once you have real data you want to keep. */
function resetDataTabs() {
  var ss = getSpreadsheet_();
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName(), headers = null;
    if (/ Lead$/.test(name)) headers = LEAD_HEADERS;
    else if (/ Order$/.test(name)) headers = ORDER_HEADERS;
    if (!headers) return;
    sh.clear();
    try { sh.setConditionalFormatRules([]); } catch (e) {}
    try { var extra = sh.getMaxColumns() - headers.length; if (extra > 0) sh.deleteColumns(headers.length + 1, extra); } catch (e) {}
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    Logger.log('reset ' + name);
  });
  try { formatAllTabs(); } catch (e) { Logger.log('format: ' + e); }
}

/* NON-DESTRUCTIVE repair — rewrites the correct header labels at column A and
   re-applies colours. Does NOT clear data or delete columns. Safe on real data.
   Use this (not resetDataTabs) once you've restored data from version history. */
function repairHeaders() {
  var ss = getSpreadsheet_();
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName(), headers = null;
    if (/ Lead$/.test(name)) headers = LEAD_HEADERS;
    else if (/ Order$/.test(name)) headers = ORDER_HEADERS;
    if (!headers) return;

    // 1) Rewrite the correct header labels at column A (data rows untouched).
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);

    // 2) SAFELY delete stray columns beyond the header set — but ONLY if they
    //    hold no data in rows 2+. If any data lives out there (e.g. a scattered
    //    Order tab), we leave everything alone so nothing is ever lost.
    var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
    if (lastCol > headers.length) {
      var dataBeyond = false;
      if (lastRow >= 2) {
        var beyond = sh.getRange(2, headers.length + 1, lastRow - 1, lastCol - headers.length).getValues();
        dataBeyond = beyond.some(function (row) { return row.some(function (c) { return c !== '' && c != null; }); });
      }
      if (!dataBeyond) { sh.deleteColumns(headers.length + 1, lastCol - headers.length); Logger.log(name + ': trimmed ' + (lastCol - headers.length) + ' empty col(s)'); }
      else { Logger.log(name + ': data found in far columns — NOT trimmed (fix manually).'); }
    }
    Logger.log('header repaired: ' + name);
  });
  try { formatAllTabs(); } catch (e) { Logger.log('format: ' + e); }
}

/* Convenience: one function to put on a single ~15-min time trigger. */
function runMaintenance() {
  try { backfillOrderNames(); } catch (e) { Logger.log('backfillOrderNames: ' + e); }   // no-op unless a shpat_ token is set
  try { linkOrderNumbers(); } catch (e) { Logger.log('linkOrderNumbers: ' + e); }        // token-free clickable order links
  try { resolveCampaignNames(); } catch (e) { Logger.log('resolveCampaignNames: ' + e); }
  try { formatAllTabs(); } catch (e) { Logger.log('formatAllTabs: ' + e); }
}

/* ========================= SHEET FORMATTING ============================= */
/* Colour-codes every "<CC> Lead"/"<CC> Order" tab: each Touchpoint its own
   consistent colour, contact columns (Name/Email/Phone) highlighted, Source
   and Stage colour-coded, branded header row. Idempotent — safe to re-run;
   conditional rules auto-extend to new rows, and it restyles new country tabs.
   Runs inside runMaintenance(); or run formatAllTabs() manually any time. */

// Muted, uniform-lightness palette — distinct hues, dark text stays readable.
var TP_COLORS = {
  '2D Mockup':'#D6E4F7',            // blue
  'Custom Size':'#E7DAF5',          // violet
  'Bulk Enquiry':'#FBE0C4',         // amber
  'Contact Us':'#D3EAF5',           // sky
  'Newsletter':'#FAF0C4',           // yellow
  'Register':'#E2E6EC',             // slate
  'Login':'#E3EBDC',                // sage
  'WhatsApp':'#D4EDCB',             // green (brand nod)
  'Phone Call':'#DCDDF6',           // indigo
  'Email Click':'#FADCE4',          // rose
  'Live Chat':'#CFEBE3',            // teal
  'Expert Consultation':'#FBD9CE'   // coral
};
var SRC_RULES = [
  ['Google', '#E8F0FE'],            // blue
  ['Microsoft', '#E6F4EA'], ['Bing', '#E6F4EA'],   // green
  ['LinkedIn', '#DCE7F0'],          // steel blue
  ['Meta', '#EDE7F6'], ['Facebook', '#EDE7F6'],    // purple
  ['Direct', '#F1F3F4']             // grey (organic/direct)
];
var STAGE_COLORS = { 'Purchase': '#CDEBD3', 'Add to Cart': '#FBECC8', 'Draft Order': '#EBD9F2' };
// Draft-order lifecycle status colours — match Shopify's admin (Open=yellow, Invoice sent=blue, Completed=grey).
var STATUS_COLORS = { 'Open': '#FCEFA1', 'Invoice sent': '#CFE2FF', 'Completed': '#E2E6EC' };
var HEADER_BG = '#1B2D55', HEADER_FG = '#FFFFFF';
// Contact cells (Name/Email/Phone) are coloured BY VALUE from this palette, so
// the SAME person/email always gets the SAME colour and duplicates stand out.
var VALUE_PALETTE = ['#D6E4F7','#E7DAF5','#FBE0C4','#D3EAF5','#FAF0C4','#D4EDCB',
  '#DCDDF6','#FADCE4','#CFEBE3','#FBD9CE','#E2E6EC','#F3D9EE','#D9EFDF','#EFE4C4',
  '#CFE0EF','#EAD7E1','#DCEFE9','#F6DBC9','#E8DFF5','#DDEAD2'];

function formatAllTabs() {
  var ss = getSpreadsheet_();
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    try {
      if (/ Lead$/.test(name)) formatTab_(sh, 'Touchpoint', TP_COLORS);
      else if (/ Order$/.test(name)) formatTab_(sh, 'Stage', STAGE_COLORS);
    } catch (e) { Logger.log('format ' + name + ': ' + e); }   // one bad tab never stops the rest
  });
}

function formatTab_(sh, catCol, catColors) {
  if (sh.getLastRow() < 1) return;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = indexMap_(headers);
  var maxR = sh.getMaxRows() - 1;
  if (maxR < 1) return;
  // Safety: if row 1 isn't the real header (e.g. stray rows pushed it down), our
  // key columns won't be found — bail WITHOUT clearing existing colour rules.
  if (col[catCol] == null && col['Source'] == null && col['Name'] == null && col['Email'] == null) {
    Logger.log('format ' + sh.getName() + ': header not in row 1 — skipped (delete rows above the header).');
    return;
  }

  // Branded header row.
  sh.getRange(1, 1, 1, headers.length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sh.setFrozenRows(1);

  var rules = [];
  // Category column (Touchpoint / Stage) — exact-match colours.
  if (col[catCol] != null) {
    var catRange = sh.getRange(2, col[catCol] + 1, maxR, 1);
    Object.keys(catColors).forEach(function (k) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(catColors[k]).setRanges([catRange]).build());
    });
  }
  // Source column — contains-match colours.
  if (col['Source'] != null) {
    var srcRange = sh.getRange(2, col['Source'] + 1, maxR, 1);
    SRC_RULES.forEach(function (p) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextContains(p[0]).setBackground(p[1]).setRanges([srcRange]).build());
    });
  }
  // Status column (draft-order lifecycle) — exact-match colours.
  if (col['Status'] != null) {
    var stsRange = sh.getRange(2, col['Status'] + 1, maxR, 1);
    Object.keys(STATUS_COLORS).forEach(function (k) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(STATUS_COLORS[k]).setRanges([stsRange]).build());
    });
  }
  sh.setConditionalFormatRules(rules);

  // Contact block — colour each Name/Email/Phone cell BY ITS VALUE so the same
  // value always gets the same colour (repeat customers / duplicates jump out).
  // Static fill, because conditional formatting can't colour by arbitrary value.
  ['Name', 'Email', 'Phone'].forEach(function (h) {
    if (col[h] != null) colorByValue_(sh, col[h], maxR);
  });
}

// Deterministic colour per distinct value (same value -> same palette colour).
function colorByValue_(sh, ci, maxR) {
  var range = sh.getRange(2, ci + 1, maxR, 1);
  var vals = range.getValues(), bg = [];
  for (var i = 0; i < vals.length; i++) {
    var v = String(vals[i][0] || '').trim().toLowerCase();
    bg.push([v ? VALUE_PALETTE[colorHash_(v) % VALUE_PALETTE.length] : null]);
  }
  range.setBackgrounds(bg);
}
function colorHash_(s) {
  var h = 0;
  for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return h;
}

/* ============================== HELPERS ================================== */

function countryCode_(d) {
  var c = String((d && d.country) || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c || 'XX';
}
function tabName_(d, kind) { return countryCode_(d) + ' ' + kind; }
function tsOf_(d) { return d.timestamp ? new Date(d.timestamp) : new Date(); }

function getSpreadsheet_() { return SpreadsheetApp.openById(CONFIG.SHEET_ID); }

function getTab_(name, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  // Write the header row ONLY when the tab is brand-new/empty. Never touch an
  // existing header (auto-appending "missing" headers caused columns to drift
  // far to the right). To change a tab's columns, delete it so it recreates.
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Append a row positioned to the sheet's ACTUAL header names, so column order
// never matters. If a header CELL is blank/corrupted (e.g. A1 "Timestamp" got
// wiped by a version-history restore), fall back to the canonical label for that
// position so a value is NEVER silently dropped — the timestamp always lands in
// column A even when the header there is missing.
function appendByHeader_(sheet, v, fallbackHeaders) {
  var lastCol = sheet.getLastColumn();
  var hdr = (lastCol > 0) ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var fb = fallbackHeaders || [];
  var n = Math.max(hdr.length, fb.length);
  var row = [];
  for (var i = 0; i < n; i++) {
    var label = String(hdr[i] != null ? hdr[i] : '').trim();
    if (!label && fb[i]) label = String(fb[i]).trim();   // blank header cell -> canonical name
    row.push(safeCell_((label && v[label] !== undefined) ? v[label] : ''));
  }
  sheet.appendRow(row);
}

// appendRow writes values "as if typed", so a string starting with = + - @ is
// evaluated as a FORMULA (e.g. a "+64…" phone becomes #ERROR!). Prefix such
// strings with an apostrophe so Sheets stores them as literal text (the
// apostrophe itself stays hidden). Numbers/Dates pass through untouched.
function safeCell_(val) {
  if (typeof val === 'string' && /^[=+\-@]/.test(val)) return "'" + val;
  return val;
}

// Overwrite a tab with a 2D array (optionally a leading parameters row).
function writeTab_(name, rows, leadingRow) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  var out = [];
  if (leadingRow) out.push(leadingRow);
  out = out.concat(rows);
  // Pad rows to equal width so setValues doesn't throw.
  var w = 0; out.forEach(function (r) { if (r.length > w) w = r.length; });
  out = out.map(function (r) { while (r.length < w) r.push(''); return r; });
  if (out.length) sheet.getRange(1, 1, out.length, w).setValues(out);
}

function indexMap_(headerRow) { var m = {}; headerRow.forEach(function (h, i) { m[h] = i; }); return m; }

// Human-readable attribution. A lead carries at most one ad click-id.
function classifySource_(d) {
  if (d.gclid)     return 'Google Ads (gclid)';
  if (d.gbraid)    return 'Google Ads (gbraid)';
  if (d.wbraid)    return 'Google Ads (wbraid)';
  if (d.msclkid)   return 'Microsoft / Bing Ads';
  if (d.li_fat_id) return 'LinkedIn Ads';
  if (d.fbclid)    return 'Meta / Facebook';
  var us = (d.utm_source || '').toLowerCase();
  if (us.indexOf('linkedin') !== -1) return 'LinkedIn (' + (d.utm_medium || 'utm') + ')';
  if (us.indexOf('facebook') !== -1 || us === 'fb' || us.indexOf('meta') !== -1 || us.indexOf('instagram') !== -1 || us === 'ig')
    return 'Meta / Facebook (' + (d.utm_medium || 'utm') + ')';
  if (d.utm_source) return d.utm_source + (d.utm_medium ? ' / ' + d.utm_medium : '');
  return 'Direct / Organic';
}

// SHA-256 hex (lowercase) — the format Meta & LinkedIn expect for hashed PII.
function sha256_(s) {
  if (!s) return '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
// Normalise Shopify draft-order status (OPEN / INVOICE_SENT / COMPLETED) to a tidy label.
function prettyStatus_(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'open') return 'Open';
  if (s.indexOf('invoice') !== -1) return 'Invoice sent';
  if (s === 'completed') return 'Completed';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function normPhone_(p) { var d = String(p || '').replace(/[^0-9]/g, ''); if (d.length === 10) d = '1' + d; return d; }

function jsonOut_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
