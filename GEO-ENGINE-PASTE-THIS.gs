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
  function repairGuestIsNew() {
    var lines = ['=== repairGuestIsNew — ' + VERSION + ' ==='];
    var sh = dataSS_().getSheetByName(DTAB.FACTS);
    if (!sh || sh.getLastRow() < 2) {
      var none = 'Order Facts is empty — nothing to repair. Run pullOrders_ / refreshAll() first.';
      Logger.log(none); return none;
    }
    var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
    if (c['Is New'] == null || c['Customer ID'] == null) {
      var bad = 'Order Facts has no "Is New" / "Customer ID" column — wrong tab or an old schema.';
      Logger.log(bad); return bad;
    }
    var col = c['Is New'] + 1, changed = 0, byEnt = {}, guests = 0, withCust = 0;
    var out = [];
    for (var i = 1; i < vals.length; i++) {
      var raw = String(vals[i][c['Is New']] || '').toUpperCase();
      var cust = String(vals[i][c['Customer ID']] || '').trim();
      var ent = String(vals[i][c['Entity']] || '').toUpperCase();
      if (cust) withCust++; else guests++;
      // A guest order carrying TRUE is the fabricated case, and the only one touched.
      if (!cust && raw === 'TRUE') {
        out.push(['UNKNOWN']);
        changed++;
        byEnt[ent] = (byEnt[ent] || 0) + 1;
      } else {
        out.push([vals[i][c['Is New']]]);
      }
    }
    if (changed) sh.getRange(2, col, out.length, 1).setValues(out);
    lines.push(String(vals.length - 1) + ' order fact row(s): ' + withCust + ' with a customer id, ' +
      guests + ' guest checkout(s) with none.');
    lines.push('');
    if (changed) {
      lines.push('REPAIRED ' + changed + ' row(s) from a fabricated TRUE to UNKNOWN:');
      Object.keys(byEnt).sort().forEach(function (k) {
        lines.push('   ' + (k || '(no entity)') + '  ' + byEnt[k]);
      });
      lines.push('');
      lines.push('Those orders keep their revenue and still count in Orders — they are simply');
      lines.push('no longer claimed as NEW customers on the strength of a guess.');
      lines.push('');
      lines.push('NOW: run refreshAll() here so "GEO Channel Daily" is rebuilt off the corrected');
      lines.push('flags, THEN rebuildAll() in the Exec RAG project. The exec report computes');
      lines.push('nothing of its own, so it keeps printing the old figures until both have run.');
    } else {
      lines.push('Nothing to repair — no guest checkout is flagged TRUE.');
      lines.push('If new-Cx revenue still exceeds the store total, the cause is NOT the guest');
      lines.push('flag: run diagnoseSplit() to see what share of orders can be classified at all.');
    }
    var msg = lines.join(String.fromCharCode(10));
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    return msg;
  }

  /* ==================== SPEND — read live from the tracker ================= */
  /* Convert between two real currencies via USD. Used because a spend row carries
    the AD ACCOUNT's currency, which is normally the entity's currency but is not
    guaranteed to be (a shared account, or a row pasted in USD). */
  function fxConvert_(amount, from, to) {
    var a = num_(amount);
    var f = String(from || 'USD').toUpperCase(), t = String(to || 'USD').toUpperCase();
    if (f === t) return a;
    var usd = toUSD_(a, f);
    if (t === 'USD') return usd;
    var r = fxRates_()[t];
    return r ? usd / r : usd;
  }

  /* Locate the tracker's spend tab, trying each known name. Returns the Sheet or
    null. We never create it — this workbook is a reader; if the tab is missing
    that is a problem to fix in the tracker, not to paper over here. */
  function budgetSpendSheet_() {
    var ss;
    try { ss = openById_(CONFIG.BUDGET_SHEET_ID, 'BUDGET_SHEET_ID'); }
    catch (err) { Logger.log('Budget workbook not reachable: ' + err); return null; }
    for (var i = 0; i < CONFIG.BUDGET_SPEND_TABS.length; i++) {
      var sh = ss.getSheetByName(CONFIG.BUDGET_SPEND_TABS[i]);
      if (sh) return sh;
    }
    Logger.log('No spend tab found in the budget workbook. Looked for: ' +
      CONFIG.BUDGET_SPEND_TABS.join(' | ') + '. Tabs present: ' +
      ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
    return null;
  }

  /* Sum the tracker's spend rows into { 'day|ENTITY|Channel': {...} }, in the
    ENTITY's own currency plus USD. Rows for countries outside CONFIG.ENTITIES are
    ignored, so adding USA to the tracker never leaks into this report.
    Also returns spendDays: { 'ENTITY|Channel': {day:1} } so the health tab can
    report how many days of the period actually had a spend row — a channel that
    stopped reporting is a tracking failure, not a zero-spend day. */
  function readSpend_() {
    var out = {}, spendDays = {};
    var sh = budgetSpendSheet_();
    if (!sh || sh.getLastRow() < 2) return { spend: out, spendDays: spendDays };
    var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
    if (c['Date'] == null || c['Country'] == null || c['Platform'] == null || c['Spend'] == null) {
      Logger.log('Spend tab "' + sh.getName() + '" has unexpected headers: ' + JSON.stringify(vals[0]));
      return { spend: out, spendDays: spendDays };
    }
    var kept = 0, dropped = 0;
    for (var i = 1; i < vals.length; i++) {
      var dk = normDayKey_(vals[i][c['Date']]); if (!dk) continue;
      var code = entityForSpendRow_(vals[i][c['Country']],
        c['Campaign'] != null ? vals[i][c['Campaign']] : '');
      if (!code) { dropped++; continue; }                 // out of scope for this report
      var ent = entityByCode_(code);
      var ch = canonChannel_(vals[i][c['Platform']]);
      var rowCur = String(vals[i][c['Currency']] || ent.currency).toUpperCase();
      var key = dk + '|' + code + '|' + ch;
      var o = out[key] || (out[key] = { spend: 0, spendUSD: 0, impr: 0, clicks: 0 });
      o.spend    += fxConvert_(vals[i][c['Spend']], rowCur, ent.currency);
      o.spendUSD += toUSD_(vals[i][c['Spend']], rowCur);
      if (c['Impressions'] != null) o.impr   += num_(vals[i][c['Impressions']]);
      if (c['Clicks'] != null)      o.clicks += num_(vals[i][c['Clicks']]);
      var dayk = code + '|' + ch;
      (spendDays[dayk] || (spendDays[dayk] = {}))[dk] = 1;
      kept++;
    }
    Logger.log('Spend read from "' + sh.getName() + '": ' + kept + ' row(s) in scope, ' +
      dropped + ' row(s) for other countries ignored.');
    return { spend: out, spendDays: spendDays };
  }

  /* ============ ATTRIBUTION — read live from bds-unified =================== */
  /* Each "<CC> Order" tab's PURCHASE rows, joined to Order Facts so every order
    carries a new/returning flag and a matched/unmatched verdict.

    REVENUE RULE: when an attributed row joins to a real Shopify order, the SHOPIFY
    amount is used, not the value the pixel posted — Shopify is the money truth and
    the pixel's Value can be pre-discount, pre-tax or stale. Unmatched rows fall
    back to the pixel Value so they are not silently dropped from revenue; they are
    counted separately so the exec report can show how much revenue rests on
    unmatched rows.

    Returns { 'day|ENTITY|Channel': {orders,matched,revenue,newRevenue,clickIds,
                                      pixelFallbackRevenue,backfillOrders} }  */
  function readAttributed_(facts) {
    var out = {};
    var ss;
    try { ss = openById_(CONFIG.TRACKING_SHEET_ID, 'TRACKING_SHEET_ID'); }
    catch (err) { Logger.log('bds-unified not reachable: ' + err); return out; }

    // Which tab belongs to which entity. Default "<CODE> Order", overridable per
    // entity (PrintFabrix may not be labelled by a country code).
    var tabForEntity = {};
    CONFIG.ENTITIES.forEach(function (e) {
      tabForEntity[String(e.trackingTab || (e.code + ' Order')).toLowerCase()] = e;
    });

    ss.getSheets().forEach(function (sh) {
      var name = sh.getName();
      var baseEnt = tabForEntity[name.toLowerCase()] || null;
      if (!baseEnt && / Order$/i.test(name)) {
        // Also accept any "<something> Order" tab whose prefix aliases an entity.
        var code = entityOfCode_(name.replace(/ Order$/i, ''));
        if (code) baseEnt = entityByCode_(code);
      }
      // Entities that carve rows OUT of this tab — a second store trading inside
      // another store's country, whose purchases land in the host country's tab.
      // Identified per row by Page URL, since the domain is what actually
      // distinguishes printfabrix.com orders from backdropsource.com ones.
      var carveOuts = CONFIG.ENTITIES.filter(function (e) {
        return e.trackingUrlPattern && (e.trackingHostTabs || []).some(function (t) {
          return String(t).toLowerCase() === name.toLowerCase();
        });
      });
      if (!baseEnt && !carveOuts.length) return;
      if (sh.getLastRow() < 2) return;
      var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
      if (c['Timestamp'] == null || c['Stage'] == null) return;

      var CLICK_COLS = ['GCLID', 'GBRAID', 'WBRAID', 'FBCLID', 'MSCLKID', 'LI FAT ID'];
      // ONE ORDER = ONE CONVERSION. bds-unified carries Product and Quantity
      // columns, so an order can arrive as several PURCHASE rows (one per line
      // item), and a re-fired pixel can repost the same order outright. Counting
      // every row would multiply both conversions and revenue by the basket size,
      // which is the single easiest way to make this report flatter itself. So each
      // order id (or, failing that, order number) contributes exactly once. Rows
      // with NEITHER identifier cannot be deduped and are kept, because dropping
      // them would understate revenue — they are reported as `unkeyed`.
      var seenOrder = {}, dupes = 0, unkeyed = 0, carved = 0;
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][c['Stage']]).trim().toLowerCase() !== 'purchase') continue;
        var dt = asDate_(vals[i][c['Timestamp']]); if (!dt) continue;

        // Which entity owns THIS row? A carve-out beats the tab's own entity: a
        // printfabrix.com purchase sitting in "USA Order" is PrintFabrix revenue,
        // not Backdropsource USA revenue.
        var ent = baseEnt;
        if (carveOuts.length && c['Page URL'] != null) {
          var pageUrl = String(vals[i][c['Page URL']] || '');
          for (var ci = 0; ci < carveOuts.length; ci++) {
            try {
              if (new RegExp(carveOuts[ci].trackingUrlPattern, 'i').test(pageUrl)) {
                ent = carveOuts[ci]; carved++; break;
              }
            } catch (err) { /* a bad pattern must not lose the row */ }
          }
        }
        if (!ent) continue;   // a host-tab row belonging to a store outside this report

        var ch = canonChannel_(c['Source'] != null ? vals[i][c['Source']] : '');

        // Join to the Shopify order: id first (exact), then name scoped by entity.
        var oid = c['Order ID'] != null ? gidNum_(vals[i][c['Order ID']]) : '';
        var onm = c['Order Number'] != null ? normOrderName_(vals[i][c['Order Number']]) : '';
        /* RESOLVE THE ORDER BEFORE DEDUPING IT.
          This used to dedupe on `oid || onm` — whichever identifier the PIXEL ROW
          happened to carry — and only then join to Shopify. Two rows for the SAME
          order therefore survived whenever they carried different identifiers:
            row A  Order ID 6234567890, no Order Number  -> key UK|6234567890
            row B  Order Number #1001,  no Order ID      -> key UK|#1001
          Both keys are unique, both rows resolved to the SAME Shopify order, and
          both added that order's revenue and its new/returning flag. One order,
          counted twice. Observed live on UK 1-21 Aug 2026: attributed revenue came
          to 104.6% of everything the store took, and attributed NEW-customer
          revenue to 161% of the store's own new-customer revenue — a subset larger
          than its whole, which is not a data problem but this arithmetic.
          The Shopify order is the thing that must be unique, so the identity used
          for deduping is the RESOLVED order's, not the pixel's. A row that matches
          nothing keeps its own key, because two unmatched rows carrying different
          identifiers really may be two different orders. */
        var f = (oid && facts.byId[oid]) || (onm && facts.byName[ent.code + '|' + onm]) || null;
        var dedupeKey = f ? ('F|' + (f.id || f.name)) : (oid || onm);
        if (dedupeKey) {
          // Scoped by entity: order numbers are only unique within a store, so a
          // host tab holding two stores could otherwise drop a real order.
          var dk2 = ent.code + '|' + dedupeKey;
          if (seenOrder[dk2]) { dupes++; continue; }
          seenOrder[dk2] = 1;
        } else { unkeyed++; }

        // Bucket on the SHOPIFY order's day when matched, so revenue lands on the
        // same calendar day Shopify reports it on; otherwise on the pixel timestamp.
        var dk = f ? f.day : dayKey_(dt);
        var key = dk + '|' + ent.code + '|' + ch;
        var o = out[key] || (out[key] = { orders: 0, matched: 0, revenue: 0, newRevenue: 0,
          clickIds: 0, pixelFallbackRevenue: 0, backfillOrders: 0, newUnknownRevenue: 0 });
        o.orders++;

        var pixVal = c['Value'] != null ? num_(vals[i][c['Value']]) : 0;
        var pixCur = String((c['Currency'] != null ? vals[i][c['Currency']] : '') || ent.currency).toUpperCase();
        if (f) {
          o.matched++;
          var amt = fxConvert_(f.revenue, f.currency || ent.currency, ent.currency);
          o.revenue += amt;
          if (f.isNew) o.newRevenue += amt;
          // Matched, but with no usable new/returning flag — a guest checkout, or a
          // store that does not populate numberOfOrders. Its revenue is real and is
          // counted; it simply cannot be placed in either half.
          else if (f.newKnown === false) o.newUnknownRevenue += amt;
          if (f.basis === 'backfill') o.backfillOrders++;
        } else {
          var fb = fxConvert_(pixVal, pixCur, ent.currency);
          o.revenue += fb;
          o.pixelFallbackRevenue += fb;
          // An unmatched order has no trustworthy new/returning flag, so it is
          // deliberately NOT counted as new revenue — better to understate
          // new-customer revenue than to guess it.
        }
        for (var k = 0; k < CLICK_COLS.length; k++) {
          var ci = c[CLICK_COLS[k]];
          if (ci != null && String(vals[i][ci] || '').trim()) { o.clickIds++; break; }
        }
      }
      if (dupes || unkeyed || carved) {
        Logger.log('Attribution tab "' + name + '": collapsed ' + dupes +
          ' duplicate/line-item purchase row(s) into their order' +
          (carved ? '; carved ' + carved + ' row(s) out to a second store by Page URL' : '') +
          (unkeyed ? '; ' + unkeyed + ' row(s) had no Order ID or Order Number and could not be deduped' : '') + '.');
      }
    });
    return out;
  }

  /* Shopify ground truth per day, read back off our own Shopify Daily tab:
    { 'day|ENTITY': {orders,revenue,newRev,retRev,currency,basis} } */
  function readShopifyDaily_() {
    var out = {};
    var sh = dataSS_().getSheetByName(DTAB.SHOPIFY);
    if (!sh || sh.getLastRow() < 2) return out;
    var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
    /* STRICT on every numeric cell. This is the LAST line of defence against a
      misaligned column: if "Returning Cust Revenue" is actually pointing at a date
      or a label, numStrict_ returns null and we treat the figure as MISSING rather
      than letting num_() render a Date as ~5e14 and calling it revenue. A blank is
      recoverable; a fabricated number in a CEO report is not. */
    var badCells = 0, badDates = 0, badSample = '', implausibleSplits = 0;
    function n_(row, col) {
      if (col == null) return null;
      var v = row[col], s = numStrict_(v);
      if (s === null && v !== '' && v != null) {
        badCells++;
        // Counted separately because it has a DIFFERENT and much cheaper fix than a
        // misaligned column: the value is fine, the cell is merely date-FORMATTED.
        if (v instanceof Date) badDates++;
        if (!badSample) badSample = String(col) + '="' + String(v).slice(0, 40) + '"';
      }
      return s;
    }
    for (var i = 1; i < vals.length; i++) {
      var row = vals[i];
      var dk = normDayKey_(row[c['Date']]); if (!dk) continue;
      var code = String(row[c['Entity']] || '').toUpperCase(); if (!code) continue;
      var newRev = n_(row, c['New Cust Revenue']), retRev = n_(row, c['Returning Cust Revenue']);
      var basis = String(row[c['Revenue Basis']] || '');
      // The split is only usable when BOTH halves parsed as numbers. One bad half
      // would silently halve or explode Blended.
      if (newRev === null || retRev === null) basis = 'orders-only';
      /* AND it has to be plausible against the independent measurement beside it.
        This matters most right after a format repair: fixing a date-formatted cell
        turns it back into its underlying number, which is the RIGHT answer when that
        number was always revenue — but if the cell genuinely held a date, the same
        repair yields its serial (a 2026 date is ~46,000), and that is indistinguishable
        from a plausible day of sales by magnitude alone. The orders-API revenue on the
        same row is the second opinion that catches it. Generous at 10x, because
        ShopifyQL total_sales and the orders API legitimately differ. */
      if (basis !== 'orders-only') {
        var rowRev = numStrict_(row[c['Revenue']]);
        var splitSum = num_(newRev) + num_(retRev);
        if (rowRev !== null && rowRev > 0 && splitSum > rowRev * 10) {
          basis = 'orders-only';
          implausibleSplits++;
        }
      }
      out[dk + '|' + code] = {
        orders:  n_(row, c['Orders']) || 0,
        revenue: n_(row, c['Revenue']) || 0,
        paidRev: n_(row, c['Paid Revenue']) || 0,
        pendRev: n_(row, c['Pending Revenue']) || 0,
        newRev:  newRev === null ? 0 : newRev,
        retRev:  retRev === null ? 0 : retRev,
        newC:    n_(row, c['New Customers']) || 0,
        retC:    n_(row, c['Repeat Customers']) || 0,
        currency: String(row[c['Currency']] || ''),
        basis: basis
      };
    }
    // Published so rebuildAll can SELF-HEAL. An empty cell is not counted above, so
    // a nonzero count means genuinely corrupt content (a date or a label sitting in
    // a money column) — the fingerprint of a stale/misaligned tab, and something a
    // clear-and-re-pull actually fixes. A legitimately absent split never trips it.
    _shopifyBadCells = badCells;
    _shopifyBadDates = badDates;
    if (implausibleSplits) {
      Logger.log('"' + DTAB.SHOPIFY + '": ' + implausibleSplits + ' day(s) had a new/returning split ' +
        'more than 10x that day orders-API revenue, so the SPLIT was dropped for those days ' +
        '(Revenue Basis reads orders-only and the ROAS New / ROAS Existing cells stay blank). ' +
        'A split that size is a parse or format artefact, not sales.');
    }
    if (badCells) {
      Logger.log('"' + DTAB.SHOPIFY + '": ' + badCells + ' numeric cell(s) did not contain a number ' +
        '(e.g. col ' + badSample + ') — treated as MISSING, not coerced.' +
        (badDates
          ? '  ' + badDates + ' of them came back as DATES. That is almost never bad data: a cell ' +
            'formatted as a date is handed to this script as a Date even when it holds a perfectly ' +
            'good number, so the FORMAT is the bug, not the value. rebuildAll() fixes the formats ' +
            'first — or run healNumberFormats() yourself.'
          : '  This is what a misaligned column looks like; rebuildAll() will clear and re-pull ' +
            'the tab automatically.'));
    }
    return out;
  }
  var _shopifyBadCells = 0;
  var _shopifyBadDates = 0;   // the subset with the cheap fix (a date-formatted cell)

  /* ==================== BUILD: the Date x Entity x Channel grain =========== */
  /* Rebuilt from scratch every run — it is pure derivation from the three sources,
    so there is nothing here worth preserving across runs. */
  function buildGrain(src) {
    src = src || loadSources_();
    var spend = src.spend, attr = src.attr;

    var keys = {};
    Object.keys(spend).forEach(function (k) { keys[k] = 1; });
    Object.keys(attr).forEach(function (k) { keys[k] = 1; });

    var rows = Object.keys(keys).map(function (k) {
      var p = k.split('|'), dk = p[0], code = p[1], ch = p[2];
      var ent = entityByCode_(code) || { currency: 'USD' };
      var s = spend[k] || { spend: 0, spendUSD: 0, impr: 0, clicks: 0 };
      var a = attr[k]  || { orders: 0, matched: 0, revenue: 0, newRevenue: 0 };
      var cpa     = a.orders ? s.spend / a.orders : '';
      var roas    = s.spend  ? a.revenue / s.spend : '';
      var roasNew = s.spend  ? a.newRevenue / s.spend : '';
      return [dk, code, ch, ent.currency,
        round2_(s.spend), round2_(s.spendUSD), a.orders,
        round2_(a.revenue), round2_(toUSD_(a.revenue, ent.currency)),
        round2_(a.newRevenue), round2_(toUSD_(a.newRevenue, ent.currency)),
        a.matched,
        cpa === '' ? '' : round2_(cpa),
        roas === '' ? '' : round2_(roas),
        roasNew === '' ? '' : round2_(roasNew),
        s.impr, s.clicks];
    });

    // Date desc, then entity in CONFIG order, then channel in CONFIG order.
    var entOrder = {}, chOrder = {};
    CONFIG.ENTITIES.forEach(function (e, i) { entOrder[e.code] = i; });
    CONFIG.CHANNELS.forEach(function (ch, i) { chOrder[ch] = i; });
    rows.sort(function (x, y) {
      if (x[0] !== y[0]) return x[0] < y[0] ? 1 : -1;
      var ex = entOrder[x[1]] == null ? 99 : entOrder[x[1]], ey = entOrder[y[1]] == null ? 99 : entOrder[y[1]];
      if (ex !== ey) return ex - ey;
      var cx = chOrder[x[2]] == null ? 99 : chOrder[x[2]], cy = chOrder[y[2]] == null ? 99 : chOrder[y[2]];
      if (cx !== cy) return cx - cy;
      return String(x[2]) < String(y[2]) ? -1 : 1;
    });

    var sh = tab_(dataSS_(), DTAB.GRAIN, GRAIN_HEADERS);
    clearBody_(sh);
    if (rows.length) {
      sh.getRange(2, 1, rows.length, GRAIN_HEADERS.length).setValues(rows);
      var n = rows.length;
      /* Formats by header NAME, not by column number. This tab used to hard-code the
        ranges (cols 5-6 money, 7 count, 8-11 money, ...) which is the same fragile
        pattern the readers are forbidden to use: insert one column and every format
        silently lands one place to the left. It is also the reason THIS tab escaped
        the 2026-08-21 incident while "Shopify Daily" did not — the grain pinned its
        formats and Shopify Daily never pinned any, so a stray date format there was
        free to persist and turn real revenue into 11/14/1906. */
      enforceFormats_(sh);
      band_(sh, 2, n, GRAIN_HEADERS.length);
    }
    sh.autoResizeColumns(1, GRAIN_HEADERS.length);
    Logger.log('Grain rebuilt: ' + rows.length + ' Date x Entity x Channel row(s).');
    return rows.length;
  }

  /* =========================== PERIODS ==================================== */
  /* Resolve a period label to inclusive 'yyyy-mm-dd' bounds in the report zone. */
  function periodRange_(label) {
    var today = new Date(), tk = dayKey_(today);
    function k(d) { return dayKey_(d); }
    function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1, 12); }
    function monthEnd(d)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12); }
    switch (String(label || CONFIG.DEFAULT_PERIOD)) {
      case 'Today':         return { from: tk, to: tk, label: 'Today' };
      case 'Yesterday':     var y = addDays_(today, -1); return { from: k(y), to: k(y), label: 'Yesterday' };
      case 'Last 7 days':   return { from: k(addDays_(today, -6)),  to: tk, label: 'Last 7 days' };
      case 'Last 14 days':  return { from: k(addDays_(today, -13)), to: tk, label: 'Last 14 days' };
      case 'Last 60 days':  return { from: k(addDays_(today, -59)), to: tk, label: 'Last 60 days' };
      case 'Last 90 days':  return { from: k(addDays_(today, -89)), to: tk, label: 'Last 90 days' };
      case 'This month':
      case 'Month to date': return { from: k(monthStart(today)), to: tk, label: 'Month to date' };
      case 'Last month':
        var lm = new Date(today.getFullYear(), today.getMonth() - 1, 15, 12);
        return { from: k(monthStart(lm)), to: k(monthEnd(lm)),
                label: Utilities.formatDate(lm, tz_(), 'MMMM yyyy') };
      default:              return { from: k(addDays_(today, -29)), to: tk, label: 'Last 30 days' };
    }
  }
  function inRange_(dk, from, to) { return dk >= from && dk <= to; }

  /* ==================== MONTHS (for the comparison tabs) ================== */
  /* A month is identified by 'yyyy-mm'. Everything below works on that string so
    month arithmetic never goes through a Date and never drifts a day. */
  function monthKeyOf_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM'); }
  function prevMonthKey_(mk) {
    var y = +String(mk).slice(0, 4), m = +String(mk).slice(5, 7) - 1;   // 0-based
    m -= 1; if (m < 0) { m = 11; y -= 1; }
    return y + '-' + (m + 1 < 10 ? '0' : '') + (m + 1);
  }
  /* Inclusive day bounds of a month. The end is capped at TODAY for the current
    month, so an in-flight month is compared as month-to-date rather than against
    a full previous month — otherwise August always looks catastrophic on the 3rd. */
  function monthRange_(mk, capToToday) {
    var y = +String(mk).slice(0, 4), m = +String(mk).slice(5, 7);
    var first = y + '-' + (m < 10 ? '0' : '') + m + '-01';
    var lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    var last = y + '-' + (m < 10 ? '0' : '') + m + '-' + (lastDay < 10 ? '0' : '') + lastDay;
    var today = dayKey_(new Date());
    if (capToToday && last > today) last = today;
    return { from: first, to: last };
  }
  /* Month options for the dropdown: this month back through LOOKBACK_DAYS. */
  function monthOptions_() {
    var out = [], mk = monthKeyOf_(new Date());
    var n = Math.max(2, Math.ceil(CONFIG.LOOKBACK_DAYS / 28));
    for (var i = 0; i < n; i++) { out.push(mk); mk = prevMonthKey_(mk); }
    return out;
  }
  function monthLabel_(mk) {
    var y = +String(mk).slice(0, 4), m = +String(mk).slice(5, 7);
    var names = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
    return names[m - 1] + ' ' + y;
  }

  /* ============ MANUAL VERIFICATION TICKS (conversion tracking health) ===== */
  /* The Verified column is ticked BY HAND after a human has checked the numbers,
    so it is data the script must never invent — and never destroy. The tabs are
    rebuilt from scratch on every refresh, which would wipe a checkbox written
    into a cell, so the ticks live in Script Properties keyed
    ENTITY|CHANNEL|yyyy-mm and are re-rendered on each build. Ticking a box is
    therefore a durable sign-off against a specific month, not a note that
    survives only until the next refresh. */
  function verifiedMap_() {
    try {
      var raw = PropertiesService.getScriptProperties().getProperty('geoVerifiedDaily');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  /* One tick per COUNTRY per DAY — the daily tabs put channels in columns, so a
    row is a single day and the sign-off covers that whole day's line. */
  function verifiedKey_(code, dk) { return code + '|' + dk; }
  function setVerified_(code, dk, on) {
    var map = verifiedMap_(), key = verifiedKey_(code, dk);
    if (on) map[key] = 1; else delete map[key];
    PropertiesService.getScriptProperties().setProperty('geoVerifiedDaily', JSON.stringify(map));
    return map;
  }
  function isVerified_(map, code, dk) { return !!map[verifiedKey_(code, dk)]; }

  /* ========================== AGGREGATION ================================= */
  /* One pass over all three sources for a date range, producing everything both
    reports need. Recomputed rather than summed off the grain tab because health
    needs columns the grain does not carry (click-id capture, backfill share,
    pixel-fallback revenue).

    Returns { period, byEntity: { CODE: {
        channels: { Channel: metrics }, overall: metrics, shopify: {...},
        spendDays: {Channel: n}, periodDays: n } } }                          */
  /* Read all three sources ONCE. Aggregating N periods must never re-read them:
    every read scans whole workbooks, and the comparison tabs need TWO periods for
    each of five entities — ten independent aggregate passes would sail past the
    6-minute execution limit. Callers that build more than one view load the
    sources here and hand the same object to each aggregate_ call. */
  function loadSources_() {
    var sp = readSpend_();
    var facts = readOrderFacts_();
    return {
      spend: sp.spend, spendDays: sp.spendDays,
      attr: readAttributed_(facts), shop: readShopifyDaily_()
    };
  }
  function aggregate_(from, to, src) {
    src = src || loadSources_();
    var spend = src.spend, spendDays = src.spendDays, attr = src.attr, shop = src.shop;

    function blank() {
      return { spend: 0, spendUSD: 0, orders: 0, matched: 0, revenue: 0, newRevenue: 0,
              clickIds: 0, pixelFallback: 0, backfillOrders: 0, impr: 0, clicks: 0 };
    }
    var byEntity = {};
    CONFIG.ENTITIES.forEach(function (e) {
      byEntity[e.code] = { channels: {}, overall: blank(), paid: blank(), spendDays: {},
        shopify: { orders: 0, revenue: 0, newRev: 0, retRev: 0, days: 0, qlDays: 0 } };
    });
    function slot(code, ch) {
      var b = byEntity[code]; if (!b) return null;
      return b.channels[ch] || (b.channels[ch] = blank());
    }
    var isPaid = {};
    CONFIG.CHANNELS.forEach(function (ch) { isPaid[ch] = 1; });
    /* The buckets a row must be added to: its channel, the entity's PAID subtotal
      (only for a configured paid channel) and the entity's OVERALL. */
    function targets(code, ch) {
      var s = slot(code, ch); if (!s) return null;
      var b = byEntity[code], list = [s, b.overall];
      if (isPaid[ch]) list.push(b.paid);
      return list;
    }

    Object.keys(spend).forEach(function (key) {
      var p = key.split('|'); if (!inRange_(p[0], from, to)) return;
      var list = targets(p[1], p[2]); if (!list) return;
      var v = spend[key];
      list.forEach(function (t) {
        t.spend += v.spend; t.spendUSD += v.spendUSD; t.impr += v.impr; t.clicks += v.clicks;
      });
    });
    Object.keys(attr).forEach(function (key) {
      var p = key.split('|'); if (!inRange_(p[0], from, to)) return;
      var list = targets(p[1], p[2]); if (!list) return;
      var v = attr[key];
      list.forEach(function (t) {
        ['orders', 'matched', 'revenue', 'newRevenue', 'clickIds'].forEach(function (f) { t[f] += v[f]; });
        t.pixelFallback  += v.pixelFallbackRevenue;
        t.backfillOrders += v.backfillOrders;
      });
    });
    Object.keys(shop).forEach(function (key) {
      var p = key.split('|'); if (!inRange_(p[0], from, to)) return;
      var b = byEntity[p[1]]; if (!b) return;
      var v = shop[key];
      b.shopify.orders += v.orders; b.shopify.revenue += v.revenue;
      b.shopify.newRev += v.newRev; b.shopify.retRev += v.retRev;
      b.shopify.days++;
      if (hasSplitBasis_(v.basis)) b.shopify.qlDays++;
    });
    // How many distinct days in the period each channel actually reported spend.
    Object.keys(spendDays).forEach(function (k) {
      var p = k.split('|'), b = byEntity[p[0]]; if (!b) return;
      var n = 0;
      Object.keys(spendDays[k]).forEach(function (dk) { if (inRange_(dk, from, to)) n++; });
      b.spendDays[p[1]] = n;
    });

    var days = 1 + Math.round((asDate_(to).getTime() - asDate_(from).getTime()) / 86400000);
    return { period: { from: from, to: to, days: days }, byEntity: byEntity };
  }

  /* Which channels to print for an entity: the configured list, plus anything the
    feeds actually reported (so a channel nobody configured cannot vanish). */
  function channelsFor_(bucket) {
    var list = CONFIG.CHANNELS.slice();
    if (CONFIG.SHOW_OTHER) {
      Object.keys(bucket.channels).sort().forEach(function (ch) {
        if (list.indexOf(ch) === -1) list.push(ch);
      });
    }
    return list;
  }
  function healthFlag_(share) {
    if (share === '' || share == null) return '—';
    if (share >= CONFIG.HEALTH.good) return '🟢';
    if (share >= CONFIG.HEALTH.warn) return '🟡';
    return '🔴';
  }

  /* ===================== BUILD: Tracking Health tab ======================= */
  function buildHealth(agg) {
    if (!agg) { var p = currentPeriod_(); agg = aggregate_(p.from, p.to); }
    var sh = tab_(dataSS_(), DTAB.HEALTH, HEALTH_HEADERS);
    clearBody_(sh);
    var rows = [];
    CONFIG.ENTITIES.forEach(function (e) {
      var b = agg.byEntity[e.code]; if (!b) return;
      var chans = channelsFor_(b);
      chans.forEach(function (ch) {
        var m = b.channels[ch] || null;
        if (!m || (!m.spend && !m.orders)) {
          rows.push([e.label, ch, 0, 0, '', 0, '', '', '', '', (b.spendDays[ch] || 0),
            agg.period.days - (b.spendDays[ch] || 0), '', healthFlag_('')]);
          return;
        }
        var match = pct_(m.matched, m.orders);
        rows.push([e.label, ch, m.orders, m.matched, match === '' ? '' : round4_(match),
          round2_(m.revenue), '', '', '',
          m.orders ? round4_(m.clickIds / m.orders) : '',
          (b.spendDays[ch] || 0), agg.period.days - (b.spendDays[ch] || 0),
          m.orders ? round4_(m.backfillOrders / m.orders) : '',
          healthFlag_(match)]);
      });
      // The entity OVERALL line is where true coverage lives: attributed revenue
      // measured against what Shopify says actually happened.
      var o = b.overall, cov = pct_(o.revenue, b.shopify.revenue);
      rows.push([e.label, 'OVERALL', o.orders, o.matched,
        o.orders ? round4_(pct_(o.matched, o.orders)) : '',
        round2_(o.revenue), round2_(b.shopify.revenue),
        cov === '' ? '' : round4_(cov),
        round2_(Math.max(0, b.shopify.revenue - o.revenue)),
        o.orders ? round4_(o.clickIds / o.orders) : '',
        '', '',
        o.orders ? round4_(o.backfillOrders / o.orders) : '',
        healthFlag_(cov)]);
    });
    if (rows.length) {
      sh.getRange(2, 1, rows.length, HEALTH_HEADERS.length).setValues(rows);
      var n = rows.length;
      sh.getRange(2, 3, n, 2).setNumberFormat('#,##0');
      sh.getRange(2, 5, n, 1).setNumberFormat('0.0%');
      sh.getRange(2, 6, n, 2).setNumberFormat('#,##0.00');
      sh.getRange(2, 8, n, 1).setNumberFormat('0.0%');
      sh.getRange(2, 9, n, 1).setNumberFormat('#,##0.00');
      sh.getRange(2, 10, n, 1).setNumberFormat('0.0%');
      sh.getRange(2, 11, n, 2).setNumberFormat('#,##0');
      sh.getRange(2, 13, n, 1).setNumberFormat('0.0%');
      band_(sh, 2, n, HEALTH_HEADERS.length);
    }
    sh.getRange(1, HEALTH_HEADERS.length + 2).setValue(
      'Period ' + agg.period.from + ' to ' + agg.period.to +
      '. Match % = attributed orders that join to a real Shopify order. ' +
      'Coverage % = attributed revenue / Shopify revenue (OVERALL rows only). ' +
      'Spend Days Missing = days in the period with no spend row from that channel.');
    sh.autoResizeColumns(1, HEALTH_HEADERS.length);
    Logger.log('Tracking Health rebuilt: ' + rows.length + ' row(s).');
  }

  /* ========================= BUILD: Exec Report =========================== */
  var EXEC_HEADERS = ['Entity', 'Channel', 'Cur', 'Spend', 'Revenue', 'New Cust Revenue',
    'ROAS', 'ROAS (New)', 'Conversions', 'CPA', 'Tracking Health', 'Basis',
    'Spend USD', 'Revenue USD', 'New Cust Rev USD'];

  function currentPeriod_() {
    var label = CONFIG.DEFAULT_PERIOD;
    try {
      var sh = execSS_().getSheetByName(ETAB.EXEC);
      if (sh) {
        var v = String(sh.getRange('B2').getValue() || '').trim();
        if (v && PERIODS.indexOf(v) !== -1) label = v;
      }
    } catch (e) {}
    var r = periodRange_(label);
    r.name = label;
    return r;
  }

  function buildExec(src) {
    var p = currentPeriod_();
    var agg = aggregate_(p.from, p.to, src);
    var ss = execSS_();
    var sh = ss.getSheetByName(ETAB.EXEC) || ss.insertSheet(ETAB.EXEC);
    sh.clear();
    sh.clearConditionalFormatRules();

    var W = EXEC_HEADERS.length;
    sh.getRange('A1').setValue('GEO × CHANNEL PERFORMANCE')
      .setFontSize(16).setFontWeight('bold').setFontColor(HEADER_BG);
    sh.getRange('A2').setValue('Period').setFontWeight('bold');
    sh.getRange('B2').setValue(p.name);
    sh.getRange('B2').setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(PERIODS, true).setAllowInvalid(false).build());
    sh.getRange('C2').setValue(p.from + '  to  ' + p.to + '   (' + agg.period.days + ' days)');
    // NOTE: nothing above the header row may be MERGED across the whole width.
    // setFrozenColumns(2) below puts the freeze boundary after column B, and Sheets
    // refuses to freeze columns that cut through a merged cell — a full-width merge
    // in a frozen row throws "you can't freeze columns which contain only part of a
    // merged cell". The explanatory note therefore lives in the footer instead.
    var top = 5;
    sh.getRange(top, 1, 1, W).setValues([EXEC_HEADERS])
      .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
    sh.setFrozenRows(top);
    sh.setFrozenColumns(2);

    var rows = [], overallRowOffsets = [], subtotalRowOffsets = [], notes = [];
    CONFIG.ENTITIES.forEach(function (e) {
      var b = agg.byEntity[e.code];
      if (!isConfigured_(e)) {
        notes.push(e.label + ' — Shopify not configured yet, so revenue / new-customer ' +
          'revenue / health are blank. Spend and conversions still show if the feeds carry ' +
          '"' + e.code + '" rows.');
      }
      channelsFor_(b).forEach(function (ch) {
        rows.push(execRow_(e, ch, b, 'channel'));
      });
      if (CONFIG.SHOW_PAID_SUBTOTAL) {
        subtotalRowOffsets.push(rows.length);
        rows.push(execRow_(e, 'PAID SUBTOTAL', b, 'paid'));
      }
      overallRowOffsets.push(rows.length);
      rows.push(execRow_(e, 'OVERALL', b, 'overall'));
    });

    if (rows.length) {
      sh.getRange(top + 1, 1, rows.length, W).setValues(rows);
      var n = rows.length, r0 = top + 1;
      sh.getRange(r0, 4, n, 3).setNumberFormat('#,##0.00');    // Spend, Revenue, New Rev
      sh.getRange(r0, 7, n, 2).setNumberFormat('0.00');        // ROAS, ROAS New
      sh.getRange(r0, 9, n, 1).setNumberFormat('#,##0');       // Conversions
      sh.getRange(r0, 10, n, 1).setNumberFormat('#,##0.00');   // CPA
      sh.getRange(r0, 11, n, 1).setNumberFormat('0.0%');       // Health
      sh.getRange(r0, 13, n, 3).setNumberFormat('#,##0.00');   // USD trio
      band_(sh, r0, n, W);
      // PAID SUBTOTAL reads as a subtotal; OVERALL carries the entity's verdict.
      subtotalRowOffsets.forEach(function (off) {
        sh.getRange(r0 + off, 1, 1, W).setBackground('#EEF3EA').setFontStyle('italic');
      });
      overallRowOffsets.forEach(function (off) {
        sh.getRange(r0 + off, 1, 1, W).setBackground(TOTAL_BG).setFontWeight('bold');
      });
      var hRange = sh.getRange(r0, 11, n, 1);
      sh.setConditionalFormatRules([
        SpreadsheetApp.newConditionalFormatRule()
          .whenNumberGreaterThanOrEqualTo(CONFIG.HEALTH.good).setBackground('#CDEBD3').setRanges([hRange]).build(),
        SpreadsheetApp.newConditionalFormatRule()
          .whenNumberBetween(CONFIG.HEALTH.warn, CONFIG.HEALTH.good).setBackground('#FCEFA1').setRanges([hRange]).build(),
        SpreadsheetApp.newConditionalFormatRule()
          .whenNumberLessThan(CONFIG.HEALTH.warn).setBackground('#F4C7C3').setRanges([hRange]).build()
      ]);
    }

    var foot = top + rows.length + 2;
    sh.getRange(foot, 1).setValue(
      'Each entity is reported on its own lines and is deliberately NEVER rolled up with another — ' +
      'there is no cross-GEO total row. Money is shown in each entity\'s OWN currency (the figure that ' +
      'ties to Shopify and to the ad platform UI); the USD columns on the right are a live-rate ' +
      'convenience for reading GEOs side by side.').setFontColor('#666666');
    sh.getRange(foot + 1, 1).setValue('Built ' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm') +
      ' · ' + VERSION + ' · spend read live from the Ad Budget Tracker, attribution from bds-unified, ' +
      'ground truth from each store\'s Shopify API. Nothing is re-keyed or pasted.')
      .setFontColor('#666666');
    foot += 1;
    notes.forEach(function (t, i) {
      sh.getRange(foot + 1 + i, 1).setValue('⚠ ' + t).setFontColor('#B45309');
    });

    sh.autoResizeColumns(1, W);
    sh.setColumnWidth(1, 110);
    buildMethodTab_();
    Logger.log('Exec report rebuilt for ' + p.name + ' (' + p.from + ' to ' + p.to + '): ' + rows.length + ' row(s).');
  }

  /* One exec row. `mode` picks which bucket is printed and, with it, what "Tracking
    Health" means on that row:
      'channel' — one paid channel; health = order match %
      'paid'    — the CONFIG.CHANNELS subtotal; health = order match %
      'overall' — everything including Direct/organic; health = revenue coverage
                  against Shopify, which is the only place true coverage belongs. */
  function execRow_(e, label, b, mode) {
    var m = mode === 'overall' ? b.overall
          : mode === 'paid'    ? b.paid
          : (b.channels[label] || null);
    if (!m) m = { spend: 0, spendUSD: 0, orders: 0, matched: 0, revenue: 0, newRevenue: 0, clickIds: 0 };
    var spend = m.spend, rev = m.revenue, newRev = m.newRevenue;
    var roas    = spend ? rev / spend : '';
    var roasNew = spend ? newRev / spend : '';
    var cpa     = m.orders ? spend / m.orders : '';
    var health, basis;
    if (mode === 'overall') {
      health = pct_(rev, b.shopify.revenue);
      basis  = b.shopify.revenue ? 'coverage vs Shopify' : 'no Shopify data';
    } else {
      health = pct_(m.matched, m.orders);
      basis  = m.orders ? (mode === 'paid' ? 'order match (paid)' : 'order match') : '—';
    }
    return [
      e.label, label, e.currency,
      round2_(spend), round2_(rev), round2_(newRev),
      roas === '' ? '' : round2_(roas),
      roasNew === '' ? '' : round2_(roasNew),
      m.orders,
      cpa === '' ? '' : round2_(cpa),
      health === '' ? '' : round4_(health),
      basis,
      round2_(m.spendUSD),
      round2_(toUSD_(rev, e.currency)),
      round2_(toUSD_(newRev, e.currency))
    ];
  }

  /* ================ BUILD: per-country DAILY tabs ========================= */
  /* THE deliverable. One tab per country, laid out exactly like the reference
    workbook: paid-channel SPEND across the top, then the revenue buckets, then
    ROAS, conversions and CPA — with ONE ROW PER DAY and a TOTAL row.
    Everything is centre-aligned and money carries that country's own symbol.

    COLUMNS
      Date                      the day, in the store's own calendar
      Country                   constant per tab, so a copied row still says where it came from
      Google · Bing · Meta ·    that channel's SPEND for the day
        LinkedIn
      Spent                     total spend across every channel that reported
      Pending                   revenue on orders awaiting payment (PENDING + AUTHORIZED)
      Paid                      revenue on orders paid (PAID + PARTIALLY_PAID)
      Blended                   total sales = New Cx Revenue + Existing Cx Revenue
      New Cx Revenue            revenue from customers on their FIRST order
      Existing Cx Revenue       revenue from customers who had ordered before
      ROAS New                  New Cx Revenue / Spent
      ROAS Existing             Existing Cx Revenue / Spent
      ROAS Blended              Blended / Spent  ( == ROAS New + ROAS Existing )
      Orders                    orders that day
      CPA New                   Spent / NEW Cx acquired
      CPA Existing              Spent / EXISTING Cx who ordered
      Health Check              a checkbox YOUR TEAM ticks after checking the day

    WHY BOTH REVENUE HALVES ARE PRINTED
      Because a ROAS is only as believable as its numerator. "ROAS New looks too
      high" is a question about New Cx Revenue, and with that column on the row the
      answer is one division away instead of a trip into Shopify. The two halves
      also make the identity visible: they add to Blended, so the three ROAS
      columns add up, and when they are BLANK the reason the ROAS columns are blank
      is visible too.

    WHY ROAS Blended REALLY DOES EQUAL New + Existing
      Blended is taken as new-customer revenue + existing-customer revenue (both
      from the same ShopifyQL total-sales split), so dividing each by the same
      Spent makes the three ROAS columns add up exactly, as specified. Paid and
      Pending come from a DIFFERENT question — order payment status — so
      Paid + Pending is NOT expected to equal Blended: refunded and voided orders
      sit in neither bucket, and Blended is net of discounts and returns. The
      reference workbook shows the same gap. The footer says so on every tab. */

  /* Money format carrying the country's own symbol, so a UK tab reads £ and an
    India tab reads ₹ without anyone having to check which sheet they are on. */
  function moneyFmt_(cur) {
    var c = String(cur || 'USD').toUpperCase();
    var sym = { USD: '$', CAD: '$', AUD: '$', NZD: '$', SGD: '$', GBP: '£', EUR: '€', INR: '₹' }[c];
    return sym ? sym + '#,##0.00' : '"' + c + ' "#,##0.00';
  }
  var DAILY_HEAD_BG = '#4F81BD', DAILY_SUB_BG = '#DCE6F1', DAILY_TOTAL_BG = '#FFF2CC';

  /* THE DAILY TAB, DEFINED ONCE.
    The group band, the header row, the number formats and the row builder all read
    THIS list, so they cannot drift apart. The tab used to hard-code its formats by
    column number (cols 5-6 money, 7 count, ...) and that is exactly how a layout
    ends up printing revenue under a ROAS header the first time a column is added.
    Every position downstream is looked up by KEY.

    'Cx' is the house abbreviation for customer, used on every label.
    `group` empty means the column stands alone and merges DOWN through the band
    instead of sitting under a heading. */
  var GRP_SPEND = 'SPEND  —  what we paid';
  var GRP_REV   = 'REVENUE  —  what came back';
  var GRP_ROAS  = 'ROAS  —  revenue ÷ spend';
  var GRP_CPA   = 'CPA  —  spend ÷ Cx acquired';

  function dailyCols_() {
    var cols = [{ key: 'date', label: 'Date', group: '', kind: 'label', w: 96 }];
    // Each paid channel's SPEND. Named from CONFIG so adding a channel needs no edit.
    CONFIG.CHANNELS.forEach(function (ch) {
      cols.push({ key: 'ch:' + ch, label: ch, group: GRP_SPEND, kind: 'money', w: 92 });
    });
    cols.push({ key: 'spent',   label: 'Spent',               group: GRP_SPEND, kind: 'money', w: 100 });
    cols.push({ key: 'pending', label: 'Pending',             group: GRP_REV,   kind: 'money', w: 100 });
    cols.push({ key: 'paid',    label: 'Paid',                group: GRP_REV,   kind: 'money', w: 100 });
    cols.push({ key: 'blended', label: 'Blended',             group: GRP_REV,   kind: 'money', w: 104 });
    // The two halves of Blended, printed so the ROAS above can be CHECKED by hand
    // rather than taken on trust — a ROAS New that looks too high is a question
    // about its numerator, and this is the numerator.
    cols.push({ key: 'newRev',  label: 'New Cx Revenue',      group: GRP_REV,   kind: 'money', w: 118 });
    cols.push({ key: 'oldRev',  label: 'Existing Cx Revenue', group: GRP_REV,   kind: 'money', w: 130 });
    cols.push({ key: 'roasNew', label: 'ROAS New',            group: GRP_ROAS,  kind: 'roas',  w: 96 });
    cols.push({ key: 'roasOld', label: 'ROAS Existing',       group: GRP_ROAS,  kind: 'roas',  w: 104 });
    cols.push({ key: 'roasBl',  label: 'ROAS Blended',        group: GRP_ROAS,  kind: 'roas',  w: 108 });
    cols.push({ key: 'orders',  label: 'Orders',              group: '',        kind: 'int',   w: 84 });
    cols.push({ key: 'cpaNew',  label: 'CPA New',             group: GRP_CPA,   kind: 'money', w: 100 });
    cols.push({ key: 'cpaOld',  label: 'CPA Existing',        group: GRP_CPA,   kind: 'money', w: 106 });
    cols.push({ key: 'health',  label: 'Health Check',        group: '',        kind: 'check', w: 104 });
    return cols;
  }
  /* The header row, still a flat list — onExecEdit uses its LENGTH to find the tick
    column, and the Method tab prints it. */
  function dailyHeaders_() {
    return dailyCols_().map(function (c) { return c.label; });
  }
  /* 1-based column of a key. Throws rather than returning 0: a silent 0 would make
    getRange(r, 0, ...) fail somewhere far away from the actual mistake. */
  function dcol_(cols, key) {
    for (var i = 0; i < cols.length; i++) if (cols[i].key === key) return i + 1;
    throw new Error('dailyCols_ has no column keyed "' + key + '" — the spec and a ' +
      'lookup have drifted apart.');
  }
  /* Contiguous runs of the same group name, for the merged band above the headers. */
  function dailyGroupSpans_(cols) {
    var out = [];
    for (var i = 0; i < cols.length; i++) {
      if (out.length && out[out.length - 1].name === cols[i].group && cols[i].group !== '') {
        out[out.length - 1].span++; continue;
      }
      out.push({ name: cols[i].group, start: i + 1, span: 1 });
    }
    return out;
  }

  /* Every day of `mk` up to today, as 'yyyy-mm-dd' strings. */
  function daysOfMonth_(mk) {
    var r = monthRange_(mk, true), out = [];
    // A month entirely in the future caps to a `to` that precedes `from`; return
    // nothing rather than emitting days that do not exist yet.
    if (r.to < r.from) return out;
    var last = +r.to.slice(8, 10);
    for (var d = 1; d <= last; d++) out.push(r.from.slice(0, 8) + (d < 10 ? '0' : '') + d);
    return out;
  }

  function buildDailyTabs(src, monthKey) {
    src = src || loadSources_();
    var ss = execSS_();
    var mk = monthKey || currentDailyMonth_();
    if (!/^\d{4}-\d{2}$/.test(mk)) mk = monthKeyOf_(new Date());
    var verified = verifiedMap_();
    CONFIG.ENTITIES.forEach(function (e) {
      buildEntityDaily_(ss, e, mk, src, verified);
    });
    // Put the country tabs FIRST in the strip, in CONFIG order. These are the
    // report; the raw data tabs are scaffolding and belong behind them — which
    // matters most when SINGLE_WORKBOOK puts them in the same file.
    try {
      CONFIG.ENTITIES.forEach(function (e, i) {
        var sh = ss.getSheetByName(e.label);
        if (!sh) return;
        ss.setActiveSheet(sh);
        ss.moveActiveSheet(i + 1);
      });
    } catch (err) { Logger.log('tab ordering skipped: ' + err); }
    Logger.log('Daily tabs rebuilt for ' + monthLabel_(mk) + ' — ' +
      CONFIG.ENTITIES.map(function (e) { return e.label; }).join(', ') +
      ' — in "' + ss.getName() + '"');
  }

  function buildEntityDaily_(ss, e, mk, src, verified) {
    var sh = ss.getSheetByName(e.label) || ss.insertSheet(e.label);
    /* UNFREEZE AND UNMERGE BEFORE ANYTHING ELSE, and in this order.
      sh.clear() removes values and formats but does NOT remove frozen rows and does
      NOT remove merges. Both outlive a rebuild, and both then break the next one:
        - a merge that straddles the freeze line is refused outright by Sheets, so a
          tab still frozen at the OLD header row cannot be given a header block of a
          different height. That is precisely what broke when the group band moved
          the header row from 3 to 4: the vertical merge spanning rows 3-4 had row 3
          frozen and row 4 not.
        - merges left behind at their old rows survive clear(), so a table whose
          height changed strands merged cells below it and looks broken after a few
          rebuilds.
      Unfreezing FIRST is what makes this tab safe to re-lay-out at any size, which
      is the whole point of rebuilding it from scratch every run. */
    try { sh.setFrozenRows(0); sh.setFrozenColumns(0); } catch (eF) {}
    try { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); } catch (eF) {}
    sh.clear();
    sh.clearConditionalFormatRules();

    var COLS = dailyCols_(), HEAD = dailyHeaders_(), W = HEAD.length;
    var nCh = CONFIG.CHANNELS.length;
    // Every position by KEY. The Country column is gone — the TAB is the country,
    // so a column repeating it on all 31 rows was just width.
    var cCh0    = dcol_(COLS, 'ch:' + CONFIG.CHANNELS[0]);
    var cSpent  = dcol_(COLS, 'spent');
    var cNewRev = dcol_(COLS, 'newRev');
    var cRoasN  = dcol_(COLS, 'roasNew');
    var cRoasBl = dcol_(COLS, 'roasBl');
    var cOrders = dcol_(COLS, 'orders');
    var cCpaN   = dcol_(COLS, 'cpaNew');
    var cHealth = dcol_(COLS, 'health');
    var days = daysOfMonth_(mk);

    /* CURRENCY. With REPORT_IN_USD every money figure is converted at the live
      rate so all five country tabs read in one currency and can be compared
      directly. Spend already arrives with a true USD figure alongside the local
      one (each row converted from its own ad-account currency), so we use that
      rather than re-converting an already-blended local total. */
    var useUSD = CONFIG.REPORT_IN_USD !== false;
    var dispCur = useUSD ? CONFIG.REPORT_CURRENCY : e.currency;
    var fmtMoney = moneyFmt_(dispCur);
    function money_(amount, fromCur) {
      return useUSD ? toUSD_(amount, fromCur || e.currency) : num_(amount);
    }

    /* ---- control row ---- */
    sh.getRange(1, 1).setValue('Month').setFontWeight('bold');
    sh.getRange(1, 2).setValue(mk).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(monthOptions_(), true).setAllowInvalid(false).build());
    sh.getRange(1, 3).setValue('← change the month; this tab rebuilds itself')
      .setFontColor('#808080');

    /* ---- title band. Painted across the row but NOT merged: a merge spanning the
            frozen-column boundary is rejected by Sheets outright. ---- */
    sh.getRange(2, 1, 1, W).setBackground(DAILY_HEAD_BG).setFontColor('#FFFFFF');
    sh.getRange(2, 1).setValue(e.label.toUpperCase() + '  —  DAILY PERFORMANCE  —  ' +
        monthLabel_(mk) + '  (' + dispCur + (useUSD && e.currency !== dispCur
          ? ' — converted from ' + e.currency + ' at the live rate' : '') + ')')
      .setFontSize(13).setFontWeight('bold');
    sh.setRowHeight(2, 26);

    /* ---- row 3: the GROUP BAND, so it is unambiguous which columns are money we
            SPENT and which are money that CAME BACK. Single-column groups merge
            DOWN through both rows, exactly as the exec report does it. ---- */
    var grp = 3, top = 4;
    dailyGroupSpans_(COLS).forEach(function (g) {
      if (g.name === '') {
        sh.getRange(grp, g.start, 2, 1).merge().setValue(COLS[g.start - 1].label);
      } else {
        sh.getRange(grp, g.start, 1, g.span).merge().setValue(g.name);
      }
    });
    sh.getRange(grp, 1, 1, W).setBackground(DAILY_HEAD_BG).setFontColor('#FFFFFF')
      .setFontWeight('bold').setFontSize(11);
    sh.setRowHeight(grp, 28);

    /* ---- row 4: the header row. Only the columns the band did NOT already merge
            over get a label of their own. ---- */
    COLS.forEach(function (c, i) {
      if (c.group === '') return;                 // merged down from the band above
      sh.getRange(top, i + 1).setValue(c.label);
    });
    sh.getRange(top, 1, 1, W).setBackground(DAILY_SUB_BG).setFontWeight('bold');
    sh.getRange(grp, 1, 2, W)
      .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
      .setBorder(true, true, true, true, true, true);
    sh.setRowHeight(top, 34);
    COLS.forEach(function (c, i) { sh.setColumnWidth(i + 1, c.w); });

    sh.getRange(top, cCh0, 1, nCh).setNote('Spend on this channel for the day.');
    sh.getRange(top, cNewRev, 1, 2).setNote(
      'The two halves of Blended: revenue from customers on their FIRST order, and ' +
      'from customers who had ordered before.\n\n' +
      'These are the NUMERATORS of ROAS New and ROAS Existing, printed so a ROAS ' +
      'that looks too high can be checked by hand instead of taken on trust: ' +
      'ROAS New = New Cx Revenue ÷ Spent, exactly.\n\n' +
      'BLANK means the new/returning split was not available that day — NOT that the ' +
      'revenue was zero.');
    sh.getRange(top, cRoasN, 1, 2).setNote(
      'New-Cx and existing-Cx revenue ÷ Spent.\n\n' +
      'BLANK means the new/returning split was not available for that day — NOT that ' +
      'the revenue was zero. Those are different statements and only one of them ' +
      'would be true. Blended still prints, because it falls back to Paid + Pending ' +
      'from the orders API.\n\n' +
      'Fix: run pullShopify() in this project. If the split is still missing, run ' +
      'diagnoseSplit() — it names which of the six causes applies.');
    sh.getRange(top, cHealth).setNote('Ticked BY YOUR TEAM after checking the day. The script ' +
      'never sets or clears it, and the tick survives every refresh.');

    /* ---- body ---- */
    var tot = { ch: {}, spent: 0, pend: 0, paid: 0, blend: 0, newRev: 0, retRev: 0,
                conv: 0, newC: 0, retC: 0,
                // Spend on the days where the new/returning split ACTUALLY exists.
                // The TOTAL ROAS New must divide split revenue by the spend of the
                // same days — dividing by every day's spend would understate it in
                // proportion to how many days are missing the split.
                splitSpent: 0, splitDays: 0 };
    CONFIG.CHANNELS.forEach(function (ch) { tot.ch[ch] = 0; });
    var noSplitDays = 0;

    // Spent is the TRUE total across every channel that reported, not merely the
    // four with columns. If some other channel ever carries spend the columns will
    // not visibly add up to Spent — deliberate: money is never hidden to make a row
    // look tidy, and the footer names whatever the extra channel was.
    // Totalled ONCE here rather than per row: rescanning every spend key for each
    // of ~31 days across 5 entities is work for nothing.
    var listed = {}, otherChannels = {}, spentByDay = {};
    CONFIG.CHANNELS.forEach(function (ch) { listed[ch] = 1; });
    Object.keys(src.spend).forEach(function (k) {
      var p = k.split('|');
      if (p[1] !== e.code) return;
      var v = src.spend[k];
      spentByDay[p[0]] = (spentByDay[p[0]] || 0) + num_(useUSD ? v.spendUSD : v.spend);
      if (!listed[p[2]]) otherChannels[p[2]] = 1;
    });

    var body = days.map(function (dk) {
      var row = [dk];
      CONFIG.CHANNELS.forEach(function (ch) {
        var s = src.spend[dk + '|' + e.code + '|' + ch];
        var v = s ? num_(useUSD ? s.spendUSD : s.spend) : 0;
        row.push(v); tot.ch[ch] += v;
      });
      var spentAll = spentByDay[dk] || 0;

      // Shopify amounts are in the STORE's currency — take it off the row itself so
      // a store that changed currency is still converted with the right rate.
      var s = src.shop[dk + '|' + e.code] || null;
      var shopCur = (s && s.currency) || e.currency;
      var pend = s ? money_(s.pendRev, shopCur) : 0;
      var paid = s ? money_(s.paidRev, shopCur) : 0;
      // Blended = new + existing revenue, so the three ROAS columns add up exactly.
      // Falls back to paid+pending only when ShopifyQL was unavailable that day.
      var newRev = s ? money_(s.newRev, shopCur) : 0, retRev = s ? money_(s.retRev, shopCur) : 0;
      var hasSplit = !!(s && hasSplitBasis_(s.basis));
      var blend = hasSplit ? (newRev + retRev) : (paid + pend);
      var conv = s ? num_(s.orders) : 0;
      var newC = s ? num_(s.newC) : 0, retC = s ? num_(s.retC) : 0;
      if (s && !hasSplit) noSplitDays++;

      row.push(spentAll, pend, paid, blend);
      /* The two halves of Blended. BLANK, not zero, when the split is unavailable —
        the same rule the ROAS columns follow, and for the same reason: printing 0
        here would assert that existing customers bought nothing that day. */
      row.push(hasSplit ? newRev : '', hasSplit ? retRev : '');
      /* WITHOUT THE SPLIT, BOTH HALVES ARE BLANK — NEVER 0.00x.
        A 0.00x in "ROAS Existing" asserts that returning customers bought nothing
        that day. When the new/returning split is unavailable, what actually
        happened is that we could not SEE the breakdown — a different statement,
        and the only true one. Printing zero there is how a report ends up lying
        with a straight face. ROAS Blended still prints, because Blended falls back
        to Paid+Pending from the orders API, which we do have.
        The same applies to both CPAs: the customer COUNTS come from the same split. */
      row.push(hasSplit && spentAll ? newRev / spentAll : '',
              hasSplit && spentAll ? retRev / spentAll : '',
              spentAll ? blend / spentAll : '');
      row.push(conv);
      row.push(hasSplit && newC ? spentAll / newC : '',
              hasSplit && retC ? spentAll / retC : '');
      row.push(isVerified_(verified, e.code, dk));   // the Health Check tick

      tot.spent += spentAll; tot.pend += pend; tot.paid += paid; tot.blend += blend;
      tot.conv += conv;
      if (hasSplit) {
        tot.newRev += newRev; tot.retRev += retRev;
        tot.newC += newC; tot.retC += retC;
        tot.splitSpent += spentAll; tot.splitDays++;
      }
      return row;
    });

    /* ---- TOTAL row. Ratios are RECOMPUTED from the totals, never averaged down
            the column — an average of daily ROAS is not the period's ROAS. ---- */
    var totRow = ['TOTAL'];
    CONFIG.CHANNELS.forEach(function (ch) { totRow.push(tot.ch[ch]); });
    totRow.push(tot.spent, tot.pend, tot.paid, tot.blend);
    // Both halves accumulate ONLY on days that had a split, so these are real sums
    // rather than a partial month masquerading as a whole one.
    totRow.push(tot.newRev, tot.retRev);
    // The split ROAS divides by splitSpent — the spend of the days that HAVE a
    // split — not by every day's spend. Otherwise a month with the split on half
    // its days would report a ROAS New roughly half its real value.
    totRow.push(tot.splitSpent ? tot.newRev / tot.splitSpent : '',
                tot.splitSpent ? tot.retRev / tot.splitSpent : '',
                tot.spent ? tot.blend / tot.spent : '');
    totRow.push(tot.conv);
    totRow.push(tot.newC ? tot.splitSpent / tot.newC : '',
                tot.retC ? tot.splitSpent / tot.retC : '');
    totRow.push('');
    body.push(totRow);

    var r0 = top + 1, n = body.length;
    sh.getRange(r0, 1, n, W).setValues(body);

    /* A banner when the new/returning split is missing, so blank ROAS cells are
      never a silent mystery. Placed in row 1 past the frozen columns, so it is
      visible without scrolling and cannot straddle a freeze line. */
    if (noSplitDays) {
      sh.getRange(1, 5, 1, W - 4).merge().setValue('⚠ ' + noSplitDays + ' of ' + days.length +
        ' day(s) have NO new/returning split, so ROAS New, ROAS Existing and both CPAs are BLANK ' +
        'on those rows — blank means "not measured", not zero. Blended still uses Paid + Pending. ' +
        'The split has TWO possible sources and neither could answer for those days: ShopifyQL, ' +
        'and failing that the orders API lifetime order count. Fix: run diagnoseSplit("' + e.code +
        '") — it names which of the five causes applies, and prints what share of orders the ' +
        'orders API can classify. The usual answer is ShopifyQL scopes: read_reports + ' +
        'read_customers on that store Shopify app.')
        .setFontColor('#B45309').setFontWeight('bold').setWrap(true)
        .setHorizontalAlignment('left').setVerticalAlignment('middle');
      sh.setRowHeight(1, 58);
    }

    /* ---- formats ---- */
    // Every money column in one span: the channels, Spent, Pending, Paid, Blended and
    // both revenue halves are contiguous by construction of the spec.
    sh.getRange(r0, cCh0, n, dcol_(COLS, 'oldRev') - cCh0 + 1).setNumberFormat(fmtMoney);
    sh.getRange(r0, cRoasN, n, 3).setNumberFormat('0.00"x"');          // the three ROAS columns
    sh.getRange(r0, cOrders, n, 1).setNumberFormat('#,##0');           // Orders
    sh.getRange(r0, cCpaN, n, 2).setNumberFormat(fmtMoney);            // CPA New / CPA Existing
    sh.getRange(r0, cHealth, n - 1, 1).insertCheckboxes();             // not on the TOTAL row
    sh.getRange(1, 1, r0 + n, W).setHorizontalAlignment('center').setVerticalAlignment('middle');
    sh.getRange(2, 1).setHorizontalAlignment('left');
    sh.getRange(1, 3).setHorizontalAlignment('left');

    /* ---- banding, TOTAL emphasis, gridlines ---- */
    band_(sh, r0, n - 1, W);
    sh.getRange(r0 + n - 1, 1, 1, W).setBackground(DAILY_TOTAL_BG).setFontWeight('bold');
    // Style must be a real BorderStyle or null — never undefined.
    var solid = SpreadsheetApp.BorderStyle ? SpreadsheetApp.BorderStyle.SOLID : null;
    sh.getRange(top, 1, n + 1, W).setBorder(true, true, true, true, true, true, '#B7C6DE', solid);

    /* ---- a light touch of colour on the blended ROAS so a bad day stands out ---- */
    var roasRng = sh.getRange(r0, cRoasBl, n - 1, 1);
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(4)
        .setBackground('#CDEBD3').setRanges([roasRng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(1, 4)
        .setBackground('#FCEFA1').setRanges([roasRng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(1)
        .setBackground('#F4C7C3').setRanges([roasRng]).build()
    ]);

    // Date is the only column worth pinning now that Country has gone, so the freeze
    // boundary sits after column A. Every merge on this tab therefore has to START at
    // column 2 or later: Sheets refuses to freeze a column holding part of a merge.
    sh.setFrozenRows(top);
    sh.setFrozenColumns(1);

    /* ---- footer. Merged from column 2 so it cannot straddle the frozen-column
            boundary, which Sheets refuses. ---- */
    var foot = r0 + n + 1;
    sh.getRange(foot, 2, 1, W - 1).merge();
    sh.getRange(foot, 2).setValue(
      'Google · Bing · Meta · LinkedIn are SPEND. Spent = total spend across every channel that reported' +
      (Object.keys(otherChannels).length
        ? ' — including ' + Object.keys(otherChannels).sort().join(', ') + ', which has no column of its own, so the channel columns will not visibly add up to Spent'
        : '') +
      '.  ·  Pending = orders awaiting payment · Paid = orders paid · Blended = total sales (new + existing customer revenue). ' +
      'Paid + Pending is NOT expected to equal Blended: refunded and voided orders count in neither bucket, and Blended is net of discounts and returns.  ·  ' +
      'New Cx Revenue and Existing Cx Revenue are the two halves of Blended, printed so every ROAS ' +
      'here can be checked by hand: ROAS New = New Cx Revenue ÷ Spent, exactly, and ROAS Existing = ' +
      'Existing Cx Revenue ÷ Spent. If a ROAS looks too high, divide the two columns yourself — the ' +
      'numerator is on the row.  ·  ' +
      'ROAS Blended = Blended ÷ Spent. It equals ROAS New + ROAS Existing ONLY on days where the ' +
      'new/returning split was available; where it was not, those two are BLANK (meaning not measured, ' +
      'NOT zero) and Blended falls back to Paid + Pending.  ·  ' +
      (noSplitDays ? '⚠ THIS TAB: ' + noSplitDays + ' of ' + days.length + ' day(s) have no split — ' +
        'run diagnoseSplit("' + e.code + '") for the cause.  ·  ' : '') +
      'WHERE THE SPLIT COMES FROM: ShopifyQL total_sales by new_or_returning_customer where it is ' +
      'available (it matches Shopify Analytics exactly), and where it is NOT, the orders API lifetime ' +
      'order count per order — but only on days where that count is known for essentially all of the ' +
      'revenue, because a guest checkout has no count and counting those as new would report 100% ' +
      'new customers. The "Revenue Basis" column on "Shopify Daily" records which source each day ' +
      'used, so any figure can be traced back to where it came from.  ·  ' +
      'The TOTAL row divides split revenue by the spend of the days that HAVE a split, so a partial month ' +
      'does not understate ROAS New.  ·  ' +
      'Orders = orders that day (renamed from Conversions — they are orders).  ·  ' +
      'CPA New = Spent ÷ new Cx acquired · CPA Existing = Spent ÷ existing Cx who ordered.  ·  ' +
      'Health Check is a tick YOUR TEAM sets after checking the day; the script never sets or clears ' +
      'it and it survives every refresh.  ·  ' +
      'There is no Country column: the TAB is the country.  ·  ' +
      'TOTAL recomputes every ratio from the totals rather than averaging the daily figures.  ·  ' +
      (useUSD
        ? 'CURRENCY: every money figure is converted to ' + CONFIG.REPORT_CURRENCY +
          ' at the live rate (see the "FX Rates" tab), so all country tabs compare directly. ' +
          'The ROAS columns are UNAFFECTED by this — revenue and spend convert at the same rate, so the ' +
          'ratio is identical to the local-currency one. CPA does change, because it is money per customer. ' +
          'For a figure that ties to the penny against Shopify or an ad account UI, set ' +
          'CONFIG.REPORT_IN_USD = false to report in ' + e.currency + '.  ·  '
        : 'CURRENCY: reported in ' + e.currency + ', the figure that ties exactly to Shopify and to that ' +
          'ad account\'s UI. Set CONFIG.REPORT_IN_USD = true to convert every tab to USD.  ·  ') +
      'Spend from the Ad Budget Tracker; revenue, orders and the new/existing split from this store\'s own ' +
      'Shopify API. Nothing on this tab is typed in or pasted from a platform export.')
      .setFontColor('#666666').setWrap(true).setHorizontalAlignment('left')
      .setVerticalAlignment('top');
    sh.setRowHeight(foot, 74);

    if (!isConfigured_(e)) {
      sh.getRange(foot + 2, 3, 1, W - 2).merge();
      sh.getRange(foot + 2, 3).setValue('⚠ ' + e.label + ' has no Shopify credentials in CONFIG yet, so ' +
        'Pending, Paid, Blended, both revenue halves, every ROAS, Orders and both CPA columns stay ' +
        'blank. The channel ' +
        'spend columns and Spent still populate from the tracker feed.')
        .setFontColor('#B45309').setWrap(true).setHorizontalAlignment('left');
    }

    /* ---- widths ---- */
    sh.setColumnWidth(1, 92);
    sh.setColumnWidth(2, 92);
    for (var c = 3; c <= W - 1; c++) sh.setColumnWidth(c, 96);
    sh.setColumnWidth(W, 84);
  }

  /* Which month the daily tabs are showing — read off the first entity tab that
    has a valid month in B1, so all tabs stay on one month. */
  function currentDailyMonth_() {
    try {
      var ss = execSS_();
      for (var i = 0; i < CONFIG.ENTITIES.length; i++) {
        var sh = ss.getSheetByName(CONFIG.ENTITIES[i].label);
        if (!sh) continue;
        var v = String(sh.getRange(1, 2).getValue() || '').trim();
        if (/^\d{4}-\d{2}$/.test(v)) return v;
      }
    } catch (e) {}
    return monthKeyOf_(new Date());
  }
  /* ===================== BUILD: Method / definitions ====================== */
  /* Every number in the exec report, written out in plain English. This exists so
    nobody has to ask "is this ROAS on attributed or total revenue?" — the answer
    travels with the report. */
  function buildMethodTab_() {
    var ss = execSS_();
    var sh = ss.getSheetByName(ETAB.METHOD) || ss.insertSheet(ETAB.METHOD);
    sh.clear();
    var rows = [
      ['Metric', 'Exact definition', 'Source of truth'],
      ['Spend',
      'Sum of the ad-platform spend rows for that entity and channel in the period, converted into the entity\'s own currency. Includes every campaign.',
      'Ad Budget Tracker "BDS Spent Input" — fed by the Meta Marketing API and the Google/Bing Ads platform scripts. Read live on every rebuild; never copied here.'],
      ['Revenue',
      'Attributed revenue: the value of orders our tracking can tie to a channel. Where an attributed order joins to a real Shopify order, the SHOPIFY amount is used, not the value the pixel posted. Unmatched orders fall back to the pixel value.',
      'bds-unified "<CC> Order" PURCHASE rows for the channel; amounts from the Shopify Admin API.'],
      ['New Cust Revenue',
      'The part of that attributed revenue from FIRST-TIME buyers. Each attributed order is joined to its Shopify order and inherits that order\'s new/returning flag, so this is a real per-channel figure rather than a store-level ratio spread across channels. Orders that do not join are never counted as new — this understates rather than guesses.',
      'Shopify order + customer record, stamped once per order in "Order Facts".'],
      ['ROAS',
      'Revenue / Spend, both as defined above. Attributed revenue only — it does not include revenue our tracking cannot see, so it is a floor, not a ceiling. The OVERALL row\'s Tracking Health tells you how big the invisible part is.',
      'Derived.'],
      ['ROAS (New)',
      'New Cust Revenue / Spend. What the spend is returning in genuinely new customers rather than repeat purchases.',
      'Derived.'],
      ['Conversions',
      'Count of attributed PURCHASE rows for that entity and channel in the period.',
      'bds-unified.'],
      ['CPA',
      'Spend / Conversions — what one order COST to acquire. Note this is NOT "order value divided by number of orders"; that figure is AOV, which answers a different question and is shown as its own column on the month-vs-month tabs. A channel can have a healthy AOV and a terrible CPA at the same time, which is exactly why both are reported.',
      'Derived.'],
      ['AOV',
      'Revenue / Conversions — what one order was WORTH. Shown beside CPA on the month-vs-month tabs so cost-to-acquire and value-acquired can be read against each other.',
      'Derived.'],
      ['DAILY COUNTRY TABS — the main report',
      'One tab per country (UK, Canada, India, UAE, PrintFabrix), one row per DAY, plus a TOTAL row. ' +
      'A banner above the headers marks which columns are SPEND and which are REVENUE. Google / Bing / ' +
      'Meta / LinkedIn hold that channel\'s SPEND; then Spent, Pending, Paid, Blended, New Cx Revenue, ' +
      'Existing Cx Revenue, the three ROAS columns, Orders, CPA New, CPA Existing and your Health Check ' +
      'tick. The two revenue halves are the numerators of the two ROAS columns, printed so a ROAS can ' +
      'be checked by hand. There is no Country column — the tab is the country. Change the month in ' +
      'cell B1 and the tabs rebuild. Money carries the country\'s own symbol.',
      'By design.'],
      ['Spent vs the channel columns',
      'Spent is the TRUE total spend for the day across every channel that reported — not just the four with columns. If some other channel ever carries spend, the four columns will not visibly add up to Spent, and the tab footer names the extra channel. Money is never hidden to make a row look tidy.',
      'Ad Budget Tracker.'],
      ['Pending · Paid · Blended',
      'Pending = revenue on orders awaiting payment (PENDING + AUTHORIZED). Paid = revenue on orders paid (PAID + PARTIALLY_PAID). Blended = total sales, taken as new-customer + existing-customer revenue. Paid + Pending is NOT expected to equal Blended: refunded, voided and expired orders count in NEITHER bucket (they still count in Conversions), and Blended is net of discounts and returns. The reference workbook shows the same gap.',
      'Shopify Admin API order payment status; Blended from the ShopifyQL total-sales split.'],
      ['The three ROAS columns',
      'ROAS New = new-customer revenue ÷ Spent. ROAS Existing = existing-customer revenue ÷ Spent. ROAS Blended = Blended ÷ Spent. Because Blended is defined as new + existing revenue, ROAS Blended equals ROAS New + ROAS Existing exactly — the columns add up. All three are BLENDED ROAS in the strict sense: they measure total store revenue against ad spend, not just revenue our tracking can attribute to a channel.',
      'Derived.'],
      ['CPA New · CPA Existing',
      'CPA New = Spent ÷ NEW customers acquired that day. CPA Existing = Spent ÷ EXISTING customers who ordered that day. Both answer "what did this cost", so both use Spend on top — that is what makes them a cost per acquisition rather than an order value.',
      'Spend from the tracker; customer counts from the ShopifyQL new/returning split.'],
      ['Currency on the daily tabs',
      'With CONFIG.REPORT_IN_USD = true (the default) every money column is converted to USD at the live rate, so all five country tabs compare directly. The ROAS columns are UNCHANGED by this — revenue and spend convert at the same rate, so the ratio is identical to the local-currency one. CPA DOES change, because it is money per customer. Set REPORT_IN_USD = false to report each country in its own currency, which is the figure that ties to the penny against Shopify and the ad-account UI.',
      'open.er-api.com live rates; see the "FX Rates" tab.'],
      ['Implausible-split guard',
      'A day\'s new+existing revenue is cross-checked against that day\'s order revenue from the orders API. If the split is more than 10x order revenue — or larger than a trillion, or not a finite number — it is treated as a PARSE FAILURE, not as revenue: the day falls back to Revenue Basis "orders-only", Blended becomes Paid + Pending, and the split is left blank. This exists because a mis-identified column once produced a ROAS of 1,648,150,983,601x; a blank is honest, a number that size is not. The run log names every day it rejected.',
      'Orders API as the independent second opinion.'],
      ['Why a measure is rejected rather than coerced',
      'Values read from an API go through a STRICT numeric parse that returns nothing unless the value is plainly a number. The looser parser used for hand-typed spend cells strips every non-digit so it can read "£1,234.56" — but handed an ISO timestamp it would turn "2026-08-05T00:00:00Z" into 20260805000000 and treat it as revenue. Rejecting is always better than inventing. Run debugShopifyQL() to see the raw columns and rows when a rejection is logged.',
      'numStrict_() — see the run log for what was rejected and why.'],
      ['TOTAL row',
      'Every ratio on the TOTAL row is RECOMPUTED from the totals — total revenue ÷ total spend — never averaged down the column. An average of daily ROAS figures is not the month\'s ROAS, and on days with little spend it is wildly misleading.',
      'Derived.'],
      ['Health Check',
      'A MANUAL sign-off, one tick per country per DAY. Your team ticks it after checking that day\'s line; the script never sets it, never clears it, and never infers it. Ticks are stored against country + date, so they survive every rebuild and a tick against 12 August stays attached to 12 August. Ticking does not trigger a rebuild, so it never fights you mid-click.',
      'Yours. Stored in Script Properties, keyed COUNTRY|yyyy-mm-dd.'],
      ['New Cx Revenue / Existing Cx Revenue',
      'The two halves of Blended on the daily country tabs: revenue from customers on their FIRST ' +
      'order, and revenue from customers who had ordered before. They exist so a ROAS can be AUDITED ' +
      'rather than believed — ROAS New is exactly New Cx Revenue divided by Spent, so a ROAS that ' +
      'looks too high can be checked on the row itself. They also make the identity visible: the two ' +
      'add to Blended, which is why the three ROAS columns add up. BLANK (never zero) on any day ' +
      'whose new/returning split was unavailable — and that is also why the ROAS columns are blank ' +
      'on those days.',
      'The same ShopifyQL / orders-API split that feeds Blended, via "Shopify Daily".'],
      ['Tracking Health — CHANNEL rows',
      'Match % = the share of that channel\'s attributed orders that join to a real Shopify order. Below 100% means bds-unified holds purchase rows that no Shopify order backs: duplicates, test hits, or a broken order-id handoff.',
      'bds-unified joined to Shopify.'],
      ['Tracking Health — OVERALL rows',
      'Coverage % = attributed revenue / Shopify revenue for that entity. This is the honest headline: how much of the money actually taken can our tracking explain at all. 100% = every order is attributable; 60% means four pounds in ten are arriving with no channel attached.',
      'bds-unified vs the Shopify Admin API.'],
      ['Health colours',
      '🟢 at or above ' + Math.round(CONFIG.HEALTH.good * 100) + '% · 🟡 ' +
        Math.round(CONFIG.HEALTH.warn * 100) + '–' + Math.round(CONFIG.HEALTH.good * 100) +
        '% · 🔴 below ' + Math.round(CONFIG.HEALTH.warn * 100) + '%. Thresholds live in CONFIG.HEALTH.',
      'CONFIG.'],
      ['Currency',
      'Each entity is reported in its OWN currency, which ties exactly to Shopify and to that ad account\'s UI. The USD columns use live rates and will differ from Shopify\'s own USD display by the rate gap — expected, not an error. Local currency is the reconciling figure.',
      'open.er-api.com live rates; see the "FX Rates" tab in the data workbook.'],
      ['Why there is no grand total',
      'The entities are deliberately never summed. A blended cross-GEO ROAS hides exactly the differences this report exists to show, and PrintFabrix is a different business from the GEO stores.',
      'By design.'],
      ['PAID SUBTOTAL vs OVERALL',
      'PAID SUBTOTAL covers only Google, Meta, Bing and LinkedIn — read it to answer "is the ad spend working". OVERALL adds everything else our tracking sees, including the Direct bucket that holds organic, email and any source bds-unified could not identify — read it to answer "how is this market doing", and note that its ROAS is blended, because organic revenue has no ad spend behind it. Coverage % is only shown on OVERALL, since coverage is a question about the whole market, not one channel.',
      'By design. Turn the subtotal off with CONFIG.SHOW_PAID_SUBTOTAL.'],
      ['One order = one conversion',
      'bds-unified can hold several PURCHASE rows for one order (it logs Product and Quantity, and a re-fired pixel can repost an order). Each order id — or order number where the id is absent — is therefore counted exactly ONCE. Rows carrying neither identifier cannot be deduped and are kept rather than dropped, so revenue is never understated by this rule; the run log reports how many rows were collapsed.',
      'Derived. Watch the execution log after a refresh.'],
      ['Why Shopify Revenue and the new/returning split can differ slightly',
      'On the "Shopify Daily" tab, Orders and Revenue come from the orders API (each ' +
      'order\'s current total, so refunds and edits are reflected), while New and Returning ' +
      'Cust Revenue come from ShopifyQL total_sales, which nets discounts and returns on its ' +
      'own terms. The two therefore need not add up to the penny. The Revenue Basis column ' +
      'records which source each day actually used, and it takes four values.  ' +
      '"shopifyql": the split came from ShopifyQL total_sales grouped by ' +
      'new_or_returning_customer, which is what Shopify Analytics itself shows — preferred, ' +
      'and never overridden.  ' +
      '"order-facts": ShopifyQL could not answer for that day, so the split was derived from ' +
      'the lifetime order count on each order the orders API had already returned (a count of ' +
      '1 = new, more than 1 = returning). That fallback is deliberately hard to earn: a guest ' +
      'checkout carries NO lifetime count, and counting those as new would report 100% ' +
      'new-customer revenue — so a day is published only when the orders carrying a real count ' +
      'cover at least CONFIG.SPLIT_FROM_ORDERS_MIN of that day\'s revenue AND the store ' +
      'populates that field on essentially all of its orders.  ' +
      '"orders-only": NEITHER source could answer, so the split is BLANK rather than zero and ' +
      'Blended falls back to Paid + Pending.  ' +
      '"quarantined": a split was returned but failed the plausibility gate.  ' +
      'Run diagnoseSplit("CA") to see which applies and why.',
      'Shopify Admin API (orders) + ShopifyQL (split).'],
      ['New-flag caveat',
      'Shopify\'s new/returning signal is a lifetime counter read at query time, so it decays for older orders. This script stamps the flag once per order and freezes it. Orders first seen within ' +
        CONFIG.FRESH_STAMP_DAYS + ' days of purchase are "fresh"; older ones are "backfill" and may understate new customers. The "Tracking Health" tab reports the backfill share per line, so the first ' +
        CONFIG.LOOKBACK_DAYS + ' days of history are the weakest and everything from go-live onward is solid.',
      '"Order Facts" tab, Basis column.']
    ];
    sh.getRange(1, 1, rows.length, 3).setValues(rows);
    sh.getRange(1, 1, 1, 3).setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 210); sh.setColumnWidth(2, 620); sh.setColumnWidth(3, 330);
    sh.getRange(2, 1, rows.length - 1, 3).setVerticalAlignment('top').setWrap(true);
  }

  /* ============================ ORCHESTRATION ============================= */

  /* Full daily job: rates, Shopify pull, then every derived tab. */
  function refreshAll() {
    var t0 = new Date().getTime();
    refreshFxRates();
    pullShopify();
    rebuildAll();
    Logger.log('refreshAll finished in ' + Math.round((new Date().getTime() - t0) / 1000) + 's.');
  }
  /* Cheap rebuild — no API calls, just re-derive from what is already stored plus
    the two source workbooks. Safe to run as often as you like. */
  function rebuildAll() {
    // One source load for EVERY view below — the grain, the health tab, the exec
    // report and two periods per comparison tab all read the same snapshot.
    var src = loadSources_();

    /* SELF-HEAL. If Shopify Daily holds corrupt cells — a date or a label where a
      money column should be — every affected day loses its new/returning split and
      the tabs go blank. That state is not recoverable by re-reading; the rows have
      to be cleared and re-pulled. Rather than print blanks and a "run pullShopify()"
      instruction and wait for someone to do it, do it here, once.
      Guarded on the CORRUPT-cell count, never on "the split is missing": a store
      that genuinely has no ShopifyQL access would otherwise re-pull on every run
      forever, achieving nothing but burning API calls. */
    if (_shopifyBadCells > 0) {
      /* STEP 1 — THE CHEAP, NON-DESTRUCTIVE REMEDY FIRST.
        Most of these turn out to be date-FORMATTED cells rather than bad data: the
        number in the cell is right and only the format makes getValues() hand back a
        Date. Setting the format recovers the value outright — no API calls, nothing
        deleted. Clearing and re-pulling would ALSO not have fixed it, which is why
        this bug survived a self-heal that only knew how to do that: a format can be
        inherited from the column and outlive the cells that were cleared. */
      var fixedFmt = enforceFormats_(dataSS_().getSheetByName(DTAB.SHOPIFY));
      SpreadsheetApp.flush();
      var wasBad = _shopifyBadCells, wasDates = _shopifyBadDates;
      _shopifyBadCells = 0; _shopifyBadDates = 0;
      src = loadSources_();
      Logger.log('SELF-HEAL step 1 (formats): "' + DTAB.SHOPIFY + '" had ' + wasBad +
        ' unreadable numeric cell(s), ' + wasDates + ' of them date-formatted. Re-set the format on ' +
        fixedFmt.length + ' column(s) — ' + _shopifyBadCells + ' still unreadable.' +
        (_shopifyBadCells < wasBad ? '  Those values were never corrupt, only mis-formatted.' : ''));
      /* STEP 2 — only now, and only for what the format could not explain, spend the
        API calls and throw the rows away. */
      if (_shopifyBadCells > 0) {
        Logger.log('SELF-HEAL step 2: ' + _shopifyBadCells + ' cell(s) are still not numbers after the ' +
          'format fix, so this is genuinely bad or misaligned data — clearing and re-pulling the tab.');
        migrateShopifyTab_(true);
        _shopifyBadCells = 0;
        pullShopify();
        src = loadSources_();
        if (_shopifyBadCells > 0) {
          Logger.log('SELF-HEAL DID NOT CLEAR IT: still ' + _shopifyBadCells + ' corrupt cell(s) after a ' +
            'fresh pull. That points at the WRITE side, not stale data — run diagnoseSplit().');
        }
      }
    }

    buildGrain(src);
    var p = currentPeriod_();
    buildHealth(aggregate_(p.from, p.to, src));
    buildExec(src);
    buildDailyTabs(src);
  }
  function jobDailyRefresh() { refreshAll(); }

  /* The Exec period dropdown. Installed on the EXEC spreadsheet, which this script
    is not bound to — so it must be an INSTALLABLE trigger (a simple onEdit only
    fires for a bound container). */
  function onExecEdit(e) {
    try {
      if (!e || !e.range) return;
      var sh = e.range.getSheet(), name = sh.getName(), a1 = e.range.getA1Notation();

      // 1. Exec Report period dropdown.
      if (name === ETAB.EXEC) {
        if (a1 !== 'B2') return;
        var src = loadSources_();
        buildExec(src);
        var p = currentPeriod_();
        buildHealth(aggregate_(p.from, p.to, src));
        return;
      }

      // 2. A comparison tab. Two things are editable there and they behave very
      //    differently: the month cell rebuilds every tab, while a Verified tick is
      //    persisted WITHOUT a rebuild — re-rendering the sheet the instant someone
      //    ticks a box would be slow and would fight the person doing the ticking.
      var ent = null;
      CONFIG.ENTITIES.forEach(function (x) { if (x.label === name) ent = x; });
      if (!ent) return;

      if (a1 === 'B1') { buildDailyTabs(null, String(e.range.getValue() || '').trim()); return; }

      // The Verified tick. Persisted against the DATE in column A of that row, and
      // deliberately WITHOUT a rebuild: re-rendering the sheet the instant someone
      // ticks a box would be slow and would fight the person doing the ticking.
      if (e.range.getColumn() !== dailyHeaders_().length) return;
      var row = e.range.getRow();
      if (row <= 4) return;              // control + title + group band + header rows
      var dk = normDayKey_(sh.getRange(row, 1).getValue());
      if (!dk) return;                             // the TOTAL row has no date
      setVerified_(ent.code, dk, e.range.getValue() === true);
    } catch (err) { Logger.log('onExecEdit: ' + err); }
  }

  /* Menus. Installable onOpen triggers, one per workbook, since a standalone script
    gets no simple onOpen. */
  function onExecOpen() {
    try {
      var m = SpreadsheetApp.getUi().createMenu('🌍 GEO Report')
        .addItem('Rebuild everything', 'rebuildAll')
        .addItem('Rebuild the daily country tabs', 'buildDailyTabs')
        .addItem('Rebuild the single-period Exec Report', 'buildExec')
        .addItem('Full refresh (pull Shopify first)', 'refreshAll');
      // With SINGLE_WORKBOOK there is only one workbook and therefore only one
      // menu, so the data-side actions have to live here too or they are
      // unreachable outside the script editor.
      if (CONFIG.SINGLE_WORKBOOK) {
        m.addSeparator()
        .addItem('Pull Shopify only', 'pullShopify')
        .addItem('Refresh FX rates', 'refreshFxRates');
      }
      m.addSeparator()
      .addItem('Where are my tabs?', 'showWorkbooks')
      .addItem('Why is ROAS New / Existing blank?', 'diagnoseSplit')
      .addItem('Why is revenue all "Direct"?', 'debugSources')
      .addItem('WHEN did paid attribution stop?', 'debugSourcesByMonth')
      .addItem('Fix guest checkouts counted as new Cx', 'repairGuestIsNew')
      .addItem('Dump the raw ShopifyQL response', 'debugShopifyQL')
      .addItem('Fix number formats (dates in money columns)', 'healNumberFormats')
      .addItem('Check access', 'checkAccess')
      .addToUi();
    } catch (e) { Logger.log('onExecOpen: ' + e); }
  }
  function onDataOpen() {
    try {
      SpreadsheetApp.getUi().createMenu('🌍 GEO Data')
        .addItem('Rebuild derived tabs', 'rebuildAll')
        .addItem('Pull Shopify (orders + new/returning)', 'pullShopify')
        .addItem('Full refresh', 'refreshAll')
        .addSeparator()
        .addItem('Refresh FX rates', 'refreshFxRates')
        .addSeparator()
        .addItem('Where are my tabs?', 'showWorkbooks')
        .addItem('Why is revenue all "Direct"?', 'debugSources')
        .addItem('WHEN did paid attribution stop?', 'debugSourcesByMonth')
        .addItem('Fix guest checkouts counted as new Cx', 'repairGuestIsNew')
        .addItem('Check access', 'checkAccess')
        .addToUi();
    } catch (e) { Logger.log('onDataOpen: ' + e); }
  }

  /* Create whichever of the two workbooks is still a PASTE_ placeholder, then log
    the id + URL to paste into CONFIG. Run from the editor BEFORE setup(). It
    deliberately does not write the id anywhere itself: CONFIG stays the single
    place the ids live, so there is never a hidden second answer to "which sheet
    is this report in". Safe to re-run — it only ever creates what is missing, and
    once both ids are filled it creates nothing. */
  function createMissingWorkbook() {
    var made = [], already = [];
    var want = [['DATA_SHEET_ID', 'GEO x Channel Performance — Data']];
    // With SINGLE_WORKBOOK there is no second workbook to create — asking for one
    // would leave an empty orphan file in Drive.
    if (!CONFIG.SINGLE_WORKBOOK) want.push(['EXEC_SHEET_ID', 'GEO x Channel Performance — Exec']);
    want.forEach(function (pair) {
      var existing = ownedSheetId_(pair[0]);
      if (existing) { already.push('  ' + pair[0] + ' = ' + existing); return; }
      var ss = SpreadsheetApp.create(pair[1]);
      // Remembered so this run — and every later run — uses THIS workbook rather
      // than creating another one. Paste it into CONFIG when convenient.
      PropertiesService.getScriptProperties().setProperty('geoSheet_' + pair[0], ss.getId());
      made.push('  CONFIG.' + pair[0] + ' = \'' + ss.getId() + '\'\n    ' + ss.getUrl());
    });
    var msg = made.length
      ? 'Created ' + made.length + ' workbook(s) and remembered the id(s), so you can carry on now.\n' +
        'Paste these into CONFIG when convenient — CONFIG always wins:\n' + made.join('\n') +
        (already.length ? '\nAlready set:\n' + already.join('\n') : '')
      : 'Nothing to create — both workbooks are already resolved:\n' + already.join('\n');
    Logger.log(msg);
    return msg;
  }

  /* WHERE ARE MY TABS? Prints both workbook names, ids and URLs, and lists the tabs
    in each. The daily country tabs live in the EXEC workbook, NOT in the data
    engine — if setup() had to create that workbook for you, its URL was logged
    once and is easy to miss, so this reprints it on demand. */
  function showWorkbooks() {
    var lines = ['=== ' + VERSION + ' — where everything lives ==='];
    if (CONFIG.SINGLE_WORKBOOK) {
      lines.push('CONFIG.SINGLE_WORKBOOK is TRUE — everything is in ONE workbook.');
    }
    var pairs = [['DATA_SHEET_ID', CONFIG.SINGLE_WORKBOOK
      ? 'THE ONE WORKBOOK (raw tabs AND the daily country tabs)'
      : 'DATA ENGINE (the raw tabs)']];
    if (!CONFIG.SINGLE_WORKBOOK) pairs.push(['EXEC_SHEET_ID', 'EXEC REPORT (the DAILY COUNTRY TABS live here)']);
    pairs.forEach(function (pair) {
      var id = ownedSheetId_(pair[0]);
      if (!id) { lines.push('FAIL ' + pair[1] + ' — not set. Run createMissingWorkbook().'); return; }
      try {
        var ss = SpreadsheetApp.openById(id);
        lines.push('');
        lines.push(pair[1]);
        lines.push('  name : ' + ss.getName());
        lines.push('  id   : ' + id +
          (isPlaceholder_(CONFIG[pair[0]]) ? '   (remembered in Script Properties — paste it into CONFIG.' + pair[0] + ')' : ''));
        lines.push('  URL  : ' + ss.getUrl());
        lines.push('  tabs : ' + ss.getSheets().map(function (s) { return s.getName(); }).join(' · '));
      } catch (err) { lines.push('FAIL ' + pair[1] + ' — cannot open ' + id + ': ' + err); }
    });
    lines.push('');
    lines.push('The per-country DAILY tables (Date · Country · Google · Bing · Meta · LinkedIn · Spent ·');
    lines.push('Pending · Paid · Blended · 3 ROAS · Conversions · CPA New · CPA Existing · Verified) are');
    lines.push('tabs named ' + CONFIG.ENTITIES.map(function (e) { return e.label; }).join(', ') +
      ' inside the EXEC workbook above.');
    Logger.log(lines.join('\n'));
    try { SpreadsheetApp.getUi().alert(lines.join('\n')); } catch (e) {}
    return lines.join('\n');
  }

  /* WHY IS ALL MY REVENUE UNDER "Direct"? Lists the raw Source values bds-unified
    actually holds, with counts and the channel each one maps to. If everything is
    landing in Direct then the pixel is not writing a recognisable Source, and no
    amount of reporting logic can split that revenue by channel — the fix is
    upstream in the tracking snippet, not here. */
  function debugSources() {
    var lines = ['=== raw Source values in bds-unified ==='];
    try {
      var ss = SpreadsheetApp.openById(CONFIG.TRACKING_SHEET_ID);
      ss.getSheets().forEach(function (sh) {
        var name = sh.getName();
        if (!/ Order$/i.test(name) || sh.getLastRow() < 2) return;
        var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
        if (c['Stage'] == null) return;
        var counts = {}, blank = 0, purch = 0;
        for (var i = 1; i < vals.length; i++) {
          if (String(vals[i][c['Stage']]).trim().toLowerCase() !== 'purchase') continue;
          purch++;
          var raw = c['Source'] != null ? String(vals[i][c['Source']] || '').trim() : '';
          if (!raw) { blank++; continue; }
          counts[raw] = (counts[raw] || 0) + 1;
        }
        lines.push('');
        lines.push(name + ' — ' + purch + ' purchase row(s)' +
          (blank ? ', ' + blank + ' with a BLANK Source (these can only become "Other"/"Direct")' : ''));
        Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
          .slice(0, 15).forEach(function (raw) {
            lines.push('   ' + counts[raw] + ' x  "' + raw + '"   ->  ' + canonChannel_(raw));
          });
      });
    } catch (err) { lines.push('FAIL cannot read bds-unified: ' + err); }
    lines.push('');
    lines.push('Anything mapping to Direct/Other is revenue the pixel could not attribute to a channel.');
    lines.push('NOTE: the daily country tabs do NOT depend on this — their Pending/Paid/Blended/ROAS');
    lines.push('columns come straight from Shopify, so they are correct even while attribution is broken.');
    Logger.log(lines.join('\n'));
    return lines.join('\n');
  }

  /* WHEN did a channel stop being attributed?  debugSources() above counts a tab's
    WHOLE lifetime, which is exactly the wrong shape for this question: July's
    Google rows sit in the same total as August's absence and hide it. This breaks
    the same rows down BY MONTH, per entity, so a channel that stopped appearing
    shows up as a column of zeroes with a date on it.
    Written for the live UK case (2026-08-22): Google/Bing/Meta carried $28,575 of
    August spend with NOTHING attributed, while Direct nearly tripled — the shape of
    a pixel that stopped writing a recognisable Source, not of channels that stopped
    selling. Click-id counts are printed beside it because they fail together: no
    GCLID means no Source to derive.
    Reading it: find the month where a paid channel's count drops to 0 while the
    total row keeps its volume. That month is when the tracking changed, and the
    revenue did not vanish — it moved into Direct. */
  function debugSourcesByMonth() {
    var lines = ['=== attributed purchase rows BY MONTH — ' + VERSION + ' ==='];
    lines.push('Looking for: a paid channel going to 0 while the row total holds up.');
    try {
      var ss = SpreadsheetApp.openById(CONFIG.TRACKING_SHEET_ID);
      ss.getSheets().forEach(function (sh) {
        var name = sh.getName();
        if (!/ Order$/i.test(name) || sh.getLastRow() < 2) return;
        var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
        if (c['Stage'] == null || c['Timestamp'] == null) return;
        var CLICK = ['GCLID', 'GBRAID', 'WBRAID', 'FBCLID', 'MSCLKID', 'LI FAT ID'];
        var byMonth = {}, months = {}, chans = {};
        for (var i = 1; i < vals.length; i++) {
          if (String(vals[i][c['Stage']]).trim().toLowerCase() !== 'purchase') continue;
          var dt = asDate_(vals[i][c['Timestamp']]); if (!dt) continue;
          var ym = dayKey_(dt).slice(0, 7);
          var ch = canonChannel_(c['Source'] != null ? vals[i][c['Source']] : '');
          months[ym] = 1; chans[ch] = 1;
          var m = byMonth[ym] || (byMonth[ym] = { total: 0, clicks: 0, ch: {} });
          m.total++;
          m.ch[ch] = (m.ch[ch] || 0) + 1;
          for (var k = 0; k < CLICK.length; k++) {
            var ci = c[CLICK[k]];
            if (ci != null && String(vals[i][ci] || '').trim()) { m.clicks++; break; }
          }
        }
        var mk = Object.keys(months).sort(), ck = Object.keys(chans).sort();
        if (!mk.length) return;
        lines.push('');
        lines.push(name);
        lines.push('  month     rows  click-ids  ' + ck.join('  '));
        mk.forEach(function (ym) {
          var m = byMonth[ym];
          var cells = ck.map(function (ch) {
            var v = m.ch[ch] || 0;
            return String(v) + (v === 0 ? '' : '');
          });
          lines.push('  ' + ym + '   ' + m.total + '     ' + m.clicks + '        ' + cells.join('  ') +
            (m.clicks === 0 && m.total > 0 ? '   <-- NO CLICK IDS AT ALL this month' : ''));
        });
        /* Name the transition rather than leaving it to be spotted: the paid channels
          are the ones with ad spend behind them, so a month where they all read 0
          while rows keep arriving is the month attribution broke. */
        var paid = CONFIG.CHANNELS || ['Google', 'Bing', 'Meta', 'LinkedIn'];
        var lastGood = '', firstBad = '';
        mk.forEach(function (ym) {
          var m = byMonth[ym], anyPaid = 0;
          paid.forEach(function (ch) { anyPaid += (m.ch[ch] || 0); });
          if (anyPaid > 0) { lastGood = ym; }
          else if (m.total > 0 && lastGood && !firstBad) { firstBad = ym; }
        });
        if (firstBad) {
          lines.push('  >>> PAID ATTRIBUTION STOPPED IN ' + firstBad + '. It last worked in ' + lastGood +
            '. Purchase rows kept arriving, so the orders are fine and the revenue is real —');
          lines.push('      it is landing in Direct because the pixel stopped writing a recognisable');
          lines.push('      Source. Fix the pixel/click-id capture for ' + firstBad + ' onward; nothing in');
          lines.push('      this workbook can split revenue that arrives with no channel on it.');
        }
      });
    } catch (err) { lines.push('FAIL cannot read bds-unified: ' + err); }
    lines.push('');
    lines.push('The country tabs and the exec BLENDED line do NOT depend on any of this —');
    lines.push('they come straight from Shopify and stay correct while attribution is broken.');
    var msg = lines.join('\n');
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    return msg;
  }

  /* RAW ShopifyQL DUMP — the tool for "why was the split wrong?". Prints the exact
    column names, their dataTypes, and the first few rows verbatim for each
    configured store, plus what this script picked as day / type / measure and
    whether each measure value survives numStrict_. If a column we treated as the
    measure is actually a date or a label, this shows it immediately. */
  function debugShopifyQL() {
    var lines = ['=== raw ShopifyQL response (first rows per store) ==='];
    CONFIG.ENTITIES.forEach(function (e) {
      lines.push('');
      lines.push('--- ' + e.label + ' ---');
      if (!isConfigured_(e)) { lines.push('  not configured'); return; }
      var ql = 'FROM sales SHOW total_sales GROUP BY day, new_or_returning_customer SINCE -7d UNTIL today';
      var res = gql_(e, 'query($q:String!){shopifyqlQuery(query:$q){parseErrors ' +
        'tableData{rows columns{name dataType}}}}', { q: ql });
      var sq = res && res.data && res.data.shopifyqlQuery;
      if (!sq) { lines.push('  no response: ' + JSON.stringify((res && res.errors) || res).slice(0, 200)); return; }
      if (sq.parseErrors && sq.parseErrors.length) {
        lines.push('  parseErrors: ' + JSON.stringify(sq.parseErrors).slice(0, 200));
      }
      var td = sq.tableData, rows = td && (td.rows || td.rowData), cols = (td && td.columns) || [];
      lines.push('  columns: ' + JSON.stringify(cols));
      if (!rows || !rows.length) { lines.push('  no rows'); return; }
      lines.push('  rows are ' + (rows[0] instanceof Array ? 'ARRAYS' : 'OBJECTS'));
      rows.slice(0, 5).forEach(function (r, i) {
        lines.push('  [' + i + '] ' + JSON.stringify(r).slice(0, 200));
      });
      // Show what the parser would decide, and whether the measure survives.
      var acc = {};
      readQLInto_(e, ql, acc, 'rev');
      var days = Object.keys(acc).sort();
      lines.push('  parsed ' + days.length + ' day(s); sample: ' +
        (days.length ? days[0] + ' newRev=' + acc[days[0]].newRev + ' retRev=' + acc[days[0]].retRev : 'none'));
    });
    lines.push('');
    lines.push('A measure value that is not plainly a number is now REJECTED rather than coerced —');
    lines.push('num_() would have turned an ISO timestamp into 20260805000000 and called it revenue.');
    Logger.log(lines.join('\n'));
    return lines.join('\n');
  }

  /* WHY IS THE SPLIT MISSING? There are exactly five reasons a day can lack the
    new/returning split, and they need completely different fixes. Guessing between
    them from a screenshot wastes a round trip, so this checks all five and names
    the one that applies:
      1. ShopifyQL refused        -> scopes: read_reports + read_customers
      2. the query failed to parse-> the dimension name changed in this API version
      3. the DAY KEYS do not match-> ShopifyQL's day and the orders API's day
                                      disagree (time zone / format), so the lookup
                                      misses even though both sides have the data
      4. the plausibility gate    -> the split came back implausible and was rejected
      5. the SHEET is stale       -> corrupt cells; rebuildAll() now self-heals this
      6. a DATE-FORMATTED column  -> the value is fine but the cell is formatted as a
                                      date, so it reaches this script as a Date and is
                                      refused. Fix: healNumberFormats(). Invisible
                                      unless you know that 12/30/1899 means zero.
    Run it for one entity: diagnoseSplit('CA'). No argument does all of them. */
  /* WHY IS A MONEY COLUMN SHOWING A DATE?  (menu: Fix number formats)
    Run this when a ROAS or CPA column is blank, or when a money column on a data tab
    is displaying something like 12/30/1899 or 11/14/1906. Those are not corrupt
    numbers — 12/30/1899 is Sheets serial 0 and 11/14/1906 is serial 2510 — they are
    real values sitting in a cell that carries a DATE format, and getValues() hands
    this script a Date for any such cell. Setting the format back recovers the value
    with nothing deleted and no API calls spent.
    Safe to run at any time: it only ever sets number formats, never a value. */
  function healNumberFormats() {
    var ss = dataSS_(), lines = ['=== ' + VERSION + ' — number-format repair ==='];
    var tabs = [DTAB.GRAIN, DTAB.SHOPIFY, DTAB.FACTS, DTAB.HEALTH, DTAB.FX];
    var totalBefore = 0, totalAfter = 0;
    tabs.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh) { lines.push('  "' + name + '": not present'); return; }
      var before = dateCellsInNumericCols_(sh);
      var cols = enforceFormats_(sh);
      SpreadsheetApp.flush();
      var after = dateCellsInNumericCols_(sh);
      totalBefore += before.total; totalAfter += after.total;
      lines.push('');
      lines.push('  "' + name + '": re-set the format on ' + cols.length + ' column(s)');
      if (!before.total) {
        lines.push('    nothing was reading back as a date — this tab was already clean');
      } else {
        lines.push('    BEFORE: ' + before.total + ' cell(s) in money/count columns read back as DATES');
        Object.keys(before.byCol).sort().forEach(function (k) {
          lines.push('      ' + k + ': ' + before.byCol[k]);
        });
        lines.push('      e.g. ' + before.sample);
        lines.push('    AFTER : ' + after.total + (after.total ? ' — still date-formatted' : ' — fixed'));
      }
    });
    lines.push('');
    if (!totalBefore) {
      lines.push('Nothing needed repairing. If a ROAS or CPA column is still blank the split is');
      lines.push('genuinely missing rather than mis-formatted — run diagnoseSplit("CA").');
    } else if (!totalAfter) {
      lines.push('REPAIRED ' + totalBefore + ' cell(s). Those values were never corrupt — only the cell');
      lines.push('format was wrong, which is why a clear-and-re-pull never fixed it.');
      lines.push('NEXT: run pullShopify() so the numbers are refreshed from Shopify with the formats');
      lines.push('now pinned, then rebuildAll(). ROAS New / ROAS Existing / CPA should fill in.');
    } else {
      lines.push(totalAfter + ' cell(s) STILL read back as dates after the format was set, which means');
      lines.push('they really do hold dates rather than numbers — a misaligned column on the write');
      lines.push('side. Run diagnoseSplit() and debugShopifyQL(); rebuildAll() also clears and re-pulls.');
    }
    var msg = lines.join('\n');
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    return msg;
  }

  function diagnoseSplit(onlyCode) {
    var lines = ['=== ' + VERSION + ' — why is the new/returning split missing? ==='];
    var shop = readShopifyDaily_();
    var sheetBad = _shopifyBadCells;
    lines.push('Shopify Daily corrupt cells: ' + sheetBad +
      (sheetBad ? '  <-- REASON 5: stale/misaligned rows. rebuildAll() will clear and re-pull automatically.' : ''));

    CONFIG.ENTITIES.forEach(function (e) {
      if (onlyCode && String(onlyCode).toUpperCase() !== e.code) return;
      lines.push('');
      lines.push('--- ' + e.label + ' (' + e.code + ') ---');
      if (!isConfigured_(e)) { lines.push('  no Shopify credentials in CONFIG — nothing to diagnose.'); return; }

      // What the sheet currently holds for this entity, month to date.
      var mk = monthKeyOf_(new Date()), days = daysOfMonth_(mk);
      var withSplit = 0, without = 0, sheetDays = {};
      days.forEach(function (dk) {
        var s = shop[dk + '|' + e.code];
        if (!s) return;
        sheetDays[dk] = 1;
        if (hasSplitBasis_(s.basis)) withSplit++; else without++;
      });
      lines.push('  sheet: ' + withSplit + ' day(s) WITH the split, ' + without + ' WITHOUT, of ' +
        days.length + ' day(s) in ' + monthLabel_(mk));

      // Ask ShopifyQL directly, right now.
      var ql = 'FROM sales SHOW total_sales GROUP BY day, new_or_returning_customer' +
              ' SINCE -' + CONFIG.LOOKBACK_DAYS + 'd UNTIL today';
      var res = gql_(e, 'query($q:String!){shopifyqlQuery(query:$q){parseErrors ' +
        'tableData{rows columns{name dataType}}}}', { q: ql });
      var sq = res && res.data && res.data.shopifyqlQuery;
      if (!sq) {
        lines.push('  REASON 1: ShopifyQL returned nothing. Add read_reports + read_customers to the ' +
          'Shopify app for this store (an in-admin custom app gets Protected Customer Data with no ' +
          'review). Raw: ' + JSON.stringify((res && res.errors) || res).slice(0, 200));
        return;
      }
      if (sq.parseErrors && sq.parseErrors.length) {
        lines.push('  REASON 2: the query did not parse — the dimension or measure name is not valid in ' +
          'API ' + CONFIG.API_VERSION + '. ' + JSON.stringify(sq.parseErrors).slice(0, 240));
        return;
      }
      var td = sq.tableData, rows = (td && (td.rows || td.rowData)) || [];
      var cols = (td && td.columns) || [];
      lines.push('  ShopifyQL: ' + rows.length + ' row(s), columns ' +
        JSON.stringify(cols.map(function (c) { return c.name + ':' + c.dataType; })));
      if (!rows.length) {
        lines.push('  ShopifyQL parsed fine but returned NO ROWS for the last ' + CONFIG.LOOKBACK_DAYS +
          ' days. Nothing here can invent the split — check the store actually has sales in that window.');
        return;
      }

      // Parse it the way pullShopify does, then compare DAY KEYS — reason 3 is the
      // silent one: both sides hold the data but the keys never meet.
      var acc = {};
      readQLInto_(e, ql, acc, 'rev');
      var qlDays = Object.keys(acc).sort();
      lines.push('  parsed into ' + qlDays.length + ' day key(s), e.g. ' + qlDays.slice(0, 3).join(', ') +
        (qlDays.length > 3 ? ' …' : ''));
      var overlap = qlDays.filter(function (d) { return sheetDays[d]; }).length;
      lines.push('  day keys shared with the sheet: ' + overlap + ' of ' + Object.keys(sheetDays).length);
      if (Object.keys(sheetDays).length && overlap === 0) {
        lines.push('  REASON 3: ZERO overlap — ShopifyQL day keys and the orders-API day keys do not ' +
          'match, so the lookup misses every day even though both sides have data. Compare the samples ' +
          'above against the Date column on "' + DTAB.SHOPIFY + '" — this is a time-zone or ' +
          'date-format mismatch, not a permissions problem.');
        return;
      }

      // Reason 4: would the gate reject any of these days?
      var rejected = [];
      qlDays.forEach(function (dk) {
        var s = shop[dk + '|' + e.code]; if (!s) return;
        var split = num_(acc[dk].newRev) + num_(acc[dk].retRev);
        if (s.revenue > 0 && split > s.revenue * 10) {
          rejected.push(dk + ' (split ' + round2_(split) + ' vs orders ' + round2_(s.revenue) + ')');
        }
      });
      if (rejected.length) {
        lines.push('  REASON 4: the plausibility gate would reject ' + rejected.length + ' day(s): ' +
          rejected.slice(0, 5).join('; ') + (rejected.length > 5 ? ' …' : '') +
          '. The split is coming back far larger than the orders API — a parse problem, not real revenue.');
      }

      if (!without) {
        lines.push('  VERDICT: nothing missing for this entity — every day in ' + monthLabel_(mk) +
          ' has its split.');
      } else if (overlap > 0 && !rejected.length) {
        lines.push('  VERDICT: ShopifyQL HAS the data and the day keys line up, so the blanks are stale ' +
          'sheet rows. Run pullShopify() (or just rebuildAll(), which now self-heals) to rewrite them.');
      }
    });

    lines.push('');
    lines.push('Reminder: a BLANK ROAS New / ROAS Existing means "not measured", never "zero". Blended ' +
      'still reports, because it falls back to Paid + Pending from the orders API.');
    var msg = lines.join('\n');
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    return msg;
  }

  /* Run ONCE after filling CONFIG. Idempotent: it clears its own triggers first,
    so running it again after a config change is always safe. */
  function setup() {
    // Make sure both workbooks exist before anything tries to open one, so setup()
    // never dies on an unfilled placeholder. Creates at most what is missing.
    createMissingWorkbook();
    var data = dataSS_(), exec = execSS_();

    ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });

    ScriptApp.newTrigger('jobDailyRefresh').timeBased()
      .atHour(CONFIG.DAILY_HOUR).everyDays(1).create();
    ScriptApp.newTrigger('onExecEdit').forSpreadsheet(exec).onEdit().create();
    ScriptApp.newTrigger('onExecOpen').forSpreadsheet(exec).onOpen().create();
    // Only install the data-side onOpen when the data workbook is a DIFFERENT file.
    // With SINGLE_WORKBOOK both handlers would fire on the same sheet and you would
    // get two menus doing overlapping things.
    if (!CONFIG.SINGLE_WORKBOOK) {
      ScriptApp.newTrigger('onDataOpen').forSpreadsheet(data).onOpen().create();
    }

    // Create the tabs up front so both workbooks look intentional before the first
    // build, and seed the period cell so currentPeriod_() has something to read.
    tab_(data, DTAB.GRAIN, GRAIN_HEADERS);
    tab_(data, DTAB.SHOPIFY, SHOPIFY_HEADERS);
    tab_(data, DTAB.FACTS, FACTS_HEADERS);
    tab_(data, DTAB.HEALTH, HEALTH_HEADERS);
    tab_(data, DTAB.FX, ['Currency', 'Local -> USD', 'Updated At']);
    var ex = exec.getSheetByName(ETAB.EXEC) || exec.insertSheet(ETAB.EXEC);
    if (!String(ex.getRange('B2').getValue() || '').trim()) {
      ex.getRange('A2').setValue('Period').setFontWeight('bold');
      ex.getRange('B2').setValue(CONFIG.DEFAULT_PERIOD);
    }
    // One comparison tab per entity, seeded with the current month so the first
    // refresh has a month to build against. Existing tabs keep their month.
    var thisMonth = monthKeyOf_(new Date());
    CONFIG.ENTITIES.forEach(function (en) {
      var t = exec.getSheetByName(en.label) || exec.insertSheet(en.label);
      if (!/^\d{4}-\d{2}$/.test(String(t.getRange(1, 2).getValue() || '').trim())) {
        t.getRange(1, 1).setValue('Month').setFontWeight('bold');
        t.getRange(1, 2).setValue(thisMonth);
      }
    });
    // Drop Sheet1 if it is still an untouched default.
    [data, exec].forEach(function (ss) {
      var s1 = ss.getSheetByName('Sheet1');
      if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) ss.deleteSheet(s1);
    });

    Logger.log('setup() done — ' + VERSION + '\n' +
      '  DATA workbook: ' + data.getName() + '\n    ' + data.getUrl() + '\n' +
      '  EXEC workbook: ' + exec.getName() + '\n    ' + exec.getUrl() + '\n' +
      '  daily refresh at ' + CONFIG.DAILY_HOUR + ':00 (script project time zone)\n' +
      '  period dropdown live on the Exec report (cell B2)\n' +
      '  menus installed on both workbooks (reopen each to see them)\n' +
      'Next: run checkProjectIsolation(), then checkAccess(), then refreshAll().');
  }

  /* Print exactly what is and is not wired. Run this whenever a number looks off —
    it is faster than guessing which credential expired. */
  function checkAccess() {
    var lines = ['=== ' + VERSION + ' access check ==='];

    var ids = [['DATA_SHEET_ID', ownedSheetId_('DATA_SHEET_ID')]];
    // With SINGLE_WORKBOOK there is no exec workbook, so reporting it as unset
    // would be a false alarm.
    if (CONFIG.SINGLE_WORKBOOK) lines.push('     SINGLE_WORKBOOK — every tab lives in the data workbook.');
    else ids.push(['EXEC_SHEET_ID', ownedSheetId_('EXEC_SHEET_ID')]);
    ids.push(['BUDGET_SHEET_ID (spend source)', CONFIG.BUDGET_SHEET_ID]);
    ids.push(['TRACKING_SHEET_ID (bds-unified)', CONFIG.TRACKING_SHEET_ID]);
    ids.forEach(function (pair) {
      if (isPlaceholder_(pair[1])) { lines.push('FAIL ' + pair[0] + ' — not set'); return; }
      try { lines.push('OK   ' + pair[0] + ' — "' + SpreadsheetApp.openById(pair[1]).getName() + '"'); }
      catch (e) { lines.push('FAIL ' + pair[0] + ' — cannot open (share it with this account?): ' + e); }
    });

    var sp = budgetSpendSheet_();
    if (sp) {
      var last = sp.getLastRow();
      lines.push('OK   spend tab "' + sp.getName() + '" — ' + Math.max(0, last - 1) + ' row(s)');
      var res = readSpend_(), codes = {};
      Object.keys(res.spend).forEach(function (k) { codes[k.split('|')[1]] = 1; });
      lines.push('     entities present in spend: ' + (Object.keys(codes).sort().join(', ') || 'NONE — check the Country column uses UK/CA/IN/UAE/PF'));
    } else {
      lines.push('FAIL spend tab not found in the budget workbook');
    }

    try {
      var tss = SpreadsheetApp.openById(CONFIG.TRACKING_SHEET_ID);
      var orderTabs = tss.getSheets().map(function (s) { return s.getName(); })
        .filter(function (n) { return / Order$/i.test(n); });
      lines.push('     bds-unified order tabs: ' + (orderTabs.join(', ') || 'none found'));
      CONFIG.ENTITIES.forEach(function (e) {
        var want = e.trackingTab || (e.code + ' Order');
        if (tss.getSheetByName(want)) { lines.push('OK   attribution tab "' + want + '" for ' + e.label); return; }
        // No own tab. If this entity carves rows out of a host tab, say whether
        // that host tab at least exists — that is the difference between "no data
        // yet" and "data is there but landing under another store's name".
        var hosts = (e.trackingHostTabs || []).filter(function (t) { return !!tss.getSheetByName(t); });
        if (hosts.length) {
          lines.push('MISS attribution tab "' + want + '" for ' + e.label +
            ' — will instead carve rows out of "' + hosts.join('", "') +
            '" where Page URL matches /' + e.trackingUrlPattern + '/i');
        } else {
          lines.push('MISS attribution tab "' + want + '" for ' + e.label +
            ' — and no host tab to fall back on, so its revenue/conversions/health will be BLANK. ' +
            'Fix: render the tracking snippet on that store as {% render \'bds-tracking\', country: \'' +
            e.code + '\' %}');
        }
      });
    } catch (e) { lines.push('FAIL bds-unified: ' + e); }

    CONFIG.ENTITIES.forEach(function (e) {
      if (!isConfigured_(e)) { lines.push('FAIL ' + e.label + ' — Shopify credentials not filled (' + e.domain + ')'); return; }
      var tok = accessToken_(e);
      if (!tok) { lines.push('FAIL ' + e.label + ' — token/grant rejected (see the lines above)'); return; }
      var shop = gql_(e, '{shop{name currencyCode}}');
      var nm = shop && shop.data && shop.data.shop;
      if (!nm) { lines.push('FAIL ' + e.label + ' — token works but the Admin API refused; add read_orders'); return; }
      var msg = 'OK   ' + e.label + ' — "' + nm.name + '" (' + nm.currencyCode + ')';
      if (String(nm.currencyCode).toUpperCase() !== String(e.currency).toUpperCase()) {
        msg += '  ⚠ CONFIG says ' + e.currency + ' — fix CONFIG.ENTITIES so local-currency numbers are right';
      }
      // ShopifyQL is what makes the new/returning revenue split possible.
      var ql = pullQLSplit_(e, 7);
      msg += ql ? ' · ShopifyQL split OK' : ' · NO ShopifyQL (add read_reports + read_customers → new-customer revenue will be blank)';
      lines.push(msg);
    });

    Logger.log(lines.join('\n'));
    try { SpreadsheetApp.getUi().alert(lines.join('\n')); } catch (e) {}
    return lines.join('\n');
  }

  /* ================== PROJECT ISOLATION SELF-CHECK ======================== */
  /* RUN THIS FIRST if you are unsure whether you pasted this file into a NEW
    Apps Script project or into an existing one.

    Every .gs file in one Apps Script project shares ONE global scope. This module
    and ad-budget-tracker-apps-script.gs declare 25 of the same names — including
    CONFIG, VERSION, setup, refreshAll, readSpend_ and readAttributed_ — so if both
    live in the same project, whichever file loads last silently wins and BOTH
    break in confusing ways: the tracker would read this module's CONFIG (wrong
    sheet ids, wrong store list), and setup()/refreshAll() would run the wrong
    module entirely. Nothing warns you; the numbers just go wrong.

    The test is decisive: these names exist ONLY in the tracker. If any of them is
    defined here, the two files are sharing a project. */
  function checkProjectIsolation() {
    var trackerOnly = ['doPost', 'TAB', 'buildDailyMaster', 'canonPlatform_',
                      'COUNTRY_CFG', 'MASTER_HEADERS', 'platformOf_'];
    var found = trackerOnly.filter(function (n) {
      try { return typeof eval(n) !== 'undefined'; } catch (e) { return false; }
    });
    var msg;
    if (found.length) {
      msg = '*** STOP — THIS PROJECT IS NOT ISOLATED ***\n' +
        'Found tracker code in this same Apps Script project: ' + found.join(', ') + '\n\n' +
        'All .gs files in one project share one global scope, and these two files declare\n' +
        '25 identical names (CONFIG, VERSION, setup, refreshAll, readSpend_, ...). Whichever\n' +
        'loads last wins, so the tracker and this report will both misbehave — the tracker\n' +
        'may read THIS CONFIG and write to the wrong sheets.\n\n' +
        'FIX: script.google.com > New project (standalone), paste ONLY this file there,\n' +
        'then delete this file from the tracker project. Do not rename to work around it.';
    } else {
      msg = 'OK — isolated. No tracker globals in this project.\n' +
        'VERSION = ' + VERSION + ' · this module has no web app, so no deployment is needed.';
    }
    Logger.log(msg);
    try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
    return msg;
  }

  /* Convenience for the editor: prove the join is working before trusting a build.
    Prints how many attributed orders matched a Shopify order, per entity. */
  function debugJoin() {
    var facts = readOrderFacts_();
    Logger.log('Order Facts holds ' + Object.keys(facts.byId).length + ' order(s).');
    var attr = readAttributed_(facts), agg = {};
    Object.keys(attr).forEach(function (k) {
      var code = k.split('|')[1], v = attr[k];
      var a = agg[code] || (agg[code] = { orders: 0, matched: 0 });
      a.orders += v.orders; a.matched += v.matched;
    });
    Object.keys(agg).forEach(function (code) {
      var a = agg[code];
      Logger.log(code + ': ' + a.matched + ' of ' + a.orders + ' attributed orders matched a Shopify order' +
        (a.orders ? ' (' + Math.round(1000 * a.matched / a.orders) / 10 + '%)' : ''));
    });
  }


  // ===========================================================================
  //  REFERENCE — the full documentation for this module.
  //
  //  At the FOOT of the file deliberately. The top of a file is the part a
  //  copy-paste clips, and a block comment up there turns 130 lines of prose
  //  into code the moment its opening marker is lost — which is exactly how
  //  this file once produced "SyntaxError: missing ) after argument list".
  //  As // lines down here, losing any of it costs reading material and
  //  nothing else.
  // ===========================================================================
  // ============================================================================
  //  BACKDROPSOURCE — GEO x CHANNEL PERFORMANCE  (Google Apps Script)
  //  Two workbooks: a DATA engine + a standalone EXEC report that reads from it.
  // ============================================================================
  //  WHAT THIS ANSWERS
  //    THE MAIN REPORT is one tab per country — UK · Canada · India · UAE ·
  //    PrintFabrix — each holding a DAILY table in this exact shape:
  //
  //      Date | Google | Bing | Meta | LinkedIn | Spent | Pending | Paid |
  //      Blended | New Cx Revenue | Existing Cx Revenue | ROAS New |
  //      ROAS Existing | ROAS Blended | Orders | CPA New | CPA Existing |
  //      Health Check
  //
  //    A banner above the headers says which block is SPEND and which is REVENUE,
  //    so no column has to be guessed at. 'Cx' is customer throughout.
  //    Google/Bing/Meta/LinkedIn are that channel's SPEND. One row per day, a
  //    TOTAL row at the foot, everything centre-aligned, money in the country's
  //    own currency symbol. Countries are NEVER rolled up together, and
  //    PrintFabrix is its own tab exactly like a country. There is no Country
  //    column: the TAB is the country.
  //    New Cx Revenue and Existing Cx Revenue are the two halves of Blended, and
  //    they are the NUMERATORS of the two ROAS columns — printed so a ROAS that
  //    looks too high can be divided out by hand rather than taken on trust.
  //    Health Check is a checkbox YOUR TEAM ticks after checking the day; the
  //    script never touches it.
  //
  //    The "Exec Report" tab keeps the single-period channel view alongside, and
  //    "Method" writes out every definition in plain English.
  //
  //  ONE VERSION OF THE TRUTH — this script INGESTS NOTHING NEW.
  //    SPEND       -> read LIVE, every rebuild, from the existing Ad Budget Tracker
  //                  workbook's "BDS Spent Input" tab (CONFIG.BUDGET_SHEET_ID).
  //                  That tab is already fed daily by the Meta Marketing API + the
  //                  Google/Bing Ads platform scripts. We do NOT copy it into a
  //                  mirror tab here, because a mirror is a second version that
  //                  drifts. Nothing in this file re-reads an ad platform, and
  //                  nothing accepts a pasted screenshot or a platform CSV export.
  //    ATTRIBUTION -> read LIVE from the bds-unified tracking workbook's
  //                  "<CC> Order" PURCHASE rows (CONFIG.TRACKING_SHEET_ID), whose
  //                  Source column already knows each order's channel.
  //    GROUND TRUTH-> each store's own Shopify Admin API (orders + ShopifyQL),
  //                  which is what "health" is measured AGAINST.
  //    So: spend has exactly one owner (the tracker), attribution has exactly one
  //    owner (bds-unified), truth has exactly one owner (Shopify). This workbook is
  //    a READER and a JOINER. If a number here is wrong, it is wrong at its source
  //    and it is wrong in the tracker too — which is the point.
  //
  //  WHY IT IS A SEPARATE SCRIPT (house rule)
  //    Per the standing rule set when the MoM module was reverted: a new module gets
  //    its OWN file and its OWN Apps Script project. This file NEVER edits, and is
  //    never pasted into, ad-budget-tracker-apps-script.gs — it only READS that
  //    workbook. It also has no web app and no /exec, so the redeploy trap does not
  //    apply here: edits take effect on the next run.
  //
  //  NEW-CUSTOMER REVENUE, PER CHANNEL — how it is actually derived
  //    Shopify can tell you new-vs-returning revenue per DAY per STORE, but not per
  //    ad channel. bds-unified knows the channel of each order but not whether the
  //    buyer was new. The join key is the order itself: "<CC> Order" rows carry
  //    Order ID and Order Number, so every attributed order is matched to its
  //    Shopify order and inherits that order's new/returning flag. That yields
  //    EXACT per-channel new-customer revenue instead of pro-rating a store-level
  //    ratio across channels (a pro-rate would invent precision the data lacks).
  //
  //    IMPORTANT — the flag is STAMPED ONCE, then frozen. Shopify's
  //    customer.numberOfOrders is a LIFETIME counter read at query time, so a buyer
  //    whose first order was in March and who bought again in July reads as
  //    "returning" today — which would silently re-label their March order and make
  //    historical new-customer revenue decay downwards on every refresh. So
  //    "Order Facts" writes Is New ONCE per Order ID and never overwrites it.
  //    Orders first seen within FRESH_STAMP_DAYS of their order date are stamped
  //    Basis='fresh' (trustworthy); older ones are Basis='backfill' (the decay may
  //    already have happened before we ever saw the order). The reports surface the
  //    backfill share per line so you know which periods to trust.
  //
  //  PAID SUBTOTAL vs OVERALL — why each entity gets both
  //    bds-unified files every source it cannot identify (organic, email, direct)
  //    under "Direct". That revenue is real and must be in the entity's OVERALL
  //    line, or coverage would be a lie. But dividing it by PAID spend would
  //    overstate ROAS, so each entity also gets a PAID SUBTOTAL line covering only
  //    CONFIG.CHANNELS. Read PAID for "is the spend working" and OVERALL for "how
  //    is this market doing". Set CONFIG.SHOW_PAID_SUBTOTAL = false to drop it.
  //
  //  ONE ORDER = ONE CONVERSION
  //    bds-unified logs Product and Quantity, so a basket can arrive as several
  //    PURCHASE rows, and a re-fired pixel can repost an order outright. Every
  //    order id (or order number when the id is missing) is therefore counted
  //    exactly once — otherwise conversions and revenue multiply by basket size.
  //    The run log reports how many rows were collapsed.
  //
  //  CONVERSION TRACKING HEALTH = ATTRIBUTION COVERAGE
  //    OVERALL rows : Coverage % = attributed revenue / Shopify revenue, per GEO.
  //                   "How much of the money we actually made can our tracking
  //                   explain at all?" 100% = every pound is attributable.
  //    CHANNEL rows : Matched %  = that channel's attributed orders that join to a
  //                   real Shopify order. Catches ghost rows, dupes and test hits.
  //    Both carry a 🟢/🟡/🔴 flag off CONFIG.HEALTH thresholds, and the components
  //    (Shopify vs attributed, the unattributed gap, click-id capture rate, missing
  //    spend days) sit on the "Tracking Health" tab in the data workbook.
  //
  //  SETUP  (about 10 minutes)
  //    1. Workbook ids. Either paste them into CONFIG.DATA_SHEET_ID /
  //       CONFIG.EXEC_SHEET_ID yourself (the id is the long string in a Sheet URL
  //       between /d/ and /edit), or leave a PASTE_ placeholder and let setup()
  //       create the missing workbook for you — it remembers the id in Script
  //       Properties and logs it, so a re-run never creates a duplicate. CONFIG
  //       always wins over the remembered id.
  //    2. script.google.com -> New project (STANDALONE — do NOT bind it to either
  //       sheet, it drives both) -> paste this whole file -> Save.
  //       It MUST be its own project, not a new file inside the Ad Budget Tracker
  //       project: every .gs file in one project shares one global scope, and these
  //       two files declare 25 of the same names (CONFIG, VERSION, setup,
  //       refreshAll, readSpend_, ...). Sharing a project silently breaks both.
  //       Run checkProjectIsolation() if you are unsure — it detects this exactly.
  //       There is NO web app here (no doGet/doPost), so do NOT Deploy anything;
  //       a /exec URL for this project can never respond. Just run setup().
  //    3. Fill the PASTE_ placeholders in CONFIG.ENTITIES. Reuse the same Shopify
  //       credentials your other projects already use, or an in-admin custom app
  //       token (shpat_...) — the easier route, because in-admin apps get Protected
  //       Customer Data automatically, so ShopifyQL and the new/returning split work
  //       with no review request. Scopes: read_orders, read_reports, read_customers.
  //    4. Run  setup()  once -> authorize -> installs the daily refresh, both menus
  //       and the Exec period dropdown.
  //    5. Run  checkAccess()  -> the log prints OK/FAIL per entity and per source
  //       workbook, so you can see exactly what is not yet wired.
  //    6. Run  refreshAll()  -> first full build (takes a few minutes).
  // ============================================================================
  // ===========================================================================