/**
 * ============================================================================
 *  BACKDROPSOURCE — HISTORICAL TRACTION  (standalone Google Apps Script)
 * ============================================================================
 *  "WHEN do the orders come in?"  A dedicated workbook that answers it for
 *  2025 vs 2026 (or any two years) at every grain you can ask for:
 *
 *      by YEAR · by MONTH · by ISO WEEK · by DAY OF WEEK · by DAY OF MONTH
 *      · by HOUR OF DAY · by PART OF DAY
 *
 *  …and then crosses those grains against each other in five colour-graded
 *  MATRICES, so the busiest COMBINATIONS jump off the page:
 *
 *      Month  x  Weekday        →  "big order days land on Fridays in March"
 *      Date   x  Month          →  "the 1st–3rd of every month spike"
 *      Hour   x  Month          →  "December orders arrive later at night"
 *      Weekday x Hour           →  "Saturday 8pm is the busiest hour we have"
 *      Weekday x Hour (revenue) →  the same grid, in money
 *
 *  BULK / VOLUME — everything is reported on ORDER COUNT as well as revenue,
 *  and the ranking columns, the matrices and the PEAKS block are all driven by
 *  ORDER COUNT. That is the "where do I get the bulk of my orders" answer.
 *  Revenue sits alongside it so you can see when volume and value disagree —
 *  a busy hour of small orders is a different thing from a quiet, rich one.
 *
 *  DATA SOURCE — Shopify's own analytics engine (ShopifyQL), three grains:
 *      FROM sales SHOW total_sales, orders GROUP BY day  SINCE <yr>-01-01 UNTIL <yr>-12-31
 *      FROM sales SHOW total_sales, orders GROUP BY hour SINCE <month> UNTIL <month>
 *  The daily query is ONE call per store-year (365 rows) and gives every date,
 *  weekday, week and month cut. The hourly query is run month by month, because
 *  a whole year of hours is ~8,760 rows and one query would truncate it; those
 *  rows are folded into BOTH a weekday x hour and a month x hour aggregate.
 *  Only the  read_reports  scope is needed — no order-level access at all.
 *
 *  TIME ZONE — ShopifyQL buckets hours in the STORE's own time zone, which is
 *  exactly what you want: "our UK customers order at 8pm" means 8pm in Britain.
 *  Each store therefore reports on its own local clock; that is deliberate, and
 *  it is printed on every tab so nobody compares 2pm-UK with 2pm-USA by mistake.
 *
 *  TABS IT CREATES
 *      ONE TAB PER COUNTRY — "USA", "UK", "CA", "FR", "NZ", "AUS", "IN", "UAE"
 *                            (names come from CONFIG.TAB_NAMES). Row 1 has two
 *                            year dropdowns — change one and that tab redraws.
 *      "Traction Daily"    — one upserted row per Country x Date: revenue, orders,
 *                            AOV, weekday, ISO week, day-of-year. Audit trail
 *                            and flat export.
 *      "Traction Hourly"   — one upserted row per Country x Year x Grain x Hour,
 *                            at both weekday and month grain (456 buckets per
 *                            country-year) — the matrix source.
 *      "FX Rates"          — the rate card. Column C is yours to type into and
 *                            always wins.
 *
 *  CURRENCY — every report tab is shown in ONE currency (CONFIG.REPORT_CURRENCY
 *  = USD) so countries read side by side. Conversion happens on READ, so editing
 *  a rate and rebuilding is enough — no re-pull. The LOCAL figures on the raw
 *  tabs are the ones that tie to each Shopify admin to the cent. Order COUNTS
 *  are never converted, so they tie exactly everywhere.
 *
 *  DEFINITIONS (also printed on every tab, so nobody has to guess)
 *      Orders  = Shopify "Orders" — the volume number everything is ranked on.
 *      Revenue = Shopify "Total sales" — ALREADY net of discounts, returns and
 *                cancellations.
 *      AOV     = Revenue / Orders. NOTE this is NOT Shopify's own
 *                average_order_value (whose numerator is gross of returns), and
 *                NOT the AOV on the MoM Comparison workbook. Shopify publishes
 *                no hourly AOV, so it is derived here; the two workbooks differ
 *                by a percent or two on AOV, while Revenue and Orders tie exactly.
 *      Share   = that bucket's slice of the YEAR'S OWN ORDERS. This is the column
 *                to read when one year is only part-complete.
 *      Weekend = CONFIG.WEEKEND_DAYS (default Sat + Sun).
 *
 *  SETUP
 *    1. Create a NEW Google Sheet -> copy its ID into CONFIG.SHEET_ID.
 *    2. Extensions > Apps Script -> paste this whole file -> Save.
 *    3. Fill CONFIG.STORES (copy the credentials straight from your MoM
 *       Comparison / Ad Budget Tracker script — same apps, same values).
 *    4. Each store's Shopify app needs the  read_reports  scope RELEASED
 *       (Dev Dashboard: Scopes -> Save -> Release a new version; an in-admin
 *       custom app: add the scope -> re-install). Without it that store is
 *       skipped and the log says exactly that.
 *    5. Run  setup()  once -> menu, dropdown trigger, daily refresh.
 *    6. Menu "Traction" -> "Pull historical data (Shopify)".
 *  No web app, no deployment — nothing here runs from a /exec URL.
 *
 *  EXCEL — menu "Traction" -> "Export workbook to Excel (.xlsx)" writes a real
 *  .xlsx (charts included) into Drive and logs the link. The first run asks for
 *  Drive permission; that is the only extra scope this script needs.
 * ============================================================================
 */

var VERSION = 'bds-traction v2';

var CONFIG = {
  SHEET_ID:    '1GRXSi3uEGk5BM8Y1x37keze0jw2gZcgH-aKI7yJyraQ',   // this workbook's id (the long string in its URL)
  TAB_PREFIX:  '',                       // leave '' for a dedicated sheet; set 'BDS ' if you paste this into an existing workbook so it can never collide with your tabs
  API_VERSION: '2025-10',
  YEARS:       [2025, 2026],             // which years to pull. [] = last year + this year. Add more (e.g. [2024,2025,2026]) and the YEARLY OVERVIEW grows with them.

  // Country code -> the TAB NAME to use for it. Tabs are created in this order.
  TAB_NAMES: { USA: 'USA', UK: 'UK', CA: 'CA', FR: 'FR', NZ: 'NZ', AU: 'AUS', IN: 'IN', UAE: 'UAE' },
  BUILD_ALL_TAB: false,                  // true = ALSO build a combined "ALL" tab totalling every store

  WEEK_START:   'Mon',                   // 'Mon' or 'Sun' — the order weekdays are listed in
  WEEKEND_DAYS: [0, 6],                  // JS weekday numbers counted as "weekend" (0 = Sunday, 6 = Saturday)
  TOP_N_DATES:  15,                      // how many busiest single days to list per year
  PULL_HOURLY:  true,                    // false = skip the hourly pull (much faster; you lose every time-of-day cut and two matrices)
  RANK_BY:      'orders',                // what the Rank column and the PEAKS block rank on: 'orders' (volume) or 'revenue'

  REPORT_CURRENCY: 'USD',                // EVERY report tab is shown in this currency; local figures stay on the raw tabs
  FX: { USD: 1, CAD: 0.73, GBP: 1.27, AUD: 0.66, NZD: 0.60, EUR: 1.08, INR: 0.012, SGD: 0.74, AED: 0.27 },   // 1 local unit -> USD (fallbacks; refreshFxRates() overwrites with live rates)
  FX_PINNED: {},                         // e.g. { GBP: 1.301 } to force a rate. Anything typed on the FX Rates tab beats even this.

  // Hour buckets, for the "part of day" summary. from/to are inclusive, 0-23.
  DAY_PARTS: [
    { name: 'Night (00–05)',     from: 0,  to: 5  },
    { name: 'Morning (06–11)',   from: 6,  to: 11 },
    { name: 'Afternoon (12–17)', from: 12, to: 17 },
    { name: 'Evening (18–23)',   from: 18, to: 23 }
  ],

  // One entry per store. TWO ways to authenticate — the script auto-detects:
  //  (A) Dev-Dashboard app: fill clientId + clientSecret (client-credentials grant).
  //  (B) In-admin custom app: put its Admin API token in `token: 'shpat_…'` (then clientId/secret are ignored).
  // EITHER WAY the app needs the  read_reports  scope for ShopifyQL, and the scope must be RELEASED / re-installed.
  STORES: [
    { code: 'USA', domain: 'bdsus.myshopify.com',               token: '', clientId: 'PASTE_USA_CLIENT_ID', clientSecret: 'PASTE_USA_CLIENT_SECRET' },
    { code: 'UK',  domain: 'backdropsourceuk.myshopify.com',    token: '', clientId: 'PASTE_UK_CLIENT_ID',  clientSecret: 'PASTE_UK_CLIENT_SECRET' },
    { code: 'CA',  domain: 'backdropsource-v1-0.myshopify.com', token: '', clientId: 'PASTE_CA_CLIENT_ID',  clientSecret: 'PASTE_CA_CLIENT_SECRET' },
    { code: 'AU',  domain: 'mousestored.myshopify.com',         token: '', clientId: 'PASTE_AU_CLIENT_ID',  clientSecret: 'PASTE_AU_CLIENT_SECRET' },
    { code: 'NZ',  domain: 'backdropsourcenz.myshopify.com',    token: '', clientId: 'PASTE_NZ_CLIENT_ID',  clientSecret: 'PASTE_NZ_CLIENT_SECRET' },
    { code: 'FR',  domain: 'PASTE_FR_STORE.myshopify.com',      token: '', clientId: 'PASTE_FR_CLIENT_ID',  clientSecret: 'PASTE_FR_CLIENT_SECRET' },
    { code: 'IN',  domain: 'PASTE_IN_STORE.myshopify.com',      token: '', clientId: 'PASTE_IN_CLIENT_ID',  clientSecret: 'PASTE_IN_CLIENT_SECRET' },
    { code: 'UAE', domain: 'PASTE_UAE_STORE.myshopify.com',     token: '', clientId: 'PASTE_UAE_CLIENT_ID', clientSecret: 'PASTE_UAE_CLIENT_SECRET' }
  ]
};

var TAB = {
  GUIDE:  CONFIG.TAB_PREFIX + '📖 How to Read',
  DAILY:  CONFIG.TAB_PREFIX + 'Traction Daily',
  HOURLY: CONFIG.TAB_PREFIX + 'Traction Hourly',
  FX:     CONFIG.TAB_PREFIX + 'FX Rates'
};
// Country code -> its report tab name (CONFIG.TAB_NAMES, falling back to the code itself).
function viewTabName_(cc) { return CONFIG.TAB_PREFIX + ((CONFIG.TAB_NAMES && CONFIG.TAB_NAMES[cc]) || cc); }

var COUNTRY_CFG = {
  USA: { currency: 'USD' }, CA: { currency: 'CAD' }, UK: { currency: 'GBP' },
  AU:  { currency: 'AUD' }, NZ: { currency: 'NZD' }, UAE: { currency: 'AED' },
  FR:  { currency: 'EUR' }, IN: { currency: 'INR' }
};
// Fold feed variants into the one canonical code (US -> USA, GB -> UK, AE -> UAE).
var COUNTRY_ALIAS = { US: 'USA', USA: 'USA', GB: 'UK', UK: 'UK', AE: 'UAE', UAE: 'UAE', CA: 'CA', AU: 'AU', NZ: 'NZ' };
function canonCountry_(v) { var cc = String(v == null ? '' : v).trim().toUpperCase(); return COUNTRY_ALIAS[cc] || cc; }

var DAILY_HEADERS  = ['Country', 'Date', 'Year', 'Month', 'Month Name', 'Day of Month', 'Weekday No', 'Day Name', 'Weekend?', 'ISO Week', 'Day of Year',
                      'Revenue', 'Orders', 'AOV', 'Currency', 'Revenue (USD)', 'AOV (USD)', 'FX → USD', 'Updated At'];
// Two grains share this tab: 'DOW' rows carry Weekday No 0-6 with Month 0, 'MON' rows carry
// Month 1-12 with Weekday No -1. That is what makes both the Weekday x Hour and the Hour x Month
// matrix possible off one cheap pull.
var HOURLY_HEADERS = ['Country', 'Year', 'Grain', 'Month', 'Weekday No', 'Day Name', 'Hour', 'Hour Label',
                      'Revenue', 'Orders', 'Currency', 'Revenue (USD)', 'FX → USD', 'Source', 'Updated At'];

var MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var MON3     = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
var DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];   // indexed by JS getDay()
var DAY3     = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

var HEADER_BG = '#1B2D55', HEADER_FG = '#FFFFFF', SUBHEAD_BG = '#CFE0F5';
var TITLE_BG = '#F8CBAD', HDR_BG = '#ED7D31', Y1_BG = '#FFFF00', Y2_BG = '#F4B183';
var GREEN = '#00E000', BLUE = '#4472C4', ORANGE = '#ED7D31', RED = '#C00000';
var GOLD = '#FFD24D', SILVER = '#D9D9D9', BRONZE = '#E0B080';
var COUNTRY_BG = { USA: '#D6E4F7', CA: '#FADBD8', UK: '#E8D9FB', AU: '#D6EEDC', NZ: '#FCE9C9', UAE: '#E4D7CF', FR: '#E3F0D4', IN: '#FDE3CC' };

/* 13 columns everywhere: it is the width of the comparison table AND of the widest matrix
   (1 label + 12 months), so every block on the tab lines up down the page. */
var NC = 13;

/* Weekday display order — Mon-first by default, because that is how a trading week reads. */
function dowOrder_() {
  return String(CONFIG.WEEK_START || 'Mon').toLowerCase().indexOf('sun') === 0 ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
}
function isWeekend_(dow) { return (CONFIG.WEEKEND_DAYS || [0, 6]).indexOf(dow) !== -1; }
function hourLabel_(h) { return pad2_(h) + ':00'; }
function rankByOrders_() { return String(CONFIG.RANK_BY || 'orders').toLowerCase() !== 'revenue'; }
function metricOf_(o) { return rankByOrders_() ? (o ? o.orders : 0) : (o ? o.rev : 0); }
function metricName_() { return rankByOrders_() ? 'orders' : 'revenue'; }

/* ========================= MENU · SETUP · TRIGGERS ======================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🕒 Traction')
    .addItem('Pull historical data (Shopify)', 'menuPull')
    .addItem('Rebuild ALL country tabs (no re-pull)', 'menuBuild')
    .addItem('Rebuild THIS tab only', 'menuBuildThis')
    .addSeparator()
    .addItem('Rebuild the "How to Read" tab', 'menuGuide')
    .addSeparator()
    .addItem('Refresh FX rates (→ ' + CONFIG.REPORT_CURRENCY + ')', 'menuFx')
    .addItem('Export workbook to Excel (.xlsx)', 'exportToExcel')
    .addSeparator()
    .addItem('Check Shopify access for every store', 'checkAccess')
    .addToUi();
}
function menuPull()  { pullTraction(); buildAllViews(); }
function menuBuild() { buildAllViews(); }
function menuFx()    { refreshFxRates(); buildAllViews(); }
function menuGuide() { buildGuideTab_(); }
/* Rebuild just the tab you're looking at — instant, no re-pull. */
function menuBuildThis() {
  var ss = SpreadsheetApp.getActive() || getSpreadsheet_();
  var name = ss.getActiveSheet().getName(), cc = countryOfTab_(name);
  if (!cc) { try { SpreadsheetApp.getUi().alert('"' + name + '" is not a country report tab.'); } catch (e) { Logger.log(name + ' is not a country tab.'); } return; }
  buildCountryView(cc);
}

/* Run ONCE. Installs the daily refresh + the year-dropdown (onEdit) trigger. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['jobPullTraction', 'onTractionEdit'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('jobPullTraction').timeBased().everyDays(1).atHour(7).nearMinute(0).create();   // hour is in the PROJECT time zone (Project Settings ⚙ → Time zone)
  ScriptApp.newTrigger('onTractionEdit').forSpreadsheet(CONFIG.SHEET_ID).onEdit().create();
  getTab_(TAB.DAILY, DAILY_HEADERS);
  getTab_(TAB.HOURLY, HOURLY_HEADERS);
  try { refreshFxRates(); } catch (e) { Logger.log('refreshFxRates: ' + e); }
  pullTraction();
  buildAllViews();
  Logger.log('Setup complete. Daily refresh ~7:00 AM (project time zone). Reload the sheet to see the 🕒 Traction menu.');
}

function jobPullTraction() {
  try { pullTraction(); }   catch (e) { Logger.log('pullTraction: ' + e); }
  try { buildAllViews(); }  catch (e) { Logger.log('buildAllViews: ' + e); }
}

/* Row 1 of every country tab holds Base year (B1) and Compare year (D1) —
   changing either rebuilds ONLY that tab, so each country can sit on its own year pair. */
function onTractionEdit(e) {
  try {
    var rng = e.range, cc = countryOfTab_(rng.getSheet().getName());
    if (!cc) return;
    if (rng.getRow() === 1 && [2, 4].indexOf(rng.getColumn()) !== -1) buildCountryView(cc);
  } catch (err) { Logger.log('onEdit: ' + err); }
}

/* Tab name -> country code, or '' if that tab isn't one of ours. */
function countryOfTab_(name) {
  var hit = '';
  tractionCountries_().forEach(function (cc) { if (viewTabName_(cc) === name) hit = cc; });
  if (!hit && CONFIG.BUILD_ALL_TAB && name === CONFIG.TAB_PREFIX + 'ALL') hit = 'ALL';
  return hit;
}
function tractionCountries_() {
  return CONFIG.STORES.map(function (s) { return canonCountry_(s.code); }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
}

/* ============================ SHOPIFYQL PULL ============================= */

/* Normalise ShopifyQL parseErrors → '' when the query is FINE. The field comes back as
   null, '' OR an EMPTY ARRAY — and [] is truthy in JS, so a naive `if (parseErrors)`
   silently rejects every valid query. Returns a string only for a REAL parse error. */
function qlErr_(pe) {
  if (pe == null) return '';
  if (typeof pe === 'string') return pe.trim();
  if (Object.prototype.toString.call(pe) === '[object Array]') return pe.length ? JSON.stringify(pe) : '';
  return JSON.stringify(pe);
}

/* Run one ShopifyQL query → { names: [column names], rows: [row objects] }, or null.
   `rows` arrives as JSON — usually objects keyed by column name, occasionally positional
   arrays; both are normalised to objects here. */
function shopifyQLTable_(st, ql, quiet) {
  var gql = 'query($q:String!){shopifyqlQuery(query:$q){parseErrors tableData{rows columns{name dataType displayName}}}}';
  var res = shopifyGraphQL_(st, gql, { q: ql });
  var sq = res && res.data && res.data.shopifyqlQuery;
  if (!sq) { if (!quiet) Logger.log(st.code + ' QL: no response — ' + JSON.stringify((res && res.errors) || res).slice(0, 220)); return null; }
  var pe = qlErr_(sq.parseErrors);
  if (pe) { if (!quiet) Logger.log(st.code + ' QL parseErrors: ' + pe.slice(0, 200) + '   [' + ql + ']'); return null; }
  var td = sq.tableData, raw = td && (td.rows || td.rowData);
  if (!td || !raw || !raw.length) { if (!quiet) Logger.log(st.code + ' QL: no rows   [' + ql + ']'); return null; }
  var names = (td.columns || []).map(function (c) { return String(c.name || ''); });
  var rows = raw.map(function (r) {
    if (!r) return null;
    if (r instanceof Array) { var o = {}; names.forEach(function (n, i) { o[n] = r[i]; }); return o; }
    return r;
  }).filter(Boolean);
  return { names: names, rows: rows };
}
function qlCol_(names, test) { for (var i = 0; i < names.length; i++) if (test(String(names[i]).toLowerCase())) return names[i]; return null; }

/* Pull the yyyy / MM / dd / HH out of whatever shape a date bucket arrives in —
   '2025-03-14', '2025-03-14T13:00:00Z' and '2025-03-14 13:00:00' from ShopifyQL, and a real
   Date object from a sheet cell (Sheets silently coerces 'yyyy-MM-dd' strings into dates on
   write, so anything read back off the raw tab comes home as a Date, not the string we sent). */
function stampParts_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate(), h: v.getHours() };
  var m = String(v == null ? '' : v).match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}))?/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), h: (m[4] == null ? -1 : Number(m[4])) };
}
/* Any date-ish cell → the canonical 'yyyy-MM-dd' we key rows on. Without this the upsert
   would compare 'USA|2025-03-14' against 'USA|Fri Mar 14 2025 00:00:00 GMT…' and append a
   duplicate row on every single re-pull. */
function dateKey_(v) {
  var p = stampParts_(v);
  return p ? (p.y + '-' + pad2_(p.m) + '-' + pad2_(p.d)) : '';
}

/* THE HOUR-BUCKET TIME ZONE RULE.
   Shopify Analytics reports in the STORE's own clock, and ShopifyQL normally hands back an
   hour bucket with no offset at all ('2026-03-14 13:00:00' = 1pm where the store is). We take
   that at face value — which is exactly what we want, because "our UK customers order at 8pm"
   should mean 8pm in Britain.
   BUT if a store ever answers with an explicit offset or a trailing Z, the digits are UTC, not
   local. Reading them literally would file the order under the wrong HOUR and — for anything
   near midnight — the wrong WEEKDAY too, quietly skewing every matrix. So: offset present →
   convert into the shop's IANA time zone first; offset absent → already local, use as-is. */
function hourStamp_(v, tz) {
  var s = String(v == null ? '' : v);
  if (tz && /(Z|[+\-]\d{2}:?\d{2})\s*$/.test(s)) {
    var d = new Date(s);
    if (!isNaN(d.getTime())) return stampParts_(Utilities.formatDate(d, tz, "yyyy-MM-dd'T'HH:mm:ss"));
  }
  return stampParts_(v);
}

/* A whole calendar year, capped at today for the current year (never queries the future). */
function yearRange_(year) {
  var tz = sheetTz_(), today = new Date(), ty = Number(Utilities.formatDate(today, tz, 'yyyy'));
  if (year > ty) return null;
  return { since: year + '-01-01', until: (year === ty) ? Utilities.formatDate(today, tz, 'yyyy-MM-dd') : (year + '-12-31') };
}
/* One calendar month, capped at today. Returns null for a month that has not started. */
function monthRange_(year, mo) {
  var tz = sheetTz_(), today = new Date();
  var ty = Number(Utilities.formatDate(today, tz, 'yyyy')), tm = Number(Utilities.formatDate(today, tz, 'MM'));
  if (year > ty || (year === ty && mo > tm)) return null;
  var lastDay = new Date(year, mo, 0).getDate();      // day 0 of the NEXT month = last day of this one
  return {
    since: year + '-' + pad2_(mo) + '-01',
    until: (year === ty && mo === tm) ? Utilities.formatDate(today, tz, 'yyyy-MM-dd') : (year + '-' + pad2_(mo) + '-' + pad2_(lastDay))
  };
}

/* DAILY revenue + orders for one store-year → { 'yyyy-MM-dd': {rev, orders} } or null.
   Measures degrade in two steps so a store whose schema is thinner still returns revenue. */
function qlDaily_(st, year) {
  var rng = yearRange_(year); if (!rng) return null;
  var sets = ['total_sales, orders', 'total_sales'];
  for (var i = 0; i < sets.length; i++) {
    var ql = 'FROM sales SHOW ' + sets[i] + ' GROUP BY day SINCE ' + rng.since + ' UNTIL ' + rng.until + ' ORDER BY day LIMIT 1000';
    var t = shopifyQLTable_(st, ql, i === 0);
    if (!t) { t = shopifyQLTable_(st, ql.replace(/ LIMIT 1000$/, '')); if (!t) continue; }   // some stores reject LIMIT — retry without it
    var n = t.names;
    var cDay = qlCol_(n, function (s) { return s === 'day' || s.indexOf('day') !== -1 || s.indexOf('date') !== -1; });
    var cRev = qlCol_(n, function (s) { return s.indexOf('total_sales') !== -1; }) || qlCol_(n, function (s) { return s.indexOf('sales') !== -1; });
    var cOrd = qlCol_(n, function (s) { return s === 'orders'; }) ||
               qlCol_(n, function (s) { return s.indexOf('order') !== -1 && s.indexOf('value') === -1 && s.indexOf('average') === -1; });
    if (!cDay || !cRev) continue;
    var map = {}, got = 0;
    t.rows.forEach(function (r) {
      var p = stampParts_(r[cDay]); if (!p) return;
      map[p.y + '-' + pad2_(p.m) + '-' + pad2_(p.d)] = { rev: num_(r[cRev]), orders: cOrd ? num_(r[cOrd]) : 0 };
      got++;
    });
    if (got) { if (i > 0) Logger.log(st.code + ' ' + year + ': daily fell back to "' + sets[i] + '"'); return map; }
  }
  return null;
}

/* HOURLY revenue + orders for one store-year, folded into BOTH aggregates at once:
     dow[weekday][hour]  — the weekday x hour matrix
     mon[month][hour]    — the hour x month matrix
   Run month by month: a year of hours is ~8,760 rows, which one query will truncate. */
function qlHourly_(st, year) {
  var dow = emptyGrid_(0, 6), mon = emptyGrid_(1, 12), got = 0, months = 0, seenHours = {};
  var tz = shopTimezone_(st), converted = false, sample = '';   // tz is only USED if the feed carries an offset — see hourStamp_
  for (var mo = 1; mo <= 12; mo++) {
    var rng = monthRange_(year, mo); if (!rng) continue;
    var sets = ['total_sales, orders', 'total_sales'], t = null, cDay, cRev, cOrd;
    for (var i = 0; i < sets.length && !t; i++) {
      var ql = 'FROM sales SHOW ' + sets[i] + ' GROUP BY hour SINCE ' + rng.since + ' UNTIL ' + rng.until + ' ORDER BY hour LIMIT 2000';
      var tt = shopifyQLTable_(st, ql, true) || shopifyQLTable_(st, ql.replace(/ LIMIT 2000$/, ''), true);
      if (!tt) continue;
      var n = tt.names;
      cDay = qlCol_(n, function (s) { return s === 'hour' || s.indexOf('hour') !== -1 || s.indexOf('day') !== -1 || s.indexOf('date') !== -1 || s.indexOf('time') !== -1; });
      cRev = qlCol_(n, function (s) { return s.indexOf('total_sales') !== -1; }) || qlCol_(n, function (s) { return s.indexOf('sales') !== -1; });
      cOrd = qlCol_(n, function (s) { return s === 'orders'; }) ||
             qlCol_(n, function (s) { return s.indexOf('order') !== -1 && s.indexOf('value') === -1 && s.indexOf('average') === -1; });
      if (cDay && cRev) t = tt;
    }
    if (!t) continue;
    var monthGot = 0;
    t.rows.forEach(function (r) {
      if (!sample) { sample = String(r[cDay] == null ? '' : r[cDay]); converted = /(Z|[+\-]\d{2}:?\d{2})\s*$/.test(sample); }
      var p = hourStamp_(r[cDay], tz); if (!p || p.h < 0) return;              // no hour component = not an hourly bucket
      var rev = num_(r[cRev]), ord = cOrd ? num_(r[cOrd]) : 0;
      var wd = new Date(p.y, p.m - 1, p.d).getDay();
      dow[wd][p.h].rev += rev;  dow[wd][p.h].orders += ord;
      mon[p.m][p.h].rev += rev; mon[p.m][p.h].orders += ord;
      seenHours[p.h] = 1;
      monthGot++;
    });
    if (monthGot) { got += monthGot; months++; }
  }
  if (!got) return null;
  // Sanity gate: a store that quietly answered at DAY grain returns '…T00:00:00' for every row,
  // which would pile a whole year of orders into the 00:00 slot and look like a real finding.
  // A genuine hourly answer always spans several distinct hours.
  if (Object.keys(seenHours).length < 3) {
    Logger.log(st.code + ' ' + year + ': GROUP BY hour returned only ' + Object.keys(seenHours).length +
               ' distinct hour(s) — treating as NOT hourly and ignoring it.');
    return null;
  }
  Logger.log(st.code + ' ' + year + ': hourly from ' + months + ' month(s), ' + got + ' bucket(s), ' +
             Object.keys(seenHours).length + ' distinct hour(s). Bucket format "' + sample + '" → ' +
             (converted ? 'carries an offset, CONVERTED into ' + (tz || 'the shop time zone')
                        : 'no offset, read as the store\'s own local clock') + '.');
  return { dow: dow, mon: mon, source: 'shopifyql', tz: tz || '', converted: converted };
}
/* A {lo..hi} x {0..23} grid of zeroed {rev, orders} cells. */
function emptyGrid_(lo, hi) {
  var g = {};
  for (var i = lo; i <= hi; i++) { g[i] = {}; for (var h = 0; h <= 23; h++) g[i][h] = { rev: 0, orders: 0 }; }
  return g;
}

/* Pull every configured store for the given years and upsert into the two raw tabs.
   Cheap enough to re-run whenever you like; it corrects rows rather than duplicating them. */
function pullTraction(codes, years) {
  var ty = Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  years = (years && years.length) ? years : ((CONFIG.YEARS && CONFIG.YEARS.length) ? CONFIG.YEARS : [ty - 1, ty]);
  var dailyRecs = [], hourRecs = [], skipped = [];

  CONFIG.STORES.forEach(function (st) {
    var cc = canonCountry_(st.code);
    if (codes && codes.length && codes.indexOf(cc) === -1) return;
    if (String(st.domain || '').indexOf('PASTE_') === 0) { skipped.push(cc + ' (store not configured)'); return; }
    var ccy = (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || CONFIG.REPORT_CURRENCY;

    years.forEach(function (y) {
      var daily = qlDaily_(st, y);
      if (!daily) { skipped.push(cc + ' ' + y + ' (no ShopifyQL — release read_reports on this store\'s app)'); return; }
      Object.keys(daily).sort().forEach(function (ds) {
        var p = stampParts_(ds), s = daily[ds], dt = new Date(p.y, p.m - 1, p.d);
        dailyRecs.push({ cc: cc, date: ds, y: p.y, m: p.m, d: p.d, dow: dt.getDay(), week: isoWeek_(dt), doy: dayOfYear_(dt),
                         rev: s.rev, orders: s.orders, ccy: ccy });
      });
      Logger.log(cc + ' ' + y + ': ' + Object.keys(daily).length + ' day(s) pulled.');

      if (!CONFIG.PULL_HOURLY) return;
      var hr = qlHourly_(st, y);
      if (!hr) { skipped.push(cc + ' ' + y + ' hourly (ShopifyQL will not GROUP BY hour on this store)'); return; }
      // Emit EVERY bucket, zeros included, so a re-pull can never leave a stale non-zero cell behind.
      // Stamp the clock the hours are on into Source, so the report tab can NAME the time zone
      // instead of vaguely saying "store-local".
      var src = hr.source + (hr.tz ? ' · ' + hr.tz : '');
      for (var d = 0; d <= 6; d++) for (var h = 0; h <= 23; h++) {
        hourRecs.push({ cc: cc, y: y, grain: 'DOW', mo: 0, dow: d, hour: h,
                        rev: hr.dow[d][h].rev, orders: hr.dow[d][h].orders, ccy: ccy, src: src });
      }
      for (var m2 = 1; m2 <= 12; m2++) for (var h2 = 0; h2 <= 23; h2++) {
        hourRecs.push({ cc: cc, y: y, grain: 'MON', mo: m2, dow: -1, hour: h2,
                        rev: hr.mon[m2][h2].rev, orders: hr.mon[m2][h2].orders, ccy: ccy, src: src });
      }
    });
  });

  upsertDaily_(dailyRecs);
  upsertHourly_(hourRecs);
  if (skipped.length) Logger.log('Skipped → ' + skipped.join(' · '));
  Logger.log('Pull complete: ' + dailyRecs.length + ' day-row(s), ' + hourRecs.length + ' hour-row(s).');
  return dailyRecs.length;
}

/* ============================== RAW TABS ================================= */

/* Upsert on Country|Date — a re-pull corrects, never duplicates. */
function upsertDaily_(recs) {
  if (!recs || !recs.length) return 0;
  var sh = getTab_(TAB.DAILY, DAILY_HEADERS);
  var lr = sh.getLastRow(), lc = Math.max(sh.getLastColumn(), DAILY_HEADERS.length);
  var vals = (lr > 0) ? sh.getRange(1, 1, lr, lc).getValues() : [DAILY_HEADERS.slice()];
  var hdr = vals[0].map(String), ix = indexMap_(hdr), idx = {};
  for (var r = 1; r < vals.length; r++) idx[String(vals[r][ix['Country']]) + '|' + dateKey_(vals[r][ix['Date']])] = r;
  var stamp = Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd HH:mm');
  function put(row, name, v) { if (ix[name] != null) row[ix[name]] = v; }

  recs.forEach(function (x) {
    var key = x.cc + '|' + x.date, row = (idx[key] != null) ? vals[idx[key]] : null;
    if (!row) { row = []; for (var i = 0; i < hdr.length; i++) row.push(''); vals.push(row); idx[key] = vals.length - 1; }
    var aov = x.orders ? x.rev / x.orders : 0, rate = fxToUSD_(1, x.ccy);
    put(row, 'Country', x.cc);            put(row, 'Date', x.date);              put(row, 'Year', x.y);
    put(row, 'Month', x.m);               put(row, 'Month Name', MON3[x.m - 1] || '');
    put(row, 'Day of Month', x.d);        put(row, 'Weekday No', x.dow);         put(row, 'Day Name', DAY_FULL[x.dow]);
    put(row, 'Weekend?', isWeekend_(x.dow) ? 'Weekend' : 'Weekday');
    put(row, 'ISO Week', x.week);         put(row, 'Day of Year', x.doy);
    put(row, 'Revenue', round2_(x.rev));  put(row, 'Orders', x.orders);          put(row, 'AOV', round2_(aov));
    put(row, 'Currency', x.ccy);
    put(row, 'Revenue (USD)', round2_(x.rev * rate)); put(row, 'AOV (USD)', round2_(aov * rate)); put(row, 'FX → USD', round4_(rate));
    put(row, 'Updated At', stamp);
  });

  var body = vals.slice(1).sort(function (a, b) {
    var ca = String(a[ix['Country']]), cb = String(b[ix['Country']]);
    if (ca !== cb) return ca < cb ? -1 : 1;
    var da = dateKey_(a[ix['Date']]), db = dateKey_(b[ix['Date']]);
    return da === db ? 0 : (da < db ? -1 : 1);
  });
  sh.getRange(1, 1, body.length + 1, hdr.length).setValues([hdr].concat(body));
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, hdr.length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  if (body.length) {
    if (ix['Date'] != null) sh.getRange(2, ix['Date'] + 1, body.length, 1).setNumberFormat('yyyy-mm-dd');   // Sheets stores these as real dates — pin the display so they sort and export cleanly
    ['Revenue', 'AOV', 'Revenue (USD)', 'AOV (USD)'].forEach(function (h) { if (ix[h] != null) sh.getRange(2, ix[h] + 1, body.length, 1).setNumberFormat('#,##0.00'); });
    if (ix['Orders'] != null)   sh.getRange(2, ix['Orders'] + 1, body.length, 1).setNumberFormat('#,##0');
    if (ix['FX → USD'] != null) sh.getRange(2, ix['FX → USD'] + 1, body.length, 1).setNumberFormat('0.0000');
    ['Revenue (USD)', 'AOV (USD)', 'FX → USD'].forEach(function (h) {          // tint the converted block so it reads as derived, not source
      if (ix[h] != null) sh.getRange(2, ix[h] + 1, body.length, 1).setBackground('#EAF1FB');
    });
    paintCountryColumn_(sh, ix['Country'], body.length);
  }
  centerAll_(sh);
  return recs.length;
}

/* Upsert on Country|Year|Grain|Month|Weekday|Hour. */
function upsertHourly_(recs) {
  if (!recs || !recs.length) return 0;
  var sh = getTab_(TAB.HOURLY, HOURLY_HEADERS);
  var lr = sh.getLastRow(), lc = Math.max(sh.getLastColumn(), HOURLY_HEADERS.length);
  var vals = (lr > 0) ? sh.getRange(1, 1, lr, lc).getValues() : [HOURLY_HEADERS.slice()];
  var hdr = vals[0].map(String), ix = indexMap_(hdr), idx = {};
  // ONE normaliser for both sides of the upsert. The key we write a row under and the key we
  // recognise it by on the next run must be produced identically — otherwise a record that
  // omits a field keys as 'undefined' on write and 'DOW' on read, and every re-pull duplicates.
  function norm_(x) {
    return {
      cc:    String(x.cc == null ? '' : x.cc),
      y:     num_(x.y),
      grain: String(x.grain || 'DOW').toUpperCase(),
      mo:    num_(x.mo),
      dow:   (x.dow == null || x.dow === '') ? -1 : numSigned_(x.dow),
      hour:  num_(x.hour)
    };
  }
  function keyOf(k) { return k.cc + '|' + k.y + '|' + k.grain + '|' + k.mo + '|' + k.dow + '|' + k.hour; }
  for (var r = 1; r < vals.length; r++) {
    idx[keyOf(norm_({ cc: vals[r][ix['Country']], y: vals[r][ix['Year']], grain: vals[r][ix['Grain']],
                      mo: vals[r][ix['Month']], dow: vals[r][ix['Weekday No']], hour: vals[r][ix['Hour']] }))] = r;
  }
  var stamp = Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd HH:mm');
  function put(row, name, v) { if (ix[name] != null) row[ix[name]] = v; }

  recs.forEach(function (x) {
    var k = norm_(x), key = keyOf(k), row = (idx[key] != null) ? vals[idx[key]] : null;
    if (!row) { row = []; for (var i = 0; i < hdr.length; i++) row.push(''); vals.push(row); idx[key] = vals.length - 1; }
    var rate = fxToUSD_(1, x.ccy);
    put(row, 'Country', k.cc);   put(row, 'Year', k.y);   put(row, 'Grain', k.grain);
    put(row, 'Month', k.mo);     put(row, 'Weekday No', k.dow);
    put(row, 'Day Name', k.dow >= 0 ? DAY_FULL[k.dow] : (k.mo ? MON_FULL[k.mo - 1] : ''));
    put(row, 'Hour', k.hour);    put(row, 'Hour Label', hourLabel_(k.hour));
    put(row, 'Revenue', round2_(x.rev)); put(row, 'Orders', Math.round(num_(x.orders))); put(row, 'Currency', x.ccy);
    put(row, 'Revenue (USD)', round2_(num_(x.rev) * rate)); put(row, 'FX → USD', round4_(rate));
    put(row, 'Source', x.src || 'shopifyql'); put(row, 'Updated At', stamp);
  });

  var body = vals.slice(1).sort(function (a, b) {
    var ca = String(a[ix['Country']]), cb = String(b[ix['Country']]);
    if (ca !== cb) return ca < cb ? -1 : 1;
    if (num_(a[ix['Year']]) !== num_(b[ix['Year']])) return num_(a[ix['Year']]) - num_(b[ix['Year']]);
    var ga = String(a[ix['Grain']] || ''), gb = String(b[ix['Grain']] || '');
    if (ga !== gb) return ga < gb ? -1 : 1;
    if (num_(a[ix['Month']]) !== num_(b[ix['Month']])) return num_(a[ix['Month']]) - num_(b[ix['Month']]);
    if (numSigned_(a[ix['Weekday No']]) !== numSigned_(b[ix['Weekday No']])) return numSigned_(a[ix['Weekday No']]) - numSigned_(b[ix['Weekday No']]);
    return num_(a[ix['Hour']]) - num_(b[ix['Hour']]);
  });
  // '08:00' would otherwise be coerced into a time VALUE on write; pin the column to plain text first.
  if (ix['Hour Label'] != null && body.length) sh.getRange(2, ix['Hour Label'] + 1, body.length, 1).setNumberFormat('@');
  sh.getRange(1, 1, body.length + 1, hdr.length).setValues([hdr].concat(body));
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, hdr.length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  if (body.length) {
    ['Revenue', 'Revenue (USD)'].forEach(function (h) { if (ix[h] != null) sh.getRange(2, ix[h] + 1, body.length, 1).setNumberFormat('#,##0.00'); });
    if (ix['Orders'] != null)   sh.getRange(2, ix['Orders'] + 1, body.length, 1).setNumberFormat('#,##0');
    if (ix['FX → USD'] != null) sh.getRange(2, ix['FX → USD'] + 1, body.length, 1).setNumberFormat('0.0000');
    if (ix['Revenue (USD)'] != null) sh.getRange(2, ix['Revenue (USD)'] + 1, body.length, 1).setBackground('#EAF1FB');
    paintCountryColumn_(sh, ix['Country'], body.length);
  }
  centerAll_(sh);
  return recs.length;
}

function paintCountryColumn_(sh, ci, n) {
  if (ci == null || !n) return;
  var L = colLetter_(ci + 1), rng = sh.getRange(L + '2:' + L);
  try {
    sh.setConditionalFormatRules(Object.keys(COUNTRY_BG).map(function (code) {
      return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(code).setBackground(COUNTRY_BG[code]).setRanges([rng]).build();
    }));
  } catch (e) {}
}

/* Recompute the raw tabs' USD columns from the CURRENT rates, without re-pulling Shopify.
   Local values are the source of truth; these are derived, so they must never go stale. */
function refreshUsdColumns_() {
  [[TAB.DAILY, DAILY_HEADERS, ['Revenue', 'AOV']], [TAB.HOURLY, HOURLY_HEADERS, ['Revenue']]].forEach(function (spec) {
    var sh = getTab_(spec[0], spec[1]), lr = sh.getLastRow();
    if (lr < 2) return;
    var vals = sh.getRange(1, 1, lr, sh.getLastColumn()).getValues(), ix = indexMap_(vals[0].map(String));
    if (ix['Revenue (USD)'] == null) return;
    var n = lr - 1, out = {};
    spec[2].forEach(function (h) { out[h + ' (USD)'] = []; });
    out['FX → USD'] = [];
    for (var r = 1; r < vals.length; r++) {
      var v = vals[r], rate = fxToUSD_(1, String(v[ix['Currency']] || CONFIG.REPORT_CURRENCY));
      spec[2].forEach(function (h) { out[h + ' (USD)'].push([round2_(num_(v[ix[h]]) * rate)]); });
      out['FX → USD'].push([round4_(rate)]);
    }
    Object.keys(out).forEach(function (h) { if (ix[h] != null) sh.getRange(2, ix[h] + 1, n, 1).setValues(out[h]); });
  });
}

/* ============================== READERS ================================= */

/* Daily raw tab → { COUNTRY: { YEAR: { 'MM-DD': {rev, orders} } } }, already in REPORT_CURRENCY. */
function readDaily_() {
  var sh = getTab_(TAB.DAILY, DAILY_HEADERS), out = {};
  if (sh.getLastRow() < 2) return out;
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), ix = indexMap_(vals[0].map(String));
  for (var r = 1; r < vals.length; r++) {
    var v = vals[r], cc = canonCountry_(v[ix['Country']]), p = stampParts_(v[ix['Date']]);
    if (!cc || !p) continue;
    var f = fxToUSD_(1, String(v[ix['Currency']] || CONFIG.REPORT_CURRENCY));
    var byY = out[cc] || (out[cc] = {}), byD = byY[p.y] || (byY[p.y] = {});
    var k = pad2_(p.m) + '-' + pad2_(p.d), cell = byD[k] || (byD[k] = { rev: 0, orders: 0 });
    cell.rev += num_(v[ix['Revenue']]) * f; cell.orders += num_(v[ix['Orders']]);
  }
  return out;
}

/* Hourly raw tab → { COUNTRY: { YEAR: { dow: {d:{h:…}}, mon: {m:{h:…}} } } }, in REPORT_CURRENCY. */
function readHourly_() {
  var sh = getTab_(TAB.HOURLY, HOURLY_HEADERS), out = {};
  if (sh.getLastRow() < 2) return out;
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), ix = indexMap_(vals[0].map(String));
  for (var r = 1; r < vals.length; r++) {
    var v = vals[r], cc = canonCountry_(v[ix['Country']]), y = num_(v[ix['Year']]);
    if (!cc || !y) continue;
    var grain = String(v[ix['Grain']] || 'DOW').toUpperCase();
    var h = num_(v[ix['Hour']]);
    if (!(h >= 0 && h <= 23)) continue;
    var f = fxToUSD_(1, String(v[ix['Currency']] || CONFIG.REPORT_CURRENCY));
    var byY = out[cc] || (out[cc] = {}), yr = byY[y] || (byY[y] = { dow: {}, mon: {}, tz: '' });
    if (!yr.tz && ix['Source'] != null) {                       // 'shopifyql · America/New_York' → the clock these hours are on
      var parts = String(v[ix['Source']] || '').split('·');
      if (parts.length > 1) yr.tz = parts[1].trim();
    }
    var bucket, side;
    if (grain === 'MON') { bucket = num_(v[ix['Month']]); side = yr.mon; if (!(bucket >= 1 && bucket <= 12)) continue; }
    else                 { bucket = numSigned_(v[ix['Weekday No']]); side = yr.dow; if (!(bucket >= 0 && bucket <= 6)) continue; }
    var row = side[bucket] || (side[bucket] = {}), cell = row[h] || (row[h] = { rev: 0, orders: 0 });
    cell.rev += num_(v[ix['Revenue']]) * f; cell.orders += num_(v[ix['Orders']]);
  }
  return out;
}

/* Every calendar slot of a year, Jan 1 → Dec 31, using a leap template so 2025 and 2026
   line up DATE-for-DATE (not day-number-for-day-number, which drifts across a leap year). */
var _slots = null;
function calendarSlots_() {
  if (_slots) return _slots;
  var out = [];
  for (var m = 1; m <= 12; m++) {
    var last = new Date(2024, m, 0).getDate();                 // 2024 is a leap year, so Feb has 29 slots
    for (var d = 1; d <= last; d++) out.push({ m: m, d: d, key: pad2_(m) + '-' + pad2_(d), label: pad2_(d) + ' ' + MON3[m - 1] });
  }
  return (_slots = out);
}

/* One country (or 'ALL') for one year, flattened into every cut and every matrix. */
function tractionSeries_(daily, hourly, country, year) {
  var allC = (country === 'ALL');
  var byDate = {}, dow = {}, hour = {}, dom = {}, mon = {}, week = {}, tot = { rev: 0, orders: 0 };
  for (var i = 0; i <= 6; i++) dow[i] = { rev: 0, orders: 0 };
  for (var h = 0; h <= 23; h++) hour[h] = { rev: 0, orders: 0 };
  for (var d = 1; d <= 31; d++) dom[d] = { rev: 0, orders: 0 };
  for (var m = 1; m <= 12; m++) mon[m] = { rev: 0, orders: 0 };
  for (var w = 1; w <= 53; w++) week[w] = { rev: 0, orders: 0 };
  var gDowHour = emptyGrid_(0, 6), gMonHour = emptyGrid_(1, 12);
  var gMonDow = {}, gDomMon = {};
  for (var m2 = 1; m2 <= 12; m2++) { gMonDow[m2] = {}; for (var d2 = 0; d2 <= 6; d2++) gMonDow[m2][d2] = { rev: 0, orders: 0 }; }
  for (var d3 = 1; d3 <= 31; d3++) { gDomMon[d3] = {}; for (var m3 = 1; m3 <= 12; m3++) gDomMon[d3][m3] = { rev: 0, orders: 0 }; }

  Object.keys(daily).forEach(function (cc) {
    if (!allC && cc !== country) return;
    var src = daily[cc] && daily[cc][year]; if (!src) return;
    Object.keys(src).forEach(function (k) {
      var s = src[k], p = k.split('-'), mm = Number(p[0]), dd = Number(p[1]);
      var dt = new Date(year, mm - 1, dd), wd = dt.getDay(), wk = isoWeek_(dt);
      var cell = byDate[k] || (byDate[k] = { rev: 0, orders: 0, m: mm, d: dd, dow: wd, week: wk });
      cell.rev += s.rev;    cell.orders += s.orders;
      dow[wd].rev += s.rev; dow[wd].orders += s.orders;
      dom[dd].rev += s.rev; dom[dd].orders += s.orders;
      mon[mm].rev += s.rev; mon[mm].orders += s.orders;
      tot.rev += s.rev;     tot.orders += s.orders;
      if (week[wk]) { week[wk].rev += s.rev; week[wk].orders += s.orders; }
      gMonDow[mm][wd].rev += s.rev; gMonDow[mm][wd].orders += s.orders;
      gDomMon[dd][mm].rev += s.rev; gDomMon[dd][mm].orders += s.orders;
    });
  });

  var tz = '';
  Object.keys(hourly).forEach(function (cc) {
    if (!allC && cc !== country) return;
    var yr = hourly[cc] && hourly[cc][year]; if (!yr) return;
    if (!tz && yr.tz) tz = yr.tz;
    Object.keys(yr.dow || {}).forEach(function (wd) {
      Object.keys(yr.dow[wd]).forEach(function (hh) {
        var s = yr.dow[wd][hh], w2 = Number(wd), h2 = Number(hh);
        if (!(w2 >= 0 && w2 <= 6) || !(h2 >= 0 && h2 <= 23)) return;
        gDowHour[w2][h2].rev += s.rev; gDowHour[w2][h2].orders += s.orders;
        hour[h2].rev += s.rev;         hour[h2].orders += s.orders;
      });
    });
    Object.keys(yr.mon || {}).forEach(function (mo) {
      Object.keys(yr.mon[mo]).forEach(function (hh) {
        var s = yr.mon[mo][hh], m4 = Number(mo), h3 = Number(hh);
        if (!(m4 >= 1 && m4 <= 12) || !(h3 >= 0 && h3 <= 23)) return;
        gMonHour[m4][h3].rev += s.rev; gMonHour[m4][h3].orders += s.orders;
      });
    });
  });

  var part = CONFIG.DAY_PARTS.map(function (p) {
    var t = { rev: 0, orders: 0 };
    for (var hp = p.from; hp <= p.to; hp++) { t.rev += hour[hp].rev; t.orders += hour[hp].orders; }
    return { name: p.name, rev: t.rev, orders: t.orders };
  });
  var hourTot = { rev: 0, orders: 0 };
  Object.keys(hour).forEach(function (hk) { hourTot.rev += hour[hk].rev; hourTot.orders += hour[hk].orders; });

  return { byDate: byDate, dow: dow, hour: hour, dom: dom, mon: mon, week: week, part: part, tot: tot, hourTot: hourTot,
           gDowHour: gDowHour, gMonHour: gMonHour, gMonDow: gMonDow, gDomMon: gDomMon, tz: tz,
           hasDaily: Object.keys(byDate).length > 0, hasHourly: hourTot.rev > 0 || hourTot.orders > 0 };
}

/* Which years actually have data on the raw tab, for the YEARLY OVERVIEW. */
function yearsPresent_(daily, country) {
  var seen = {};
  Object.keys(daily).forEach(function (cc) {
    if (country !== 'ALL' && cc !== country) return;
    Object.keys(daily[cc]).forEach(function (y) { seen[Number(y)] = 1; });
  });
  return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
}

/* ========================== THE TRACTION VIEW =========================== */

function buildAllViews() {
  var ss = getSpreadsheet_(), list = tractionCountries_();
  try { refreshUsdColumns_(); } catch (e) { Logger.log('refreshUsdColumns: ' + e); }   // so an edited FX rate shows up on the raw tabs as well as in the reports
  if (CONFIG.BUILD_ALL_TAB) list = list.concat(['ALL']);
  list.forEach(function (cc, i) {
    try {
      var sh = buildCountryView(cc);
      ss.setActiveSheet(sh); ss.moveActiveSheet(i + 2);          // +2 leaves position 1 for the guide
    } catch (e) { Logger.log('buildCountryView ' + cc + ': ' + e); }
  });
  // Built LAST (it samples the freshly-written data) but parked FIRST, so it is what you land on.
  try {
    var g = buildGuideTab_();
    ss.setActiveSheet(g); ss.moveActiveSheet(1);
  } catch (e) { Logger.log('buildGuideTab: ' + e); }
  Logger.log('Built ' + list.length + ' tab(s): ' + list.join(', ') + ' + the How-to-Read guide.');
}

/* Read the two year cells BEFORE the tab is cleared, so each tab keeps its own choice. */
function readViewControls_(sh) {
  var ty = Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  var yrs = (CONFIG.YEARS && CONFIG.YEARS.length >= 2)
    ? CONFIG.YEARS.slice().sort(function (a, b) { return a - b; })      // numeric, not the default lexicographic, sort
    : [ty - 1, ty];
  var def = { yA: yrs[0], yB: yrs[yrs.length - 1] };
  try {
    if (sh && sh.getLastRow() >= 1) {
      var v = sh.getRange(1, 1, 1, 4).getValues()[0], a = num_(v[1]), b = num_(v[3]);
      if (a >= 2000 && a < 2100) def.yA = a;
      if (b >= 2000 && b < 2100) def.yB = b;
    }
  } catch (e) {}
  return def;
}

/* Build ONE country's traction tab. `cc` is a store code, or 'ALL' for the combined tab. */
function buildCountryView(cc) {
  var ss = getSpreadsheet_(), tabName = (cc === 'ALL') ? (CONFIG.TAB_PREFIX + 'ALL') : viewTabName_(cc);
  var sh = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  var ctl = readViewControls_(sh);
  var yA = ctl.yA, yB = ctl.yB;
  var daily = readDaily_(), hourly = readHourly_();
  var A = tractionSeries_(daily, hourly, cc, yA), B = tractionSeries_(daily, hourly, cc, yB);
  var ccy = CONFIG.REPORT_CURRENCY;
  var localCcy = (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || '';
  var M = metricName_();                                    // 'orders' (default) or 'revenue' — what we rank on

  clearSheet_(sh);
  try { sh.setConditionalFormatRules([]); } catch (e) {}
  // Release any frozen pane BEFORE merging — Sheets refuses a merge that a freeze line would cut,
  // and vice versa. Frozen rows go back on once the header merges exist.
  try { sh.setFrozenRows(0); sh.setFrozenColumns(0); } catch (e) {}
  // The tab runs to ~1,200 rows of tables and matrices before the charts are anchored below them.
  // A fresh sheet only has 1,000 rows, and writing or anchoring past the last row throws.
  if (sh.getMaxRows() < 2200) sh.insertRowsAfter(sh.getMaxRows(), 2200 - sh.getMaxRows());
  if (sh.getMaxColumns() < NC) sh.insertColumnsAfter(sh.getMaxColumns(), NC - sh.getMaxColumns());

  var cf = [], charts = [];      // conditional-format rules and chart specs are collected and applied at the end
  var r = 1;

  /* --- row 1: the two year controls (the tab itself is the country) --- */
  sh.getRange(1, 1, 1, 4).setValues([['Base year', yA, 'Compare year', yB]]);
  [1, 3].forEach(function (c) { sh.getRange(1, c).setFontWeight('bold'); });
  var yrs = [], tyNow = Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  for (var y = tyNow; y >= tyNow - 6; y--) yrs.push(y);
  [2, 4].forEach(function (c) {
    sh.getRange(1, c).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(yrs, true).build())
      .setBackground('#FFF2CC').setFontWeight('bold');
  });
  sh.getRange(1, 5, 1, NC - 4).merge().setValue('◀ change either yellow cell — this whole tab, matrices and charts included, rebuilds automatically')
    .setFontStyle('italic').setFontColor('#666666').setHorizontalAlignment('left');

  /* --- row 2: title --- */
  sh.getRange(2, 1, 1, NC).merge()
    .setValue('HISTORICAL TRACTION — ' + (cc === 'ALL' ? 'ALL COUNTRIES' : tabName) + '   ·   ' + yA + ' vs ' + yB +
              '   ·   when the orders come in   (' + ccy + ')')
    .setBackground(TITLE_BG).setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sh.setRowHeight(2, 32);
  r = 3;
  sh.setFrozenRows(2);

  /* --- ① the peaks, and whether they moved --- */
  r = sectionHeader_(sh, r, '①  PEAKS — where the bulk of the orders actually landed',
      'Ranked on ORDER COUNT. Each line is the single busiest month / date / weekday / hour of that year, and the last column says whether it moved between ' + yA + ' and ' + yB + '.');
  r = writePeaks_(sh, r, yA, yB, A, B, ccy) + 1;

  /* --- ② yearly overview, every year on the raw tab --- */
  r = sectionHeader_(sh, r, '②  YEARLY OVERVIEW', 'Every year currently held on the "' + TAB.DAILY + '" tab — not just the two selected above. Add years to CONFIG.YEARS and re-pull to grow this.');
  r = writeYearly_(sh, r, daily, hourly, cc, ccy, cf) + 1;

  /* --- ③–⑧ the six single-grain cuts --- */
  var monRows = [];
  for (var mm = 1; mm <= 12; mm++) monRows.push({ label: MON_FULL[mm - 1], a: A.mon[mm], b: B.mon[mm] });
  r = sectionHeader_(sh, r, '③  BY MONTH');
  var tMon = writeCompareTable_(sh, r, 'Month', yA, yB, monRows, A.tot, B.tot, ccy, cf);
  r = tMon.next + 1;
  charts.push({ kind: 'col', title: 'Orders by month',                  ranges: [[tMon.hdr2, 1, tMon.count + 1, 1], [tMon.hdr2, 6, tMon.count + 1, 2]], colors: [BLUE, ORANGE] });
  charts.push({ kind: 'col', title: 'Revenue by month (' + ccy + ')',   ranges: [[tMon.hdr2, 1, tMon.count + 1, 1], [tMon.hdr2, 2, tMon.count + 1, 2]], colors: [BLUE, ORANGE] });

  r = sectionHeader_(sh, r, '④  BY ISO WEEK', 'ISO weeks run Monday–Sunday; week 1 is the one containing the first Thursday, so early-January weeks can belong to the previous year. Only weeks with data in either year are listed.');
  var weeksUsed = [];
  for (var wk = 1; wk <= 53; wk++) if (A.week[wk].orders || A.week[wk].rev || B.week[wk].orders || B.week[wk].rev) weeksUsed.push(wk);
  if (!weeksUsed.length) weeksUsed = [1];
  var wkRows = weeksUsed.map(function (w) { return { label: 'W' + pad2_(w), a: A.week[w], b: B.week[w] }; });
  var tWk = writeCompareTable_(sh, r, 'ISO week', yA, yB, wkRows, A.tot, B.tot, ccy, cf);
  r = tWk.next + 1;
  charts.push({ kind: 'line', title: 'Orders by ISO week',              ranges: [[tWk.hdr2, 1, tWk.count + 1, 1], [tWk.hdr2, 6, tWk.count + 1, 2]], colors: [BLUE, ORANGE] });

  r = sectionHeader_(sh, r, '⑤  BY DAY OF WEEK', 'Every ' + yA + ' Monday added together vs every ' + yB + ' Monday, and so on. "Share of orders" is the column to read when one year is only part-complete — it is immune to the year being longer or shorter.');
  var dowRows = dowOrder_().map(function (d) { return { label: DAY_FULL[d], a: A.dow[d], b: B.dow[d], mark: isWeekend_(d) }; });
  var tDow = writeCompareTable_(sh, r, 'Day', yA, yB, dowRows, A.tot, B.tot, ccy, cf);
  r = tDow.next + 1;
  charts.push({ kind: 'col', title: 'Orders by day of week',            ranges: [[tDow.hdr2, 1, tDow.count + 1, 1], [tDow.hdr2, 6, tDow.count + 1, 2]], colors: [BLUE, ORANGE] });
  charts.push({ kind: 'col', title: 'Share of the year\'s orders, by day of week', ranges: [[tDow.hdr2, 1, tDow.count + 1, 1], [tDow.hdr2, 11, tDow.count + 1, 2]], colors: [BLUE, ORANGE] });

  r = sectionHeader_(sh, r, '⑥  BY DAY OF MONTH', 'All twelve 1sts together, all twelve 2nds together, and so on — this is where pay-day and month-end effects show up.');
  var domRows = [];
  for (var dd = 1; dd <= 31; dd++) domRows.push({ label: String(dd), a: A.dom[dd], b: B.dom[dd] });
  var tDom = writeCompareTable_(sh, r, 'Date', yA, yB, domRows, A.tot, B.tot, ccy, cf);
  r = tDom.next + 1;
  charts.push({ kind: 'col', title: 'Orders by day of month',           ranges: [[tDom.hdr2, 1, tDom.count + 1, 1], [tDom.hdr2, 6, tDom.count + 1, 2]], colors: [BLUE, ORANGE] });

  var haveHourly = A.hasHourly || B.hasHourly;
  if (!haveHourly) {
    r = sectionHeader_(sh, r, '⑦  BY HOUR OF DAY');
    sh.getRange(r, 1, 1, NC).merge().setValue('No hourly data yet for this store. Either CONFIG.PULL_HOURLY is off, or ShopifyQL will not GROUP BY hour here — ' +
      'run "Check Shopify access for every store". Every other section on this tab is unaffected.')
      .setFontStyle('italic').setFontColor('#A61C00').setWrap(true).setHorizontalAlignment('left');
    r += 2;
  } else {
    var hourTz = B.tz || A.tz;
    r = sectionHeader_(sh, r, '⑦  BY HOUR OF DAY   ·   clock: ' + (hourTz || 'this store\'s own local time'),
        'Every hour on this tab is on ' + (hourTz ? 'the ' + hourTz + ' clock — this store\'s own time zone, as set in its Shopify admin.' : 'this store\'s own time zone, as set in its Shopify admin.') +
        ' It is NOT your local time and NOT the spreadsheet\'s. So "20:00" means 8pm where the customer is shopping. ' +
        'Compare hours WITHIN a country, never across two — 20:00 here and 20:00 on another country\'s tab are different moments.');
    var hourRows = [];
    for (var h2 = 0; h2 <= 23; h2++) hourRows.push({ label: hourLabel_(h2), a: A.hour[h2], b: B.hour[h2] });
    var tHour = writeCompareTable_(sh, r, 'Hour', yA, yB, hourRows, A.hourTot, B.hourTot, ccy, cf);
    r = tHour.next + 1;
    charts.push({ kind: 'col',  title: 'Orders by hour of day',           ranges: [[tHour.hdr2, 1, tHour.count + 1, 1], [tHour.hdr2, 6, tHour.count + 1, 2]], colors: [BLUE, ORANGE] });
    charts.push({ kind: 'line', title: 'Revenue by hour of day (' + ccy + ')', ranges: [[tHour.hdr2, 1, tHour.count + 1, 1], [tHour.hdr2, 2, tHour.count + 1, 2]], colors: [BLUE, ORANGE] });

    r = sectionHeader_(sh, r, '⑧  BY PART OF DAY');
    var partRows = CONFIG.DAY_PARTS.map(function (p, i) { return { label: p.name, a: A.part[i], b: B.part[i] }; });
    var tPart = writeCompareTable_(sh, r, 'Part of day', yA, yB, partRows, A.hourTot, B.hourTot, ccy, cf);
    r = tPart.next + 1;
    charts.push({ kind: 'col', title: 'Orders by part of day',            ranges: [[tPart.hdr2, 1, tPart.count + 1, 1], [tPart.hdr2, 6, tPart.count + 1, 2]], colors: [BLUE, ORANGE] });
  }

  /* --- ⑨ THE MATRICES — where the single-grain cuts cross each other --- */
  r = sectionHeader_(sh, r, '⑨  MATRICES — the busiest COMBINATIONS',
      'Each grid is coloured white → amber → red on ORDER COUNT, so the hot cells find themselves. A single-grain table can tell you Fridays are busy and March is busy; only the matrix tells you whether it is Fridays IN March.');

  var dOrder = dowOrder_();
  var monLabels = MON3.slice(), dowLabels = dOrder.map(function (d) { return DAY3[d]; });
  var hourLabels = [], domLabels = [];
  for (var hl = 0; hl <= 23; hl++) hourLabels.push(hourLabel_(hl));
  for (var dl = 1; dl <= 31; dl++) domLabels.push(String(dl));

  // M1 — Month x Weekday
  [[yA, A], [yB, B]].forEach(function (pair) {
    var m1 = writeMatrix_(sh, r, 'MONTH × WEEKDAY — orders, ' + pair[0], 'Month', monLabels, dowLabels,
      gridValues_(pair[1].gMonDow, range_(1, 12), dOrder, 'orders'), '#,##0');
    cf.push(valueGradientRule_(sh.getRange(m1.first, 2, m1.nr, m1.nc), m1.max));
    r = m1.next + 1;
  });
  // M2 — Date x Month
  [[yA, A], [yB, B]].forEach(function (pair) {
    var m2 = writeMatrix_(sh, r, 'DATE × MONTH — orders, ' + pair[0], 'Date', domLabels, monLabels,
      gridValues_(pair[1].gDomMon, range_(1, 31), range_(1, 12), 'orders'), '#,##0');
    cf.push(valueGradientRule_(sh.getRange(m2.first, 2, m2.nr, m2.nc), m2.max));
    r = m2.next + 1;
  });
  if (haveHourly) {
    // M3 — Hour x Month
    [[yA, A], [yB, B]].forEach(function (pair) {
      var m3 = writeMatrix_(sh, r, 'HOUR × MONTH — orders, ' + pair[0], 'Hour', hourLabels, monLabels,
        transposeGrid_(pair[1].gMonHour, range_(1, 12), range_(0, 23), 'orders'), '#,##0');
      cf.push(valueGradientRule_(sh.getRange(m3.first, 2, m3.nr, m3.nc), m3.max));
      r = m3.next + 1;
    });
    // M4 — Hour x Weekday, orders, both years plus the change
    [[yA, A], [yB, B]].forEach(function (pair) {
      var m4 = writeMatrix_(sh, r, 'HOUR × WEEKDAY — orders, ' + pair[0], 'Hour', hourLabels, dowLabels,
        transposeGrid_(pair[1].gDowHour, dOrder, range_(0, 23), 'orders'), '#,##0');
      cf.push(valueGradientRule_(sh.getRange(m4.first, 2, m4.nr, m4.nc), m4.max));
      r = m4.next + 1;
    });
    var dv = transposeGrid_(A.gDowHour, dOrder, range_(0, 23), 'orders'),
        bv = transposeGrid_(B.gDowHour, dOrder, range_(0, 23), 'orders');
    var diff = bv.map(function (row, i) { return row.map(function (v, j) { return v - dv[i][j]; }); });
    var m5 = writeMatrix_(sh, r, 'HOUR × WEEKDAY — CHANGE in orders, ' + yA + ' → ' + yB, 'Hour', hourLabels, dowLabels, diff, '#,##0;[Red]-#,##0');
    cf.push(diffGradientRule_(sh.getRange(m5.first, 2, m5.nr, m5.nc), m5.min, m5.max));
    r = m5.next + 1;
    // M6 — the same grid in money, for the compare year
    var m6 = writeMatrix_(sh, r, 'HOUR × WEEKDAY — revenue (' + ccy + '), ' + yB, 'Hour', hourLabels, dowLabels,
      transposeGrid_(B.gDowHour, dOrder, range_(0, 23), 'rev'), '#,##0');
    cf.push(valueGradientRule_(sh.getRange(m6.first, 2, m6.nr, m6.nc), m6.max));
    r = m6.next + 1;
  }

  /* --- ⑩ the busiest single dates --- */
  r = sectionHeader_(sh, r, '⑩  BUSIEST SINGLE DATES', 'The top ' + CONFIG.TOP_N_DATES + ' trading days of each year by ORDER COUNT, ranked, with the exact weekday. This is where BFCM, sales and campaign spikes announce themselves.');
  r = writeTopDates_(sh, r, yA, yB, A, B, ccy, cf) + 1;

  /* --- ⑪ daily pace (chart source, kept visible so the lines are traceable) --- */
  r = sectionHeader_(sh, r, '⑪  DAILY PACE — chart data', 'Every calendar date of both years, aligned DATE for DATE. "7-day avg" smooths the noise; "cumulative" shows whether ' + yB + ' is ahead of or behind ' + yA + ' at the same point in the year.');
  var pace = writePace_(sh, r, yA, yB, A, B);
  r = pace.next + 1;
  charts.push({ kind: 'line', title: 'Daily orders, 7-day rolling average',   ranges: [[pace.hdr, 1, pace.count + 1, 1], [pace.hdr, 6, pace.count + 1, 2]], colors: [BLUE, ORANGE] });
  charts.push({ kind: 'line', title: 'Cumulative orders — is ' + yB + ' ahead of ' + yA + '?', ranges: [[pace.hdr, 1, pace.count + 1, 1], [pace.hdr, 8, pace.count + 1, 2]], colors: [BLUE, ORANGE] });

  /* --- what the numbers mean --- */
  r += 1;
  sh.getRange(r, 1, 1, NC).merge().setValue(
    'Source: Shopify Analytics (ShopifyQL) — daily rows via GROUP BY day, hourly rows via GROUP BY hour, folded into weekday and month aggregates. Only the read_reports scope is used. ' +
    'ORDERS = Shopify "Orders" — the volume figure this report ranks everything on (CONFIG.RANK_BY). ' +
    'REVENUE = "Total sales", already net of discounts, returns and cancellations. ' +
    'AOV here = Revenue ÷ Orders, which is NOT Shopify\'s own average_order_value (its numerator is gross of returns) — so AOV differs by a percent or two from the MoM Comparison workbook, while Revenue and Orders tie exactly. ' +
    'SHARE = that bucket\'s slice of the year\'s OWN orders, which is the fair read when one year is only part-complete. ' +
    'HOURS are on ' + ((B.tz || A.tz) ? 'the ' + (B.tz || A.tz) + ' clock — this store\'s own time zone' : 'this store\'s own time zone') +
    ', never the viewer\'s and never the spreadsheet\'s; compare hours within a country, not across countries. ' +
    'Weekend = ' + (CONFIG.WEEKEND_DAYS || [0, 6]).map(function (d) { return DAY_FULL[d]; }).join(' + ') + '. ' +
    'CURRENCY: shown in ' + ccy + '; order COUNTS are never converted, so they tie exactly everywhere. ' +
    (localCcy && localCcy !== ccy
      ? 'This store bills in ' + localCcy + ', converted at the rate on the "' + TAB.FX + '" tab (type your own rate in column C to control it exactly). ' +
        'One rate is applied to the whole period, so the ' + ccy + ' figures sit a few % from Shopify\'s own ' + ccy + ' display — the exact, ties-to-the-cent ' +
        'numbers are the ' + localCcy + ' ones on the "' + TAB.DAILY + '" tab.'
      : 'This store bills in ' + ccy + ', so these figures tie to Shopify exactly.'))
    .setWrap(true).setFontSize(9).setFontColor('#666666').setHorizontalAlignment('left').setVerticalAlignment('top');
  sh.setRowHeight(r, 74);
  r += 2;

  /* --- the charts, two to a row, below everything --- */
  var chartRow = r + 1;
  charts.forEach(function (c, i) {
    // col 1 spans ~150 + 6x104 = 774px before col 8 starts, so a 600px-wide chart never overlaps its neighbour
    var row = chartRow + Math.floor(i / 2) * 18, col = (i % 2 === 0) ? 1 : 8;
    var ranges = c.ranges.map(function (q) { return sh.getRange(q[0], q[1], q[2], q[3]); });
    if (c.kind === 'line') addLineChart_(sh, c.title, ranges, row, col, c.colors);
    else addColChart_(sh, c.title, ranges, row, col, c.colors);
  });

  /* --- cosmetics --- */
  sh.setColumnWidth(1, 150);
  for (var w3 = 2; w3 <= NC; w3++) sh.setColumnWidth(w3, 104);
  cf = cf.filter(Boolean);           // an all-zero grid yields no rule at all — Sheets rejects a gradient with no spread
  try { if (cf.length) sh.setConditionalFormatRules(cf); } catch (e) { Logger.log('conditional formatting ' + tabName + ': ' + e); }

  if (!A.hasDaily && !B.hasDaily) {
    sh.getRange(2, 1).setValue('HISTORICAL TRACTION — ' + tabName + '   ·   NO DATA YET   ·   ' +
      'fill this store in CONFIG.STORES, release the read_reports scope on its Shopify app, then run "Pull historical data". ' +
      'Run "Check Shopify access for every store" to see which step is missing.');
  }
  Logger.log('Traction built: ' + tabName + ' ' + yA + ' vs ' + yB + ' · ' +
             Object.keys(A.byDate).length + '/' + Object.keys(B.byDate).length + ' day(s) · hourly ' + A.hasHourly + '/' + B.hasHourly +
             ' · ranked on ' + M);
  return sh;
}

/* ---------------------------- layout helpers ---------------------------- */

function range_(lo, hi) { var o = []; for (var i = lo; i <= hi; i++) o.push(i); return o; }

/* grid[rowKey][colKey].<field>  →  a plain 2-D array of numbers, in the order given. */
function gridValues_(grid, rowKeys, colKeys, field) {
  return rowKeys.map(function (rk) {
    return colKeys.map(function (ck) {
      var c = grid[rk] && grid[rk][ck];
      return c ? round2_(c[field]) : 0;
    });
  });
}
/* Same, but the grid is stored the other way round (grid[colKey][rowKey]). */
function transposeGrid_(grid, colKeys, rowKeys, field) {
  return rowKeys.map(function (rk) {
    return colKeys.map(function (ck) {
      var c = grid[ck] && grid[ck][rk];
      return c ? round2_(c[field]) : 0;
    });
  });
}

function sectionHeader_(sh, r, text, sub) {
  sh.getRange(r, 1, 1, NC).merge().setValue(text)
    .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(12)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setRowHeight(r, 28);
  r++;
  if (sub) {
    sh.getRange(r, 1, 1, NC).merge().setValue(sub).setFontSize(9).setFontColor('#666666')
      .setWrap(true).setHorizontalAlignment('left').setVerticalAlignment('top');
    sh.setRowHeight(r, 30);
    r++;
  }
  return r;
}

/* The standard 13-column comparison table, used by every single-grain cut.
     rows: [{label, a:{rev,orders}, b:{rev,orders}, mark?}]
     totA/totB: the year's own totals, used as the SHARE denominators.
   Ranks are by CONFIG.RANK_BY (orders unless you change it) and the top three get medals.
   Returns {next, hdr1, hdr2, first, count} so charts can bind straight to the table. */
function writeCompareTable_(sh, r, labelHdr, yA, yB, rows, totA, totB, ccy, cf) {
  var hdr1 = r, hdr2 = r + 1, first = r + 2, n = rows.length;
  var useOrders = rankByOrders_();

  sh.getRange(hdr1, 1, 1, NC).setValues([['', 'Revenue (' + ccy + ')', '', '', '', 'Orders', '', '', 'AOV (' + ccy + ')', '', 'Share of orders', '', 'Rank']]);
  [[2, 4], [6, 3], [9, 2], [11, 2]].forEach(function (g) { sh.getRange(hdr1, g[0], 1, g[1]).merge(); });
  sh.getRange(hdr1, 1, 1, NC).setBackground(HDR_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');

  sh.getRange(hdr2, 1, 1, NC).setValues([[labelHdr, yA, yB, 'Growth ' + ccy, 'Growth %', yA, yB, 'Growth %', yA, yB, yA, yB, yB]]).setFontWeight('bold');
  [2, 6, 9, 11].forEach(function (c) { sh.getRange(hdr2, c).setBackground(Y1_BG); });
  [3, 7, 10, 12].forEach(function (c) { sh.getRange(hdr2, c).setBackground(Y2_BG); });
  [4, 5, 8].forEach(function (c) { sh.getRange(hdr2, c).setBackground(HDR_BG).setFontColor('#FFFFFF'); });
  sh.getRange(hdr2, 13).setBackground(GOLD);
  sh.getRange(hdr2, 1).setBackground(SUBHEAD_BG);
  sh.getRange(hdr1, 1, 2, NC).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(hdr1, 22); sh.setRowHeight(hdr2, 22);

  // rank every bucket of the COMPARE year on the chosen metric; ties keep their order, zeros get no rank
  var order = rows.map(function (x, i) { return { i: i, v: metricOf_(x.b) }; })
                  .filter(function (x) { return x.v > 0; })
                  .sort(function (p, q) { return q.v - p.v; });
  var rank = {};
  order.forEach(function (x, k) { rank[x.i] = k + 1; });

  var body = [], sumA = { rev: 0, orders: 0 }, sumB = { rev: 0, orders: 0 };
  rows.forEach(function (x, i) {
    var a = x.a || { rev: 0, orders: 0 }, b = x.b || { rev: 0, orders: 0 };
    sumA.rev += a.rev; sumA.orders += a.orders; sumB.rev += b.rev; sumB.orders += b.orders;
    body.push(compareRow_(x.label, a, b, totA, totB, rank[i] || ''));
  });
  // Pin the label column to plain text BEFORE writing: '08:00' becomes a time value and '1'..'31'
  // become numbers otherwise, and either turns a categorical chart axis into a continuous one.
  sh.getRange(first, 1, n + 1, 1).setNumberFormat('@');
  sh.getRange(first, 1, n, NC).setValues(body);
  sh.getRange(first + n, 1, 1, NC).setValues([compareRow_('TOTAL', sumA, sumB, totA, totB, '')])
    .setFontWeight('bold').setBackground('#D9D9D9');

  var all = n + 1;
  sh.getRange(first, 2, all, 3).setNumberFormat('#,##0.00');     // Revenue Y1 / Y2 / Growth
  sh.getRange(first, 5, all, 1).setNumberFormat('0.0%');         // Revenue growth %
  sh.getRange(first, 6, all, 2).setNumberFormat('#,##0');        // Orders
  sh.getRange(first, 8, all, 1).setNumberFormat('0.0%');         // Orders growth %
  sh.getRange(first, 9, all, 2).setNumberFormat('#,##0.00');     // AOV
  sh.getRange(first, 11, all, 2).setNumberFormat('0.0%');        // Share of orders
  sh.getRange(first, 13, all, 1).setNumberFormat('#,##0');       // Rank
  sh.getRange(hdr1, 1, all + 2, NC).setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(first, 1, all, 1).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(first, 2, all, NC - 1).setHorizontalAlignment('center');
  sh.getRange(first, 13, all, 1).setFontWeight('bold');
  rows.forEach(function (x, i) { if (x.mark) sh.getRange(first + i, 1).setBackground(SILVER); });   // e.g. weekends, marked on the label only so the data columns keep their own colour coding
  // medals on the podium — a glance is enough to see where the bulk of the orders sits
  order.slice(0, 3).forEach(function (x, k) { sh.getRange(first + x.i, 13).setBackground([GOLD, SILVER, BRONZE][k]); });

  if (cf) {
    // colour-grade the two order columns and the two revenue columns, so every table reads like a heatmap
    cf.push(valueGradientRule_(sh.getRange(first, 6, n, 1), maxOf_(body, 5)));
    cf.push(valueGradientRule_(sh.getRange(first, 7, n, 1), maxOf_(body, 6)));
    cf.push(valueGradientRule_(sh.getRange(first, 2, n, 1), maxOf_(body, 1)));
    cf.push(valueGradientRule_(sh.getRange(first, 3, n, 1), maxOf_(body, 2)));
    var gr = minMaxOf_(body, 7);                                                  // orders growth %, diverging on a true zero
    cf.push(diffGradientRule_(sh.getRange(first, 8, n, 1), gr.min, gr.max));
    var gv = minMaxOf_(body, 4);
    cf.push(diffGradientRule_(sh.getRange(first, 5, n, 1), gv.min, gv.max));
  }
  return { next: first + n + 1, hdr1: hdr1, hdr2: hdr2, first: first, count: n };
}

function compareRow_(label, a, b, totA, totB, rank) {
  var gAmt = round2_(b.rev - a.rev);
  var gPct = a.rev ? round4_((b.rev - a.rev) / a.rev) : '';
  var oPct = a.orders ? round4_((b.orders - a.orders) / a.orders) : '';
  var tA = totA ? totA.orders : 0, tB = totB ? totB.orders : 0;
  return [label,
    round2_(a.rev), round2_(b.rev), gAmt, gPct,
    Math.round(a.orders), Math.round(b.orders), oPct,
    a.orders ? round2_(a.rev / a.orders) : '', b.orders ? round2_(b.rev / b.orders) : '',
    tA ? round4_(a.orders / tA) : '', tB ? round4_(b.orders / tB) : '',
    rank];
}
function maxOf_(body, col) {
  var m = 0;
  body.forEach(function (rw) { var v = Number(rw[col]); if (!isNaN(v) && v > m) m = v; });
  return m;
}
function minMaxOf_(body, col) {
  var mn = 0, mx = 0;
  body.forEach(function (rw) { var v = Number(rw[col]); if (isNaN(v) || rw[col] === '') return; if (v < mn) mn = v; if (v > mx) mx = v; });
  return { min: mn, max: mx };
}

/* A generic labelled matrix: rowLabels down the side, colLabels across the top.
   Never wider than NC, so every matrix lines up with the tables above it.
   Returns {next, first, nr, nc, min, max} — the caller uses first/nr/nc to attach a gradient. */
function writeMatrix_(sh, r, title, corner, rowLabels, colLabels, values, fmt) {
  var nr = rowLabels.length, ncol = colLabels.length, width = ncol + 1;
  if (width > NC) throw new Error('matrix "' + title + '" needs ' + width + ' columns but NC is ' + NC);
  sh.getRange(r, 1, 1, NC).merge().setValue(title)
    .setBackground(SUBHEAD_BG).setFontWeight('bold').setFontSize(11).setHorizontalAlignment('left');
  sh.setRowHeight(r, 22);
  var lbl = r + 1;
  sh.getRange(lbl, 1, 1, width).setValues([[corner].concat(colLabels)])
    .setFontWeight('bold').setBackground('#EFEFEF').setHorizontalAlignment('center');
  var first = lbl + 1;
  sh.getRange(first, 1, nr, 1).setNumberFormat('@');            // keep '08:00' and '1'..'31' as labels, not values
  sh.getRange(first, 1, nr, width).setValues(values.map(function (row, i) { return [rowLabels[i]].concat(row); }));
  sh.getRange(first, 2, nr, ncol).setNumberFormat(fmt || '#,##0').setHorizontalAlignment('center');
  sh.getRange(first, 1, nr, 1).setFontWeight('bold').setHorizontalAlignment('center').setBackground('#F5F5F5');
  sh.getRange(lbl, 1, nr + 1, width).setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
  var mn = Infinity, mx = -Infinity;
  values.forEach(function (row) { row.forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; }); });
  if (mn === Infinity) { mn = 0; mx = 0; }
  return { next: first + nr, first: first, nr: nr, nc: ncol, min: mn, max: mx };
}

/* Every year on the raw tab, one row each: the shape of the business year by year. */
function writeYearly_(sh, r, daily, hourly, country, ccy, cf) {
  var years = yearsPresent_(daily, country);
  var hdr = r;
  sh.getRange(hdr, 1, 1, NC).setValues([['Year', 'Orders', 'Revenue (' + ccy + ')', 'AOV (' + ccy + ')', 'Trading days',
    'Orders / day', 'Revenue / day', 'Busiest month', 'Busiest weekday', 'Busiest hour', 'Busiest date', 'Weekend share', 'Orders YoY %']])
    .setBackground(HDR_BG).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(hdr, 30);

  var body = [], prevOrders = null;
  years.forEach(function (y) {
    var S = tractionSeries_(daily, hourly, country, y);
    var days = Object.keys(S.byDate).length;
    var bm = topKeyOf_(S.mon, range_(1, 12)), bd = topKeyOf_(S.dow, range_(0, 6)),
        bh = S.hasHourly ? topKeyOf_(S.hour, range_(0, 23)) : null, bdt = topKeyOf_(S.byDate, Object.keys(S.byDate));
    var wknd = 0, tot = 0;
    for (var d = 0; d <= 6; d++) { tot += S.dow[d].orders; if (isWeekend_(d)) wknd += S.dow[d].orders; }
    var yoy = (prevOrders != null && prevOrders > 0) ? round4_((S.tot.orders - prevOrders) / prevOrders) : '';
    body.push([y, Math.round(S.tot.orders), round2_(S.tot.rev),
      S.tot.orders ? round2_(S.tot.rev / S.tot.orders) : '', days,
      days ? round2_(S.tot.orders / days) : '', days ? round2_(S.tot.rev / days) : '',
      bm === null ? '—' : MON_FULL[bm - 1],
      bd === null ? '—' : DAY_FULL[bd],
      bh === null ? '—' : hourLabel_(bh),
      bdt === null ? '—' : (pad2_(S.byDate[bdt].d) + ' ' + MON3[S.byDate[bdt].m - 1] + ' (' + DAY3[S.byDate[bdt].dow] + ')'),
      tot ? round4_(wknd / tot) : '', yoy]);
    prevOrders = S.tot.orders;
  });
  if (!body.length) body.push(['—', '', '', '', '', '', '', '', '', '', '', '', '']);

  sh.getRange(hdr + 1, 1, body.length, NC).setValues(body);
  sh.getRange(hdr + 1, 2, body.length, 1).setNumberFormat('#,##0');
  sh.getRange(hdr + 1, 3, body.length, 2).setNumberFormat('#,##0.00');
  sh.getRange(hdr + 1, 5, body.length, 1).setNumberFormat('#,##0');
  sh.getRange(hdr + 1, 6, body.length, 2).setNumberFormat('#,##0.00');
  sh.getRange(hdr + 1, 12, body.length, 2).setNumberFormat('0.0%');
  sh.getRange(hdr + 1, 1, body.length, 1).setFontWeight('bold').setBackground(Y1_BG);
  sh.getRange(hdr, 1, body.length + 1, NC).setBorder(true, true, true, true, true, true, '#7F7F7F', SpreadsheetApp.BorderStyle.SOLID)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  if (cf) {
    cf.push(valueGradientRule_(sh.getRange(hdr + 1, 2, body.length, 1), maxOf_(body, 1)));
    var g = minMaxOf_(body, 12);
    cf.push(diffGradientRule_(sh.getRange(hdr + 1, 13, body.length, 1), g.min, g.max));
  }
  return hdr + body.length;
}

/* Highest-metric key of a {key: {rev, orders}} map, or null when everything is zero. */
function topKeyOf_(obj, keys) {
  var best = null, bv = 0;
  keys.forEach(function (k) {
    var v = metricOf_(obj[k]);
    if (v > bv) { bv = v; best = k; }
  });
  return best === null ? null : (typeof best === 'string' && /^\d+$/.test(best) ? Number(best) : best);
}

/* The headline block: busiest month, date, weekday, hour and weekday-hour slot for each year,
   plus the shift between them stated in plain English. */
function writePeaks_(sh, r, yA, yB, A, B, ccy) {
  function fmtN(v) { return addCommas_(Math.round(v)); }
  function cellFor(label, o) { return label + '   ·   ' + fmtN(o.orders) + ' orders   ·   ' + ccy + ' ' + addCommas_(round2_(o.rev)); }
  function bestMonth(S) { var k = topKeyOf_(S.mon, range_(1, 12)); return k === null ? null : { txt: cellFor(MON_FULL[k - 1], S.mon[k]), key: MON3[k - 1] }; }
  function bestDow(S)   { var k = topKeyOf_(S.dow, range_(0, 6));  return k === null ? null : { txt: cellFor(DAY_FULL[k], S.dow[k]),   key: DAY3[k] }; }
  function bestHour(S)  { if (!S.hasHourly) return null; var k = topKeyOf_(S.hour, range_(0, 23)); return k === null ? null : { txt: cellFor(hourLabel_(k), S.hour[k]), key: hourLabel_(k) }; }
  function bestWeek(S)  { var k = topKeyOf_(S.week, range_(1, 53)); return k === null ? null : { txt: cellFor('Week ' + pad2_(k), S.week[k]), key: 'W' + pad2_(k) }; }
  function bestDom(S)   { var k = topKeyOf_(S.dom, range_(1, 31));  return k === null ? null : { txt: cellFor('Day ' + k + ' of the month', S.dom[k]), key: 'D' + k }; }
  function bestDate(S) {
    var k = topKeyOf_(S.byDate, Object.keys(S.byDate)); if (k === null) return null;
    var c = S.byDate[k];
    return { txt: cellFor(pad2_(c.d) + ' ' + MON3[c.m - 1] + ' (' + DAY_FULL[c.dow] + ')', c), key: pad2_(c.d) + ' ' + MON3[c.m - 1] };
  }
  function bestSlot(S) {
    if (!S.hasHourly) return null;
    var bd = null, bh = null, bv = 0;
    for (var d = 0; d <= 6; d++) for (var h = 0; h <= 23; h++) {
      var v = metricOf_(S.gDowHour[d][h]);
      if (v > bv) { bv = v; bd = d; bh = h; }
    }
    return bd === null ? null : { txt: cellFor(DAY_FULL[bd] + ' at ' + hourLabel_(bh), S.gDowHour[bd][bh]), key: DAY3[bd] + ' ' + hourLabel_(bh) };
  }
  function weekendShare(S) {
    var w = 0, t = 0;
    for (var d = 0; d <= 6; d++) { t += S.dow[d].orders; if (isWeekend_(d)) w += S.dow[d].orders; }
    return t ? (w / t) : null;
  }
  function txt(x) { return x ? x.txt : '—'; }
  function shift(a, b) { return (!a || !b) ? '—' : (a.key === b.key ? ('unchanged · ' + a.key) : (a.key + '  →  ' + b.key)); }

  var wsA = weekendShare(A), wsB = weekendShare(B);
  var daysA = Object.keys(A.byDate).length, daysB = Object.keys(B.byDate).length;
  var rows = [
    ['Busiest month',              txt(bestMonth(A)), txt(bestMonth(B)), shift(bestMonth(A), bestMonth(B))],
    ['Busiest ISO week',           txt(bestWeek(A)),  txt(bestWeek(B)),  shift(bestWeek(A),  bestWeek(B))],
    ['Busiest single date',        txt(bestDate(A)),  txt(bestDate(B)),  shift(bestDate(A),  bestDate(B))],
    ['Busiest day of the month',   txt(bestDom(A)),   txt(bestDom(B)),   shift(bestDom(A),   bestDom(B))],
    ['Busiest day of week',        txt(bestDow(A)),   txt(bestDow(B)),   shift(bestDow(A),   bestDow(B))],
    ['Busiest hour of day',        txt(bestHour(A)),  txt(bestHour(B)),  shift(bestHour(A),  bestHour(B))],
    ['Busiest weekday × hour slot', txt(bestSlot(A)), txt(bestSlot(B)),  shift(bestSlot(A),  bestSlot(B))],
    ['Weekend share of orders',    wsA === null ? '—' : pct1_(wsA), wsB === null ? '—' : pct1_(wsB),
                                   (wsA === null || wsB === null) ? '—' : (signed1_((wsB - wsA) * 100) + ' pp')],
    ['Total orders in period',     fmtN(A.tot.orders), fmtN(B.tot.orders),
                                   A.tot.orders ? (signed1_(((B.tot.orders - A.tot.orders) / A.tot.orders) * 100) + '%') : '—'],
    ['Trading days with orders',   fmtN(daysA), fmtN(daysB), signed_(daysB - daysA) + ' day(s)'],
    ['Orders per trading day',     daysA ? round2_(A.tot.orders / daysA) : '—', daysB ? round2_(B.tot.orders / daysB) : '—',
                                   (daysA && daysB && A.tot.orders) ? (signed1_((((B.tot.orders / daysB) - (A.tot.orders / daysA)) / (A.tot.orders / daysA)) * 100) + '%') : '—']
  ];

  var hdr = r;
  sh.getRange(hdr, 1, 1, NC).setValues([['What', yA, '', '', '', yB, '', '', '', 'Shift ' + yA + ' → ' + yB, '', '', '']]);
  sh.getRange(hdr, 2, 1, 4).merge(); sh.getRange(hdr, 6, 1, 4).merge(); sh.getRange(hdr, 10, 1, 4).merge();
  sh.getRange(hdr, 1, 1, NC).setBackground(HDR_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');

  var body = rows.map(function (x) { return [x[0], x[1], '', '', '', x[2], '', '', '', x[3], '', '', '']; });
  sh.getRange(hdr + 1, 1, body.length, NC).setValues(body);
  for (var i = 0; i < body.length; i++) {
    sh.getRange(hdr + 1 + i, 2, 1, 4).merge();
    sh.getRange(hdr + 1 + i, 6, 1, 4).merge();
    sh.getRange(hdr + 1 + i, 10, 1, 4).merge();
  }
  sh.getRange(hdr + 1, 1, body.length, 1).setFontWeight('bold').setBackground('#F5F5F5');
  sh.getRange(hdr + 1, 2, body.length, 4).setBackground(Y1_BG);
  sh.getRange(hdr + 1, 6, body.length, 4).setBackground(Y2_BG);
  sh.getRange(hdr + 1, 10, body.length, 4).setFontWeight('bold').setBackground('#E2EFDA');
  sh.getRange(hdr, 1, body.length + 1, NC).setBorder(true, true, true, true, true, true, '#7F7F7F', SpreadsheetApp.BorderStyle.SOLID)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(hdr + 1, 1, body.length, 1).setHorizontalAlignment('left');
  return hdr + body.length;
}

/* The busiest N single dates of each year by order count, ranked, side by side. */
function writeTopDates_(sh, r, yA, yB, A, B, ccy, cf) {
  function top(S, year) {
    return Object.keys(S.byDate).map(function (k) {
      var c = S.byDate[k];
      return { date: year + '-' + pad2_(c.m) + '-' + pad2_(c.d), day: DAY_FULL[c.dow], orders: c.orders, rev: c.rev };
    }).sort(function (x, y) { return metricOf_(y) - metricOf_(x); }).slice(0, CONFIG.TOP_N_DATES);
  }
  var ta = top(A, yA), tb = top(B, yB), n = Math.max(ta.length, tb.length, 1);
  var hdr = r;
  sh.getRange(hdr, 1, 1, NC).setValues([['#', yA + ' date', 'Day', 'Orders', 'Revenue (' + ccy + ')', '', '',
                                          yB + ' date', 'Day', 'Orders', 'Revenue (' + ccy + ')', '', '']])
    .setBackground(HDR_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  var body = [];
  for (var i = 0; i < n; i++) {
    var a = ta[i], b = tb[i];
    body.push([i + 1,
      a ? a.date : '', a ? a.day : '', a ? Math.round(a.orders) : '', a ? round2_(a.rev) : '', '', '',
      b ? b.date : '', b ? b.day : '', b ? Math.round(b.orders) : '', b ? round2_(b.rev) : '', '', '']);
  }
  sh.getRange(hdr + 1, 1, n, NC).setValues(body);
  [2, 8].forEach(function (c) { sh.getRange(hdr + 1, c, n, 1).setNumberFormat('yyyy-mm-dd'); });   // Sheets coerces these to real dates — pin how they read
  sh.getRange(hdr + 1, 2, n, 4).setBackground(Y1_BG);
  sh.getRange(hdr + 1, 8, n, 4).setBackground(Y2_BG);
  [4, 10].forEach(function (c) { sh.getRange(hdr + 1, c, n, 1).setNumberFormat('#,##0').setFontWeight('bold'); });
  [5, 11].forEach(function (c) { sh.getRange(hdr + 1, c, n, 1).setNumberFormat('#,##0.00'); });
  sh.getRange(hdr + 1, 1, n, 1).setFontWeight('bold');
  [0, 1, 2].forEach(function (k) { if (k < n) sh.getRange(hdr + 1 + k, 1).setBackground([GOLD, SILVER, BRONZE][k]); });
  sh.getRange(hdr, 1, n + 1, NC).setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  if (cf) {
    cf.push(valueGradientRule_(sh.getRange(hdr + 1, 4, n, 1), maxOf_(body, 3)));
    cf.push(valueGradientRule_(sh.getRange(hdr + 1, 10, n, 1), maxOf_(body, 9)));
  }
  return hdr + n;
}

/* min / max of a rectangular block of numbers, used to anchor a gradient. */
function valuesStats_(values) {
  var mn = Infinity, mx = -Infinity;
  values.forEach(function (row) { row.forEach(function (v) { if (v < mn) mn = v; if (v > mx) mx = v; }); });
  if (mn === Infinity) { mn = 0; mx = 0; }
  return { min: mn, max: mx };
}
/* Value scale: white (nothing) → amber → red (the hottest cell). The anchors are real numbers
   rather than percentiles, because Sheets rejects a gradient whose three points are not in
   strict ascending order, and percentiles collapse onto each other on a sparse grid. */
function valueGradientRule_(range, max) {
  if (!(max > 0)) return null;
  return SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#FFFFFF', SpreadsheetApp.InterpolationType.NUMBER, '0')
    .setGradientMidpointWithValue('#FFD966', SpreadsheetApp.InterpolationType.NUMBER, String(round2_(max * 0.35)))
    .setGradientMaxpointWithValue('#E06666', SpreadsheetApp.InterpolationType.NUMBER, String(round2_(max)))
    .setRanges([range]).build();
}
/* Change scale: red (fell) / white (no change) / green (grew), always anchored on a true zero.
   The one-sided cases are handled separately — three identical anchors would be rejected. */
function diffGradientRule_(range, min, max) {
  var lo = Math.min(0, min), hi = Math.max(0, max);
  if (lo === 0 && hi === 0) return null;
  var b = SpreadsheetApp.newConditionalFormatRule();
  if (lo === 0) {
    b.setGradientMinpointWithValue('#FFFFFF', SpreadsheetApp.InterpolationType.NUMBER, '0')
     .setGradientMidpointWithValue('#CDE8CD', SpreadsheetApp.InterpolationType.NUMBER, String(round4_(hi / 2)))
     .setGradientMaxpointWithValue('#57A957', SpreadsheetApp.InterpolationType.NUMBER, String(round4_(hi)));
  } else if (hi === 0) {
    b.setGradientMinpointWithValue('#D9534F', SpreadsheetApp.InterpolationType.NUMBER, String(round4_(lo)))
     .setGradientMidpointWithValue('#F4C7C3', SpreadsheetApp.InterpolationType.NUMBER, String(round4_(lo / 2)))
     .setGradientMaxpointWithValue('#FFFFFF', SpreadsheetApp.InterpolationType.NUMBER, '0');
  } else {
    b.setGradientMinpointWithValue('#D9534F', SpreadsheetApp.InterpolationType.NUMBER, String(round4_(lo)))
     .setGradientMidpointWithValue('#FFFFFF', SpreadsheetApp.InterpolationType.NUMBER, '0')
     .setGradientMaxpointWithValue('#57A957', SpreadsheetApp.InterpolationType.NUMBER, String(round4_(hi)));
  }
  return b.setRanges([range]).build();
}

/* Both years' daily series, aligned DATE for DATE, with 7-day rolling averages and running
   totals for orders and revenue. Written out because the two pace charts read from it. */
function writePace_(sh, r, yA, yB, A, B) {
  var slots = calendarSlots_(), hdr = r;
  sh.getRange(hdr, 1, 1, 9).setValues([['Date', 'Orders ' + yA, 'Orders ' + yB, 'Revenue ' + yA, 'Revenue ' + yB,
    '7-day avg orders ' + yA, '7-day avg orders ' + yB, 'Cumulative orders ' + yA, 'Cumulative orders ' + yB]])
    .setBackground(SUBHEAD_BG).setFontWeight('bold').setWrap(true).setHorizontalAlignment('center');
  sh.setRowHeight(hdr, 30);

  function series(S, year) {
    var ord = [], rev = [], lastIdx = -1;
    slots.forEach(function (s, i) {
      var real = !(s.m === 2 && s.d === 29 && !isLeap_(year));
      var c = S.byDate[s.key];
      ord.push(real ? (c ? c.orders : 0) : null);
      rev.push(real ? (c ? c.rev : 0) : null);
      if (c) lastIdx = i;
    });
    return { ord: ord, rev: rev, lastIdx: lastIdx };
  }
  var sa = series(A, yA), sb = series(B, yB);
  var lastIdx = Math.max(sa.lastIdx, sb.lastIdx);
  if (lastIdx < 0) lastIdx = 0;

  function ma7(s, i) {
    if (i > s.lastIdx || s.lastIdx < 0) return '';
    var sum = 0, cnt = 0;
    for (var k = Math.max(0, i - 6); k <= i; k++) { if (s.ord[k] === null) continue; sum += s.ord[k]; cnt++; }
    return cnt ? round2_(sum / cnt) : '';
  }
  var cumA = 0, cumB = 0, body = [];
  for (var i = 0; i <= lastIdx; i++) {
    if (sa.ord[i] !== null && i <= sa.lastIdx) cumA += sa.ord[i];
    if (sb.ord[i] !== null && i <= sb.lastIdx) cumB += sb.ord[i];
    var inA = (i <= sa.lastIdx && sa.ord[i] !== null), inB = (i <= sb.lastIdx && sb.ord[i] !== null);
    body.push([slots[i].label,
      inA ? Math.round(sa.ord[i]) : '', inB ? Math.round(sb.ord[i]) : '',
      inA ? round2_(sa.rev[i]) : '',    inB ? round2_(sb.rev[i]) : '',
      ma7(sa, i), ma7(sb, i),
      (i <= sa.lastIdx) ? Math.round(cumA) : '', (i <= sb.lastIdx) ? Math.round(cumB) : '']);
  }
  if (!body.length) body.push(['—', '', '', '', '', '', '', '', '']);
  sh.getRange(hdr + 1, 1, body.length, 1).setNumberFormat('@');   // '06 AUG' would otherwise be parsed as a date
  sh.getRange(hdr + 1, 1, body.length, 9).setValues(body);
  sh.getRange(hdr + 1, 2, body.length, 2).setNumberFormat('#,##0');
  sh.getRange(hdr + 1, 4, body.length, 2).setNumberFormat('#,##0.00');
  sh.getRange(hdr + 1, 6, body.length, 2).setNumberFormat('#,##0.0');
  sh.getRange(hdr + 1, 8, body.length, 2).setNumberFormat('#,##0');
  sh.getRange(hdr + 1, 1, body.length, 9).setHorizontalAlignment('center');
  return { next: hdr + body.length, hdr: hdr, count: body.length };
}

/* ======================= THE "HOW TO READ" TAB =========================== */

/* The exact colour the conditional-format scale would paint a value: white at 0, #FFD966 at
   35% of the max, #E06666 at the max. Used to paint the guide's demo grids directly, so what
   you learn to read here is pixel-for-pixel what the real matrices do. */
function heatColor_(v, max) {
  if (!(max > 0)) return '#FFFFFF';
  var t = Math.max(0, Math.min(1, v / max)), a, b, k;
  if (t <= 0.35) { a = [255, 255, 255]; b = [255, 217, 102]; k = t / 0.35; }
  else           { a = [255, 217, 102]; b = [224, 102, 102]; k = (t - 0.35) / 0.65; }
  return '#' + [0, 1, 2].map(function (i) {
    var n = Math.round(a[i] + (b[i] - a[i]) * k);
    return (n < 16 ? '0' : '') + n.toString(16);
  }).join('').toUpperCase();
}

/* Prefer a REAL weekday x hour grid — the most recent year of whichever store has the most
   hourly orders — so the lesson is taught on your own numbers. Falls back to a clearly
   labelled illustrative shape when nothing has been pulled yet. */
function guideSample_(daily, hourly) {
  var best = null;
  tractionCountries_().forEach(function (cc) {
    var years = yearsPresent_(daily, cc);
    for (var i = years.length - 1; i >= 0; i--) {
      var S = tractionSeries_(daily, hourly, cc, years[i]);
      if (!S.hasHourly) continue;
      if (!best || S.hourTot.orders > best.tot) best = { cc: cc, year: years[i], S: S, tot: S.hourTot.orders };
      break;                                                    // newest year with hours wins for this store
    }
  });
  var dOrder = dowOrder_();
  if (best) {
    return { real: true, cc: best.cc, year: best.year,
             values: transposeGrid_(best.S.gDowHour, dOrder, range_(0, 23), 'orders') };
  }
  var WK = { 0: 1.17, 1: 1.00, 2: 0.96, 3: 0.94, 4: 0.99, 5: 1.10, 6: 1.42 };   // Sun..Sat, weekend uplift
  var out = [];
  for (var h = 0; h <= 23; h++) {
    out.push(dOrder.map(function (d) {
      var evening = Math.exp(-Math.pow(h - 20, 2) / 11) + 0.10;
      var lunch = 0.22 * Math.exp(-Math.pow(h - 13, 2) / 4);
      return Math.round(210 * WK[d] * (evening + lunch));
    }));
  }
  return { real: false, values: out };
}

/* The three archetypes. Deliberately synthetic — they are shapes to recognise, not findings. */
var GUIDE_SHAPES = [
  { name: 'A VERTICAL BAND', hot: function (r, c) { return c === 5 ? 1 : 0.16; },
    what: 'One column glows top to bottom.',
    means: 'A WEEKDAY habit — that day is busy whatever the hour. Staff the whole day; do not bother timing anything to an hour.' },
  { name: 'A HORIZONTAL BAND', hot: function (r, c) { return r === 3 ? 1 : 0.16; },
    what: 'One row glows straight across every day.',
    means: 'A TIME-OF-DAY habit, independent of weekday. Time your sends, your live chat cover and your dispatch cut-off to it.' },
  { name: 'ONE HOT CELL', hot: function (r, c) { return (r === 3 && c === 5) ? 1 : 0.12; },
    what: 'A single dark square, quiet neighbours.',
    means: 'Not a habit — an EVENT. A campaign, a drop, a Black Friday. Go and find out what you did that day, then decide whether to repeat it.' }
];

/* Build the guide. Everything on it is drawn with real cell colours, because the thing being
   taught IS a colour — reading a paragraph about a heatmap is what was not working. */
function buildGuideTab_() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(TAB.GUIDE) || ss.insertSheet(TAB.GUIDE);
  var daily = readDaily_(), hourly = readHourly_();
  var sample = guideSample_(daily, hourly);
  var dOrder = dowOrder_(), dayLabels = dOrder.map(function (d) { return DAY3[d]; });

  clearSheet_(sh);
  try { sh.setConditionalFormatRules([]); } catch (e) {}
  try { sh.setFrozenRows(0); sh.setFrozenColumns(0); } catch (e) {}
  if (sh.getMaxRows() < 220) sh.insertRowsAfter(sh.getMaxRows(), 220 - sh.getMaxRows());
  if (sh.getMaxColumns() < NC) sh.insertColumnsAfter(sh.getMaxColumns(), NC - sh.getMaxColumns());

  var r = 1;
  function prose(text, height) {                                 // a full-width paragraph
    sh.getRange(r, 1, 1, NC).merge().setValue(text)
      .setWrap(true).setFontSize(10).setFontColor('#444444')
      .setHorizontalAlignment('left').setVerticalAlignment('middle');
    sh.setRowHeight(r, height || 34);
    r++;
  }

  /* --- title --- */
  sh.getRange(r, 1, 1, NC).merge().setValue('📖  HOW TO READ THIS WORKBOOK')
    .setBackground(TITLE_BG).setFontWeight('bold').setFontSize(15).setHorizontalAlignment('center');
  sh.setRowHeight(r, 34); r++;
  prose('The country tabs are long on purpose — but you are not meant to read them. You are meant to look at four places and stop. ' +
        'This tab is where the signal is and what it means. It rebuilds itself whenever the data does.', 34);
  r++;

  /* --- A · the four places --- */
  r = sectionHeader_(sh, r, 'A ·  FOUR PLACES, FOUR QUESTIONS',
      'Everything else on a country tab is supporting evidence. If you only ever look at these four, you have the answer.');
  sh.getRange(r, 1, 1, 6).merge().setValue('If you want to know…');
  sh.getRange(r, 7, 1, NC - 6).merge().setValue('Read this');
  sh.getRange(r, 1, 1, NC).setBackground(HDR_BG).setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setRowHeight(r, 24); r++;
  [['When do most of my orders land?', '①  PEAKS — the top block of any country tab'],
   ['Is this year shaped differently from last?', 'The Rank and Share of orders columns'],
   ['Which day AND which hour together?', '⑨  MATRICES — the coloured grids'],
   ['Am I ahead of last year right now?', 'The cumulative orders chart, at the bottom']
  ].forEach(function (row, i) {
    sh.getRange(r, 1, 1, 6).merge().setValue(row[0]).setFontWeight('bold');
    sh.getRange(r, 7, 1, NC - 6).merge().setValue(row[1]).setFontColor('#444444');
    sh.getRange(r, 1, 1, NC).setBackground(i % 2 ? '#F5F7FA' : '#FFFFFF')
      .setHorizontalAlignment('left').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, false, false, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
    sh.setRowHeight(r, 22); r++;
  });
  r++;

  /* --- B · the trap --- */
  r = sectionHeader_(sh, r, 'B ·  THE ONE TRAP — read SHARE, not GROWTH %',
      'This is the column that will mislead you, and it is the one that catches the eye because it is the one coloured red.');
  var ty = Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  prose('Right now you are comparing a FULL year against a PART year — twelve months of ' + (ty - 1) + ' against however much of ' + ty + ' has happened. ' +
        'So every Growth % must fall by roughly the same fraction. That is the calendar, not the business. The worked example below is illustrative:', 34);

  sh.getRange(r, 1, 1, 6).setValues([['Day', 'Orders ' + (ty - 1), 'Orders ' + ty, 'Growth %', 'Share ' + (ty - 1), 'Share ' + ty]])
    .setBackground(HDR_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sh.setRowHeight(r, 22); r++;
  var demo = [['Monday', 2412, 1588], ['Tuesday', 2301, 1470], ['Wednesday', 2264, 1402], ['Thursday', 2388, 1511],
              ['Friday', 2655, 1802], ['Saturday', 3402, 2416], ['Sunday', 2801, 1762]];
  var tA = 0, tB = 0;
  demo.forEach(function (d) { tA += d[1]; tB += d[2]; });
  var demoFirst = r;
  demo.forEach(function (d) {
    sh.getRange(r, 1, 1, 6).setValues([[d[0], d[1], d[2], (d[2] - d[1]) / d[1], d[1] / tA, d[2] / tB]]);
    r++;
  });
  var totalRow = r;
  sh.getRange(r, 1, 1, 6).setValues([['TOTAL', tA, tB, (tB - tA) / tA, 1, 1]]);
  var demoRows = demo.length + 1;
  sh.getRange(demoFirst, 2, demoRows, 2).setNumberFormat('#,##0');
  sh.getRange(demoFirst, 4, demoRows, 1).setNumberFormat('0.0%').setFontColor('#B3261E').setBackground('#FCE8E6');
  sh.getRange(demoFirst, 5, demoRows, 2).setNumberFormat('0.0%');
  sh.getRange(demoFirst, 1, demoRows, 1).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(demoFirst, 2, demoRows, 5).setHorizontalAlignment('center');
  sh.getRange(demoFirst + 5, 5, 1, 2).setBackground(GOLD);                    // Saturday's two share cells — the point of the whole section
  sh.getRange(totalRow, 1, 1, 6).setFontWeight('bold').setBackground('#D9D9D9');   // after the column fills, so the total row stays grey throughout
  sh.getRange(demoFirst - 1, 1, demoRows + 1, 6).setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
  r++;
  prose('⬆  Every Growth % is red, so the eye reports "everything is down" — but look at the two gold cells. Saturday went 18.7% → 20.2% of the year\'s orders: ' +
        'a BIGGER slice of a smaller pie. That is a real change in customer behaviour, and Growth % hid it completely. ' +
        'Read SHARE while one year is part-finished; Growth % becomes meaningful again once both years are complete, or when you set both dropdowns to finished years.', 48);
  r++;

  /* --- C · the matrix --- */
  r = sectionHeader_(sh, r, 'C ·  THE MATRIX — look at it, do not read it',
      '168 cells, coloured by order count. The numbers are there when you need them, but the point is the SHAPE.');
  prose(sample.real
    ? '⬇  This is YOUR data — ' + sample.cc + ', ' + sample.year + ', orders by weekday and hour. The identical grid, per year, is section ⑨ of every country tab.'
    : '⬇  Illustrative shape (nothing pulled yet, so these numbers are invented). Once you run "Pull historical data" this redraws with your own figures.', 30);

  sh.getRange(r, 1, 1, 8).setValues([['Hour'].concat(dayLabels)])
    .setBackground('#EFEFEF').setFontWeight('bold').setHorizontalAlignment('center');
  sh.setRowHeight(r, 20); r++;
  var hmFirst = r, vals = sample.values, hmMax = 0;
  vals.forEach(function (row) { row.forEach(function (v) { if (v > hmMax) hmMax = v; }); });
  var body = [], colors = [];
  for (var h = 0; h < 24; h++) {
    body.push([hourLabel_(h)].concat(vals[h]));
    colors.push(['#F5F5F5'].concat(vals[h].map(function (v) { return heatColor_(v, hmMax); })));
  }
  sh.getRange(hmFirst, 1, 24, 1).setNumberFormat('@');
  sh.getRange(hmFirst, 1, 24, 8).setValues(body).setBackgrounds(colors)
    .setHorizontalAlignment('center').setFontSize(9)
    .setBorder(true, true, true, true, true, true, '#D7DCE4', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(hmFirst, 2, 24, 7).setNumberFormat('#,##0');
  sh.getRange(hmFirst, 1, 24, 1).setFontWeight('bold');
  for (var hr = 0; hr < 24; hr++) sh.setRowHeight(hmFirst + hr, 18);
  // annotation parked beside the grid, where the eye already is
  sh.getRange(hmFirst, 10, 8, NC - 9).merge()
    .setValue('WHY THIS BEATS THE TABLES\n\n' +
              'A table can tell you Saturdays are busy, and separately that evenings are busy. Those are two facts, and they need not intersect.\n\n' +
              'Only the grid tells you it is SATURDAY EVENING.\n\n' +
              'Find the darkest cell. That single square out of 168 is the answer to "when do I get the bulk of my orders".')
    .setWrap(true).setVerticalAlignment('top').setHorizontalAlignment('left')
    .setBackground('#FFF8E1').setFontSize(10)
    .setBorder(true, true, true, true, false, false, '#E0B080', SpreadsheetApp.BorderStyle.SOLID);
  r = hmFirst + 24;
  r++;

  /* --- D · the three shapes --- */
  r = sectionHeader_(sh, r, 'D ·  THREE SHAPES WORTH RECOGNISING',
      'When you glance at any grid you are looking for one of these three. Each means something different, and each calls for a different decision.');
  GUIDE_SHAPES.forEach(function (shape) {
    var top = r;
    sh.getRange(top, 1).setValue(shape.name).setFontWeight('bold').setFontSize(10)
      .setHorizontalAlignment('left').setVerticalAlignment('middle');
    var grid = [], cols = [];
    for (var gr = 0; gr < 6; gr++) {
      var line = [], cl = [];
      for (var gc = 0; gc < 7; gc++) { line.push(''); cl.push(heatColor_(shape.hot(gr, gc) * 100, 100)); }
      grid.push(line); cols.push(cl);
    }
    sh.getRange(top, 2, 6, 7).setValues(grid).setBackgrounds(cols)
      .setBorder(true, true, true, true, true, true, '#D7DCE4', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(top, 10, 6, NC - 9).merge()
      .setValue(shape.what + '\n\n' + shape.means)
      .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('left').setFontSize(10);
    for (var k = 0; k < 6; k++) sh.setRowHeight(top + k, 18);
    r = top + 6;
    r++;
  });

  /* --- E · the clock --- */
  r = sectionHeader_(sh, r, 'E ·  THE CLOCK IS THE STORE\'S, NOT YOURS');
  prose('Hours are bucketed in each STORE\'s own time zone, as set in that Shopify admin. "20:00" on the USA tab means 8pm in America — ' +
        'not 8pm where you are, and not whatever the spreadsheet is set to. That is deliberate: you want to know when your CUSTOMERS order. ' +
        'The consequence is that you must never compare an hour across two country tabs — 20:00 on the USA tab and 20:00 on the UK tab are different moments. ' +
        'Within one country, compare freely. Each country tab names its actual zone in the ⑦ BY HOUR OF DAY header, and "Check Shopify access for every store" ' +
        'prints every store\'s zone alongside a raw sample bucket, so you can verify it rather than trust it. If a zone looks wrong, fix it in that Shopify admin — not here.', 76);
  r++;

  /* --- F · what to run --- */
  r = sectionHeader_(sh, r, 'F ·  WHAT TO RUN, AND WHEN');
  [['Once, to set up', 'Extensions → Apps Script → run  setup()  → it pulls, builds every tab and installs the daily refresh.'],
   ['Before the first pull', 'Run  checkAccess()  → one line per store: can we authenticate, does daily work, does hourly work, and what time zone is it on.'],
   ['Every day, automatically', 'The trigger installed by setup() re-pulls and rebuilds around 7am in the Apps Script project time zone. You do not need to do anything.'],
   ['Whenever you want it now', 'Menu 🕒 Traction → "Pull historical data".'],
   ['To change the years compared', 'Change either yellow dropdown in row 1 of a country tab — that tab redraws on its own.'],
   ['To add another year entirely', 'Add it to CONFIG.YEARS in the script, then re-pull. The YEARLY OVERVIEW grows with it.']
  ].forEach(function (row, i) {
    sh.getRange(r, 1, 1, 4).merge().setValue(row[0]).setFontWeight('bold');
    sh.getRange(r, 5, 1, NC - 4).merge().setValue(row[1]).setFontColor('#444444');
    sh.getRange(r, 1, 1, NC).setBackground(i % 2 ? '#F5F7FA' : '#FFFFFF')
      .setWrap(true).setHorizontalAlignment('left').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, false, false, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
    sh.setRowHeight(r, 30); r++;
  });

  sh.setColumnWidth(1, 170);
  for (var c2 = 2; c2 <= 8; c2++) sh.setColumnWidth(c2, 66);
  sh.setColumnWidth(9, 18);                                        // a deliberate gutter between grid and annotation
  for (var c3 = 10; c3 <= NC; c3++) sh.setColumnWidth(c3, 108);
  sh.setFrozenRows(1);
  sh.setHiddenGridlines(true);
  Logger.log('How-to-Read tab built (' + (sample.real ? 'demo grid uses REAL ' + sample.cc + ' ' + sample.year + ' data' : 'demo grid is illustrative — nothing pulled yet') + ').');
  return sh;
}

/* ================================ CHARTS ================================= */
function addColChart_(sheet, title, ranges, row, col, colors) {
  var b = sheet.newChart().asColumnChart().setNumHeaders(1).setPosition(row, col, 5, 5)
    .setOption('title', title).setOption('height', 340).setOption('width', 600)
    .setOption('legend', { position: 'bottom' }).setOption('titleTextStyle', { fontSize: 13, bold: true });
  if (colors) b.setOption('colors', colors);
  ranges.forEach(function (rg) { b.addRange(rg); });
  sheet.insertChart(b.build());
}
function addLineChart_(sheet, title, ranges, row, col, colors) {
  var b = sheet.newChart().asLineChart().setNumHeaders(1).setPosition(row, col, 5, 5)
    .setOption('title', title).setOption('height', 340).setOption('width', 600)
    .setOption('legend', { position: 'bottom' }).setOption('titleTextStyle', { fontSize: 13, bold: true })
    .setOption('curveType', 'function').setOption('pointSize', 0);
  if (colors) b.setOption('colors', colors);
  ranges.forEach(function (rg) { b.addRange(rg); });
  sheet.insertChart(b.build());
}

/* ================================== FX =================================== */
var _fxCache = null, _fxOverrides = null;

/* Merge order (last wins): CONFIG.FX defaults → live rates → CONFIG.FX_PINNED → whatever
   you typed on the FX Rates tab. So a typed rate is always exactly what the report uses. */
function FX_RATES_() {
  if (_fxCache) return _fxCache;
  var out = {};
  Object.keys(CONFIG.FX).forEach(function (k) { out[k] = CONFIG.FX[k]; });
  try {
    var raw = PropertiesService.getDocumentProperties().getProperty('fxRates');
    if (raw) { var j = JSON.parse(raw); if (j && j.rates) Object.keys(j.rates).forEach(function (k) { out[k] = j.rates[k]; }); }
  } catch (e) {}
  Object.keys(CONFIG.FX_PINNED || {}).forEach(function (k) { out[k] = CONFIG.FX_PINNED[k]; });
  var ov = fxOverrides_();
  Object.keys(ov).forEach(function (k) { out[k] = ov[k]; });
  return (_fxCache = out);
}
function fxOverrides_() {
  if (_fxOverrides) return _fxOverrides;
  var out = {};
  try {
    var sh = getSpreadsheet_().getSheetByName(TAB.FX);
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
        var cur = String(r[0] || '').trim().toUpperCase(), v = Number(r[2]);
        if (cur && v > 0) out[cur] = v;
      });
    }
  } catch (e) {}
  return (_fxOverrides = out);
}
function fxToUSD_(amount, currency) {
  amount = num_(amount);
  var cur = String(currency || CONFIG.REPORT_CURRENCY).toUpperCase();
  if (!cur || cur === CONFIG.REPORT_CURRENCY) return amount;
  var rate = FX_RATES_()[cur];
  return rate ? amount * rate : amount;
}
/* Live rates from a free, no-key API → cached on the document → written to the FX tab. */
function refreshFxRates() {
  try {
    var res = UrlFetchApp.fetch('https://open.er-api.com/v6/latest/USD', { muteHttpExceptions: true });
    var j = JSON.parse(res.getContentText());
    if (j && j.result === 'success' && j.rates) {
      var out = { USD: 1 };
      Object.keys(j.rates).forEach(function (c) { var rr = Number(j.rates[c]); if (rr) out[c.toUpperCase()] = Math.round((1 / rr) * 1e6) / 1e6; });
      PropertiesService.getDocumentProperties().setProperty('fxRates', JSON.stringify({ rates: out }));
      _fxCache = null; _fxOverrides = null;
      buildFxTab_(out);
      Logger.log('FX refreshed: 1 CAD=' + out.CAD + ' · 1 GBP=' + out.GBP + ' · 1 AUD=' + out.AUD + ' USD.');
      return out;
    }
    Logger.log('FX refresh failed (kept existing rates): ' + res.getContentText().slice(0, 160));
  } catch (e) { Logger.log('FX refresh error (kept existing rates): ' + e); }
  return null;
}
/* Editable rate card. Type into column C and that is exactly what every report tab uses. */
function buildFxTab_(live) {
  var sh = getTab_(TAB.FX, ['Currency', 'Live rate → USD', 'Your rate → USD', 'Rate used']);
  var typed = fxOverrides_(), curs = {};
  Object.keys(CONFIG.FX).forEach(function (c) { curs[c] = 1; });
  Object.keys(COUNTRY_CFG).forEach(function (cc) { curs[COUNTRY_CFG[cc].currency] = 1; });
  var list = Object.keys(curs).sort(), body = list.map(function (c, i) {
    return [c, (live && live[c] != null) ? live[c] : (CONFIG.FX[c] || ''), (typed[c] != null ? typed[c] : ''), '=IF(C' + (i + 2) + '="",B' + (i + 2) + ',C' + (i + 2) + ')'];
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();
  sh.getRange(1, 1, 1, 4).setValues([['Currency', 'Live rate → USD', 'Your rate → USD', 'Rate used']])
    .setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sh.getRange(2, 1, body.length, 4).setValues(body);
  sh.getRange(2, 3, body.length, 1).setBackground('#FFF2CC');           // the column you own
  sh.getRange(2, 2, body.length, 3).setNumberFormat('0.000000');
  sh.setFrozenRows(1);
  sh.getRange(body.length + 3, 1, 1, 4).merge()
    .setValue('Every report tab is shown in ' + CONFIG.REPORT_CURRENCY + ', converted with the "Rate used" column. Type a rate in column C to override the live one — it wins everywhere, ' +
              'and a rebuild is enough (no re-pull). Order COUNTS are never converted. The local-currency figures on the "' + TAB.DAILY + '" tab are the ones that tie to each Shopify admin exactly; ' +
              'one rate per currency means the ' + CONFIG.REPORT_CURRENCY + ' totals sit a few % from Shopify\'s own ' + CONFIG.REPORT_CURRENCY + ' display, because Shopify converts each order at its order-date rate.')
    .setFontSize(9).setFontColor('#666666').setWrap(true);
  centerAll_(sh);
  _fxOverrides = null; _fxCache = null;
}

/* ================================ EXCEL ================================== */

/* Save the whole workbook — tables, matrices, colour scales and charts — as a real .xlsx in
   Drive, in a "BDS Traction Exports" folder, and log the link. First run asks for Drive access. */
function exportToExcel() {
  var id = CONFIG.SHEET_ID, name = 'BDS Historical Traction ' + Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd HHmm') + '.xlsx';
  var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx&id=' + id;
  var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    Logger.log('Excel export failed (HTTP ' + resp.getResponseCode() + '): ' + resp.getContentText().slice(0, 200));
    try { SpreadsheetApp.getUi().alert('Excel export failed — see the Apps Script execution log.'); } catch (e) {}
    return null;
  }
  var folders = DriveApp.getFoldersByName('BDS Traction Exports');
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('BDS Traction Exports');
  var file = folder.createFile(resp.getBlob().setName(name));
  Logger.log('Excel written: ' + file.getUrl());
  try { SpreadsheetApp.getUi().alert('Excel file created\n\n' + name + '\n\n' + file.getUrl()); } catch (e) {}
  return file.getUrl();
}

/* ====================== SHOPIFY AUTH + GRAPHQL =========================== */
var _tokenCache = {};
function getAccessToken_(st) {
  if (_tokenCache[st.code]) return _tokenCache[st.code];
  if (st.token) return (_tokenCache[st.code] = st.token);          // in-admin custom app token (shpat_…)
  var resp = UrlFetchApp.fetch('https://' + st.domain + '/admin/oauth/access_token', {
    method: 'post',
    payload: { grant_type: 'client_credentials', client_id: st.clientId, client_secret: st.clientSecret },
    muteHttpExceptions: true
  });
  var txt = resp.getContentText(), body = {};
  try { body = JSON.parse(txt); } catch (e) {}
  if (!body.access_token) {
    var hint = /shop-404|Store unavailable/i.test(txt) ? ' → store not found: check the .myshopify.com domain'
             : /invalid_client|Unauthorized|401/i.test(txt) ? ' → bad clientId/clientSecret, or the app is not installed'
             : '';
    Logger.log(st.code + ' token error (HTTP ' + resp.getResponseCode() + ')' + hint + ': ' + txt.slice(0, 200));
    return null;
  }
  return (_tokenCache[st.code] = body.access_token);
}
function shopifyGraphQL_(st, query, variables) {
  var token = getAccessToken_(st);
  if (!token) return null;
  var resp = UrlFetchApp.fetch('https://' + st.domain + '/admin/api/' + CONFIG.API_VERSION + '/graphql.json', {
    method: 'post', contentType: 'application/json',
    headers: { 'X-Shopify-Access-Token': token },
    payload: JSON.stringify({ query: query, variables: variables || {} }),
    muteHttpExceptions: true
  });
  try { return JSON.parse(resp.getContentText()); }
  catch (e) { Logger.log(st.code + ' non-JSON response: ' + resp.getContentText().slice(0, 300)); return null; }
}
var _shopTz = {};
function shopTimezone_(st) {
  if (_shopTz[st.code] !== undefined) return _shopTz[st.code];
  var res = shopifyGraphQL_(st, 'query{shop{ianaTimezone}}', {});
  var tz = res && res.data && res.data.shop && res.data.shop.ianaTimezone;
  return (_shopTz[st.code] = tz || null);
}

/* ============================== DIAGNOSTICS ============================== */

/* One line per store: can we authenticate, does ShopifyQL answer, and can it group by HOUR?
   Run this first if a country is missing, or if its time-of-day sections are empty. */
function checkAccess() {
  var out = [];
  CONFIG.STORES.forEach(function (st) {
    var cc = canonCountry_(st.code);
    if (String(st.domain || '').indexOf('PASTE_') === 0) { out.push(cc + ': ✗ store not configured'); return; }
    if (!getAccessToken_(st)) { out.push(cc + ': ✗ cannot authenticate (check clientId/secret or token)'); return; }
    var d = shopifyQLTable_(st, 'FROM sales SHOW total_sales, orders GROUP BY day SINCE -30d UNTIL today', true);
    if (!d) { out.push(cc + ': ✗ ShopifyQL blocked — add read_reports to this app and RELEASE a new version'); return; }
    var h = shopifyQLTable_(st, 'FROM sales SHOW total_sales, orders GROUP BY hour SINCE -7d UNTIL today', true);
    var tz = shopTimezone_(st);
    var clock = '';
    if (h) {
      // Show the RAW bucket Shopify sent and how we read it, so the hour columns can be verified
      // against the store's own admin rather than taken on trust.
      var hc = qlCol_(h.names, function (s) { return s.indexOf('hour') !== -1 || s.indexOf('day') !== -1 || s.indexOf('date') !== -1 || s.indexOf('time') !== -1; });
      var raw = hc ? String(h.rows[0][hc]) : '';
      var offset = /(Z|[+\-]\d{2}:?\d{2})\s*$/.test(raw);
      clock = ' · sample bucket "' + raw + '" → ' + (offset ? 'has an offset, converted into ' + (tz || 'shop time') : 'no offset, read as store-local');
    }
    out.push(cc + ': ✓ daily OK (' + d.rows.length + ' row(s)) · hourly ' + (h ? '✓ OK' : '✗ not available — the time-of-day sections and two matrices will be empty') +
             (tz ? ' · store time zone ' + tz : ' · store time zone UNKNOWN') + clock);
  });
  out.push('');
  out.push('Hours are always reported on each STORE\'s own clock — never your local time and never the spreadsheet\'s.');
  out.push('If a store time zone above looks wrong, fix it in that Shopify admin (Settings → General → Store defaults), not here.');
  Logger.log(out.join('\n'));
  try { SpreadsheetApp.getUi().alert('Shopify access\n\n' + out.join('\n')); } catch (e) {}
  return out;
}

/* What does ShopifyQL actually return for one store-year? */
function debugTraction(code, year) {
  var st = null;
  CONFIG.STORES.forEach(function (s) { if (canonCountry_(s.code) === canonCountry_(code || 'USA')) st = s; });
  if (!st) { Logger.log('No store configured for ' + code); return; }
  year = year || Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  var d = qlDaily_(st, year);
  Logger.log(st.code + ' ' + year + ' daily: ' + (d ? Object.keys(d).length + ' day(s), first = ' + JSON.stringify(d[Object.keys(d).sort()[0]]) : 'NULL'));
  var h = qlHourly_(st, year);
  Logger.log(st.code + ' ' + year + ' hourly: ' + (h ? 'source=' + h.source + ', MON weekday grid = ' + JSON.stringify(h.dow[1]) : 'NULL'));
}

/* ================================ HELPERS ================================ */
function getSpreadsheet_() { return SpreadsheetApp.openById(CONFIG.SHEET_ID); }

function getTab_(name, headers) {
  var ss = getSpreadsheet_(), sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers && headers.length) {
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // append any NEW header missing from an existing tab, leaving old columns where they are
      var cur = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(String);
      var missing = headers.filter(function (h) { return cur.indexOf(h) === -1; });
      if (missing.length) sheet.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
  }
  return sheet;
}
function clearSheet_(sheet) {
  sheet.getCharts().forEach(function (ch) { sheet.removeChart(ch); });
  try { sheet.getBandings().forEach(function (bd) { bd.remove(); }); } catch (e) {}
  try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch (e) {}
  sheet.clear();
}
function centerAll_(sh) {
  try {
    var lr = sh.getLastRow(), lc = sh.getLastColumn();
    if (lr > 0 && lc > 0) sh.getRange(1, 1, lr, lc).setHorizontalAlignment('center').setVerticalAlignment('middle');
  } catch (e) {}
}
function colLetter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m - 1) / 26); } return s; }
function indexMap_(headerRow) { var m = {}; headerRow.forEach(function (h, i) { m[String(h).trim()] = i; }); return m; }
var _tz = null;
function sheetTz_() {
  if (_tz) return _tz;
  try { _tz = getSpreadsheet_().getSpreadsheetTimeZone(); } catch (e) { _tz = Session.getScriptTimeZone(); }
  return _tz || 'UTC';
}
function num_(v) { if (v === '' || v == null) return 0; var n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
/* num_ strips to digits, so a stored -1 (the "no weekday" marker on MON-grain rows) survives. */
function numSigned_(v) { if (v === '' || v == null) return 0; var n = Number(v); return isNaN(n) ? num_(v) : n; }
function round2_(n) { n = Number(n); return isNaN(n) ? '' : Math.round(n * 100) / 100; }
function round4_(n) { n = Number(n); return isNaN(n) ? '' : Math.round(n * 10000) / 10000; }
function pad2_(n) { n = Number(n); return (n < 10 ? '0' : '') + n; }
function isLeap_(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
function dayOfYear_(dt) { return Math.floor((dt - new Date(dt.getFullYear(), 0, 0)) / 86400000); }
/* ISO-8601 week number — weeks start Monday, week 1 is the one containing the first Thursday. */
function isoWeek_(dt) {
  var d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  var thursday = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - thursday) / 86400000 - 3 + ((thursday.getDay() + 6) % 7)) / 7);
}
function addCommas_(n) {
  var s = String(n), p = s.split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return p.join('.');
}
function pct1_(v) { return (Math.round(v * 1000) / 10) + '%'; }
function signed_(v) { return (v > 0 ? '+' : '') + v; }
function signed1_(v) { var x = Math.round(v * 10) / 10; return (x > 0 ? '+' : '') + x; }
