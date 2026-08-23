// FILE IS NOT EMPTY — scroll to line 83. Ctrl+A copies all.
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
                                                                              
// --- why the file starts with blank lines ---------------------------------
//  Deliberate, and load-bearing. Copying this file into the Apps Script editor
//  was losing the first ~917 characters, cutting in the MIDDLE of a line. Half
//  a "//" comment is not a comment — it parses as code — which is where
//  "SyntaxError: missing ) after argument list" came from. The blank run above
//  is 6320 characters of pure whitespace, so a cut landing anywhere
//  inside it is absorbed: whitespace has no syntax. Line 1 carries a visible
//  marker only so the file does not LOOK empty when you open it.
//  Do not delete this block unless you are pushing with clasp (_clasp/README.md),
//  which removes the clipboard from the process and makes it unnecessary.
// -------------------------------------------------------------------------
// ===========================================================================
//  BACKDROPSOURCE — GEO x CHANNEL PERFORMANCE ENGINE   (Google Apps Script)
//  The data engine. Builds the daily country tabs (UK · Canada · India ·
//  UAE · PrintFabrix), the grain, Shopify ground truth, Order Facts,
//  Tracking Health and the single-period Exec Report.
//
//  SETUP   paste this WHOLE file into its OWN standalone Apps Script
//          project — never the Exec RAG project — Save, then run setup().
//  CHECK   checkProjectIsolation()  ·  checkAccess()  ·  selfTest()
//  REPAIR  healNumberFormats()  then  pullShopify()  then  rebuildAll()
//  WHY IS A ROAS / CPA BLANK?   diagnoseSplit("CA")
//
//  FULL DOCUMENTATION IS AT THE FOOT OF THIS FILE — search "REFERENCE".
//  It lives down there on purpose: the top of a file is what a copy-paste
//  clips, and losing documentation must never stop the script parsing.
// ===========================================================================

var VERSION = 'bds-geo v1';

var CONFIG = {
  /* ---- THE TWO WORKBOOKS THIS SCRIPT OWNS (it writes only to these) ------- */
  // Workbook 1 — the detail / data engine. This is the sheet you supplied.
  DATA_SHEET_ID: '13SdMx1nGN3pnenj1-Uzc-YHuwTT7nQYI5T4rRYqb7rA',
  // Workbook 2 — the standalone exec report. Don't have one yet? Run
  // createMissingWorkbook() once: it creates the sheet, logs its ID and URL, and
  // you paste the id here. (If you would rather the sheet above BE the exec
  // report, just swap the two ids — nothing else cares which is which.)
  EXEC_SHEET_ID: 'PASTE_EXEC_SHEET_ID',

  // TRUE  = EVERYTHING lives in ONE workbook (DATA_SHEET_ID). The daily country
  //         tabs sit right next to the raw tabs, first in the tab strip, so the
  //         report is impossible to miss. EXEC_SHEET_ID is ignored entirely and
  //         no second workbook is created.
  // FALSE = the original two-workbook split: raw tabs in the data workbook, the
  //         country tabs + Exec Report + Method in EXEC_SHEET_ID. Cleaner to
  //         share the report without exposing the raw feeds — but you then have
  //         to remember that the country tabs are in the OTHER file.
  // Default TRUE because "where are my tabs" beats "tidy separation" every time.
  SINGLE_WORKBOOK: true,

  /* ---- THE SOURCES THIS SCRIPT ONLY EVER READS (never writes) ------------- */
  // The live Ad Budget Tracker workbook ("Integrated yet Comprehensive GEOs
  // Traceability Canvas"). Its spend tab is the ONE owner of spend.
  BUDGET_SHEET_ID: '1NN1wIwcYk9SO88OObPaUTk8ULtdhlr9Dv5hcUkdt4BM',
  // The tracker's tab is literally "BDS Spent Input" (yes, "Spent" — that is the
  // real tab name in the live workbook). The older "BDS Spend Input" name is
  // tried as a fallback so this keeps working whichever name it currently uses.
  BUDGET_SPEND_TABS: ['BDS Spent Input', 'BDS Spend Input', 'Spent Input', 'Spend Input'],
  // The bds-unified tracking workbook — "<CC> Order" PURCHASE rows (attribution).
  TRACKING_SHEET_ID: '15wnVR1TSrEnBuEg6QCLRUxJ3ptuTyOdlOriF28viAQ0',

  /* ---- SCOPE --------------------------------------------------------------- */
  // Each entry is its OWN line in every report and is NEVER combined with another.
  // `label` is what the reports print; `code` must match the country code used in
  // the tracker's spend rows and in the bds-unified "<CC> Order" tab names.
  ENTITIES: [
    { code: 'UK',  label: 'UK',         currency: 'GBP', domain: 'backdropsourceuk.myshopify.com',
      token: '', clientId: 'PASTE_UK_CLIENT_ID',  clientSecret: 'PASTE_UK_CLIENT_SECRET' },
    { code: 'CA',  label: 'Canada',     currency: 'CAD', domain: 'backdropsource-v1-0.myshopify.com',
      token: '', clientId: 'PASTE_CA_CLIENT_ID',  clientSecret: 'PASTE_CA_CLIENT_SECRET' },
    { code: 'IN',  label: 'India',      currency: 'INR', domain: 'backdropsource-india.myshopify.com',
      token: '', clientId: 'PASTE_IN_CLIENT_ID',  clientSecret: 'PASTE_IN_CLIENT_SECRET' },
    { code: 'UAE', label: 'UAE',        currency: 'AED', domain: 'backdropsourceuae.myshopify.com',
      token: '', clientId: 'PASTE_UAE_CLIENT_ID', clientSecret: 'PASTE_UAE_CLIENT_SECRET' },
    // PrintFabrix is the SECOND USA STORE (printfabrix.myshopify.com, USD) — a
    // different business from the Backdropsource USA store (bdsus.myshopify.com).
    // The two must NEVER merge, which is the whole reason it gets its own line.
    //
    // Because it trades in the USA, its spend rows and its orders may be LABELLED
    // 'USA' upstream rather than 'PF'. The four carve-out fields below pull
    // PrintFabrix back out of a USA-labelled feed: spendHostCodes +
    // spendCampaignPattern for spend, trackingHostTabs + trackingUrlPattern for
    // attribution. This is the same trick the tracker uses to split the shared
    // AU/NZ Meta account by campaign-name prefix.
    //
    // PREFERRED SETUP is that PrintFabrix carries its own 'PF' labels — tag its
    // spend Country='PF' in the tracker and render the tracking snippet as
    // {% render 'bds-tracking', country: 'PF' %} so purchases land in a "PF Order"
    // tab. When that is done these carve-out fields simply never fire, and PF can
    // never be confused with the USA store. Leave them in place regardless: they
    // cost nothing and they catch the mislabelled rows.
    { code: 'PF', label: 'PrintFabrix', currency: 'USD', domain: 'printfabrix.myshopify.com',
      token: '', clientId: 'PASTE_PF_CLIENT_ID', clientSecret: 'PASTE_PF_CLIENT_SECRET',
      isStore: true,
      spendCodes: ['PF', 'PRINTFABRIX'],
      spendHostCodes: ['USA', 'US'],                                  // where its spend might hide
      spendCampaignPattern: 'printfabrix|print fabrix|^pf[\\s|:_-]',  // how to recognise it there
      trackingTab: 'PF Order',
      trackingHostTabs: ['USA Order'],                                // where its orders might hide
      trackingUrlPattern: 'printfabrix'                               // Page URL tells PF from BDS
    }
  ],

  // The paid channels, in report order. An OVERALL line is added per entity.
  // Anything the feeds report that is NOT in this list (TikTok, Direct/organic)
  // still lands in the OVERALL line, and appears as an "Other" row when
  // SHOW_OTHER is true — so a channel nobody configured can never silently vanish.
  // Column order on the daily tabs, matching the reference workbook exactly:
  // Google · Bing · Meta · LinkedIn. Each of these is that channel's SPEND.
  CHANNELS: ['Google', 'Bing', 'Meta', 'LinkedIn'],
  SHOW_OTHER: true,
  // bds-unified maps any source it cannot identify — organic, email, direct — to
  // "Direct". That revenue belongs in the entity's OVERALL line (it is real
  // money, and coverage is only honest if it is counted), but dividing it by PAID
  // spend would overstate ROAS. So each entity gets a "PAID SUBTOTAL" line
  // covering only the CHANNELS above, alongside the OVERALL line that includes
  // everything. Read PAID for "is the spend working", OVERALL for "how is this
  // market doing". Set false to print only the channel rows and OVERALL.
  SHOW_PAID_SUBTOTAL: true,

  /* ---- BEHAVIOUR ---------------------------------------------------------- */
  LOOKBACK_DAYS: 90,          // trailing window refreshed on every pull
  FRESH_STAMP_DAYS: 3,        // Is New stamped within N days of the order = 'fresh'
  // When ShopifyQL cannot give us the new/returning split, the orders API can —
  // but ONLY if it actually knows. customer.numberOfOrders is unpopulated on guest
  // checkouts, and an unpopulated field read leniently makes every buyer look new,
  // which is exactly the false "100% new customers" this engine refuses to print.
  // So the fallback publishes a day's split only when the orders carrying a real
  // lifetime count represent at least this share of that day's revenue. Set high on
  // purpose: at 0.98 the two halves still sum to the day's revenue, so
  // "ROAS New + ROAS Existing = ROAS Blended" keeps holding. Below the floor the
  // day stays orders-only and the columns stay blank — missing beats invented.
  SPLIT_FROM_ORDERS_MIN: 0.98,
  TIMEZONE: 'America/Chicago',
  API_VERSION: '2025-10',
  REPORT_CURRENCY: 'USD',     // the common currency for the USD columns
  // Every entity is ALSO reported in its OWN currency, which is the number that
  // ties exactly to Shopify and to each ad platform's UI. The USD columns are a
  // real-live-rate convenience for reading GEOs side by side, and will differ
  // from Shopify's own USD display by the rate gap — expected, not a bug.
  FX: { USD: 1, CAD: 0.73, GBP: 1.27, AUD: 0.66, NZD: 0.60, EUR: 1.08, INR: 0.012, SGD: 0.74, AED: 0.27 },
  FX_PINNED: {},              // e.g. { GBP: 1.301 } to force a rate; {} = live rates

  // Health thresholds (share, 0-1). >= good -> green, >= warn -> amber, else red.
  HEALTH: { good: 0.90, warn: 0.70 },

  // TRUE  = every money column on the daily country tabs is converted to USD at
  //         the live rate, so all five tabs are directly comparable and read in
  //         one currency. FALSE = each tab reports in its own store currency
  //         (£ / ₹ / C$ / AED), which is the figure that ties EXACTLY to Shopify
  //         and to that ad account's UI.
  // NOTE: converting does NOT change any ROAS — revenue and spend are converted
  // at the same rate, so the ratio is identical. CPA DOES change, because it is
  // money per customer.
  REPORT_IN_USD: true,

  DAILY_HOUR: 7,              // daily refresh hour, in the SCRIPT PROJECT's time zone
  DEFAULT_PERIOD: 'Last 30 days'
};

/* Tabs in workbook 1 (the data engine). */
var DTAB = {
  GRAIN:   'GEO Channel Daily',   // Date x Entity x Channel — the atomic grain
  SHOPIFY: 'Shopify Daily',       // Shopify ground truth per Date x Entity
  FACTS:   'Order Facts',         // per-order new/returning stamp (write-once flag)
  HEALTH:  'Tracking Health',     // attribution coverage components, per period
  FX:      'FX Rates'
};
/* Tabs in workbook 2 (the exec report). */
var ETAB = {
  EXEC:   'Exec Report',
  METHOD: 'Method'
};

var GRAIN_HEADERS = ['Date', 'Entity', 'Channel', 'Currency',
  'Spend', 'Spend USD', 'Conversions', 'Revenue', 'Revenue USD',
  'New Cust Revenue', 'New Cust Revenue USD', 'Matched Orders',
  'CPA', 'ROAS', 'ROAS New', 'Impressions', 'Clicks'];

var SHOPIFY_HEADERS = ['Date', 'Entity', 'Currency', 'Orders', 'Revenue',
  'Paid Revenue', 'Pending Revenue', 'Paid Orders', 'Pending Orders',
  'New Cust Revenue', 'Returning Cust Revenue', 'New Customers', 'Repeat Customers',
  'Revenue Basis', 'Updated At'];

var FACTS_HEADERS = ['Order ID', 'Order Number', 'Entity', 'Date', 'Revenue',
  'Currency', 'Customer ID', 'Is New', 'Basis', 'Stamped At'];

var HEALTH_HEADERS = ['Entity', 'Channel', 'Attributed Orders', 'Matched Orders',
  'Match %', 'Attributed Revenue', 'Shopify Revenue', 'Coverage %',
  'Unattributed Revenue', 'Click ID Present %', 'Spend Days', 'Spend Days Missing',
  'New Flag Backfill %', 'Health'];

var HEADER_BG = '#274E13', BAND_BG = '#F3F6F4', TOTAL_BG = '#E2EFDA';
var PERIODS = ['Today', 'Yesterday', 'Last 7 days', 'Last 14 days', 'Last 30 days',
  'Last 60 days', 'Last 90 days', 'This month', 'Last month', 'Month to date'];

/* ====================== SMALL SHARED HELPERS ============================= */

function num_(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  // Strip currency symbols, thousands separators and stray spaces that arrive
  // through manual paste rows (LinkedIn spend is typed by hand in the tracker).
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
/* STRICT numeric parse — returns null instead of a wrong number.
   num_() above deliberately strips every non-digit so it can read "£1,234.56"
   out of a hand-typed spend cell. That is exactly the wrong behaviour for a value
   that might NOT be money: hand it an ISO timestamp and "2026-08-05T00:00:00Z"
   silently becomes 20260805000000, which then sails into the report as revenue.
   That is how a ROAS of 1,648,150,983,601x happens.
   So anything read from an API response, where a column could turn out to be a
   date or an id, must come through HERE — a value that is not plainly a number
   returns null and the caller decides what to do about it. */
function numStrict_(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v instanceof Date) return null;                 // a date is never a measure
  if (typeof v !== 'string') return null;             // objects, arrays, booleans
  // Allow a leading currency symbol/code, thousands separators and spaces.
  var s = v.replace(/[\s,\u00A0]/g, '').replace(/^[£$€₹]|^[A-Z]{3}/, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;        // rejects dates, ids, text
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}
/* WHICH BASES CARRY A USABLE NEW/RETURNING SPLIT.
   Asked in several places (Blended, the ROAS/CPA columns, the qlDays counter, the
   exec report's newHasData) and it MUST be asked the same way in all of them: a
   view that accepted a basis another view rejected would print a Blended that
   disagreed with its own ROAS columns. One function, so adding a third source
   later is a one-line change rather than a hunt.
     shopifyql    the ShopifyQL total_sales split — preferred, matches Analytics
     order-facts  derived from the orders API's lifetime order count, used only
                  when it could classify ~all of the day's revenue
     orders-only  no split at all -> the columns stay BLANK, never 0.00x
     quarantined  a split we read but refused to believe -> also blank */
/* MAY we publish a day's split derived from the orders API? Two independent
   questions, and BOTH have to be yes:
     detShare  does this STORE populate customer.numberOfOrders at all? A store
               taking mostly guest checkouts does not, and there every buyer would
               read as new — the false "100% new customers" we refuse to print.
     the day    is the revenue we could actually classify essentially ALL of that
               day's revenue? It has to be: the two halves become Blended, so a day
               where 30% of revenue is unclassified would show a Blended 30% short
               of Paid + Pending and every ROAS on the row would disagree.
   A day with no revenue at all has nothing to split and is not a failure.
   Pure, and separate from pullShopify, so the boundary can be tested — this gate
   is the only thing standing between a missing number and an invented one. */
function ordersSplitOk_(d, detShare) {
  if (!d || !(num_(d.ofAllRev) > 0)) return false;
  var floor = num_(CONFIG.SPLIT_FROM_ORDERS_MIN);
  if (!(floor > 0)) return false;             // 0 or missing disables the fallback
  if (num_(detShare) < floor) return false;
  return (num_(d.ofDetRev) / num_(d.ofAllRev)) >= floor;
}
function hasSplitBasis_(basis) {
  var b = String(basis || '');
  return b === 'shopifyql' || b === 'order-facts';
}
function round2_(n) { return Math.round(num_(n) * 100) / 100; }
function round4_(n) { return Math.round(num_(n) * 10000) / 10000; }
function addDays_(d, n) { return new Date(d.getTime() + n * 86400000); }
function indexMap_(row) { var m = {}; row.forEach(function (h, i) { m[String(h).trim()] = i; }); return m; }
function safeCell_(v) { return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v; }
function pct_(part, whole) { return num_(whole) ? num_(part) / num_(whole) : ''; }
/* Is this CONFIG value still an unfilled placeholder? Every placeholder in this
   file is written PASTE_SOMETHING, so the underscore is REQUIRED — testing for a
   bare 'PASTE' prefix would reject a real credential or sheet id that merely
   happened to begin with those five characters. */
function isPlaceholder_(v) { return !v || /^PASTE_/.test(String(v)); }

function asDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v).trim(); if (!s) return null;
  var d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : null;
}
/* A date-only cell is stored by Sheets as midnight in the SPREADSHEET's zone, so
   it must be formatted back in that same zone or every date shifts by a day.
   This is the day-drift bug that produced duplicate daily rows in the tracker. */
var _tz = null;
function tz_() {
  if (_tz) return _tz;
  try { _tz = dataSS_().getSpreadsheetTimeZone() || CONFIG.TIMEZONE; }
  catch (e) { _tz = CONFIG.TIMEZONE; }
  return _tz;
}
function dayKey_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function normDayKey_(v) {
  if (v instanceof Date) return dayKey_(v);
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = asDate_(s);
  return d ? dayKey_(d) : '';
}

var _ssCache = {};
function openById_(id, what) {
  if (isPlaceholder_(id)) throw new Error('CONFIG.' + what + ' is not set yet.');
  if (_ssCache[id]) return _ssCache[id];
  return (_ssCache[id] = SpreadsheetApp.openById(id));
}
/* The two workbooks this script OWNS resolve in a fixed order:
     1. CONFIG — always wins if filled in. This is where the ids SHOULD live.
     2. Script Properties — set once by createMissingWorkbook()/setup() when it
        had to create a workbook for you, so the run can carry on immediately
        instead of dying on a placeholder.
   The property is a convenience, never a competing answer: filling CONFIG
   overrides it, and because step 2 is checked BEFORE creating anything, a
   re-run can never spawn a second workbook. */
function ownedSheetId_(key) {
  var v = CONFIG[key];
  if (!isPlaceholder_(v)) return v;
  try {
    var stored = PropertiesService.getScriptProperties().getProperty('geoSheet_' + key);
    if (stored) return stored;
  } catch (e) {}
  return null;
}
function openOwned_(key) {
  var id = ownedSheetId_(key);
  if (!id) {
    throw new Error('CONFIG.' + key + ' is not set. Run createMissingWorkbook() — it creates the ' +
      'workbook, remembers its id and logs it for you to paste into CONFIG — then run setup().');
  }
  return openById_(id, key);
}
function dataSS_() { return openOwned_('DATA_SHEET_ID'); }
/* With SINGLE_WORKBOOK the "exec" workbook IS the data workbook, so every report
   tab is created alongside the raw tabs and there is only ever one file to open. */
function execSS_() {
  if (CONFIG.SINGLE_WORKBOOK) return dataSS_();
  return openOwned_('EXEC_SHEET_ID');
}

/* Get-or-create a tab with a header row, in a given workbook. */
function tab_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (headers && headers.length) {
    var cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    var same = cur.length >= headers.length && headers.every(function (h, i) { return String(cur[i]) === h; });
    if (!same) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}
function clearBody_(sh) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, Math.max(sh.getLastColumn(), 1)).clear();
}

/* ========================================================================== */
/*  NUMBER FORMATS ARE PART OF THE DATA, NOT DECORATION                       */
/*                                                                            */
/*  *** THE 2026-08-21 INCIDENT — this is why this section exists. ***         */
/*  "Returning Cust Revenue" on "Shopify Daily" was showing 12/30/1899,        */
/*  4/14/1901, 11/14/1906 ... and every ROAS New / ROAS Existing / CPA cell on */
/*  every daily tab was blank. Nothing was wrong with the VALUES: 12/30/1899   */
/*  is Google Sheets serial 0 and 11/14/1906 is serial 2510, so the column     */
/*  held real revenue all along. The COLUMN carried a date number format, and  */
/*  getValues() returns a Date object for any date-formatted cell — so a       */
/*  perfectly good 2510.25 arrived in this script as Sat Nov 14 1906.          */
/*  numStrict_ then refused it (correctly — see below), the split was dropped, */
/*  and the columns went blank. The older, looser parser did something worse:  */
/*  it stringified that Date into ~5e14 and published a 1,648,150,983,601x     */
/*  ROAS. Same root cause, two different disasters.                           */
/*                                                                            */
/*  WHY THE READER MUST NOT JUST CONVERT A Date BACK TO ITS SERIAL: it cannot  */
/*  tell the two cases apart. A genuinely wrong date of 2026-08-05 is serial   */
/*  46239, which is a perfectly plausible day of revenue. Coercing would fix   */
/*  one case and silently invent a number in the other, so the fix belongs     */
/*  HERE — at the format, where it is deterministic — and the reader keeps     */
/*  refusing anything it cannot read.                                         */
/*                                                                            */
/*  A format is therefore enforced on every write, by header NAME, because a   */
/*  format outlives the value in the cell: clearing a range and writing a      */
/*  number back into it does not necessarily drop a format inherited from the  */
/*  column, which is exactly how this survived a clear-and-re-pull.            */
/* ========================================================================== */

var FMT_TEXT = '@', FMT_DATE = 'yyyy-mm-dd', FMT_STAMP = 'yyyy-mm-dd hh:mm',
    FMT_MONEY = '#,##0.00', FMT_COUNT = '#,##0', FMT_ROAS = '0.00"x"', FMT_PCT = '0.0%';

/* The format a column should carry, decided from its HEADER rather than from a
   per-tab table, so one rule covers every data tab and a new column inherits the
   right behaviour automatically. Order matters and each rung is load-bearing:
     TEXT first  "Revenue Basis" contains "Revenue" and would otherwise be
                 formatted as money; an ID formatted as a number loses its last
                 digits to float precision, which breaks the order join.
     COUNT before MONEY  "Spend Days" is a count of days, not an amount.
   Returns null for anything unrecognised — an unknown column is left alone
   rather than guessed at. */
function numberFormatForHeader_(h) {
  var s = String(h == null ? '' : h).trim();
  if (!s) return null;
  if (['Entity', 'Channel', 'Currency', 'Country', 'Revenue Basis', 'Basis', 'Is New',
       'Health', 'Order ID', 'Customer ID', 'Order Number'].indexOf(s) >= 0) return FMT_TEXT;
  if (/%$/.test(s)) return FMT_PCT;
  if (/ At$/.test(s)) return FMT_STAMP;
  if (s === 'Date') return FMT_DATE;
  if (/ROAS/i.test(s)) return FMT_ROAS;
  if (/(Orders|Customers|Conversions|Impressions|Clicks|Days|Count|Matched)/i.test(s)) return FMT_COUNT;
  if (/(Revenue|Spend|Spent|CPA|Cost|Value)/i.test(s)) return FMT_MONEY;
  return null;
}
/* Is this a column whose cells must read back as NUMBERS? Used by the detector
   below, so "Date" and "Updated At" are not reported as broken for holding dates. */
function isNumericFormat_(f) {
  return f === FMT_MONEY || f === FMT_COUNT || f === FMT_ROAS || f === FMT_PCT;
}

/* Force every recognised column onto its format. Reads the SHEET's own header row
   rather than a constant, so it is correct even if a tab has extra columns or the
   engine has since reordered them. Returns the column names it set. */
function enforceFormats_(sh) {
  if (!sh) return [];
  var last = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (last < 2 || lastCol < 1) return [];
  var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0], done = [];
  hdr.forEach(function (h, i) {
    var f = numberFormatForHeader_(h);
    if (!f) return;
    sh.getRange(2, i + 1, last - 1, 1).setNumberFormat(f);
    done.push(String(h));
  });
  return done;
}

/* THE DETECTOR: cells in a NUMERIC column that come back as a Date. That is the
   exact fingerprint of this bug and it is invisible on the face of the sheet to
   anyone who does not know that 12/30/1899 means zero. Returns a per-column count
   so the report can name the column, which is what makes the fix obvious. */
function dateCellsInNumericCols_(sh) {
  var out = { total: 0, byCol: {}, sample: '' };
  if (!sh) return out;
  var last = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (last < 2 || lastCol < 1) return out;
  var vals = sh.getRange(1, 1, last, lastCol).getValues();
  var hdr = vals[0], numeric = [];
  hdr.forEach(function (h, i) {
    if (isNumericFormat_(numberFormatForHeader_(h))) numeric.push({ i: i, name: String(h) });
  });
  for (var r = 1; r < vals.length; r++) {
    for (var k = 0; k < numeric.length; k++) {
      var v = vals[r][numeric[k].i];
      if (!(v instanceof Date)) continue;
      out.total++;
      out.byCol[numeric[k].name] = (out.byCol[numeric[k].name] || 0) + 1;
      if (!out.sample) {
        out.sample = numeric[k].name + ' row ' + (r + 1) + ' reads as ' +
          Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd') + ' (Sheets serial ' +
          Math.round((v.getTime() - Date.UTC(1899, 11, 30)) / 86400000) + ')';
      }
    }
  }
  return out;
}
function band_(sh, firstRow, rows, cols) {
  if (rows <= 0) return;
  for (var r = 0; r < rows; r++) {
    if (r % 2 === 1) sh.getRange(firstRow + r, 1, 1, cols).setBackground(BAND_BG);
  }
}
function entityByCode_(code) {
  var want = String(code || '').toUpperCase(), hit = null;
  CONFIG.ENTITIES.forEach(function (e) { if (e.code.toUpperCase() === want) hit = e; });
  return hit;
}
function isConfigured_(e) {
  if (!e || isPlaceholder_(e.domain)) return false;
  if (e.token) return true;
  return !isPlaceholder_(e.clientId);
}
/* Every raw feed code that should fold INTO this entity's line. */
function spendCodesFor_(e) {
  var out = {}; out[e.code.toUpperCase()] = 1;
  (e.spendCodes || []).forEach(function (c) { out[String(c).toUpperCase()] = 1; });
  if (e.code === 'UK')  out.GB = 1;
  if (e.code === 'UAE') out.AE = 1;
  if (e.code === 'IN')  out.IND = 1;
  return out;
}
/* Which entity does a raw feed country code belong to? null = out of scope. */
function entityOfCode_(raw) {
  var cc = String(raw == null ? '' : raw).trim().toUpperCase();
  if (!cc) return null;
  for (var i = 0; i < CONFIG.ENTITIES.length; i++) {
    if (spendCodesFor_(CONFIG.ENTITIES[i])[cc]) return CONFIG.ENTITIES[i].code;
  }
  return null;
}
/* Resolve a SPEND row to an entity, honouring carve-outs.
   A second store trading inside another store's country (PrintFabrix in the USA)
   may have its spend labelled with the HOST country code. So the carve-out is
   tested FIRST: a USA-labelled row whose campaign name says PrintFabrix belongs
   to PrintFabrix, not to the USA store. Only then does the plain code match run.
   Getting this order wrong would let a host country silently swallow the second
   store's spend the moment that host is added to ENTITIES. */
function entityForSpendRow_(rawCode, campaign) {
  var cc = String(rawCode == null ? '' : rawCode).trim().toUpperCase();
  if (!cc) return null;
  var camp = String(campaign == null ? '' : campaign);
  for (var i = 0; i < CONFIG.ENTITIES.length; i++) {
    var e = CONFIG.ENTITIES[i];
    if (!e.spendHostCodes || !e.spendCampaignPattern) continue;
    var isHost = e.spendHostCodes.some(function (h) { return String(h).toUpperCase() === cc; });
    if (!isHost) continue;
    try {
      if (new RegExp(e.spendCampaignPattern, 'i').test(camp)) return e.code;
    } catch (err) {
      Logger.log('Bad spendCampaignPattern on ' + e.code + ': ' + err);
    }
  }
  return entityOfCode_(cc);
}
/* Free-text platform label / bds-unified Source -> canonical channel. Kept
   deliberately identical to the tracker's canonPlatform_ + platformOf_ so this
   workbook buckets a row exactly the way the tracker does: same spend row, same
   channel, no reconciliation gap between the two reports. ABM runs on LinkedIn,
   so it folds into that one bucket. */
function canonChannel_(v) {
  var s = String(v || '').trim().toLowerCase();
  if (!s) return 'Other';
  if (s.indexOf('google') !== -1 || s === 'adwords' || s === 'gads') return 'Google';
  if (s.indexOf('meta') !== -1 || s.indexOf('facebook') !== -1 || s === 'fb' ||
      s.indexOf('instagram') !== -1 || s === 'ig') return 'Meta';
  if (s.indexOf('bing') !== -1 || s.indexOf('microsoft') !== -1 || s === 'msft') return 'Bing';
  if (s.indexOf('linkedin') !== -1 || s.indexOf('abm') !== -1) return 'LinkedIn';
  if (s.indexOf('tiktok') !== -1 || s === 'tt') return 'TikTok';
  if (s.indexOf('direct') !== -1 || s.indexOf('organic') !== -1) return 'Direct';
  return String(v).charAt(0).toUpperCase() + String(v).slice(1);
}

/* ============================== FX ======================================= */
var _fx = null;
function fxRates_() {
  if (_fx) return _fx;
  var base = {};
  Object.keys(CONFIG.FX).forEach(function (k) { base[k] = CONFIG.FX[k]; });
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('geoFx');
    if (raw) {
      var j = JSON.parse(raw);
      if (j && j.rates) Object.keys(j.rates).forEach(function (k) { base[k] = j.rates[k]; });
    }
  } catch (e) {}
  Object.keys(CONFIG.FX_PINNED || {}).forEach(function (k) {
    base[String(k).toUpperCase()] = CONFIG.FX_PINNED[k];
  });
  return (_fx = base);
}
function toUSD_(amount, currency) {
  var a = num_(amount);
  var cur = String(currency || CONFIG.REPORT_CURRENCY).toUpperCase();
  if (!cur || cur === 'USD') return a;
  var r = fxRates_()[cur];
  return r ? a * r : a;
}
/* Live rates (1 USD -> each), inverted to local->USD, cached on the script. */
function refreshFxRates() {
  try {
    var res = UrlFetchApp.fetch('https://open.er-api.com/v6/latest/USD', { muteHttpExceptions: true });
    var j = JSON.parse(res.getContentText());
    if (j && j.result === 'success' && j.rates) {
      var out = { USD: 1 };
      Object.keys(j.rates).forEach(function (c) {
        var r = Number(j.rates[c]); if (r) out[c.toUpperCase()] = Math.round((1 / r) * 1e6) / 1e6;
      });
      PropertiesService.getScriptProperties().setProperty('geoFx',
        JSON.stringify({ at: dayKey_(new Date()), rates: out }));
      _fx = null;
      Logger.log('FX refreshed — 1 GBP=' + out.GBP + ' · 1 CAD=' + out.CAD +
                 ' · 1 INR=' + out.INR + ' · 1 AED=' + out.AED + ' USD');
      try { writeFxTab_(out); } catch (e) {}
      return out;
    }
    Logger.log('FX refresh failed, keeping existing rates: ' + res.getContentText().slice(0, 160));
  } catch (e) { Logger.log('FX refresh error, keeping existing rates: ' + e); }
  return fxRates_();
}
function writeFxTab_(rates) {
  var sh = tab_(dataSS_(), DTAB.FX, ['Currency', 'Local -> USD', 'Updated At']);
  clearBody_(sh);
  var used = { USD: 1 };
  CONFIG.ENTITIES.forEach(function (e) { used[e.currency] = 1; });
  var rows = Object.keys(used).sort().map(function (c) {
    return [c, rates[c] || CONFIG.FX[c] || '', new Date()];
  });
  if (rows.length) {
    sh.getRange(2, 1, rows.length, 3).setValues(rows);
    sh.getRange(2, 2, rows.length, 1).setNumberFormat('0.000000');
    sh.getRange(2, 3, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  }
  var pinned = Object.keys(CONFIG.FX_PINNED || {});
  sh.getRange(1, 5).setValue(pinned.length
    ? 'PINNED (these override the live rates): ' + pinned.join(', ')
    : 'Live rates from open.er-api.com. Local currency is the exact-match truth; USD is a real-rate convenience.');
}

/* ========================= SHOPIFY ACCESS ================================ */
/* Two auth styles, auto-detected: a static in-admin custom app token
   (`token: 'shpat_...'`, preferred — Protected Customer Data is granted without a
   review request, so ShopifyQL and the new/returning split just work), otherwise
   a client-credentials grant from a Dev-Dashboard app. */
var _tokenCache = {};
function accessToken_(e) {
  if (_tokenCache[e.code] !== undefined) return _tokenCache[e.code];
  if (e.token) return (_tokenCache[e.code] = e.token);
  var resp = UrlFetchApp.fetch('https://' + e.domain + '/admin/oauth/access_token', {
    method: 'post',
    payload: { grant_type: 'client_credentials', client_id: e.clientId, client_secret: e.clientSecret },
    muteHttpExceptions: true
  });
  var txt = resp.getContentText(), body = {};
  try { body = JSON.parse(txt); } catch (err) {}
  if (!body.access_token) {
    var hint = /shop-404|Store unavailable/i.test(txt) ? ' -> store not found: check the .myshopify.com domain'
             : /invalid_client|Unauthorized|401/i.test(txt) ? ' -> bad clientId/clientSecret, or the app is not installed'
             : '';
    Logger.log(e.code + ' token error (HTTP ' + resp.getResponseCode() + ')' + hint + ': ' + txt.slice(0, 200));
    return (_tokenCache[e.code] = null);
  }
  return (_tokenCache[e.code] = body.access_token);
}
function gql_(e, query, variables) {
  var token = accessToken_(e);
  if (!token) return null;
  var resp = UrlFetchApp.fetch('https://' + e.domain + '/admin/api/' + CONFIG.API_VERSION + '/graphql.json', {
    method: 'post', contentType: 'application/json',
    headers: { 'X-Shopify-Access-Token': token },
    payload: JSON.stringify({ query: query, variables: variables || {} }),
    muteHttpExceptions: true
  });
  var txt = resp.getContentText();
  try { return JSON.parse(txt); }
  catch (err) { Logger.log(e.code + ' non-JSON response: ' + txt.slice(0, 300)); return null; }
}
/* The STORE's own time zone — an order's calendar day must be bucketed the way
   Shopify's own reports bucket it, or daily revenue will not tie out. */
var _shopTz = {};
function shopTz_(e) {
  if (_shopTz[e.code]) return _shopTz[e.code];
  var res = gql_(e, '{shop{ianaTimezone}}');
  var t = res && res.data && res.data.shop && res.data.shop.ianaTimezone;
  return (_shopTz[e.code] = t || CONFIG.TIMEZONE);
}

/* ============ SHOPIFY GROUND TRUTH — revenue split new vs returning ======= */
/* ShopifyQL, so the split matches Shopify Analytics EXACTLY. The `sales` dataset
   with the `new_or_returning_customer` dimension is the same one the Ad Budget
   Tracker already relies on for its customer counts, and it is used here rather
   than counting orders through the REST/GraphQL orders API because that API's
   numberOfOrders returns 0 "Repeat" on these stores (guest checkouts leave the
   field unpopulated), which would report every buyer as new.
   Returns { 'yyyy-mm-dd': {newRev, retRev, newC, retC} } or null if unavailable. */
function pullQLSplit_(e, daysBack) {
  var out = {};
  var qlRev = 'FROM sales SHOW total_sales GROUP BY day, new_or_returning_customer' +
              ' SINCE -' + daysBack + 'd UNTIL today';
  var qlCus = 'FROM sales SHOW customers GROUP BY day, new_or_returning_customer' +
              ' SINCE -' + daysBack + 'd UNTIL today';
  var got = false;
  if (readQLInto_(e, qlRev, out, 'rev')) got = true;
  if (readQLInto_(e, qlCus, out, 'cust')) got = true;
  return got ? out : null;
}
/* Run one ShopifyQL query and fold its rows into `acc`. `what` selects which pair
   of fields the measure lands in. Returns true if any row was read. */
function readQLInto_(e, ql, acc, what) {
  var gqlq = 'query($q:String!){shopifyqlQuery(query:$q){parseErrors tableData{rows columns{name dataType}}}}';
  var res = gql_(e, gqlq, { q: ql });
  var sq = res && res.data && res.data.shopifyqlQuery;
  if (!sq) {
    Logger.log(e.code + ' ShopifyQL unavailable (needs read_reports + Protected Customer Data): ' +
      JSON.stringify((res && res.errors) || res).slice(0, 220));
    return false;
  }
  if (sq.parseErrors && sq.parseErrors.length) {
    Logger.log(e.code + ' ShopifyQL parse error on [' + ql + ']: ' + JSON.stringify(sq.parseErrors).slice(0, 220));
    return false;
  }
  var td = sq.tableData, rows = td && (td.rows || td.rowData);
  if (!td || !rows || !rows.length) { Logger.log(e.code + ' ShopifyQL returned no rows for: ' + ql); return false; }

  // Resolve columns by NAME, never by position — the dimension order is not
  // guaranteed. The new/returning DIMENSION must be matched BEFORE the measure,
  // because a measure called "customers" also contains the word "customer".
  var cols = td.columns || [];
  var dayIdx = -1, typeIdx = -1, dayNm = null, typeNm = null;
  cols.forEach(function (c, i) {
    var nm = String(c.name || '').toLowerCase(), dt = String(c.dataType || '').toLowerCase();
    if (dayIdx < 0 && (nm === 'day' || nm.indexOf('day') !== -1 || nm.indexOf('date') !== -1 ||
        dt.indexOf('date') !== -1 || dt.indexOf('time') !== -1)) { dayIdx = i; dayNm = c.name; }
    else if (typeIdx < 0 && (nm.indexOf('return') !== -1 || nm.indexOf('new_or') !== -1)) { typeIdx = i; typeNm = c.name; }
  });
  // The MEASURE gets its own pass — see qlMeasureIdx_ for why it refuses to guess.
  var valIdx = qlMeasureIdx_(cols, what, dayIdx, typeIdx);
  var valNm = valIdx >= 0 ? cols[valIdx].name : null;
  if (valIdx < 0) {
    Logger.log(e.code + ' ShopifyQL: could not find the measure this query asked for among ' +
      JSON.stringify(cols.map(function (c) { return c.name; })) +
      '. REFUSING TO GUESS, so there is no new/returning split for this pull — which the reports show ' +
      'as "unknown" rather than as a wrong number. Run debugShopifyQL() to see the raw response.');
    return false;
  }
  var any = false, rejected = 0, sample = '';
  rows.forEach(function (row) {
    if (!row) return;
    var dv, tv, vv;
    if (row instanceof Array) { dv = row[dayIdx]; tv = (typeIdx >= 0 ? row[typeIdx] : ''); vv = row[valIdx]; }
    else { dv = row[dayNm]; tv = (typeNm ? row[typeNm] : ''); vv = row[valNm]; }
    var dk = normDayKey_(dv); if (!dk) return;
    // STRICT: if the measure cell is not plainly a number the column we picked is
    // not the measure — drop the row loudly rather than coerce a date into money.
    var n = numStrict_(vv);
    if (n === null) {
      rejected++;
      if (!sample) sample = JSON.stringify(vv).slice(0, 60);
      return;
    }
    var slot = acc[dk] || (acc[dk] = { newRev: 0, retRev: 0, newC: 0, retC: 0 });
    var t = String(tv == null ? '' : tv).toLowerCase();
    // Anything not explicitly "returning"/"repeat" counts as new — Shopify labels
    // the first-time bucket several ways across versions ("first-time", "new").
    var isRet = (t.indexOf('return') !== -1 || t.indexOf('repeat') !== -1);
    if (what === 'rev') { if (isRet) slot.retRev += n; else slot.newRev += n; }
    else               { if (isRet) slot.retC   += n; else slot.newC   += n; }
    any = true;
  });
  if (rejected) {
    Logger.log(e.code + ' ShopifyQL: REJECTED ' + rejected + ' of ' + rows.length +
      ' row(s) — the column read as the measure did not contain a number (first bad value: ' +
      sample + '). Columns were ' + JSON.stringify(cols.map(function (c) { return c.name; })) +
      '; picked "' + valNm + '" as the measure. Run debugShopifyQL() to see the raw response.');
  }
  return any;
}

/* WHICH COLUMN IS THE MONEY? Resolved by the measure this query actually ASKED
   for, exact name first, and never by "whatever else looks plausible".

   *** THE 2026-08-20 INCIDENT — do not loosen this. ***
   The old test accepted any column whose name merely CONTAINED "sales" or
   "customer". A ShopifyQL response can carry customer_id next to the measure, and
   "customer_id".indexOf('customer') matches — so ids were read as money. Summing
   ~361 thirteen-digit ids per day produced a "Returning Cust Revenue" of about
   2.5e15 per day, which flowed into "Shopify Daily", into the GEO daily tabs' ROAS
   columns, and out the far end as an exec-report Overall Revenue of
   $51,205,863,893,064,000.00 at 1,298,642,692,670x ROAS.
   Every one of those cells held a VALID NUMBER, which is why numStrict_ could not
   catch it and nothing downstream could either. The only defence is to stop
   guessing which column is the money.

   There is deliberately NO fallback pass over "any remaining numeric column":
   a MISSING split is recoverable — the reports render it as "unknown" and carry
   on — whereas a WRONG split is silent and poisons everything downstream. */
function qlMeasureIdx_(cols, what, dayIdx, typeIdx) {
  // Exactly what the two queries in pullQLSplit_ ask for: total_sales / customers.
  var want = (what === 'rev')
    ? ['total_sales', 'net_sales', 'gross_sales']
    : ['customers', 'total_customers'];
  var names = (cols || []).map(function (c) { return String((c && c.name) || '').toLowerCase(); });
  // Anything that names an identifier is never a measure, however numeric it looks.
  function idLike(nm) { return /(^|[^a-z])id([^a-z]|$)|_id$|gid|token|_at$/.test(nm); }

  for (var w = 0; w < want.length; w++) {          // 1. exact name wins, any order
    var hit = names.indexOf(want[w]);
    if (hit >= 0) return hit;
  }
  for (var w2 = 0; w2 < want.length; w2++) {       // 2. then a containing name
    for (var i = 0; i < names.length; i++) {
      if (i === dayIdx || i === typeIdx || idLike(names[i])) continue;
      if (names[i].indexOf(want[w2]) !== -1) return i;
    }
  }
  return -1;                                       // 3. and then we stop.
}

/* ORDERS — total orders + revenue per day, AND the per-order facts we need to
   join attribution to a new/returning flag. One pass, because both come from the
   same order list. Test orders are excluded; cancelled orders stay in the order
   count but their revenue follows Shopify's current total. */
function pullOrders_(e, daysBack) {
  var tz = shopTz_(e);
  var since = addDays_(new Date(), -daysBack), sinceMs = since.getTime();
  var sinceISO = Utilities.formatDate(since, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var q = 'query($cursor:String,$q:String){orders(first:100, after:$cursor, query:$q, sortKey:CREATED_AT){' +
          'pageInfo{hasNextPage endCursor} edges{node{id name createdAt test displayFinancialStatus ' +
          'currentTotalPriceSet{shopMoney{amount currencyCode}} ' +
          'customer{id numberOfOrders}}}}}';
  var byDay = {}, facts = [], cursor = null, guard = 0;
  var custDet = 0, custTot = 0;   // orders whose lifetime count is actually known
  while (guard++ < 400) {
    var res = gql_(e, q, { cursor: cursor, q: 'created_at:>=' + sinceISO });
    var conn = res && res.data && res.data.orders;
    if (!conn) {
      Logger.log(e.code + ' orders read failed (needs read_orders): ' +
        JSON.stringify((res && res.errors) || res).slice(0, 220));
      return null;
    }
    conn.edges.forEach(function (edge) {
      var n = edge.node; if (!n || n.test) return;
      var dt = asDate_(n.createdAt); if (!dt || dt.getTime() < sinceMs) return;
      var dk = Utilities.formatDate(dt, tz, 'yyyy-MM-dd');
      var money = n.currentTotalPriceSet && n.currentTotalPriceSet.shopMoney;
      var amt = money ? num_(money.amount) : 0;
      var cur = (money && money.currencyCode) || e.currency;
      var d = byDay[dk] || (byDay[dk] = { orders: 0, revenue: 0, currency: cur,
        paidRev: 0, pendRev: 0, paidOrders: 0, pendOrders: 0,
        ofNewRev: 0, ofRetRev: 0, ofNewC: 0, ofRetC: 0, ofDetRev: 0, ofAllRev: 0 });
      d.orders++; d.revenue += amt;

      // PAID vs PENDING, bucketed the same way the Ad Budget Tracker does it so
      // the two reports agree: Paid = PAID + PARTIALLY_PAID, Pending = PENDING +
      // AUTHORIZED. Refunded / voided / expired orders land in NEITHER bucket —
      // they still count in Orders, but calling a refund "revenue" would be wrong.
      // This is why Paid + Pending does not have to equal Blended.
      var fin = String(n.displayFinancialStatus || '').toUpperCase();
      if (fin === 'PAID' || fin === 'PARTIALLY_PAID')      { d.paidRev += amt; d.paidOrders++; }
      else if (fin === 'PENDING' || fin === 'AUTHORIZED')  { d.pendRev += amt; d.pendOrders++; }

      var cust = n.customer || null;
      /* ONE reading of customer.numberOfOrders, THREE states, used by BOTH the daily
         split and Order Facts.
         It used to be read twice, two different ways. Order Facts took the lenient
         one — `cust ? (num_(cust.numberOfOrders) <= 1) : true` — which marks a GUEST
         CHECKOUT as a new customer, because a guest has no customer record at all and
         the expression falls through to `true`. The daily split took the strict one.
         So the two halves of this workbook disagreed about the same orders, and the
         exec report printed both side by side.
         Observed live (CANADA, 1-21 Aug 2026): the channel rows claimed $128,238.95 of
         new-customer revenue while the store's own split said $86,146.16 — 149% of it,
         a subset larger than its whole. Total revenue coverage over the same window was
         99.8%, which is what proves it was never a double-count: only the new/returning
         FLAG was wrong. Attribution called 97.6% of revenue new; Shopify said 65.4%.
         Understating new-customer revenue is recoverable. Fabricating it is not, so an
         order we cannot classify is UNKNOWN and counts in neither half:
            1  -> this really is their first order  -> new
           >1  -> they have ordered before          -> returning
           0 / missing -> the field is unpopulated  -> UNKNOWN: counted in neither
                          half, and it is this share that decides whether the day's
                          split may be published at all. */
      var lifetime = cust ? num_(cust.numberOfOrders) : 0;
      /* The flag Order Facts stores. 'UNKNOWN' is a real, stored third value — not a
         blank and not a silent FALSE — so a later reader can tell "we know this was a
         returning customer" apart from "we never knew", and diagnostics can report the
         unknown share instead of it hiding inside the returning half. */
      var newFlag = lifetime >= 1 ? (lifetime === 1 ? 'TRUE' : 'FALSE') : 'UNKNOWN';
      d.ofAllRev += amt; custTot++;
      if (lifetime >= 1) {
        custDet++; d.ofDetRev += amt;
        if (lifetime === 1) { d.ofNewRev += amt; d.ofNewC++; }
        else                { d.ofRetRev += amt; d.ofRetC++; }
      }
      facts.push({
        id: gidNum_(n.id), name: String(n.name || ''), day: dk,
        revenue: amt, currency: cur, customerId: gidNum_(cust && cust.id),
        newFlag: newFlag, isNew: newFlag === 'TRUE', orderDate: dt
      });
    });
    if (conn.pageInfo && conn.pageInfo.hasNextPage) { cursor = conn.pageInfo.endCursor; Utilities.sleep(220); }
    else break;
  }
  return { byDay: byDay, facts: facts, custDet: custDet, custTot: custTot };
}
/* "gid://shopify/Order/12345" -> "12345"; anything else passes through as text so
   an unexpected id shape is still a usable join key rather than a blank. */
function gidNum_(gid) {
  if (!gid) return '';
  var s = String(gid), m = s.match(/(\d+)\s*$/);
  return m ? m[1] : s;
}
/* Order names arrive with and without the "#" across feeds — normalise both
   sides of the join, or every UK order silently fails to match. */
function normOrderName_(v) {
  return String(v == null ? '' : v).trim().replace(/^#/, '').toUpperCase();
}

/* ================ SCHEMA MIGRATION for Shopify Daily ==================== */
/* Shopify Daily is read back BY HEADER NAME, so adding a column mid-life leaves
   old rows misaligned under the new header: "Returning Cust Revenue" starts
   reading whatever used to sit at that index. When that turns out to be the
   `Updated At` DATE, num_() renders it as ~5e14 and a ROAS of 1,648,150,983,601x
   lands in the report. This actually happened.

   THE GUARD MUST NOT COMPARE THE HEADER ROW. setup() calls tab_() — which
   REWRITES the header to the current layout — and it runs BEFORE pullShopify.
   By the time a header-comparing guard looked, the header already matched while
   the data underneath was still the old shape, so the guard passed and the
   corruption went out. The schema fingerprint is therefore stored in Script
   Properties, where nothing else can quietly bring it up to date.

   Safe because this tab is 100% re-derivable from Shopify inside the lookback.
   Order Facts is NEVER migrated this way — its write-once Is New flags cannot be
   recreated once dropped. */
function shopifySchemaKey_() { return SHOPIFY_HEADERS.join('|'); }
/* `force` re-runs the clear even when the fingerprint already matches. Used by the
   self-heal path: a tab can be corrupt for reasons the fingerprint cannot see —
   e.g. it was written under an older layout by a build that then updated the
   fingerprint — and in that case the ONLY way out is to clear and re-pull. */
function migrateShopifyTab_(force) {
  var ss = dataSS_(), sh = ss.getSheetByName(DTAB.SHOPIFY);
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('geoShopifySchema');
  var current = shopifySchemaKey_();
  if (!force && stored === current) return false;
  if (sh && sh.getLastRow() > 1) {
    Logger.log('"' + DTAB.SHOPIFY + '" schema changed — clearing ' + (sh.getLastRow() - 1) +
      ' stale row(s) so the new columns cannot be read out of the old positions. ' +
      'Every cleared day is re-pulled from Shopify below.');
    clearBody_(sh);
  }
  props.setProperty('geoShopifySchema', current);
  return true;
}

/* ================ PULL: write Shopify Daily + Order Facts ================ */
function pullShopify() {
  var daysBack = CONFIG.LOOKBACK_DAYS;
  migrateShopifyTab_();
  var shSh = tab_(dataSS_(), DTAB.SHOPIFY, SHOPIFY_HEADERS);
  var pulled = 0, skipped = [];

  CONFIG.ENTITIES.forEach(function (e) {
    if (!isConfigured_(e)) { skipped.push(e.label + ' (not configured)'); return; }
    var od = pullOrders_(e, daysBack);
    if (!od) { skipped.push(e.label + ' (orders API failed)'); return; }

    var ql = pullQLSplit_(e, daysBack);   // null if ShopifyQL is not available
    var rows = [], implausible = 0, ofUsed = 0, ofBlocked = 0;
    // Does the orders API actually know who is a repeat buyer on THIS store?
    // Measured, never assumed — it is the whole question the fallback turns on.
    var detShare = od.custTot ? od.custDet / od.custTot : 0;
    var ofUsable = detShare >= CONFIG.SPLIT_FROM_ORDERS_MIN;   // store-level, for the log
    Object.keys(od.byDay).forEach(function (dk) {
      var d = od.byDay[dk];
      var q = ql ? ql[dk] : null;

      /* PLAUSIBILITY GATE. The orders API is the independent second opinion: a
         day's new+existing split should be in the same ballpark as that day's
         order revenue. If it is wildly bigger, the split is not revenue — it is
         a parse failure — and publishing it would put a 1,648,150,983,601x ROAS
         in front of the business. Better to declare the split unavailable for
         that day (Revenue Basis 'orders-only', blank split) than to print a
         number nobody can act on. Deliberately generous at 10x, because
         ShopifyQL total_sales and the orders API legitimately differ somewhat. */
      if (q) {
        var split = num_(q.newRev) + num_(q.retRev);
        var bad = !isFinite(split) || Math.abs(split) > 1e12 ||
                  (d.revenue > 0 && split > d.revenue * 10);
        if (bad) {
          Logger.log(e.label + ' ' + dk + ': REJECTED the ShopifyQL split as implausible — ' +
            'new+existing = ' + split + ' against order revenue ' + round2_(d.revenue) +
            '. Falling back to paid+pending for this day.');
          q = null; implausible++;
        }
      }
      // Revenue Basis records WHICH source each row's split came from, so a
      // period where ShopifyQL was unavailable is visible rather than silently
      // reporting zero new-customer revenue.
      var basis = q ? 'shopifyql' : 'orders-only';
      var nRev = q ? round2_(q.newRev) : '', rRev = q ? round2_(q.retRev) : '';
      var nCus = q ? q.newC : '', rCus = q ? q.retC : '';
      /* SECOND SOURCE FOR THE SPLIT. ShopifyQL is preferred and is never
         overridden — it matches Shopify Analytics exactly. But when it is
         unavailable (missing read_reports, a parse error, or a day it simply did
         not return) the orders we ALREADY pulled can answer the same question —
         provided they know the answer. Gated twice: the store overall must know who
         its repeat buyers are, and THIS day's classified revenue must cover
         essentially all of the day's revenue, or the two halves would not sum to
         Blended and every ROAS on the row would quietly disagree with the others.
         Recorded under its own Revenue Basis so it can never be mistaken for the QL
         split, and so any figure can be traced back to which source produced it. */
      if (!q && d.ofAllRev > 0) {
        if (ordersSplitOk_(d, detShare)) {
          basis = 'order-facts';
          nRev = round2_(d.ofNewRev); rRev = round2_(d.ofRetRev);
          nCus = d.ofNewC;            rCus = d.ofRetC;
          ofUsed++;
        } else ofBlocked++;
      }
      rows.push([dk, e.code, d.currency, d.orders, round2_(d.revenue),
        round2_(d.paidRev), round2_(d.pendRev), d.paidOrders, d.pendOrders,
        nRev, rRev, nCus, rCus, basis, new Date()]);
    });
    upsertShopifyDaily_(shSh, e.code, rows);
    stampOrderFacts_(e, od.facts);
    pulled++;
    Logger.log(e.label + ': ' + Object.keys(od.byDay).length + ' day(s), ' +
      od.facts.length + ' order(s)' + (ql ? ', ShopifyQL split OK' : ', NO ShopifyQL split') +
      (implausible ? ' — ' + implausible + ' day(s) had the split REJECTED as implausible' : '') +
      ' — the orders API knows the lifetime order count for ' +
      Math.round(detShare * 1000) / 10 + '% of orders' +
      (ofUsed ? ', so ' + ofUsed + ' day(s) took their split from the ORDERS API instead' : '') +
      (ofBlocked ? '; ' + ofBlocked + ' day(s) could NOT (below the ' +
        Math.round(CONFIG.SPLIT_FROM_ORDERS_MIN * 100) + '% floor) and stay blank' : '') +
      (!ql && !ofUsable ? '. NEITHER source can give the split — fix ShopifyQL access ' +
        '(read_reports + read_customers), then run diagnoseSplit(' + JSON.stringify(e.code) + ')' : ''));
  });

  // Pin the formats AFTER the writes. A number written into a date-formatted cell
  // stays a date on the way back out, which is the whole 2026-08-21 incident.
  enforceFormats_(shSh);
  var factsSh = dataSS_().getSheetByName(DTAB.FACTS);
  if (factsSh) enforceFormats_(factsSh);
  if (skipped.length) Logger.log('SKIPPED: ' + skipped.join('; '));
  Logger.log('pullShopify done — ' + pulled + ' of ' + CONFIG.ENTITIES.length + ' entities.');
}

/* Upsert on Date+Entity so re-running a day corrects it instead of duplicating. */
function upsertShopifyDaily_(sh, code, rows) {
  var vals = sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [SHOPIFY_HEADERS];
  var c = indexMap_(vals[0]), index = {};
  for (var i = 1; i < vals.length; i++) {
    var k = normDayKey_(vals[i][c['Date']]) + '|' + String(vals[i][c['Entity']]).toUpperCase();
    index[k] = i + 1;
  }
  var appends = [];
  rows.forEach(function (r) {
    var key = r[0] + '|' + code;
    if (index[key]) sh.getRange(index[key], 1, 1, r.length).setValues([r]);
    else appends.push(r);
  });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
}

/* Write the per-order new/returning stamp. WRITE-ONCE: an Order ID already on the
   tab keeps its original Is New / Basis forever. Only revenue is refreshed (an
   order can be edited or partly refunded after the fact, and the money should
   follow Shopify; the new/returning judgement should not). */
function stampOrderFacts_(e, facts) {
  if (!facts || !facts.length) return;
  var sh = tab_(dataSS_(), DTAB.FACTS, FACTS_HEADERS);
  var vals = sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [FACTS_HEADERS];
  var c = indexMap_(vals[0]), seen = {};
  for (var i = 1; i < vals.length; i++) {
    var id = String(vals[i][c['Order ID']]).trim();
    if (id) seen[id] = i + 1;
  }
  var now = new Date(), appends = [], revUpdates = [];
  facts.forEach(function (f) {
    if (!f.id) return;
    var ageDays = (now.getTime() - f.orderDate.getTime()) / 86400000;
    var basis = ageDays <= CONFIG.FRESH_STAMP_DAYS ? 'fresh' : 'backfill';
    // seen[id] > 0 = an existing sheet row; -1 = already queued as an append in
    // THIS run (a duplicate inside one pull), which must not become getRange(-1).
    if (seen[f.id] > 0) {
      revUpdates.push({ row: seen[f.id], rev: round2_(f.revenue) });
      return;   // Is New / Basis are deliberately NOT touched again
    }
    if (seen[f.id] === -1) return;
    appends.push([f.id, safeCell_(f.name), e.code, f.day, round2_(f.revenue), f.currency,
      f.customerId, f.newFlag || (f.isNew ? 'TRUE' : 'FALSE'), basis, now]);
    seen[f.id] = -1;
  });
  if (appends.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appends.length, appends[0].length).setValues(appends);
  }
  // Revenue refresh, batched per contiguous run to keep the call count sane.
  var revCol = c['Revenue'] + 1;
  revUpdates.forEach(function (u) { sh.getRange(u.row, revCol).setValue(u.rev); });
  Logger.log(e.label + ' order facts: +' + appends.length + ' new stamp(s), ' +
    revUpdates.length + ' revenue refresh(es).');
}

/* Read the whole Order Facts tab into a lookup used by the join:
   { byId: {id: fact}, byName: {ORDERNAME: fact} }. */
function readOrderFacts_() {
  var out = { byId: {}, byName: {} };
  var ss = dataSS_(), sh = ss.getSheetByName(DTAB.FACTS);
  if (!sh || sh.getLastRow() < 2) return out;
  var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
  for (var i = 1; i < vals.length; i++) {
    var f = {
      id: String(vals[i][c['Order ID']]).trim(),
      name: normOrderName_(vals[i][c['Order Number']]),
      entity: String(vals[i][c['Entity']]).toUpperCase(),
      day: normDayKey_(vals[i][c['Date']]),
      revenue: num_(vals[i][c['Revenue']]),
      currency: String(vals[i][c['Currency']] || ''),
      // Only an explicit TRUE counts as new. 'UNKNOWN' and a blank both read as
      // false HERE, which is the safe direction, and newKnown keeps the difference
      // visible so a diagnostic can say how much revenue has no usable flag.
      isNew: String(vals[i][c['Is New']]).toUpperCase() === 'TRUE',
      newKnown: ['TRUE', 'FALSE'].indexOf(String(vals[i][c['Is New']]).toUpperCase()) >= 0,
      basis: String(vals[i][c['Basis']] || '')
    };
    if (f.id) out.byId[f.id] = f;
    // Order NAMES are only unique within a store, so the name key is scoped by
    // entity — "#1001" exists in both UK and CA.
    if (f.name) out.byName[f.entity + '|' + f.name] = f;
  }
  return out;
}

/* RETRO-FIX FOR THE GUEST-CHECKOUT FLAG.  Run this ONCE after pasting this version.

   Order Facts is write-once: `Is New` is stamped the first time an order is seen and
   never touched again, because customer.numberOfOrders is a LIFETIME counter read at
   query time — re-reading it later would flip an order that WAS a first order into a
   returning one the moment that buyer came back, and last month's new-customer revenue
   would quietly shrink. That rule is right and this function does not break it.

   What it repairs is narrower: rows whose flag was never evidence in the first place.
   The old code read `cust ? (num_(cust.numberOfOrders) <= 1) : true`, so an order with
   NO CUSTOMER RECORD AT ALL — a guest checkout — fell through to `true` and was stamped
   TRUE. That was a guess, not a measurement, and a guess is what this workbook exists
   to avoid. Such rows are identifiable with no Shopify call whatsoever: a guest order
   has a BLANK Customer ID, which is already stored right next to the flag.

   So this reads no lifetime counter, contacts no API, and cannot decay anything. It
   only turns a fabricated TRUE into an honest UNKNOWN. Rows WITH a customer id are not
   touched: for those the counter was populated and `<= 1` really did mean a first order.

   Effect on the reports: new-customer revenue on the channel rows FALLS, and should,
   because it was counting guests. The exec report's "ATTRIBUTED NEW-CX REVENUE EXCEEDS
   THE STORE TOTAL" banner is what this clears. Total revenue does not move at all —
   an UNKNOWN order still counts in revenue and in Orders, just in neither half of the
   split. Safe to run twice; the second run reports 0 changes. */