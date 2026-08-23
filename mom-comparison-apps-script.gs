/**
 * ============================================================================
 *  BACKDROPSOURCE — MoM / YoY COMPARISON VIEW   (standalone Google Apps Script)
 * ============================================================================
 *  A dedicated workbook that compares EVERY MONTH of one year against the same
 *  month of another — Jan-2025 vs Jan-2026, Feb vs Feb, … — for Revenue, CRR,
 *  AOV, Orders and Returns, with growth $ and growth %, plus 9 charts.
 *
 *  Self-contained: it does NOT need the Ad Budget Tracker. It talks to Shopify
 *  directly and keeps its own tabs.
 *
 *  DATA SOURCE — Shopify's own analytics engine (ShopifyQL), so every figure
 *  ties to Shopify Analytics to the cent and FULL HISTORY is available:
 *      FROM sales SHOW total_sales, orders, average_order_value, returns GROUP BY month
 *      FROM sales SHOW customers GROUP BY month, new_or_returning_customer
 *  Two queries per store-year — fast, no order pagination.
 *
 *  TABS IT CREATES
 *      ONE TAB PER COUNTRY — "USA", "UK", "CA", "FR", "NZ", "AUS", "IN", "UAE"
 *                          (names come from CONFIG.TAB_NAMES, so they match the
 *                          tabs you already use). Each tab is a full report:
 *                          the 13-column table + 9 charts. Row 1 has two dropdowns
 *                          (Base year / Compare year) — change one and that tab redraws.
 *      "MoM Data"        — the raw monthly figures behind them all, one upserted
 *                          row per Country x Year x Month (your audit trail). Holds
 *                          BOTH the local-currency figures and their USD equivalents.
 *      "FX Rates"        — the rates used for that conversion; column C is yours to
 *                          type into and always wins.
 *
 *  CURRENCY — every report tab is in ONE currency (CONFIG.REPORT_CURRENCY = USD) so
 *  the countries can be read side by side. Conversion happens on READ, so changing a
 *  rate + rebuilding is enough — no re-pull. The LOCAL figures on "MoM Data" are the
 *  ones that tie to each Shopify admin to the cent; the USD ones use a single rate per
 *  currency and will sit a few % from Shopify's own USD display. That gap is FX, not error.
 *
 *  DEFINITIONS (also printed on the tab, so nobody has to guess)
 *      Revenue = Shopify "Total sales" — ALREADY net of discounts, returns and
 *                cancellations.  Gross = Revenue + Returns.
 *      AOV     = Shopify's own average_order_value (NOT Revenue / Orders —
 *                Shopify's AOV numerator is gross-of-returns, so they differ).
 *      CRR     = repeat / (new + repeat) customers = Shopify's "Returning
 *                customer rate".
 *      Returns = Shopify "Returns", shown positive.
 *
 *  SETUP
 *    1. Create a new Google Sheet → copy its ID into CONFIG.SHEET_ID.
 *    2. Extensions > Apps Script → paste this whole file → Save.
 *    3. Fill CONFIG.STORES (copy the credentials straight from your Ad Budget
 *       Tracker — same apps, same values).
 *    4. Each store's Shopify app needs the  read_reports  scope RELEASED
 *       (Dev Dashboard: Scopes → Save → Release a new version; an in-admin
 *       custom app: add the scope → re-install). Without it that store is
 *       skipped and the log says so.
 *    5. Run  setup()  once → menu, dropdown trigger, daily refresh.
 *    6. Menu "📊 Comparison" → "Pull year-over-year data".
 *  No web app, no deployment — nothing here runs from a /exec URL.
 * ============================================================================
 */

var VERSION = 'bds-mom v1';

var CONFIG = {
  SHEET_ID:    'PASTE_NEW_SHEET_ID',     // this workbook's id (the long string in its URL)
  TAB_PREFIX:  '',                       // leave '' for a dedicated sheet; set 'BDS ' if you paste this into an existing workbook so it can never collide with your tabs
  API_VERSION: '2025-10',
  YEARS:       [],                       // which years to pull. [] = last year + this year. e.g. [2024, 2025, 2026]

  // Country code → the TAB NAME to use for it, so the tabs match the ones you already have.
  // A country with no entry here just uses its code. Tabs are created in this order.
  TAB_NAMES: { USA: 'USA', UK: 'UK', CA: 'CA', FR: 'FR', NZ: 'NZ', AU: 'AUS', IN: 'IN', UAE: 'UAE' },
  BUILD_ALL_TAB: false,                  // true = ALSO build a combined "ALL" tab totalling every store
  GREEN_RULE: 'top3',                    // which month rows get the green band: 'top3' (biggest growth %), 'last3' (three most recent), 'none'

  REPORT_CURRENCY: 'USD',                // EVERY report tab is shown in this currency; local figures stay on the "MoM Data" tab
  FX: { USD: 1, CAD: 0.73, GBP: 1.27, AUD: 0.66, NZD: 0.60, EUR: 1.08, INR: 0.012, SGD: 0.74, AED: 0.27 },   // 1 local unit → USD (fallbacks; refreshFxRates() overwrites with live rates)
  FX_PINNED: {},                         // e.g. { GBP: 1.301 } to force a rate. Anything typed on the FX Rates tab beats even this.

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
    { code: 'FR',  domain: 'backdropsourcefrance.myshopify.com', token: '', clientId: 'PASTE_FR_CLIENT_ID',  clientSecret: 'PASTE_FR_CLIENT_SECRET' },
    { code: 'ES',  domain: 'backdropsource-spain.myshopify.com', token: '', clientId: 'PASTE_ES_CLIENT_ID',  clientSecret: 'PASTE_ES_CLIENT_SECRET' },
    { code: 'DE',  domain: 'backdropsourcegermany.myshopify.com', token: '', clientId: 'PASTE_DE_CLIENT_ID',  clientSecret: 'PASTE_DE_CLIENT_SECRET' },
    { code: 'IN',  domain: 'PASTE_IN_STORE.myshopify.com',      token: '', clientId: 'PASTE_IN_CLIENT_ID',  clientSecret: 'PASTE_IN_CLIENT_SECRET' },
    { code: 'UAE', domain: 'PASTE_UAE_STORE.myshopify.com',     token: '', clientId: 'PASTE_UAE_CLIENT_ID', clientSecret: 'PASTE_UAE_CLIENT_SECRET' }
  ]
};

var TAB = {
  DATA: CONFIG.TAB_PREFIX + 'MoM Data',
  FX:   CONFIG.TAB_PREFIX + 'FX Rates'
};
// Country code → its report tab name (CONFIG.TAB_NAMES, falling back to the code itself).
function viewTabName_(cc) { return CONFIG.TAB_PREFIX + ((CONFIG.TAB_NAMES && CONFIG.TAB_NAMES[cc]) || cc); }

var COUNTRY_CFG = {
  USA: { currency: 'USD' }, CA: { currency: 'CAD' }, UK: { currency: 'GBP' },
  AU:  { currency: 'AUD' }, NZ: { currency: 'NZD' }, UAE: { currency: 'AED' },
  FR:  { currency: 'EUR' }, IN: { currency: 'INR' }
};
// Fold feed variants into the one canonical code (US → USA, GB → UK, AE → UAE).
var COUNTRY_ALIAS = { US: 'USA', USA: 'USA', GB: 'UK', UK: 'UK', AE: 'UAE', UAE: 'UAE', CA: 'CA', AU: 'AU', NZ: 'NZ' };
function canonCountry_(v) { var cc = String(v == null ? '' : v).trim().toUpperCase(); return COUNTRY_ALIAS[cc] || cc; }

// Revenue / AOV / Returns are stored in the store's LOCAL currency (that's the figure that ties to
// Shopify to the cent), with the USD equivalents alongside so the raw tab reads in USD too.
var MOM_HEADERS = ['Country', 'Year', 'Month', 'Month Name', 'Revenue', 'Orders', 'AOV', 'Returns', 'New Customers', 'Repeat Customers', 'CRR', 'Currency',
                   'Revenue (USD)', 'AOV (USD)', 'Returns (USD)', 'FX → USD', 'Updated At'];
var MON_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

var HEADER_BG = '#1B2D55', HEADER_FG = '#FFFFFF', SUBHEAD_BG = '#CFE0F5';
var TITLE_BG = '#F8CBAD', HDR_BG = '#ED7D31', Y1_BG = '#FFFF00', Y2_BG = '#F4B183';
var GREEN = '#00E000', BLUE = '#4472C4', ORANGE = '#ED7D31', RED = '#C00000';
var COUNTRY_BG = { USA: '#D6E4F7', CA: '#FADBD8', UK: '#E8D9FB', AU: '#D6EEDC', NZ: '#FCE9C9', UAE: '#E4D7CF', FR: '#E3F0D4', IN: '#FDE3CC' };

/* ========================= MENU · SETUP · TRIGGERS ======================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📊 Comparison')
    .addItem('Pull year-over-year data (Shopify)', 'menuPull')
    .addItem('Rebuild ALL country tabs (no re-pull)', 'menuBuild')
    .addItem('Rebuild THIS tab only', 'menuBuildThis')
    .addSeparator()
    .addItem('Refresh FX rates (→ ' + CONFIG.REPORT_CURRENCY + ')', 'menuFx')
    .addItem('Check Shopify access for every store', 'checkAccess')
    .addToUi();
}
function menuPull()  { pullMoM(); buildAllViews(); }
function menuBuild() { buildAllViews(); }
function menuFx()    { refreshFxRates(); buildAllViews(); }
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
    if (['jobPullMoM', 'onMoMEdit'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('jobPullMoM').timeBased().everyDays(1).atHour(6).nearMinute(30).create();   // hour is in the PROJECT time zone (Project Settings ⚙ → Time zone)
  ScriptApp.newTrigger('onMoMEdit').forSpreadsheet(CONFIG.SHEET_ID).onEdit().create();
  getTab_(TAB.DATA, MOM_HEADERS);
  try { refreshFxRates(); } catch (e) { Logger.log('refreshFxRates: ' + e); }
  pullMoM();
  buildAllViews();
  Logger.log('Setup complete. Daily refresh ~6:30 AM (project time zone). Reload the sheet to see the 📊 Comparison menu.');
}

function jobPullMoM() {
  try { pullMoM(); }        catch (e) { Logger.log('pullMoM: ' + e); }
  try { buildAllViews(); }  catch (e) { Logger.log('buildAllViews: ' + e); }
}

/* Row 1 of every country tab holds Base year (B1) and Compare year (D1) →
   changing either rebuilds ONLY that tab, so each country can sit on its own year pair. */
function onMoMEdit(e) {
  try {
    var rng = e.range, cc = countryOfTab_(rng.getSheet().getName());
    if (!cc) return;
    if (rng.getRow() === 1 && [2, 4].indexOf(rng.getColumn()) !== -1) buildCountryView(cc);
  } catch (err) { Logger.log('onEdit: ' + err); }
}

/* Tab name → country code, or '' if that tab isn't one of ours. */
function countryOfTab_(name) {
  var hit = '';
  momCountries_().forEach(function (cc) { if (viewTabName_(cc) === name) hit = cc; });
  if (!hit && CONFIG.BUILD_ALL_TAB && name === CONFIG.TAB_PREFIX + 'ALL') hit = 'ALL';
  return hit;
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
function shopifyQLTable_(st, ql) {
  var gql = 'query($q:String!){shopifyqlQuery(query:$q){parseErrors tableData{rows columns{name dataType displayName}}}}';
  var res = shopifyGraphQL_(st, gql, { q: ql });
  var sq = res && res.data && res.data.shopifyqlQuery;
  if (!sq) { Logger.log(st.code + ' QL: no response — ' + JSON.stringify((res && res.errors) || res).slice(0, 220)); return null; }
  var pe = qlErr_(sq.parseErrors);
  if (pe) { Logger.log(st.code + ' QL parseErrors: ' + pe.slice(0, 200) + '   [' + ql + ']'); return null; }
  var td = sq.tableData, raw = td && (td.rows || td.rowData);
  if (!td || !raw || !raw.length) { Logger.log(st.code + ' QL: no rows   [' + ql + ']'); return null; }
  var names = (td.columns || []).map(function (c) { return String(c.name || ''); });
  var rows = raw.map(function (r) {
    if (!r) return null;
    if (r instanceof Array) { var o = {}; names.forEach(function (n, i) { o[n] = r[i]; }); return o; }
    return r;
  }).filter(Boolean);
  return { names: names, rows: rows };
}
function qlCol_(names, test) { for (var i = 0; i < names.length; i++) if (test(String(names[i]).toLowerCase())) return names[i]; return null; }
function monthKeyOf_(v) { var m = String(v == null ? '' : v).match(/(\d{4})-(\d{2})/); return m ? (m[1] + '-' + m[2]) : ''; }

/* A whole calendar year, capped at today for the current year (never queries the future). */
function momYearRange_(year) {
  var tz = sheetTz_(), today = new Date(), ty = Number(Utilities.formatDate(today, tz, 'yyyy'));
  if (year > ty) return null;
  return { since: year + '-01-01', until: (year === ty) ? Utilities.formatDate(today, tz, 'yyyy-MM-dd') : (year + '-12-31') };
}

/* Monthly Revenue / Orders / AOV / Returns for one store-year → { 'yyyy-MM': {...} } or null.
   Measures are requested richest-first and degrade in four steps, so a store whose schema
   doesn't expose average_order_value or returns still returns revenue + orders. */
function shopifyQLMonthlySales_(st, year) {
  var rng = momYearRange_(year); if (!rng) return null;
  var sets = ['total_sales, orders, average_order_value, returns', 'total_sales, orders, returns', 'total_sales, orders', 'total_sales'];
  for (var i = 0; i < sets.length; i++) {
    var ql = 'FROM sales SHOW ' + sets[i] + ' GROUP BY month SINCE ' + rng.since + ' UNTIL ' + rng.until + ' ORDER BY month';
    var t = shopifyQLTable_(st, ql);
    if (!t) continue;
    var n = t.names;
    var cMon = qlCol_(n, function (s) { return s === 'month' || s.indexOf('month') !== -1 || s.indexOf('date') !== -1; });
    var cRev = qlCol_(n, function (s) { return s.indexOf('total_sales') !== -1; }) || qlCol_(n, function (s) { return s.indexOf('sales') !== -1; });
    var cOrd = qlCol_(n, function (s) { return s === 'orders'; }) ||
               qlCol_(n, function (s) { return s.indexOf('order') !== -1 && s.indexOf('value') === -1 && s.indexOf('average') === -1; });
    var cAov = qlCol_(n, function (s) { return s.indexOf('average_order') !== -1 || s === 'aov'; });
    var cRet = qlCol_(n, function (s) { return s.indexOf('return') !== -1; });
    if (!cMon || !cRev) continue;
    var map = {}, got = 0;
    t.rows.forEach(function (r) {
      var mk = monthKeyOf_(r[cMon]); if (!mk) return;
      var rev = num_(r[cRev]), ord = cOrd ? num_(r[cOrd]) : 0, ret = cRet ? Math.abs(num_(r[cRet])) : 0;
      map[mk] = { rev: rev, orders: ord, ret: ret, aov: cAov ? num_(r[cAov]) : (ord ? rev / ord : 0) };
      got++;
    });
    if (got) { if (i > 0) Logger.log(st.code + ' ' + year + ': fell back to measure set "' + sets[i] + '"'); return map; }
  }
  return null;
}

/* Monthly NEW vs REPEAT customers → { 'yyyy-MM': {newC, retC} } or null.
   Same dimension Shopify Analytics uses for "Returning customer rate". */
function shopifyQLMonthlyCustomers_(st, year) {
  var rng = momYearRange_(year); if (!rng) return null;
  var ql = 'FROM sales SHOW customers GROUP BY month, new_or_returning_customer SINCE ' + rng.since + ' UNTIL ' + rng.until;
  var t = shopifyQLTable_(st, ql); if (!t) return null;
  var n = t.names;
  var cMon = qlCol_(n, function (s) { return s === 'month' || s.indexOf('month') !== -1 || s.indexOf('date') !== -1; });
  var cTyp = qlCol_(n, function (s) { return s.indexOf('return') !== -1 || s.indexOf('new_or') !== -1; });   // the DIMENSION — matched before the "customers" MEASURE, which also contains "customer"
  var cCus = qlCol_(n, function (s) { return s.indexOf('customer') !== -1 && s !== cTyp; });
  if (!cMon || !cCus) { Logger.log(st.code + ' QL customers: unexpected columns ' + JSON.stringify(n)); return null; }
  var map = {};
  t.rows.forEach(function (r) {
    var mk = monthKeyOf_(r[cMon]); if (!mk) return;
    var m = map[mk] || (map[mk] = { newC: 0, retC: 0 });
    var typ = String((cTyp ? r[cTyp] : '') || '').toLowerCase(), v = num_(r[cCus]);
    if (typ.indexOf('return') !== -1 || typ.indexOf('repeat') !== -1) m.retC += v; else m.newC += v;
  });
  return map;
}

/* Pull every configured store for the given years (default: last year + this year)
   and upsert into "MoM Data". 2 ShopifyQL calls per store-year — cheap enough to
   re-run whenever you like; it corrects rows rather than duplicating them. */
function pullMoM(codes, years) {
  var ty = Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  years = (years && years.length) ? years : ((CONFIG.YEARS && CONFIG.YEARS.length) ? CONFIG.YEARS : [ty - 1, ty]);
  var recs = [], skipped = [];
  CONFIG.STORES.forEach(function (st) {
    var cc = canonCountry_(st.code);
    if (codes && codes.length && codes.indexOf(cc) === -1) return;
    if (String(st.domain || '').indexOf('PASTE_') === 0) { skipped.push(cc + ' (store not configured)'); return; }
    var ccy = (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || CONFIG.REPORT_CURRENCY;
    years.forEach(function (y) {
      var sales = shopifyQLMonthlySales_(st, y);
      if (!sales) { skipped.push(cc + ' ' + y + ' (no ShopifyQL — release read_reports on this store\'s app)'); return; }
      var cust = shopifyQLMonthlyCustomers_(st, y) || {};
      Object.keys(sales).sort().forEach(function (mk) {
        var s = sales[mk], c = cust[mk] || { newC: 0, retC: 0 }, tot = c.newC + c.retC;
        recs.push({ cc: cc, y: Number(mk.split('-')[0]), m: Number(mk.split('-')[1]), rev: s.rev, orders: s.orders,
                    aov: s.aov, ret: s.ret, newC: c.newC, retC: c.retC, crr: tot ? c.retC / tot : '', ccy: ccy });
      });
      Logger.log(cc + ' ' + y + ': ' + Object.keys(sales).length + ' month(s) pulled.');
    });
  });
  upsertMoM_(recs);
  if (skipped.length) Logger.log('Skipped → ' + skipped.join(' · '));
  Logger.log('Pull complete: ' + recs.length + ' month-row(s).');
  return recs.length;
}

/* ============================ RAW TAB (MoM Data) ========================= */

/* Upsert on Country|Year|Month — a re-pull corrects, never duplicates. */
function upsertMoM_(recs) {
  if (!recs || !recs.length) return 0;
  var sh = getTab_(TAB.DATA, MOM_HEADERS);
  var lr = sh.getLastRow(), lc = Math.max(sh.getLastColumn(), MOM_HEADERS.length);
  var vals = (lr > 0) ? sh.getRange(1, 1, lr, lc).getValues() : [MOM_HEADERS.slice()];
  var hdr = vals[0].map(String), ix = indexMap_(hdr), idx = {};
  for (var r = 1; r < vals.length; r++) idx[String(vals[r][ix['Country']]) + '|' + num_(vals[r][ix['Year']]) + '|' + num_(vals[r][ix['Month']])] = r;
  var stamp = Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd HH:mm');
  function put(row, name, v) { if (ix[name] != null) row[ix[name]] = v; }
  recs.forEach(function (x) {
    var key = x.cc + '|' + x.y + '|' + x.m, row = (idx[key] != null) ? vals[idx[key]] : null;
    if (!row) { row = []; for (var i = 0; i < hdr.length; i++) row.push(''); vals.push(row); idx[key] = vals.length - 1; }
    put(row, 'Country', x.cc); put(row, 'Year', x.y); put(row, 'Month', x.m); put(row, 'Month Name', MON3[x.m - 1] || '');
    put(row, 'Revenue', round2_(x.rev)); put(row, 'Orders', x.orders); put(row, 'AOV', round2_(x.aov)); put(row, 'Returns', round2_(x.ret));
    put(row, 'New Customers', x.newC); put(row, 'Repeat Customers', x.retC); put(row, 'CRR', x.crr === '' ? '' : round4_(x.crr));
    put(row, 'Currency', x.ccy);
    var rate = fxToUSD_(1, x.ccy);
    put(row, 'Revenue (USD)', round2_(x.rev * rate)); put(row, 'AOV (USD)', round2_(x.aov * rate));
    put(row, 'Returns (USD)', round2_(x.ret * rate)); put(row, 'FX → USD', round4_(rate));
    put(row, 'Updated At', stamp);
  });
  var body = vals.slice(1).sort(function (a, b) {
    var ca = String(a[ix['Country']]), cb = String(b[ix['Country']]);
    if (ca !== cb) return ca < cb ? -1 : 1;
    if (num_(a[ix['Year']]) !== num_(b[ix['Year']])) return num_(a[ix['Year']]) - num_(b[ix['Year']]);
    return num_(a[ix['Month']]) - num_(b[ix['Month']]);
  });
  sh.getRange(1, 1, body.length + 1, hdr.length).setValues([hdr].concat(body));
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, hdr.length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  if (body.length) {
    ['Revenue', 'AOV', 'Returns', 'Revenue (USD)', 'AOV (USD)', 'Returns (USD)'].forEach(function (h) { if (ix[h] != null) sh.getRange(2, ix[h] + 1, body.length, 1).setNumberFormat('#,##0.00'); });
    if (ix['CRR'] != null) sh.getRange(2, ix['CRR'] + 1, body.length, 1).setNumberFormat('0.00%');
    if (ix['FX → USD'] != null) sh.getRange(2, ix['FX → USD'] + 1, body.length, 1).setNumberFormat('0.0000');
    ['Revenue (USD)', 'AOV (USD)', 'Returns (USD)', 'FX → USD'].forEach(function (h) {   // tint the converted block so it reads as derived, not source
      if (ix[h] != null) sh.getRange(2, ix[h] + 1, body.length, 1).setBackground('#EAF1FB');
    });
    var ci = ix['Country'];
    if (ci != null) {
      var L = colLetter_(ci + 1), rng = sh.getRange(L + '2:' + L);
      try {
        sh.setConditionalFormatRules(Object.keys(COUNTRY_BG).map(function (code) {
          return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(code).setBackground(COUNTRY_BG[code]).setRanges([rng]).build();
        }));
      } catch (e) {}
    }
  }
  centerAll_(sh);
  return recs.length;
}

/* Recompute the raw tab's USD columns from the CURRENT rates, without re-pulling Shopify.
   Local values are the source of truth; these are derived, so they must never go stale. */
function refreshUsdColumns_() {
  var sh = getTab_(TAB.DATA, MOM_HEADERS), lr = sh.getLastRow();
  if (lr < 2) return 0;
  var vals = sh.getRange(1, 1, lr, sh.getLastColumn()).getValues(), ix = indexMap_(vals[0].map(String));
  if (ix['Revenue (USD)'] == null) return 0;
  var n = lr - 1, cols = { 'Revenue (USD)': [], 'AOV (USD)': [], 'Returns (USD)': [], 'FX → USD': [] };
  for (var r = 1; r < vals.length; r++) {
    var v = vals[r], rate = fxToUSD_(1, String(v[ix['Currency']] || CONFIG.REPORT_CURRENCY));
    cols['Revenue (USD)'].push([round2_(num_(v[ix['Revenue']]) * rate)]);
    cols['AOV (USD)'].push([round2_(num_(v[ix['AOV']]) * rate)]);
    cols['Returns (USD)'].push([round2_(num_(v[ix['Returns']]) * rate)]);
    cols['FX → USD'].push([round4_(rate)]);
  }
  Object.keys(cols).forEach(function (h) { if (ix[h] != null) sh.getRange(2, ix[h] + 1, n, 1).setValues(cols[h]); });
  return n;
}

/* Raw tab → { COUNTRY: { YEAR: { MONTH: {...} } } } */
function readMoM_() {
  var sh = getTab_(TAB.DATA, MOM_HEADERS), out = {};
  if (sh.getLastRow() < 2) return out;
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), ix = indexMap_(vals[0].map(String));
  for (var r = 1; r < vals.length; r++) {
    var v = vals[r], cc = canonCountry_(v[ix['Country']]), y = num_(v[ix['Year']]), m = num_(v[ix['Month']]);
    if (!cc || !y || !m) continue;
    var byY = out[cc] || (out[cc] = {}), byM = byY[y] || (byY[y] = {});
    byM[m] = { rev: num_(v[ix['Revenue']]), orders: num_(v[ix['Orders']]), aov: num_(v[ix['AOV']]), ret: num_(v[ix['Returns']]),
               newC: num_(v[ix['New Customers']]), retC: num_(v[ix['Repeat Customers']]),
               ccy: String(v[ix['Currency']] || CONFIG.REPORT_CURRENCY) };
  }
  return out;
}

function momCountries_() {
  return CONFIG.STORES.map(function (s) { return canonCountry_(s.code); }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
}

/* One country (or ALL) for one year → { 1..12: metrics }, ALWAYS converted to
   CONFIG.REPORT_CURRENCY (USD) so every tab is directly comparable. The raw tab keeps
   the local figures, and the conversion happens here on READ — so editing a rate on the
   FX Rates tab and rebuilding is enough, no re-pull needed. */
function momSeries_(all, country, year) {
  var allC = (country === 'ALL'), out = {};
  Object.keys(all).forEach(function (cc) {
    if (!allC && cc !== country) return;
    var byM = all[cc] && all[cc][year]; if (!byM) return;
    Object.keys(byM).forEach(function (mk) {
      var s = byM[mk], m = Number(mk), f = fxToUSD_(1, s.ccy);
      var o = out[m] || (out[m] = { rev: 0, orders: 0, ret: 0, newC: 0, retC: 0, aovNum: 0 });
      o.rev += s.rev * f; o.ret += s.ret * f; o.orders += s.orders;
      o.aovNum += s.aov * s.orders * f;                    // weighted, so a rolled-up AOV is still Shopify's AOV
      o.newC += s.newC; o.retC += s.retC;
    });
  });
  Object.keys(out).forEach(function (m) {
    var o = out[m];
    o.aov = o.orders ? o.aovNum / o.orders : 0;
    o.crr = (o.newC + o.retC) ? o.retC / (o.newC + o.retC) : '';
  });
  return out;
}
function momHas_(o) { return !!(o && (o.rev || o.orders || o.ret)); }
function momSum_(series, months) {
  var t = { rev: 0, orders: 0, ret: 0, newC: 0, retC: 0, aovNum: 0 };
  months.forEach(function (m) {
    var o = series[m]; if (!o) return;
    t.rev += o.rev; t.orders += o.orders; t.ret += o.ret; t.newC += o.newC; t.retC += o.retC; t.aovNum += o.aovNum;
  });
  t.aov = t.orders ? t.aovNum / t.orders : 0;
  t.crr = (t.newC + t.retC) ? t.retC / (t.newC + t.retC) : '';
  return t;
}

/* ========================== THE COMPARISON VIEW ========================== */

/* Build every country tab (plus the combined ALL tab when CONFIG.BUILD_ALL_TAB is on),
   in CONFIG.TAB_NAMES order, and leave the tabs in that order in the workbook. */
function buildAllViews() {
  var ss = getSpreadsheet_(), list = momCountries_();
  try { refreshUsdColumns_(); } catch (e) { Logger.log('refreshUsdColumns: ' + e); }   // so an edited FX rate shows up on the raw tab as well as in the reports
  if (CONFIG.BUILD_ALL_TAB) list = list.concat(['ALL']);
  list.forEach(function (cc, i) {
    try {
      var sh = buildCountryView(cc);
      ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1);          // keep the tab strip in a stable order
    } catch (e) { Logger.log('buildCountryView ' + cc + ': ' + e); }
  });
  Logger.log('Built ' + list.length + ' tab(s): ' + list.join(', '));
}

/* Read the two year cells BEFORE the tab is cleared, so each tab keeps its own choice. */
function readViewControls_(sh) {
  var ty = Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  var def = { yA: ty - 1, yB: ty };
  try {
    if (sh && sh.getLastRow() >= 1) {
      var v = sh.getRange(1, 1, 1, 4).getValues()[0], a = num_(v[1]), b = num_(v[3]);
      if (a >= 2000 && a < 2100) def.yA = a;
      if (b >= 2000 && b < 2100) def.yB = b;
    }
  } catch (e) {}
  return def;
}

/* Which month rows get the green band. Deliberately a rule, not hand-picked, so it
   stays right after every refresh — switch it with CONFIG.GREEN_RULE. */
function greenMonths_(monthsBoth, monthsWithB, growth) {
  var mode = String(CONFIG.GREEN_RULE || 'top3').toLowerCase();
  if (mode === 'none') return [];
  if (mode === 'last3') return monthsWithB.slice(-3);
  return monthsBoth.slice().sort(function (a, b) {
    var ga = (growth[a] == null ? -1e12 : growth[a]), gb = (growth[b] == null ? -1e12 : growth[b]);
    return gb - ga;
  }).slice(0, 3);                                                  // 'top3' = the three biggest growth-% months
}

/* Build ONE country's report tab. `cc` is a store code, or 'ALL' for the combined USD tab. */
function buildCountryView(cc) {
  var ss = getSpreadsheet_(), tabName = (cc === 'ALL') ? (CONFIG.TAB_PREFIX + 'ALL') : viewTabName_(cc);
  var sh = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  var ctl = readViewControls_(sh), all = readMoM_();
  var yA = ctl.yA, yB = ctl.yB, country = cc;
  var sA = momSeries_(all, country, yA), sB = momSeries_(all, country, yB);
  var ccy = CONFIG.REPORT_CURRENCY;                        // every tab reports in ONE currency (USD) so countries compare directly
  var localCcy = (COUNTRY_CFG[country] && COUNTRY_CFG[country].currency) || '';

  clearSheet_(sh);
  // Release any frozen pane BEFORE merging — Sheets refuses a merge that a freeze line would cut,
  // and vice versa. Frozen rows are re-applied once the header merges exist.
  try { sh.setFrozenRows(0); sh.setFrozenColumns(0); } catch (e) {}

  var NC = 13;                            // Month | Revenue x4 | CRR x2 | AOV x2 | Orders x2 | Returns x2
  var R_CTL = 1, R_TITLE = 2, R_G = 3, R_H = 4, R_M0 = 5, R_TOT = R_M0 + 12, R_LFL = R_TOT + 1, R_NOTE = R_LFL + 1;

  /* --- row 1: the two year controls (the tab itself is the country) --- */
  sh.getRange(R_CTL, 1, 1, 4).setValues([['Base year', yA, 'Compare year', yB]]);
  [1, 3].forEach(function (c) { sh.getRange(R_CTL, c).setFontWeight('bold'); });
  var yrs = [], tyNow = Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  for (var y = tyNow; y >= tyNow - 6; y--) yrs.push(y);
  [2, 4].forEach(function (c) {
    sh.getRange(R_CTL, c).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(yrs, true).build())
      .setBackground('#FFF2CC').setFontWeight('bold');
  });
  sh.getRange(R_CTL, 5, 1, NC - 4).merge().setValue('◀ change either yellow cell — this tab\'s table and charts rebuild automatically')
    .setFontStyle('italic').setFontColor('#666666').setHorizontalAlignment('left');

  /* --- row 2: title --- */
  sh.getRange(R_TITLE, 1, 1, NC).merge()
    .setValue('Comparison View — ' + (country === 'ALL' ? 'ALL COUNTRIES' : tabName) + '  ·  ' + yA + ' vs ' + yB + '  (' + ccy + ')')
    .setBackground(TITLE_BG).setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sh.setRowHeight(R_TITLE, 30);

  /* --- rows 3-4: two-row grouped header --- */
  sh.getRange(R_G, 1, 2, 1).merge().setValue('Month');
  [['Revenue (' + ccy + ')', 2, 4], ['CRR (%)', 6, 2], ['AOV (' + ccy + ')', 8, 2], ['Total No. of Orders', 10, 2], ['Returns (' + ccy + ')', 12, 2]]
    .forEach(function (g) { sh.getRange(R_G, g[1], 1, g[2]).merge().setValue(g[0]); });
  sh.getRange(R_G, 1, 1, NC).setBackground(HDR_BG).setFontWeight('bold').setFontSize(12);
  sh.getRange(R_H, 2, 1, NC - 1).setValues([[yA + ' Value', yB + ' Value', 'Growth Amount', 'Growth %', yA, yB, yA, yB, yA, yB, yA, yB]]).setFontWeight('bold');
  [2, 6, 8, 10, 12].forEach(function (c) { sh.getRange(R_H, c).setBackground(Y1_BG); });
  [3, 7, 9, 11, 13].forEach(function (c) { sh.getRange(R_H, c).setBackground(Y2_BG); });
  sh.getRange(R_H, 4).setBackground(HDR_BG); sh.getRange(R_H, 5).setBackground(Y1_BG);
  sh.getRange(R_G, 1, 2, NC).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(R_G, 26); sh.setRowHeight(R_H, 26);
  sh.setFrozenRows(R_H);
  // NOTE: do NOT freeze column 1 — the title in row 2 is merged across all 13 columns, and Sheets
  // refuses to freeze a column that would cut a merged cell in half ("you can't freeze columns which
  // contain only part of a merged cell"). That exception used to abort the build, leaving an empty tab.

  /* --- rows 5-16: one row per month --- */
  var rows = [], monthsWithB = [], monthsBoth = [], growth = {}, lastMonth = 0;
  for (var m = 1; m <= 12; m++) {
    var a = sA[m], b = sB[m], hasA = momHas_(a), hasB = momHas_(b);
    if (hasA || hasB) lastMonth = m;
    if (hasB) monthsWithB.push(m);
    if (hasA && hasB) monthsBoth.push(m);
    var gAmt = (hasA && hasB) ? (b.rev - a.rev) : '';
    var gPct = (hasA && hasB && a.rev) ? ((b.rev - a.rev) / a.rev) : '';
    if (gPct !== '') growth[m] = gPct;
    rows.push([MON_FULL[m - 1],
      hasA ? round2_(a.rev) : '', hasB ? round2_(b.rev) : '', gAmt === '' ? '' : round2_(gAmt), gPct === '' ? '' : round4_(gPct),
      hasA ? a.crr : '',          hasB ? b.crr : '',
      hasA ? round2_(a.aov) : '', hasB ? round2_(b.aov) : '',
      hasA ? a.orders : '',       hasB ? b.orders : '',
      hasA ? round2_(a.ret) : '', hasB ? round2_(b.ret) : '']);
  }
  sh.getRange(R_M0, 1, 12, NC).setValues(rows);

  /* --- row 17: each year's own total · row 18: like-for-like (months BOTH years have) --- */
  var monthsA = [], monthsB = [];
  for (var mm = 1; mm <= 12; mm++) { if (momHas_(sA[mm])) monthsA.push(mm); if (momHas_(sB[mm])) monthsB.push(mm); }
  var tA = momSum_(sA, monthsA), tB = momSum_(sB, monthsB);
  var lA = momSum_(sA, monthsBoth), lB = momSum_(sB, monthsBoth);
  function totRow(label, a, b, showGrowth) {
    var gA = (showGrowth && a.rev) ? round2_(b.rev - a.rev) : '', gP = (showGrowth && a.rev) ? round4_((b.rev - a.rev) / a.rev) : '';
    return [label, round2_(a.rev), round2_(b.rev), gA, gP, a.crr, b.crr, round2_(a.aov), round2_(b.aov), a.orders, b.orders, round2_(a.ret), round2_(b.ret)];
  }
  var lflLabel = monthsBoth.length ? ('Like-for-like ' + MON3[monthsBoth[0] - 1] + '–' + MON3[monthsBoth[monthsBoth.length - 1] - 1]) : 'Like-for-like';
  sh.getRange(R_TOT, 1, 2, NC).setValues([totRow('Total', tA, tB, false), totRow(lflLabel, lA, lB, true)]);
  sh.getRange(R_TOT, 1, 1, NC).setFontWeight('bold').setBackground('#D9D9D9');
  sh.getRange(R_LFL, 1, 1, NC).setFontWeight('bold').setBackground(Y1_BG);

  /* --- number formats + highlighting --- */
  var nRows = 14;                                                    // 12 months + Total + like-for-like
  sh.getRange(R_M0,  2, nRows, 3).setNumberFormat('#,##0.00');        // Revenue Y1 / Y2 / Growth amount
  sh.getRange(R_M0,  5, nRows, 1).setNumberFormat('0.00%');           // Growth %
  sh.getRange(R_M0,  6, nRows, 2).setNumberFormat('0.00%');           // CRR
  sh.getRange(R_M0,  8, nRows, 2).setNumberFormat('#,##0.00');        // AOV
  sh.getRange(R_M0, 10, nRows, 2).setNumberFormat('#,##0');           // Orders
  sh.getRange(R_M0, 12, nRows, 2).setNumberFormat('#,##0.00');        // Returns
  sh.getRange(R_M0, 5, 12, 1).setBackground(Y1_BG);                   // Growth % column stands out
  sh.getRange(R_M0, 1, nRows, NC).setBorder(true, true, true, true, true, true, '#BFBFBF', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(R_G, 1, 2, NC).setBorder(true, true, true, true, true, true, '#7F7F7F', SpreadsheetApp.BorderStyle.SOLID);
  greenMonths_(monthsBoth, monthsWithB, growth).forEach(function (mo) { sh.getRange(R_M0 + mo - 1, 1, 1, NC).setBackground(GREEN); });   // see CONFIG.GREEN_RULE
  sh.getRange(R_M0, 1, 12, 1).setFontWeight('bold');

  /* --- row 19: what the numbers mean --- */
  sh.getRange(R_NOTE, 1, 1, NC).merge().setValue(
    'Source: Shopify Analytics (ShopifyQL), pulled per month. ' +
    'Revenue = "Total sales" (already net of discounts, returns and cancellations; Gross = Revenue + Returns). ' +
    'AOV = Shopify\'s own average order value. CRR = repeat ÷ (new + repeat) customers = Shopify\'s "Returning customer rate". ' +
    '"Total" sums each year\'s own months (' + yB + ' is part-year), so use the yellow like-for-like row for a fair ' + yA + ' vs ' + yB + ' comparison. ' +
    'CURRENCY: shown in ' + ccy + '. ' +
    (localCcy && localCcy !== ccy
      ? 'This store bills in ' + localCcy + ', converted at the rate on the "' + TAB.FX + '" tab (type your own rate in column C to control it exactly). ' +
        'Because one rate is applied to the whole year, the ' + ccy + ' figures will sit a few % away from Shopify\'s own ' + ccy + ' display — ' +
        'the exact, ties-to-the-cent numbers are the ' + localCcy + ' ones on the "' + TAB.DATA + '" tab.'
      : 'This store bills in ' + ccy + ', so these figures tie to Shopify exactly.'))
    .setWrap(true).setFontSize(9).setFontColor('#666666').setHorizontalAlignment('left').setVerticalAlignment('top');
  sh.setRowHeight(R_NOTE, 46);

  /* --- chart source block (kept visible so every chart is traceable) --- */
  var cdHdr = R_NOTE + 2, nM = Math.max(lastMonth, 1);
  sh.getRange(cdHdr, 1, 1, 13).setValues([['Chart data ▾', 'Revenue ' + yA, 'Revenue ' + yB, 'CRR ' + yA, 'CRR ' + yB,
    'AOV ' + yA, 'AOV ' + yB, 'Orders ' + yA, 'Orders ' + yB, 'Returns ' + yA, 'Returns ' + yB, 'Returns % of gross ' + yA, 'Returns % of gross ' + yB]])
    .setBackground(SUBHEAD_BG).setFontWeight('bold').setWrap(true);
  var cd = [];
  function pctRet(o) { if (!momHas_(o)) return ''; var gross = o.rev + o.ret; return gross ? round4_(o.ret / gross) : ''; }
  for (var cm = 1; cm <= nM; cm++) {
    var ca = sA[cm], cb = sB[cm];
    cd.push([MON3[cm - 1],
      momHas_(ca) ? round2_(ca.rev) : '', momHas_(cb) ? round2_(cb.rev) : '',
      momHas_(ca) ? ca.crr : '',          momHas_(cb) ? cb.crr : '',
      momHas_(ca) ? round2_(ca.aov) : '', momHas_(cb) ? round2_(cb.aov) : '',
      momHas_(ca) ? ca.orders : '',       momHas_(cb) ? cb.orders : '',
      momHas_(ca) ? round2_(ca.ret) : '', momHas_(cb) ? round2_(cb.ret) : '',
      pctRet(ca), pctRet(cb)]);
  }
  sh.getRange(cdHdr + 1, 1, cd.length, 13).setValues(cd);
  sh.getRange(cdHdr + 1, 4, cd.length, 2).setNumberFormat('0.00%');
  sh.getRange(cdHdr + 1, 12, cd.length, 2).setNumberFormat('0.00%');
  var cdEnd = cdHdr + cd.length;

  // two small like-for-like totals blocks — the pie and the gross/net stack read from these
  var pieHdr = cdEnd + 2;
  sh.getRange(pieHdr, 1, 3, 3).setValues([['Year', 'Revenue', 'Orders'], [yA, round2_(lA.rev), lA.orders], [yB, round2_(lB.rev), lB.orders]]);
  sh.getRange(pieHdr, 1, 1, 3).setBackground(SUBHEAD_BG).setFontWeight('bold');
  var stkHdr = pieHdr + 5;
  sh.getRange(stkHdr, 1, 3, 3).setValues([['Year', 'Net (Total sales)', 'Returns'], [yA, round2_(lA.rev), round2_(lA.ret)], [yB, round2_(lB.rev), round2_(lB.ret)]]);
  sh.getRange(stkHdr, 1, 1, 3).setBackground(SUBHEAD_BG).setFontWeight('bold');

  /* --- the charts --- */
  var C2 = [BLUE, ORANGE], chartRow = stkHdr + 5, LEFT = 2, RIGHT = 9;   // anchored off column 1 so the frozen first column never pins a chart
  function rg(c1, c2) { return sh.getRange(cdHdr, c1, cd.length + 1, (c2 - c1 + 1)); }
  function pair(col) { return [rg(1, 1), rg(col, col + 1)]; }
  addColChart_(sh,  'Revenue (' + ccy + ')',                    pair(2),  chartRow,      LEFT,  C2);
  addLineChart_(sh, 'CRR (%) — customer repeat rate',           pair(4),  chartRow,      RIGHT, C2);
  addColChart_(sh,  'AOV (' + ccy + ') — average order value',  pair(6),  chartRow + 18, LEFT,  C2);
  addColChart_(sh,  'Total No. of Orders',                      pair(8),  chartRow + 18, RIGHT, C2);
  addColChart_(sh,  'Returns (' + ccy + ')',                    pair(10), chartRow + 36, LEFT,  C2);
  addLineChart_(sh, 'Returns as % of gross sales',              pair(12), chartRow + 36, RIGHT, C2);
  addStackedColChart_(sh, 'Gross = net + returns, by month (' + yB + ')',
    [rg(1, 1), sh.getRange(cdHdr, 3, cd.length + 1, 1), sh.getRange(cdHdr, 11, cd.length + 1, 1)], chartRow + 54, LEFT, [BLUE, RED]);
  addPieChart_(sh,  'Revenue share — ' + lflLabel,              sh.getRange(pieHdr, 1, 3, 2), chartRow + 54, RIGHT, C2);
  addStackedColChart_(sh, 'Gross vs net totals — ' + lflLabel,  [sh.getRange(stkHdr, 1, 3, 3)], chartRow + 72, LEFT, [BLUE, RED]);
  addColChart_(sh,  'Total orders — ' + lflLabel,               [sh.getRange(pieHdr, 1, 3, 1), sh.getRange(pieHdr, 3, 3, 1)], chartRow + 72, RIGHT, [BLUE]);

  sh.setColumnWidth(1, 130);
  for (var w = 2; w <= NC; w++) sh.setColumnWidth(w, 108);
  sh.getRange(R_TITLE, 1, R_NOTE - R_TITLE + 1, NC).setVerticalAlignment('middle');
  sh.getRange(R_M0, 1, nRows, NC).setHorizontalAlignment('center');
  sh.getRange(R_NOTE, 1).setHorizontalAlignment('left').setVerticalAlignment('top');
  // A store with nothing pulled yet gets a plain-English reason instead of a silently empty tab.
  if (!monthsA.length && !monthsB.length) {
    sh.getRange(R_TITLE, 1).setValue('Comparison View — ' + tabName + '  ·  NO DATA YET  ·  ' +
      'fill this store in CONFIG.STORES, release the read_reports scope on its Shopify app, then run "Pull year-over-year data". ' +
      'Run "Check Shopify access for every store" to see which step is missing.');
  }
  Logger.log('Comparison View built: ' + tabName + ' ' + yA + ' vs ' + yB + ' · ' + monthsA.length + '/' + monthsB.length + ' month(s) of data.');
  return sh;
}

/* ================================ CHARTS ================================= */
function addColChart_(sheet, title, ranges, row, col, colors) {
  var b = sheet.newChart().asColumnChart().setNumHeaders(1).setPosition(row, col, 5, 5)
    .setOption('title', title).setOption('height', 340).setOption('width', 560)
    .setOption('legend', { position: 'bottom' }).setOption('titleTextStyle', { fontSize: 13, bold: true });
  if (colors) b.setOption('colors', colors);
  ranges.forEach(function (r) { b.addRange(r); });
  sheet.insertChart(b.build());
}
function addLineChart_(sheet, title, ranges, row, col, colors) {
  var b = sheet.newChart().asLineChart().setNumHeaders(1).setPosition(row, col, 5, 5)
    .setOption('title', title).setOption('height', 340).setOption('width', 560)
    .setOption('legend', { position: 'bottom' }).setOption('titleTextStyle', { fontSize: 13, bold: true })
    .setOption('curveType', 'function').setOption('pointSize', 5);
  if (colors) b.setOption('colors', colors);
  ranges.forEach(function (r) { b.addRange(r); });
  sheet.insertChart(b.build());
}
function addPieChart_(sheet, title, range, row, col, colors) {
  var b = sheet.newChart().asPieChart().setNumHeaders(1).addRange(range).setPosition(row, col, 5, 5)
    .setOption('title', title).setOption('height', 340).setOption('width', 560)
    .setOption('pieHole', 0.4).setOption('titleTextStyle', { fontSize: 13, bold: true });
  if (colors) b.setOption('colors', colors);
  sheet.insertChart(b.build());
}
/* Series stacked on top of each other (net + returns = gross). */
function addStackedColChart_(sheet, title, ranges, row, col, colors) {
  var b = sheet.newChart().asColumnChart().setNumHeaders(1).setStacked().setPosition(row, col, 5, 5)
    .setOption('title', title).setOption('height', 340).setOption('width', 560)
    .setOption('legend', { position: 'bottom' }).setOption('titleTextStyle', { fontSize: 13, bold: true });
  if (colors) b.setOption('colors', colors);
  ranges.forEach(function (r) { b.addRange(r); });
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
      Object.keys(j.rates).forEach(function (c) { var r = Number(j.rates[c]); if (r) out[c.toUpperCase()] = Math.round((1 / r) * 1e6) / 1e6; });
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
/* Editable rate card. Type into column C and that is exactly what every report tab uses.
   Your typed rates survive every refresh. */
function buildFxTab_(live) {
  var sh = getTab_(TAB.FX, ['Currency', 'Live rate → USD', 'Your rate → USD', 'Rate used']);
  var typed = fxOverrides_();
  var curs = {};
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
              'and a rebuild is enough (no re-pull). The local-currency figures on the "' + TAB.DATA + '" tab are the ones that tie to each Shopify admin exactly; ' +
              'one rate per currency means the ' + CONFIG.REPORT_CURRENCY + ' totals sit a few % from Shopify\'s own ' + CONFIG.REPORT_CURRENCY + ' display, because Shopify converts each order at its order-date rate.')
    .setFontSize(9).setFontColor('#666666').setWrap(true);
  centerAll_(sh);
  _fxOverrides = null; _fxCache = null;
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

/* ============================== DIAGNOSTICS ============================== */

/* One line per store: can we authenticate, and does ShopifyQL answer? Run this first
   if a country is missing from the view. */
function checkAccess() {
  var out = [];
  CONFIG.STORES.forEach(function (st) {
    var cc = canonCountry_(st.code);
    if (String(st.domain || '').indexOf('PASTE_') === 0) { out.push(cc + ': ✗ store not configured'); return; }
    if (!getAccessToken_(st)) { out.push(cc + ': ✗ cannot authenticate (check clientId/secret or token)'); return; }
    var t = shopifyQLTable_(st, 'FROM sales SHOW total_sales GROUP BY month SINCE -60d UNTIL today');
    out.push(cc + (t ? ': ✓ ShopifyQL OK (' + t.rows.length + ' row(s))' : ': ✗ ShopifyQL blocked — add read_reports to this app and RELEASE a new version'));
  });
  Logger.log(out.join('\n'));
  try { SpreadsheetApp.getUi().alert('Shopify access\n\n' + out.join('\n')); } catch (e) {}
  return out;
}

/* What does ShopifyQL actually return for one store-year? */
function debugMoM(code, year) {
  var st = null;
  CONFIG.STORES.forEach(function (s) { if (canonCountry_(s.code) === canonCountry_(code || 'USA')) st = s; });
  if (!st) { Logger.log('No store configured for ' + code); return; }
  year = year || Number(Utilities.formatDate(new Date(), sheetTz_(), 'yyyy'));
  Logger.log(st.code + ' ' + year + ' sales: ' + JSON.stringify(shopifyQLMonthlySales_(st, year)));
  Logger.log(st.code + ' ' + year + ' customers: ' + JSON.stringify(shopifyQLMonthlyCustomers_(st, year)));
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
function round2_(n) { n = Number(n); return isNaN(n) ? '' : Math.round(n * 100) / 100; }
function round4_(n) { n = Number(n); return isNaN(n) ? '' : Math.round(n * 10000) / 10000; }
