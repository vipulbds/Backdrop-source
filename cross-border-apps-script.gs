/**
 * ============================================================================
 *  BACKDROPSOURCE — CROSS-BORDER JOURNEY + CHECKOUT / ABANDONMENT TRACKING
 * ============================================================================
 *  A SEPARATE sheet and a SEPARATE Apps Script from the main bds-unified
 *  workbook, on purpose: nothing here can touch or reshape your existing
 *  "<CC> Lead" / "<CC> Order" tabs.
 *
 *  WHAT IT TRACKS
 *    ONE ROW PER CHECKOUT — from the moment checkout starts until it either
 *    dies (Abandoned) or converts (Purchased / Recovered), carrying the
 *    cross-border journey the whole way:
 *
 *      Started At  Store  Origin  Journey   Stage Reached   Outcome
 *      10:02       CA     UK      UK → CA   Payment Info    Abandoned
 *      11:15       CA     UK      UK → CA   Completed       Purchased
 *
 *  TABS (auto-created)
 *    "Checkouts"           — the live table, one row per checkout token.
 *    "Abandoned"           — rebuilt view of just the abandoned ones (the
 *                            actionable recovery list), newest first.
 *    "Summary"             — funnel, abandonment rate, cross-border routes.
 *    "Ad Account Routing"  — cross-border purchases whose click-id belongs to
 *                            ANOTHER country's ad account (see note below).
 *
 *  DATA IN — bds-pixel.js only. It subscribes to every checkout step:
 *    checkout_started · checkout_contact_info_submitted ·
 *    checkout_address_info_submitted · checkout_shipping_info_submitted ·
 *    payment_info_submitted · checkout_completed
 *  and beacons each one here with the cross-border attributes that
 *  bds-tracking.liquid mirrored onto the cart.
 *
 *  ABANDONMENT is inferred, not pushed: a checkout with no "Completed" after
 *  CONFIG.ABANDON_AFTER_MIN minutes is marked Abandoned by resolveAbandoned().
 *  If that same checkout later completes (e.g. via Shopify's recovery email)
 *  it flips to "Recovered", so you can measure recovery for free.
 *
 *  SETUP
 *    1. Create a NEW Google Sheet. Copy its ID from the URL into CONFIG.SHEET_ID.
 *    2. Extensions > Apps Script, paste this file, Save.
 *    3. Deploy > New deployment > Web app > Execute as: Me,
 *       Who has access: Anyone > Deploy. COPY THE /exec URL.
 *    4. Paste that URL into bds-pixel.js as XB_URL, then re-paste the pixel
 *       into every store's Custom Pixel.
 *    5. Run setup() once (creates the tabs + the 15-minute trigger).
 * ============================================================================
 */

var VERSION = 'bds-crossborder v1';

var CONFIG = {
  // ⬇⬇ PASTE THE NEW SHEET'S ID HERE (the long string in its URL) ⬇⬇
  SHEET_ID: 'PASTE_NEW_CROSS_BORDER_SHEET_ID_HERE',
  ABANDON_AFTER_MIN: 60,          // no "Completed" after this long -> Abandoned
  TIMEZONE: 'America/Chicago',
  DEFAULT_CURRENCY: 'USD'
};

// Store handles for the clickable admin links (domain minus .myshopify.com).
// Token-free — same trick the main script uses.
var STORE_HANDLE = {
  USA: 'bdsus',
  UK:  'backdropsourceuk',
  CA:  'backdropsource-v1-0',
  AU:  'mousestored',
  NZ:  'backdropsourcenz',
  IN:  'backdropsource-india',
  UAE: 'backdropsourceuae',
  FR:  'backdropsourcefrance',
  ES:  'backdropsource-spain',
  DE:  'backdropsourcegermany'
};

var CHECKOUT_TAB = 'Checkouts', ABANDONED_TAB = 'Abandoned',
    SUMMARY_TAB = 'Summary',    ROUTING_TAB   = 'Ad Account Routing';

var CHECKOUT_HEADERS = [
  'Started At', 'Store', 'Origin', 'Journey', 'Cross-Border',
  'Stage Reached', 'Outcome', 'Ended At', 'Minutes to Outcome',
  'Order ID', 'Order Number', 'Value', 'Currency', 'Products', 'Quantity',
  'Email', 'Name', 'Phone',
  'Source', 'Ad Country', 'GCLID', 'MSCLKID', 'FBCLID', 'UTM Source', 'UTM Campaign',
  'Visitor ID', 'Checkout Token', 'Page URL', 'Last Update'
];

// The checkout funnel, in order. A row's "Stage Reached" only ever moves
// FORWARD — a late-arriving earlier event can never drag it back.
var STAGES = ['Checkout Started', 'Contact Info', 'Address', 'Shipping', 'Payment Info', 'Completed'];
var STAGE_RANK = {};
STAGES.forEach(function (s, i) { STAGE_RANK[s] = i + 1; });

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
  if (p.checkout_token || p.stage || p.type) return route_(p);
  return jsonOut_({ ok: true, version: VERSION, message: 'Backdropsource cross-border endpoint is live.' });
}

function route_(data) {
  if (!data || !data.checkout_token) return jsonOut_({ ok: false, error: 'checkout_token required' });
  return saveCheckout_(data);
}

/* One row per checkout token. Every beacon MERGES into that row: the stage
   advances, empty cells fill in, and the outcome resolves on completion.
   Out-of-order or duplicated events are therefore harmless. */
function saveCheckout_(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var sheet = getTab_(CHECKOUT_TAB, CHECKOUT_HEADERS);
    var token = String(data.checkout_token || '').trim();
    var stage = normStage_(data.stage);
    var now = tsOf_(data);
    var completed = (stage === 'Completed');

    var v = {
      'Started At': now,
      'Store': countryCode_(data),
      'Origin': originCc_(data),
      'Journey': journey_(data),
      'Cross-Border': crossBorder_(data),
      'Stage Reached': stage,
      'Outcome': completed ? 'Purchased' : 'In Progress',
      'Ended At': completed ? now : '',
      'Order ID': String(data.order_id || '').replace(/[^0-9]/g, ''),
      'Order Number': data.order_number || '',
      'Value': data.value || data.order_value || '',
      'Currency': data.currency || CONFIG.DEFAULT_CURRENCY,
      'Products': data.product || '',
      'Quantity': data.quantity || '',
      'Email': data.email || '',
      'Name': data.name || '',
      'Phone': data.phone || '',
      'Source': classifySource_(data),
      'Ad Country': String(data.ad_country || '').toUpperCase(),
      'GCLID': data.gclid || '', 'MSCLKID': data.msclkid || '', 'FBCLID': data.fbclid || '',
      'UTM Source': data.utm_source || '', 'UTM Campaign': data.utm_campaign || '',
      'Visitor ID': data.visitor_id || '',
      'Checkout Token': token,
      'Page URL': data.page_url || '',
      'Last Update': now
    };

    var values = sheet.getDataRange().getValues();
    var col = indexMap_(values[0]);
    var tCol = col['Checkout Token'];
    for (var r = 1; r < values.length; r++) {
      if (tCol == null || String(values[r][tCol]).trim() !== token) continue;

      var curStage = String(values[r][col['Stage Reached']] || '');
      var curOutcome = String(values[r][col['Outcome']] || '');
      var rowNo = r + 1;

      CHECKOUT_HEADERS.forEach(function (h) {
        var ci = col[h]; if (ci == null) return;
        var inc = v[h], cur = values[r][ci];
        if (inc === undefined || inc === '') return;

        if (h === 'Started At') return;                                   // never move the start time
        if (h === 'Stage Reached') {                                      // forward only
          if ((STAGE_RANK[inc] || 0) <= (STAGE_RANK[curStage] || 0)) return;
        } else if (h === 'Outcome') {
          if (!completed) return;                                          // only a completion changes the outcome
          // An abandoned checkout that later completes was RECOVERED.
          inc = (curOutcome === 'Abandoned') ? 'Recovered' : 'Purchased';
        } else if (h !== 'Last Update' && h !== 'Ended At' && cur !== '' && cur != null) {
          return;                                                          // everything else fills empties only
        }
        sheet.getRange(rowNo, ci + 1).setValue(safeCell_(inc));
      });

      if (completed) {
        var started = values[r][col['Started At']];
        var mins = minutesBetween_(started, now);
        if (mins !== '') sheet.getRange(rowNo, col['Minutes to Outcome'] + 1).setValue(mins);
      }
      return jsonOut_({ ok: true, version: VERSION, merged: true, stage: stage });
    }

    appendByHeader_(sheet, v, CHECKOUT_HEADERS);
    return jsonOut_({ ok: true, version: VERSION, created: true, stage: stage });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ==================== ABANDONMENT (inferred, no API) ==================== */
/* A checkout that never reached "Completed" and has been quiet for longer than
   CONFIG.ABANDON_AFTER_MIN is an abandoned checkout. Runs on the trigger.     */
function resolveAbandoned() {
  var sheet = getTab_(CHECKOUT_TAB, CHECKOUT_HEADERS);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return 0;
  var col = indexMap_(values[0]);
  var cutoff = Date.now() - CONFIG.ABANDON_AFTER_MIN * 60000;
  var marked = 0;

  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[col['Outcome']]) !== 'In Progress') continue;
    var last = msOf_(r[col['Last Update']]) || msOf_(r[col['Started At']]);
    if (!last || last > cutoff) continue;

    sheet.getRange(i + 1, col['Outcome'] + 1).setValue('Abandoned');
    if (!r[col['Ended At']]) sheet.getRange(i + 1, col['Ended At'] + 1).setValue(new Date(last));
    var mins = minutesBetween_(r[col['Started At']], new Date(last));
    if (mins !== '') sheet.getRange(i + 1, col['Minutes to Outcome'] + 1).setValue(mins);
    marked++;
  }
  Logger.log('resolveAbandoned: marked ' + marked);
  return marked;
}

/* ======================== ABANDONED VIEW TAB ============================ */
/* Just the abandoned checkouts, newest first — your recovery worklist.      */
function buildAbandoned() {
  var values = getTab_(CHECKOUT_TAB, CHECKOUT_HEADERS).getDataRange().getValues();
  var out = [['Abandoned At', 'Store', 'Origin', 'Journey', 'Cross-Border', 'Dropped At Stage',
              'Value', 'Currency', 'Products', 'Email', 'Name', 'Phone', 'Source', 'Ad Country',
              'Minutes in Checkout', 'Checkout Token']];
  if (values.length > 1) {
    var col = indexMap_(values[0]);
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      if (String(cell_(r, col, 'Outcome')) !== 'Abandoned') continue;
      rows.push([
        cell_(r, col, 'Ended At') || cell_(r, col, 'Last Update'),
        cell_(r, col, 'Store'), cell_(r, col, 'Origin'), cell_(r, col, 'Journey'),
        cell_(r, col, 'Cross-Border'), cell_(r, col, 'Stage Reached'),
        cell_(r, col, 'Value'), cell_(r, col, 'Currency'), cell_(r, col, 'Products'),
        cell_(r, col, 'Email'), cell_(r, col, 'Name'), cell_(r, col, 'Phone'),
        cell_(r, col, 'Source'), cell_(r, col, 'Ad Country'),
        cell_(r, col, 'Minutes to Outcome'), cell_(r, col, 'Checkout Token')
      ]);
    }
    rows.sort(function (a, b) { return msOf_(b[0]) - msOf_(a[0]); });
    out = out.concat(rows);
  }
  writeTab_(ABANDONED_TAB, out);
  var sh = getSpreadsheet_().getSheetByName(ABANDONED_TAB);
  sh.getRange(1, 1, 1, out[0].length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sh.setFrozenRows(1);
  try { sh.autoResizeColumns(1, out[0].length); } catch (e) {}
  Logger.log('buildAbandoned: ' + (out.length - 1) + ' row(s)');
}

/* ============================ SUMMARY TAB =============================== */
function buildSummary() {
  var values = getTab_(CHECKOUT_TAB, CHECKOUT_HEADERS).getDataRange().getValues();
  var out = [];
  var stageCount = {}, outcome = { 'In Progress': 0, 'Abandoned': 0, 'Recovered': 0, 'Purchased': 0 };
  // Purchased and Recovered revenue are tracked separately — lumping them
  // together made the Purchased row read as if it had earned the recovered
  // money too.
  var routes = {}, revPurchased = 0, revRecovered = 0, lostValue = 0, currency = '';

  if (values.length > 1) {
    var col = indexMap_(values[0]);
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      var rank = STAGE_RANK[String(cell_(r, col, 'Stage Reached'))] || 0;
      // "Reached" is cumulative: getting to Payment Info means you passed Address.
      STAGES.forEach(function (s, k) { if (rank >= k + 1) stageCount[s] = (stageCount[s] || 0) + 1; });

      var oc = String(cell_(r, col, 'Outcome')) || 'In Progress';
      if (outcome[oc] === undefined) outcome[oc] = 0;
      outcome[oc]++;

      var val = Number(cell_(r, col, 'Value')) || 0;
      currency = currency || String(cell_(r, col, 'Currency'));
      if (oc === 'Purchased') revPurchased += val;
      if (oc === 'Recovered') revRecovered += val;
      if (oc === 'Abandoned') lostValue += val;

      if (String(cell_(r, col, 'Cross-Border')) === 'Yes') {
        var route = String(cell_(r, col, 'Origin')) + ' → ' + String(cell_(r, col, 'Store'));
        var a = routes[route] || (routes[route] = { checkouts: 0, abandoned: 0, won: 0, revenue: 0, lost: 0 });
        a.checkouts++;
        if (oc === 'Abandoned') { a.abandoned++; a.lost += val; }
        if (oc === 'Purchased' || oc === 'Recovered') { a.won++; a.revenue += val; }
      }
    }
  }

  var started = stageCount['Checkout Started'] || 0;
  var pct = function (n) { return started ? Math.round(n / started * 1000) / 10 + '%' : '—'; };

  out.push(['CHECKOUT FUNNEL — all stores', 'rebuilt ' + fmtNow_(), '', '', '', '']);
  out.push(['Stage', 'Checkouts', '% of started', 'Drop-off', '', '']);
  var prev = null;
  STAGES.forEach(function (s) {
    var n = stageCount[s] || 0;
    out.push([s, n, pct(n), prev === null ? '' : (prev - n), '', '']);
    prev = n;
  });
  out.push([]);

  var lost = outcome['Abandoned'] || 0, won = (outcome['Purchased'] || 0) + (outcome['Recovered'] || 0);
  out.push(['OUTCOMES', '', '', '', '', '']);
  out.push(['Outcome', 'Checkouts', '% of started', 'Value', 'Currency', '']);
  out.push(['In Progress', outcome['In Progress'] || 0, pct(outcome['In Progress'] || 0), '', '', 'still live']);
  out.push(['Abandoned', lost, pct(lost), lostValue || '', currency, 'value walked away']);
  out.push(['Recovered', outcome['Recovered'] || 0, pct(outcome['Recovered'] || 0), revRecovered || '', currency, 'abandoned, then bought']);
  out.push(['Purchased', outcome['Purchased'] || 0, pct(outcome['Purchased'] || 0), revPurchased || '', currency, 'bought first time']);
  out.push(['Total revenue', '', '', (revPurchased + revRecovered) || '', currency, '']);
  out.push(['Abandonment rate', (lost + won) ? Math.round(lost / (lost + won) * 1000) / 10 + '%' : '—', '', '', '', '']);
  out.push([]);

  out.push(['CROSS-BORDER ROUTES — started on one store, checked out on another', '', '', '', '', '']);
  out.push(['Route', 'Checkouts', 'Abandoned', 'Purchased', 'Revenue', 'Lost Value']);
  var keys = Object.keys(routes).sort(function (a, b) { return routes[b].checkouts - routes[a].checkouts; });
  if (!keys.length) out.push(['(no cross-border checkouts recorded yet)', '', '', '', '', '']);
  keys.forEach(function (k) {
    var a = routes[k];
    out.push([k, a.checkouts, a.abandoned, a.won, a.revenue || '', a.lost || '']);
  });
  out.push([]);
  out.push(['Abandoned checkouts in Shopify admin:', '', '', '', '', '']);
  Object.keys(STORE_HANDLE).forEach(function (cc) {
    out.push([cc, '=HYPERLINK("https://admin.shopify.com/store/' + STORE_HANDLE[cc] + '/checkouts","open ' + cc + ' abandoned checkouts")', '', '', '', '']);
  });

  writeTab_(SUMMARY_TAB, out);
  formatSummary_();
  Logger.log('buildSummary: ' + started + ' checkout(s), ' + keys.length + ' cross-border route(s)');
}

function formatSummary_() {
  var sh = getSpreadsheet_().getSheetByName(SUMMARY_TAB);
  if (!sh) return;
  var last = Math.max(sh.getLastColumn(), 6);
  var colA = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    var t = String(colA[i][0]);
    if (/^(CHECKOUT FUNNEL|OUTCOMES|CROSS-BORDER ROUTES)/.test(t)) {
      sh.getRange(i + 1, 1, 1, last).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
      sh.getRange(i + 2, 1, 1, last).setBackground('#E8EDF5').setFontWeight('bold');
    }
    if (/^Abandonment rate/.test(t)) sh.getRange(i + 1, 1, 1, 2).setFontWeight('bold').setBackground('#FBD9CE');
  }
  try { sh.autoResizeColumns(1, last); } catch (e) {}
}

/* ==================== AD ACCOUNT ROUTING (the money tab) ================= */
/* A UK gclid that converts on the CA store gets written into CA's upload tab
   by the MAIN script — but Google rejects a conversion uploaded to an account
   that doesn't own the click. This tab lists exactly those rows so you can move
   them to the right account's import.                                        */
function buildAdRouting() {
  var values = getTab_(CHECKOUT_TAB, CHECKOUT_HEADERS).getDataRange().getValues();
  var out = [['Upload To (Ad Account)', 'Ordered On', 'Journey', 'Platform', 'Click ID',
              'Conversion Time', 'Value', 'Currency', 'Order Number', 'Email']];
  if (values.length > 1) {
    var col = indexMap_(values[0]);
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      var oc = String(cell_(r, col, 'Outcome'));
      if (oc !== 'Purchased' && oc !== 'Recovered') continue;
      var store = String(cell_(r, col, 'Store'));
      var adCc = String(cell_(r, col, 'Ad Country'));
      if (!adCc || adCc === store) continue;                  // already in the right account

      var when = cell_(r, col, 'Ended At') || cell_(r, col, 'Started At');
      var dt = (when instanceof Date) ? when : new Date(when);
      var row = function (platform, clickId) {
        out.push([adCc, store, cell_(r, col, 'Journey'), platform, clickId,
          isNaN(dt.getTime()) ? '' : Utilities.formatDate(dt, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ssXXX'),
          cell_(r, col, 'Value'), cell_(r, col, 'Currency'),
          cell_(r, col, 'Order Number') || cell_(r, col, 'Order ID'), cell_(r, col, 'Email')]);
      };
      if (cell_(r, col, 'GCLID')) row('Google Ads', cell_(r, col, 'GCLID'));
      if (cell_(r, col, 'MSCLKID')) row('Microsoft / Bing', cell_(r, col, 'MSCLKID'));
      if (cell_(r, col, 'FBCLID')) row('Meta', cell_(r, col, 'FBCLID'));
    }
  }
  if (out.length === 1) out.push(['(no misrouted conversions — every click-id belongs to the store that took the order)', '', '', '', '', '', '', '', '', '']);
  writeTab_(ROUTING_TAB, out);
  var sh = getSpreadsheet_().getSheetByName(ROUTING_TAB);
  sh.getRange(1, 1, 1, out[0].length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sh.setFrozenRows(1);
  try { sh.autoResizeColumns(1, out[0].length); } catch (e) {}
  Logger.log('buildAdRouting: ' + (out.length - 1) + ' row(s)');
}

/* ===================== ORDER LINKS (token-free) ========================= */
/* Makes each won checkout's Order Number open that order in Shopify admin. */
function linkOrders() {
  var sheet = getTab_(CHECKOUT_TAB, CHECKOUT_HEADERS);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return;
  var col = indexMap_(values[0]);
  var onCol = col['Order Number'];
  if (onCol == null) return;
  var formulas = sheet.getRange(2, onCol + 1, values.length - 1, 1).getFormulas();
  var linked = 0;
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var oc = String(cell_(r, col, 'Outcome'));
    if (oc !== 'Purchased' && oc !== 'Recovered') continue;
    if (formulas[i - 1][0] && formulas[i - 1][0].indexOf('HYPERLINK') !== -1) continue;
    var id = String(cell_(r, col, 'Order ID')).replace(/[^0-9]/g, '');
    var handle = STORE_HANDLE[String(cell_(r, col, 'Store')).toUpperCase()];
    if (!id || !handle) continue;
    var disp = String(r[onCol] || '');
    var label = (disp && disp.charAt(0) === '#') ? disp : ('Order ' + id);
    sheet.getRange(i + 1, onCol + 1)
      .setFormula('=HYPERLINK("https://admin.shopify.com/store/' + handle + '/orders/' + id + '","' + label + '")');
    linked++;
  }
  Logger.log('linkOrders: ' + linked);
}

/* ========================== MAINTENANCE / SETUP ========================= */

function runMaintenance() {
  try { resolveAbandoned(); } catch (e) { Logger.log('resolveAbandoned: ' + e); }
  try { linkOrders(); } catch (e) { Logger.log('linkOrders: ' + e); }
  try { formatCheckouts(); } catch (e) { Logger.log('formatCheckouts: ' + e); }
  try { buildAbandoned(); } catch (e) { Logger.log('buildAbandoned: ' + e); }
  try { buildAdRouting(); } catch (e) { Logger.log('buildAdRouting: ' + e); }
  try { buildSummary(); } catch (e) { Logger.log('buildSummary: ' + e); }
}

/* Run ONCE after pasting the sheet id: creates the tabs and the 15-min trigger. */
function setup() {
  if (CONFIG.SHEET_ID.indexOf('PASTE_') === 0) throw new Error('Set CONFIG.SHEET_ID to the new sheet\'s id first.');
  getTab_(CHECKOUT_TAB, CHECKOUT_HEADERS);
  runMaintenance();
  var already = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'runMaintenance'; });
  if (!already) {
    ScriptApp.newTrigger('runMaintenance').timeBased().everyMinutes(15).create();
    Logger.log('15-minute runMaintenance trigger created.');
  } else {
    Logger.log('trigger already exists.');
  }
  Logger.log('Setup complete — ' + VERSION);
}

/* ========================= SHEET FORMATTING ============================= */

var HEADER_BG = '#1B2D55', HEADER_FG = '#FFFFFF';
var OUTCOME_COLORS = {
  'In Progress': '#FAF0C4',   // yellow — still live
  'Abandoned':   '#FBD9CE',   // coral  — lost
  'Recovered':   '#D6E4F7',   // blue   — came back
  'Purchased':   '#CDEBD3'    // green  — won
};
var STAGE_COLORS = {
  'Checkout Started': '#F1F3F4', 'Contact Info': '#E2E6EC', 'Address': '#D3EAF5',
  'Shipping': '#DCDDF6', 'Payment Info': '#FBE0C4', 'Completed': '#CDEBD3'
};
var CROSS_COLORS = { 'Yes': '#FBE0C4', 'No': '#F1F3F4' };

function formatCheckouts() {
  var sh = getTab_(CHECKOUT_TAB, CHECKOUT_HEADERS);
  if (sh.getLastRow() < 1) return;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var col = indexMap_(headers);
  var maxR = sh.getMaxRows() - 1;
  if (maxR < 1) return;
  // Same guard as the main script: if row 1 isn't the real header, bail WITHOUT
  // clearing the existing colour rules.
  if (col['Outcome'] == null && col['Stage Reached'] == null) {
    Logger.log('formatCheckouts: header not in row 1 — skipped.');
    return;
  }
  sh.getRange(1, 1, 1, headers.length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sh.setFrozenRows(1);

  var rules = [];
  var addRules = function (header, map) {
    if (col[header] == null) return;
    var range = sh.getRange(2, col[header] + 1, maxR, 1);
    Object.keys(map).forEach(function (k) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(map[k]).setRanges([range]).build());
    });
  };
  addRules('Outcome', OUTCOME_COLORS);
  addRules('Stage Reached', STAGE_COLORS);
  addRules('Cross-Border', CROSS_COLORS);
  sh.setConditionalFormatRules(rules);
}

/* ============================== HELPERS ================================== */

function getSpreadsheet_() { return SpreadsheetApp.openById(CONFIG.SHEET_ID); }

function getTab_(name, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  // Write the header row ONLY when the tab is brand-new. Never rewrite an
  // existing header — that is what caused the column drift in the main script.
  if (headers && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Position each value under the sheet's ACTUAL header name, so column order
// never matters and a blank header cell falls back to the canonical label.
function appendByHeader_(sheet, v, fallbackHeaders) {
  var lastCol = sheet.getLastColumn();
  var hdr = (lastCol > 0) ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var fb = fallbackHeaders || [];
  var n = Math.max(hdr.length, fb.length);
  var row = [];
  for (var i = 0; i < n; i++) {
    var label = String(hdr[i] != null ? hdr[i] : '').trim();
    if (!label && fb[i]) label = String(fb[i]).trim();
    row.push(safeCell_((label && v[label] !== undefined) ? v[label] : ''));
  }
  sheet.appendRow(row);
}

// appendRow writes "as if typed", so a string starting with = + - @ is evaluated
// as a FORMULA (a "+64…" phone becomes #ERROR!). Store those as literal text.
function safeCell_(val) {
  if (typeof val === 'string' && /^[=+\-@]/.test(val)) return "'" + val;
  return val;
}

function writeTab_(name, rows) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  try { sheet.setConditionalFormatRules([]); } catch (e) {}
  var w = 0;
  rows.forEach(function (r) { if (r.length > w) w = r.length; });
  var out = rows.map(function (r) { r = r.slice(); while (r.length < w) r.push(''); return r; });
  if (out.length && w) sheet.getRange(1, 1, out.length, w).setValues(out);
}

function indexMap_(headerRow) { var m = {}; headerRow.forEach(function (h, i) { m[h] = i; }); return m; }

// Read by header name, tolerating a column that doesn't exist on this tab.
function cell_(row, col, header) {
  var i = col[header];
  return (i == null || row[i] == null) ? '' : row[i];
}
function msOf_(v) {
  if (v instanceof Date) return v.getTime();
  if (!v) return 0;
  var d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
function minutesBetween_(a, b) {
  var x = msOf_(a), y = msOf_(b);
  if (!x || !y || y < x) return '';
  return Math.round((y - x) / 60000);
}
function fmtNow_() { return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm'); }

function countryCode_(d) {
  var c = String((d && d.country) || 'XX').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c || 'XX';
}
function tsOf_(d) { return d.timestamp ? new Date(d.timestamp) : new Date(); }
function normStage_(s) {
  s = String(s || '').trim();
  for (var i = 0; i < STAGES.length; i++) if (STAGES[i].toLowerCase() === s.toLowerCase()) return STAGES[i];
  return 'Checkout Started';
}

// The store the visitor FIRST landed on; defaults to this store.
function originCc_(d) {
  var o = String(d.origin_country || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return o || countryCode_(d);
}
function journey_(d) {
  var j = String(d.journey || '').trim();
  if (j) return j;
  var o = originCc_(d), cc = countryCode_(d);
  return (o && o !== cc) ? (o + ' → ' + cc) : cc;
}
function crossBorder_(d) {
  var x = String(d.cross_border || '').trim();
  if (x) return /^(y|1|true)/i.test(x) ? 'Yes' : 'No';
  return originCc_(d) !== countryCode_(d) ? 'Yes' : 'No';
}

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

function jsonOut_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
