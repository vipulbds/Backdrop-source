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
//  BACKDROPSOURCE — EXEC RAG REPORT          (Google Apps Script)
//  bds-rag — the fortnightly exec scorecard. Every GEO x channel graded
//  Red / Amber / Green against fixed targets, period-to-date against the
//  SAME days of last month, in its own workbook. Reads the GEO x Channel
//  Performance workbook and computes nothing of its own.
//
//  SETUP   paste this WHOLE file into its OWN standalone Apps Script
//          project — never the GEO project — Save, then run setup().
//  CHECK   checkProjectIsolation()  ·  checkAccess()  ·  selfTest()
//  REBUILD rebuildAll()
//
//  FULL DOCUMENTATION IS AT THE FOOT OF THIS FILE — search "REFERENCE".
//  It lives down there on purpose: the top of a file is what a copy-paste
//  clips, and losing documentation must never stop the script parsing.
// ===========================================================================

/* Bump this on every change that alters what the tabs SAY or how they grade.
   It is printed by selfTest(), by whatVersion(), in every rebuild log line and in
   the footer of every tab — so "which version is actually loaded?" is one run away
   instead of a guess. Several rounds were lost to a paste that silently did not
   land, with no way to tell from inside Apps Script. */
var VERSION = 'bds-rag v2 — Cx/Blended/Orders/Spent labels';

var CONFIG = {
  /* ---- THE ONE WORKBOOK THIS SCRIPT OWNS (the only thing it ever writes) --- */
  // *** THIS IS THE REPORT — the workbook you asked for, 2026-08-20: ***
  //   https://docs.google.com/spreadsheets/d/1ydXV6dbO5bx0vRFCm54R-GHMV1YbZojPLi1a2ARCvnA/edit
  // Every tab this script builds lands HERE. Change this id and the whole report
  // moves with it — but you must re-run setup() afterwards, because the onEdit and
  // onOpen triggers are bound to a specific FILE, and a trigger left pointing at
  // the old one means the menu and the health sign-off silently stop working.
  // (setup() first created 1kxIArW3AgCEaHsg2fLDlkeVrEXdfnum0qGVIPxEqZbI, which is
  // now unused and safe to delete from Drive.)
  REPORT_SHEET_ID: '1ydXV6dbO5bx0vRFCm54R-GHMV1YbZojPLi1a2ARCvnA',

  // A prefix on every tab this script creates. Leave '' for a workbook dedicated
  // to this report. Set it to something like 'RAG ' if you are pointing the report
  // at a workbook that already has tabs of its own, so a name can never collide
  // with yours. Changing it does not move your old tabs — it builds new ones, and
  // the guard below simply stops complaining about the clash.
  TAB_PREFIX: '',

  /* ---- THE SOURCE IT ONLY EVER READS (never writes) ----------------------- */
  // The GEO x Channel Performance workbook — the data engine built by
  // geo-channel-performance-apps-script.gs.
  GEO_SHEET_ID: '13SdMx1nGN3pnenj1-Uzc-YHuwTT7nQYI5T4rRYqb7rA',
  GEO_TABS: {
    GRAIN:   'GEO Channel Daily',   // Date x Entity x Channel
    SHOPIFY: 'Shopify Daily',       // Date x Entity ground truth
    FX:      'FX Rates'             // the GEO engine's live local -> USD rates
  },

  /* ---- SCOPE -------------------------------------------------------------- */
  // `code` MUST match the Entity code used in the GEO workbook's tabs — that is
  // the join key. `label` is the tab name and what the report prints.
  // Never combined with each other: no cross-GEO total row exists.
  ENTITIES: [
    { code: 'UK',  label: 'UK',          currency: 'GBP' },
    { code: 'CA',  label: 'Canada',      currency: 'CAD' },
    { code: 'IN',  label: 'India',       currency: 'INR' },
    { code: 'UAE', label: 'UAE',         currency: 'AED' },
    { code: 'PF',  label: 'PrintFabrix', currency: 'USD' }
  ],

  // Paid channels, in report order (matches the GEO workbook's column order).
  CHANNELS: ['Google', 'Bing', 'Meta', 'LinkedIn'],
  // Any other channel the source reports (TikTok, Direct/organic, ...) still
  // gets its own row when true, so a channel nobody configured cannot silently
  // vanish from an exec report.
  SHOW_OTHER: true,
  // A PAID SUBTOTAL line covering only CHANNELS above, next to the OVERALL line.
  SHOW_PAID_SUBTOTAL: true,
  // A cross-country summary tab: one line per GEO, still with NO total row.
  SHOW_SUMMARY_TAB: true,

  /* ---- THE TARGETS THE RAG IS GRADED AGAINST ------------------------------ */
  // Change a number here and every tab re-grades on the next rebuild.
  // >= green -> GREEN, >= amber -> AMBER, below amber -> RED.
  TARGETS: {
    roasNew:     { green: 4,    amber: 3    },   // new-customer revenue / spend
    roasOverall: { green: 5,    amber: 4    },   // all revenue (new + returning) / spend
    growth:      { green: 0.25, amber: 0.10 }    // period-on-period revenue growth
  },

  // Thresholds for the AUTOMATIC tracking-health evidence flag only. The RAG on
  // the tracking-health line itself is set by your team, never by the script.
  HEALTH: { good: 0.90, warn: 0.70 },

  /* ---- CURRENCY ----------------------------------------------------------- */
  // EVERY figure in this workbook is shown in this one currency, so the five GEOs
  // can be read and added up side by side. Conversion happens ONCE, as the source
  // is read, using ONE rate per currency — see readFx_ for why that matters.
  REPORT_CURRENCY: 'USD',
  // Fallback rates (1 unit of local -> USD), used only if the GEO workbook's
  // "FX Rates" tab cannot be read. That tab is the real source and is refreshed
  // live by the GEO engine; these keep the report building rather than silently
  // leaving foreign amounts unconverted.
  FX: { USD: 1, CAD: 0.73, GBP: 1.27, AUD: 0.66, NZD: 0.60, EUR: 1.08, INR: 0.012, SGD: 0.74, AED: 0.27 },
  // Force a rate, e.g. { GBP: 1.30 } to report a whole period at one agreed rate.
  // Anything here beats both the FX tab and the fallbacks above.
  FX_PINNED: {},

  /* ---- SANITY TRIPWIRES --------------------------------------------------- */
  // These exist because of a real incident (2026-08-20): the GEO workbook's
  // "Returning Cust Revenue" arrived at ~2.5e15 PER DAY and this report printed an
  // Overall Revenue of $51,205,863,893,064,000 with a 1,298,642,692,670x ROAS. The
  // values were valid NUMBERS — they were just not money (summed customer ids) —
  // so nothing downstream could tell. A report that prints that as revenue has
  // stopped being a report, so it now refuses to and says where the bad data is.
  SANITY: {
    // Per entity, per DAY, after conversion to the report currency. Not a business
    // limit — a corruption tripwire. Their biggest month is ~$1.2M (≈$40k/day), so
    // this leaves three orders of magnitude of headroom and only ever fires on
    // data that is not money at all. 0 disables the check.
    maxDailyRevenue: 50000000,
    // "Shopify Daily" carries TWO independent measurements of the same day: the
    // orders-API Revenue, and the ShopifyQL new+returning split. They need not
    // agree to the penny (QL nets discounts and returns differently) but they must
    // be in the same universe. Outside this band the SPLIT is the untrustworthy
    // one — the orders API is a plain sum of order totals — so the day falls back
    // to orders-only, exactly as if QL had been unavailable.
    splitMaxRatio: 3,      // split more than 3x the orders-API revenue -> quarantine
    splitMinRatio: 0.5,    // or less than half of it. Set 0 to skip the low side.
    // The two above are AGGREGATE tripwires: they judge a day's total for an
    // entity. These two judge a SINGLE CELL as it is read, because the two fail
    // differently. A date landing in a money column upstream stringifies to ~5e14
    // and, once WRITTEN to the sheet, the cell holds a genuine Number — so every
    // type check accepts it and magnitude is the only tell. Deliberately looser
    // than maxDailyRevenue: this is the "cannot be money in any currency, ever"
    // line, while maxDailyRevenue is the "cannot be THIS business in one day" line.
    maxDailyMoney: 1e9,
    maxDailyCount: 1e6     // an order/customer count of 5e14 is the same bug
  },


  /* ---- BEHAVIOUR ---------------------------------------------------------- */
  DEFAULT_MODE: 'Month to date',
  TIMEZONE: 'America/Chicago',   // the report's day boundary
  STALE_DAYS: 2,                 // source older than this -> banner on every tab
  DAILY_HOUR: 8                  // rebuild hour; the GEO engine refreshes at 7
};

/* The four comparison modes. Every one of them compares LIKE FOR LIKE: the prior
   window always holds the same number of days as the current window. */
var MODES = ['Month to date', 'Last 15 days', 'Last 30 days', 'Last full month'];

/* Tabs this script owns. Always name them through tabName_ / entityTab_ so
   CONFIG.TAB_PREFIX applies everywhere at once — a prefix that only reached half
   the call sites would leave the report reading one tab and writing another. */
var RTAB = {
  SUMMARY: 'Exec Summary',
  METHOD:  'Method',
  LOG:     'Health Log'
};
/* The line name as PRINTED. The stored key stays 'OVERALL' on purpose: health
   sign-offs live in Script Properties keyed CODE|LINE|PERIOD, so renaming the line
   itself would orphan every tick the team has already entered. Display and identity
   are different things, and only one of them is safe to change. */
function lineLabel_(line) { return String(line) === 'OVERALL' ? 'BLENDED' : String(line); }
function tabName_(base) { return String(CONFIG.TAB_PREFIX || '') + base; }
function entityTab_(e) { return tabName_(e.label); }
/* Every tab this script builds, in the order it wants them. */
function ourTabNames_() {
  var out = [];
  if (CONFIG.SHOW_SUMMARY_TAB) out.push(tabName_(RTAB.SUMMARY));
  CONFIG.ENTITIES.forEach(function (e) { out.push(entityTab_(e)); });
  out.push(tabName_(RTAB.METHOD), tabName_(RTAB.LOG));
  return out;
}

/* Script Property keys. */
var PROP = {
  SHEET:  'ragSheet_REPORT_SHEET_ID',  // remembered workbook id (CONFIG wins)
  HEALTH: 'ragHealth',                 // the manual tracking-health sign-offs
  LAYOUT: 'ragLayout'                  // where each tab's health block sits
};

/* ---- palette. Deliberately the same family as the MoM Comparison View so the
        two reports read as one pack. ---- */
var TITLE_BG = '#F8CBAD', HDR_BG = '#ED7D31';
var CUR_BG   = '#FFFF00', PRIOR_BG = '#F4B183', GROWTH_BG = '#FFF2CC';
var BAND_BG  = '#F7F7F7', PAID_BG = '#FFF2CC', OVERALL_BG = '#FFD966';
var GRID     = '#BFBFBF', MUTED = '#666666', WARN_FG = '#B45309';
var HEALTH_TITLE_BG = '#DCE6F1', HEALTH_HDR_BG = '#4F81BD';

/* The RAG vocabulary. `rank` is only used to explain intent — the status
   priority is spelled out in worstStatus_ because "worst" is not a number. */
var RAG = {
  G: { icon: '🟢', word: 'GREEN',   bg: '#C6EFCE', fg: '#006100' },
  A: { icon: '🟡', word: 'AMBER',   bg: '#FFEB9C', fg: '#9C5700' },
  R: { icon: '🔴', word: 'RED',     bg: '#FFC7CE', fg: '#9C0006' },
  U: { icon: '⚪', word: 'NO DATA', bg: '#EDEDED', fg: '#767676' },
  N: { icon: '—',  word: '—',       bg: '#FFFFFF', fg: '#AAAAAA' }
};
/* What your team picks from on the tracking-health line. */
var TEAM_RAG_OPTIONS = ['🟢 Green', '🟡 Amber', '🔴 Red', '⚪ Not checked'];

var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ========================================================================== */
/*  COLUMN SPECS                                                              */
/*  Header text, number formats and the row builder all read the SAME spec, so
    they cannot drift out of alignment. Adding a column here is the only edit
    needed — miscounting columns is the classic way one of these tables ends up
    printing revenue under a ROAS header.                                     */
/* ========================================================================== */

/* {P} and {C} are replaced with the prior / current window labels at build time
   ("1–20 Jul", "1–20 Aug"), exactly as your MoM view prints the two years. */
function entityCols_() {
  return [
    { key: 'line',   group: 'Channel',                sub: '',          kind: 'label', w: 158 },
    { key: 'spendP', group: 'Spent',                  sub: '{P}',       kind: 'money', w: 100 },
    { key: 'spendC', group: 'Spent',                  sub: '{C}',       kind: 'money', w: 100 },
    { key: 'spendG', group: 'Spent',                  sub: 'Growth %',  kind: 'pct',   w: 86  },
    { key: 'newP',   group: 'New Cx Revenue',   sub: '{P}',       kind: 'money', w: 108 },
    { key: 'newC',   group: 'New Cx Revenue',   sub: '{C}',       kind: 'money', w: 108 },
    { key: 'newG',   group: 'New Cx Revenue',   sub: 'Growth %',  kind: 'pct',   w: 86  },
    { key: 'newGR',  group: 'New Cx Revenue',   sub: 'RAG',       kind: 'rag',   w: 56  },
    { key: 'rnP',    group: 'New-Revenue ROAS',       sub: '{P}',       kind: 'roas',  w: 86  },
    { key: 'rnC',    group: 'New-Revenue ROAS',       sub: '{C}',       kind: 'roas',  w: 86  },
    { key: 'rnR',    group: 'New-Revenue ROAS',       sub: 'RAG',       kind: 'rag',   w: 56  },
    { key: 'ovP',    group: 'Blended Revenue',        sub: '{P}',       kind: 'money', w: 108 },
    { key: 'ovC',    group: 'Blended Revenue',        sub: '{C}',       kind: 'money', w: 108 },
    { key: 'ovG',    group: 'Blended Revenue',        sub: 'Growth %',  kind: 'pct',   w: 86  },
    { key: 'ovGR',   group: 'Blended Revenue',        sub: 'RAG',       kind: 'rag',   w: 56  },
    { key: 'roP',    group: 'Blended ROAS',           sub: '{P}',       kind: 'roas',  w: 86  },
    { key: 'roC',    group: 'Blended ROAS',           sub: '{C}',       kind: 'roas',  w: 86  },
    { key: 'roR',    group: 'Blended ROAS',           sub: 'RAG',       kind: 'rag',   w: 56  },
    { key: 'cvP',    group: 'Orders',            sub: '{P}',       kind: 'int',   w: 86  },
    { key: 'cvC',    group: 'Orders',            sub: '{C}',       kind: 'int',   w: 86  },
    { key: 'status', group: 'Status',                 sub: '',          kind: 'rag',   w: 104 }
  ];
}

/* The tracking-health block. The last five columns are YOURS — the script reads
   them back but never writes a judgement into them. */
function healthCols_() {
  return [
    { key: 'line',    label: 'Line',              kind: 'label',  w: 158, manual: false },
    { key: 'orders',  label: 'Attributed Orders', kind: 'int',    w: 110, manual: false },
    { key: 'matched', label: 'Matched Orders',    kind: 'int',    w: 110, manual: false },
    { key: 'attrRev', label: 'Attributed Revenue', kind: 'money', w: 124, manual: false },
    { key: 'shopRev', label: 'Shopify Revenue',   kind: 'money',  w: 124, manual: false },
    { key: 'metric',  label: 'Evidence',          kind: 'label',  w: 104, manual: false },
    { key: 'pct',     label: '%',                 kind: 'pct1',   w: 76,  manual: false },
    { key: 'auto',    label: 'Auto Flag',         kind: 'rag',    w: 76,  manual: false },
    { key: 'teamRag', label: 'Team RAG',          kind: 'pick',   w: 120, manual: true  },
    { key: 'signed',  label: 'Health Check ✓',    kind: 'check',  w: 92,  manual: true  },
    { key: 'by',      label: 'Checked By',        kind: 'text',   w: 120, manual: true  },
    { key: 'when',    label: 'Date Checked',      kind: 'date',   w: 104, manual: true  },
    { key: 'notes',   label: 'Notes',             kind: 'text',   w: 320, manual: true  }
  ];
}

function summaryCols_() {
  return [
    { key: 'country', group: 'Country',              sub: '',         kind: 'label', w: 128 },
    { key: 'basis',   group: 'Basis',                sub: '',         kind: 'label', w: 132 },
    { key: 'cur',     group: 'Rate',                 sub: '',         kind: 'label', w: 112 },
    { key: 'spendP',  group: 'Spent',                sub: '{P}',      kind: 'money', w: 100 },
    { key: 'spendC',  group: 'Spent',                sub: '{C}',      kind: 'money', w: 100 },
    { key: 'newP',    group: 'New Cx Revenue', sub: '{P}',      kind: 'money', w: 108 },
    { key: 'newC',    group: 'New Cx Revenue', sub: '{C}',      kind: 'money', w: 108 },
    { key: 'newG',    group: 'New Cx Revenue', sub: 'Growth %', kind: 'pct',   w: 86  },
    { key: 'newGR',   group: 'New Cx Revenue', sub: 'RAG',      kind: 'rag',   w: 56  },
    { key: 'rnP',     group: 'New-Revenue ROAS',     sub: '{P}',      kind: 'roas',  w: 86  },
    { key: 'rnC',     group: 'New-Revenue ROAS',     sub: '{C}',      kind: 'roas',  w: 86  },
    { key: 'rnR',     group: 'New-Revenue ROAS',     sub: 'RAG',      kind: 'rag',   w: 56  },
    { key: 'ovP',     group: 'Blended Revenue',      sub: '{P}',      kind: 'money', w: 108 },
    { key: 'ovC',     group: 'Blended Revenue',      sub: '{C}',      kind: 'money', w: 108 },
    { key: 'ovG',     group: 'Blended Revenue',      sub: 'Growth %', kind: 'pct',   w: 86  },
    { key: 'ovGR',    group: 'Blended Revenue',      sub: 'RAG',      kind: 'rag',   w: 56  },
    { key: 'roP',     group: 'Blended ROAS',         sub: '{P}',      kind: 'roas',  w: 86  },
    { key: 'roC',     group: 'Blended ROAS',         sub: '{C}',      kind: 'roas',  w: 86  },
    { key: 'roR',     group: 'Blended ROAS',         sub: 'RAG',      kind: 'rag',   w: 56  },
    { key: 'hPct',    group: 'Tracking Health',      sub: 'Evidence', kind: 'pct1',  w: 88  },
    { key: 'hTeam',   group: 'Tracking Health',      sub: 'Team RAG', kind: 'label', w: 110 },
    { key: 'status',  group: 'Status',               sub: '',         kind: 'rag',   w: 104 }
  ];
}

/* ========================================================================== */
/*  SMALL SHARED HELPERS                                                      */
/* ========================================================================== */

function num_(v) {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
/* STRICT numeric parse — returns null rather than a wrong number. num_() above
   strips every non-digit so it can read "£1,234.56" out of a typed cell; handed a
   Date it stringifies it and yields ~5e14. Anything read from the SOURCE comes
   through here instead, so a date or a label in a money column is rejected. */
function numStrict_(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v instanceof Date) return null;                 // a date is never a measure
  if (typeof v !== 'string') return null;
  var s = v.replace(/[\s, ]/g, '').replace(/^[£$€₹]|^[A-Z]{3}/, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  var n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/* One money figure from the source: converted to the report currency, or NULL if
   it cannot be trusted. A BLANK is not untrustworthy — it is a legitimate zero, and
   an orders-only day has genuinely blank split columns — so blank returns 0 and is
   never reported. Two gates, because they catch different failures:
     numStrict_     a date / label / object sitting in a money column
     maxDailyMoney  a value that is arithmetic rather than money — the case that
                    survives every type check, because by the time it reaches this
                    sheet it IS a Number, and magnitude is all that gives it away.
   Rejections go into the SAME bad[] the vet functions use, so the tabs tell one
   quarantine story rather than two competing ones. */
function srcMoney_(raw, cur, ctx, field) {
  if (raw === '' || raw == null) return 0;
  var v = numStrict_(raw);
  if (v === null) return srcReject_(ctx, field, raw, whyNotANumber_(raw));
  var usd = toUSD_(v, cur);
  var cap = num_(CONFIG.SANITY.maxDailyMoney);
  if (cap > 0 && Math.abs(usd) > cap)
    return srcReject_(ctx, field, raw, 'reads as ' + fmtBig_(usd) + ', which cannot be money');
  return usd;
}
/* Counts get the same treatment — an order count of 5e14 is the same bug. */
function srcCount_(raw, ctx, field) {
  if (raw === '' || raw == null) return 0;
  var v = numStrict_(raw);
  if (v === null) return srcReject_(ctx, field, raw, whyNotANumber_(raw));
  var cap = num_(CONFIG.SANITY.maxDailyCount);
  if (cap > 0 && Math.abs(v) > cap)
    return srcReject_(ctx, field, raw, 'reads as ' + fmtBig_(v) + ', which cannot be a count');
  return v;
}
/* WHY a cell could not be read, in words that name the actual fix.
   The date case is worth its own sentence because it is both the most common and
   the most misleading: the value in the cell is usually CORRECT and only its
   number format is wrong, but a date-formatted cell is handed to Apps Script as a
   Date, so it is refused and the column goes blank. 12/30/1899 is Sheets serial 0
   and 11/14/1906 is serial 2510 — real money, wearing a date. Nobody guesses that
   from "is not a number", so the message says it. */
function whyNotANumber_(raw) {
  if (raw instanceof Date) {
    return 'is DATE-FORMATTED, so it arrives here as a date rather than a number — the value ' +
      'itself is probably fine and only the cell format is wrong. Fix it in the GEO project: ' +
      'run healNumberFormats() (menu: "Fix number formats"), then pullShopify() and rebuildAll()';
  }
  return 'is not a number';
}
function srcReject_(ctx, field, raw, why) {
  if (ctx && ctx.bad) ctx.bad.push({
    code: ctx.code, day: ctx.day, kind: 'unreadable', tab: ctx.tab,
    detail: field + ' ' + why + ' (the cell holds "' +
      String(raw instanceof Date ? raw.toISOString().slice(0, 10) : raw).slice(0, 32) + '")' });
  return null;
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
function hasSplitBasis_(basis) {
  var b = String(basis || '');
  return b === 'shopifyql' || b === 'order-facts';
}
function round2_(n) { return Math.round(num_(n) * 100) / 100; }
function round4_(n) { return Math.round(num_(n) * 10000) / 10000; }
function indexMap_(row) { var m = {}; row.forEach(function (h, i) { m[String(h).trim()] = i; }); return m; }
function isPlaceholder_(v) { return !v || /^PASTE_/.test(String(v)); }
/* A leading = + - @ in a text cell is a formula injection waiting to happen. */
function safeCell_(v) { return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v; }

var _tz = null;
function tz_() {
  if (_tz) return _tz;
  _tz = CONFIG.TIMEZONE || Session.getScriptTimeZone() || 'Etc/UTC';
  return _tz;
}
function dayKey_(d) { return Utilities.formatDate(d, tz_(), 'yyyy-MM-dd'); }
function addDays_(d, n) { return new Date(d.getTime() + n * 86400000); }
/* Parse anything the sheet might hold into a real Date at local noon — noon so a
   DST shift can never roll the date backwards a day. */
function asDate_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12);
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}
/* Any cell value -> 'yyyy-mm-dd', or '' if it is not a date at all. */
function normDayKey_(v) {
  if (v instanceof Date) return dayKey_(v);
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(+m[2]) + '-' + pad2_(+m[3]);
  var d = asDate_(s);
  return d ? dayKey_(d) : '';
}
function pad2_(n) { return (n < 10 ? '0' : '') + n; }
function ymd_(y, m, d) { return y + '-' + pad2_(m) + '-' + pad2_(d); }
/* Days in month m (1-based) of year y. Day 0 of the NEXT month is the last day
   of this one, which is also how February gets its leap years right. */
function lastDayOf_(y, m) { return new Date(Date.UTC(y, m, 0, 12)).getUTCDate(); }
function shiftKey_(dk, n) { return dayKey_(addDays_(asDate_(dk), n)); }
function inRange_(dk, from, to) { return dk >= from && dk <= to; }
function daysBetween_(from, to) {
  return 1 + Math.round((asDate_(to).getTime() - asDate_(from).getTime()) / 86400000);
}

function moneyFmt_(cur) {
  var c = String(cur || 'USD').toUpperCase();
  var sym = { USD: '$', CAD: '$', AUD: '$', NZD: '$', SGD: '$', GBP: '£', EUR: '€', INR: '₹' }[c];
  return sym ? sym + '#,##0.00' : '"' + c + ' "#,##0.00';
}
/* ========================================================================== */
/*  FX — ONE rate table, read once, applied to everything                     */
/*  Read from the GEO workbook's "FX Rates" tab, which its engine refreshes from
    live rates — so this report and the GEO workbook's own USD columns agree
    instead of being two answers to the same question.

    WHY ONE RATE FOR BOTH WINDOWS, rather than each period at its own historical
    rate: this report exists to compare two periods. Converting them at two
    different rates would fold a currency move into the growth %, and a channel
    could go red on an exec scorecard because sterling moved, not because it sold
    less. With a single rate, every growth % and every ROAS is FX-neutral. The
    trade-off is that a USD total here will not tie exactly to Shopify's own USD
    display, which uses the rate on each order's day — that is stated on the tab. */
/* ========================================================================== */

var _fx = null;
function readFx_() {
  if (_fx) return _fx;
  var rates = {}, updatedAt = '', source = 'CONFIG.FX fallback rates';
  Object.keys(CONFIG.FX).forEach(function (k) { rates[String(k).toUpperCase()] = num_(CONFIG.FX[k]); });
  try {
    var sh = geoSS_().getSheetByName(CONFIG.GEO_TABS.FX);
    if (sh && sh.getLastRow() > 1) {
      var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
      var ci = c['Currency'], ri = c['Local -> USD'], ui = c['Updated At'];
      if (ci != null && ri != null) {
        var got = 0;
        for (var i = 1; i < vals.length; i++) {
          var cur = String(vals[i][ci] || '').trim().toUpperCase();
          var rate = num_(vals[i][ri]);
          if (!cur || rate <= 0) continue;          // a blank or zero rate is not a rate
          rates[cur] = rate; got++;
          if (ui != null) {
            var u = normDayKey_(vals[i][ui]);
            if (u && u > updatedAt) updatedAt = u;
          }
        }
        if (got) source = '"' + CONFIG.GEO_TABS.FX + '" tab of the GEO workbook';
      }
    }
  } catch (e) { /* fall back to CONFIG.FX — reported in the footer and checkAccess */ }
  Object.keys(CONFIG.FX_PINNED || {}).forEach(function (k) {
    var r = num_(CONFIG.FX_PINNED[k]);
    if (r > 0) { rates[String(k).toUpperCase()] = r; source += ' (with pinned overrides)'; }
  });
  _fx = { rates: rates, updatedAt: updatedAt, source: source, missing: {} };
  return _fx;
}
/* Convert into CONFIG.REPORT_CURRENCY. A currency with NO rate is left as-is and
   RECORDED — never quietly treated as 1:1, because that would silently inflate a
   GEO's revenue (an unconverted AED figure reads ~3.7x too high) and nothing on
   the face of the report would show it. The count surfaces as a tab banner. */
function toUSD_(amount, cur) {
  var a = num_(amount);
  var c = String(cur || '').toUpperCase();
  if (!a) return 0;
  if (!c || c === String(CONFIG.REPORT_CURRENCY).toUpperCase()) return a;
  var fx = readFx_(), r = fx.rates[c];
  if (!r || r <= 0) { fx.missing[c] = (fx.missing[c] || 0) + 1; return a; }
  return a * r;
}
function fxRateFor_(cur) {
  var c = String(cur || '').toUpperCase();
  if (!c || c === String(CONFIG.REPORT_CURRENCY).toUpperCase()) return 1;
  return readFx_().rates[c] || 0;
}
/* "GBP @ 1.2700", or "USD native" for a store that already bills in USD. */
function fxLabel_(cur) {
  var c = String(cur || '').toUpperCase();
  if (!c || c === String(CONFIG.REPORT_CURRENCY).toUpperCase()) return c + ' native';
  var r = fxRateFor_(c);
  return c + (r ? ' @ ' + r.toFixed(4) : ' @ NO RATE');
}
/* The currency a source row is in: what the row says, else what CONFIG says the
   entity bills in. Never assumed to be the report currency. */
function rowCurrency_(code, raw) {
  var c = String(raw == null ? '' : raw).trim().toUpperCase();
  if (c) return c;
  var e = entityByCode_(code);
  return e ? String(e.currency).toUpperCase() : String(CONFIG.REPORT_CURRENCY).toUpperCase();
}

function entityByCode_(code) {
  var want = String(code || '').toUpperCase(), hit = null;
  CONFIG.ENTITIES.forEach(function (e) { if (e.code.toUpperCase() === want) hit = e; });
  return hit;
}
function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m - 1) / 26); }
  return s;
}

/* ========================================================================== */
/*  WORKBOOKS                                                                 */
/* ========================================================================== */

var _ssCache = {};
function openById_(id, what) {
  if (isPlaceholder_(id)) throw new Error('CONFIG.' + what + ' is not set yet.');
  if (_ssCache[id]) return _ssCache[id];
  return (_ssCache[id] = SpreadsheetApp.openById(id));
}
/* The report workbook resolves CONFIG first, then the id setup() remembered.
   Checking the remembered id BEFORE creating anything is what stops a re-run
   from spawning a second workbook — the mistake that makes people ask "which of
   these two sheets is the real report?". */
function reportSheetId_() {
  if (!isPlaceholder_(CONFIG.REPORT_SHEET_ID)) return CONFIG.REPORT_SHEET_ID;
  try {
    var stored = PropertiesService.getScriptProperties().getProperty(PROP.SHEET);
    if (stored) return stored;
  } catch (e) {}
  return null;
}
function reportSS_() {
  var id = reportSheetId_();
  if (!id) {
    throw new Error('No report workbook yet. Run setup() — it creates the workbook, ' +
      'remembers its id and logs the URL for you to paste into CONFIG.REPORT_SHEET_ID.');
  }
  return openById_(id, 'REPORT_SHEET_ID');
}
function geoSS_() { return openById_(CONFIG.GEO_SHEET_ID, 'GEO_SHEET_ID'); }

function sheetFor_(name) {
  var ss = reportSS_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/* Does this tab look like one WE built? Every tab this script writes starts with
   a known cell, and an empty tab is safe by definition. Anything else is somebody
   else's work and must not be cleared — resetTab_ wipes unconditionally, so this
   is the only thing standing between a name collision and someone's lost data. */
function tabIsOurs_(sh) {
  if (!sh || sh.getLastRow() === 0) return true;             // empty: nothing to lose
  var a1 = String(sh.getRange(1, 1).getValue() || '').trim();
  /* 'Period' in A1 is written by paintControls_ on EVERY tab this script builds,
     and it is written FIRST. Accepting it on its own is deliberate and it matters:
     a build that failed partway through leaves a tab holding the control row and
     nothing else, and a guard that also demanded the title would then refuse to
     rebuild that tab FOREVER — a deadlock nothing but hand-editing could clear.
     Refusing to overwrite a stranger's data is the point; refusing to finish our
     own half-written tab is just a bug. 'Item' is the Method tab's first cell. */
  if (a1 === 'Period') return true;   // country tab, summary tab, or Health Log
  if (a1 === 'Item') return true;     // Method
  return false;
}
/* What a clashing tab actually holds, so the refusal can name the cause instead of
   just the symptom. A1 = 'Month' is the GEO ENGINE's daily tab — that workbook uses
   the same country names, and pointing both scripts at one file is the usual way
   this happens. */
function tabFingerprint_(sh) {
  try {
    var a1 = String(sh.getRange(1, 1).getValue() || '').trim();
    var a2 = String(sh.getRange(2, 1).getValue() || '').trim();
    var hint = a1 === 'Month'
      ? '  <-- this is the GEO ENGINE\'s daily tab, not a tab of this report'
      : '';
    return 'A1="' + a1.slice(0, 24) + '" A2="' + a2.slice(0, 30) + '" (' +
      sh.getLastRow() + ' rows)' + hint;
  } catch (e) { return '(could not read it: ' + e.message + ')'; }
}
/* Run BEFORE building anything. Pointing the report at a workbook that already
   has a tab called "UK" or "Method" would otherwise destroy it on the first
   rebuild, silently and completely. Better to refuse and say how to fix it. */
function assertSafeTabs_() {
  var ss = reportSS_(), clash = [];
  ourTabNames_().forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh && !tabIsOurs_(sh)) clash.push(name);
  });
  if (!clash.length) return;
  throw new Error(
    'REFUSING TO BUILD — the workbook "' + ss.getName() + '" already has ' + clash.length +
    ' tab(s) with the name(s) this report needs, and they are NOT tabs this script wrote:\n' +
    clash.map(function (nm) {
      return '    ' + nm + '   ' + tabFingerprint_(ss.getSheetByName(nm));
    }).join('\n') + '\n' +
    'Rebuilding would clear them completely, so nothing has been touched. Pick one:\n' +
    '  1. Set CONFIG.TAB_PREFIX to something like \'RAG \' — the report then builds ' +
    '"RAG ' + clash[0] + '" and leaves your tab alone. (Easiest.)\n' +
    '  2. Rename or delete your own tab(s) listed above.\n' +
    '  3. Point CONFIG.REPORT_SHEET_ID at a workbook of its own.\n' +
    'Then run rebuildAll() again.');
}

/* ========================================================================== */
/*  READING THE SOURCE  (read-only, by header NAME)                           */
/*  Read by name, never by position: the GEO engine has added columns to these
    tabs before, and a positional read would silently start pulling Paid Revenue
    where New Cust Revenue used to be. A missing header is a loud error here.   */
/* ========================================================================== */

function readSourceTab_(tabName, needed) {
  var sh = geoSS_().getSheetByName(tabName);
  if (!sh) {
    throw new Error('The GEO workbook has no "' + tabName + '" tab. This report reads it ' +
      'and computes nothing itself — run the GEO x Channel Performance script\'s refreshAll() ' +
      'first, then rebuild this report.');
  }
  if (sh.getLastRow() < 2) return { rows: [], c: {}, empty: true, tab: tabName };
  var vals = sh.getDataRange().getValues();
  var c = indexMap_(vals[0]);
  var missing = needed.filter(function (h) { return c[h] == null; });
  if (missing.length) {
    throw new Error('"' + tabName + '" is missing the column(s): ' + missing.join(', ') +
      '. The GEO engine renamed or reordered them — update this report\'s reader before trusting it.');
  }
  return { rows: vals, c: c, empty: false, tab: tabName };
}

/* GEO Channel Daily -> { 'yyyy-mm-dd|CODE|Channel': {...} } */
function readGrain_() {
  var need = ['Date', 'Entity', 'Channel', 'Spend', 'Conversions', 'Revenue',
              'New Cust Revenue', 'Matched Orders'];
  var t = readSourceTab_(CONFIG.GEO_TABS.GRAIN, need);
  var out = {}, maxDate = '', seen = {}, codes = {}, curSeen = {}, bad = [], n = 0;
  if (t.empty) return { map: out, maxDate: '', channelsByEntity: seen, codes: codes,
                        curSeen: curSeen, bad: bad, rows: 0 };
  var c = t.c;
  for (var i = 1; i < t.rows.length; i++) {
    var r = t.rows[i];
    var dk = normDayKey_(r[c['Date']]); if (!dk) continue;
    var code = String(r[c['Entity']] || '').trim().toUpperCase(); if (!code) continue;
    var ch = String(r[c['Channel']] || '').trim(); if (!ch) continue;
    codes[code] = (codes[code] || 0) + 1;
    if (dk > maxDate) maxDate = dk;
    (seen[code] || (seen[code] = {}))[ch] = 1;
    var key = dk + '|' + code + '|' + ch;
    // Converted HERE, as it is read, rather than in each builder: one place means
    // no view can forget, and every figure downstream is already in one currency.
    // Counts (conversions, matched orders) are never converted.
    var cur = rowCurrency_(code, c['Currency'] != null ? r[c['Currency']] : '');
    (curSeen[code] || (curSeen[code] = {}))[cur] = 1;
    // One row per Date x Entity x Channel is the contract, but SUM rather than
    // assign so a duplicated row in the source cannot silently drop money.
    // Each figure is guarded INDEPENDENTLY: one bad cell must not discard the
    // three good ones beside it, so a rejected value contributes nothing rather
    // than poisoning the row.
    var ctx = { bad: bad, code: code, day: dk, tab: t.tab };
    var o = out[key] || (out[key] = { spend: 0, orders: 0, revenue: 0, newRevenue: 0, matched: 0 });
    o.spend      += srcMoney_(r[c['Spend']],            cur, ctx, ch + ' Spend')          || 0;
    o.orders     += srcCount_(r[c['Conversions']],           ctx, ch + ' Conversions')     || 0;
    o.revenue    += srcMoney_(r[c['Revenue']],          cur, ctx, ch + ' Revenue')          || 0;
    o.newRevenue += srcMoney_(r[c['New Cust Revenue']], cur, ctx, ch + ' New Cust Revenue') || 0;
    o.matched    += srcCount_(r[c['Matched Orders']],        ctx, ch + ' Matched Orders')   || 0;
    n++;
  }
  // Vetted AFTER the sums, so a day split across duplicate rows is judged on its
  // total rather than row by row.
  Object.keys(out).forEach(function (k) {
    var pk = k.split('|');
    vetGrainRow_(out[k], pk[0], pk[1], pk[2], bad);
  });
  return { map: out, maxDate: maxDate, channelsByEntity: seen, codes: codes,
           curSeen: curSeen, bad: bad, rows: n };
}

/* Shopify Daily -> { 'yyyy-mm-dd|CODE': {...} } — the ground truth. */
function readShopify_() {
  var need = ['Date', 'Entity', 'Orders', 'Revenue', 'New Cust Revenue',
              'Returning Cust Revenue', 'Revenue Basis'];
  var t = readSourceTab_(CONFIG.GEO_TABS.SHOPIFY, need);
  var out = {}, maxDate = '', curSeen = {}, bad = [], n = 0;
  if (t.empty) return { map: out, maxDate: '', curSeen: curSeen, bad: bad, rows: 0 };
  var c = t.c;
  for (var i = 1; i < t.rows.length; i++) {
    var r = t.rows[i];
    var dk = normDayKey_(r[c['Date']]); if (!dk) continue;
    var code = String(r[c['Entity']] || '').trim().toUpperCase(); if (!code) continue;
    if (dk > maxDate) maxDate = dk;
    var cur = rowCurrency_(code, c['Currency'] != null ? r[c['Currency']] : '');
    (curSeen[code] || (curSeen[code] = {}))[cur] = 1;
    // Read through the same gates as the grain, BEFORE the vet functions: those
    // judge magnitude, which cannot tell a date from money once the date has been
    // written to the cell as a number. Both layers are needed.
    var ctx = { bad: bad, code: code, day: dk, tab: t.tab };
    var rev = srcMoney_(r[c['Revenue']],                  cur, ctx, 'Revenue');
    var nwR = srcMoney_(r[c['New Cust Revenue']],          cur, ctx, 'New Cust Revenue');
    var rtR = srcMoney_(r[c['Returning Cust Revenue']],    cur, ctx, 'Returning Cust Revenue');
    var ord = srcCount_(r[c['Orders']],                         ctx, 'Orders');
    var rec = {
      orders:  ord === null ? 0 : ord,
      revenue: rev === null ? 0 : rev,
      newRev:  nwR === null ? 0 : nwR,
      retRev:  rtR === null ? 0 : rtR,
      basis:   String(r[c['Revenue Basis']] || '')
    };
    // A half of the split that could not be READ is an unknown half, not an empty
    // one. Keeping it as 0 would print a confident "all revenue is returning
    // customers", so the day drops to orders-only and the split renders as ⚪.
    if (nwR === null || rtR === null) { rec.newRev = 0; rec.retRev = 0; rec.basis = 'quarantined'; }
    vetShopifyRow_(rec, dk, code, bad);
    out[dk + '|' + code] = rec;
    n++;
  }
  return { map: out, maxDate: maxDate, curSeen: curSeen, bad: bad, rows: n };
}

/* Both sources, read ONCE per rebuild. Every tab and both periods are computed
   off this one object: each read scans a whole workbook, and re-reading per tab
   per period would be ten full scans for no new information. */
function loadSource_() {
  var g = readGrain_(), s = readShopify_();
  var maxDate = g.maxDate > s.maxDate ? g.maxDate : s.maxDate;
  var today = dayKey_(new Date());
  var staleDays = maxDate ? daysBetween_(maxDate, today) - 1 : 9999;
  // readFx_ returns the SAME object each call, and toUSD_ records unknown
  // currencies into its .missing as the readers run — so this is read AFTER them.
  var fx = readFx_();
  var curByEntity = {};
  [g.curSeen, s.curSeen].forEach(function (m) {
    Object.keys(m || {}).forEach(function (code) {
      Object.keys(m[code]).forEach(function (cur) { (curByEntity[code] || (curByEntity[code] = {}))[cur] = 1; });
    });
  });
  var bad = (g.bad || []).concat(s.bad || []);
  if (bad.length) {
    Logger.log('SANITY: quarantined ' + bad.length + ' source row(s) that could not be money. First: ' +
      bad[0].code + ' ' + bad[0].day + ' — ' + bad[0].detail);
  }
  return {
    grain: g.map, shop: s.map, fx: fx, curByEntity: curByEntity, bad: bad,
    channelsByEntity: g.channelsByEntity, codesSeen: g.codes,
    grainRows: g.rows, shopRows: s.rows,
    grainMax: g.maxDate, shopMax: s.maxDate, maxDate: maxDate,
    staleDays: staleDays,
    stale: staleDays > CONFIG.STALE_DAYS
  };
}

/* ========================================================================== */
/*  SANITY — a number that cannot be true must never be printed as if it were  */
/* ========================================================================== */

/* Readable at any magnitude: 2.5e15 says "this is not money" far better than
   2,560,293,194,653,200.00 does. */
function fmtBig_(v) {
  var n = num_(v);
  return Math.abs(n) >= 1e10 ? n.toExponential(3) : String(round2_(n));
}
function overCap_(v) {
  var cap = num_(CONFIG.SANITY && CONFIG.SANITY.maxDailyRevenue);
  return cap > 0 && Math.abs(num_(v)) > cap;
}

/* Vet ONE "Shopify Daily" row, in place. Quarantining sets the day's split to
   nothing and marks the basis, so aggregate_ falls back to the orders-API revenue
   and lineMetrics_ reports newHasData:false — which the tabs already render as ⚪
   "cannot see it" rather than a red zero. Nothing is invented and nothing that
   cannot be trusted is shown. */
function vetShopifyRow_(rec, dk, code, bad) {
  // 1. Absolute implausibility. Catches corruption in EITHER measurement, which a
  //    cross-check between them cannot (if both are garbage they can still agree).
  if (overCap_(rec.revenue) || overCap_(rec.newRev) || overCap_(rec.retRev)) {
    bad.push({ code: code, day: dk, kind: 'impossible', tab: CONFIG.GEO_TABS.SHOPIFY,
      detail: 'Revenue ' + fmtBig_(rec.revenue) + ' · New ' + fmtBig_(rec.newRev) +
              ' · Returning ' + fmtBig_(rec.retRev) + '  (tripwire ' +
              fmtBig_(CONFIG.SANITY.maxDailyRevenue) + ' per day)' });
    if (overCap_(rec.revenue)) rec.revenue = 0;
    rec.newRev = 0; rec.retRev = 0; rec.basis = 'quarantined';
    return true;
  }
  // 2. The two measurements must agree within a wide band.
  if (hasSplitBasis_(rec.basis) && rec.revenue > 0) {
    var split = rec.newRev + rec.retRev;
    var hiR = num_(CONFIG.SANITY.splitMaxRatio), loR = num_(CONFIG.SANITY.splitMinRatio);
    var tooHigh = hiR > 0 && split > rec.revenue * hiR;
    var tooLow  = loR > 0 && split < rec.revenue * loR;
    if (tooHigh || tooLow) {
      bad.push({ code: code, day: dk, kind: 'split', tab: CONFIG.GEO_TABS.SHOPIFY,
        detail: 'new+returning ' + fmtBig_(split) + ' vs orders-API revenue ' +
                fmtBig_(rec.revenue) + ' — ' + (tooHigh ? 'far too high' : 'far too low') });
      rec.newRev = 0; rec.retRev = 0; rec.basis = 'quarantined';
      return true;
    }
  }
  return false;
}

/* The same tripwire on a grain row. A corrupted figure here would inflate ONE
   channel's ROAS rather than the OVERALL line, which is harder to spot by eye. */
function vetGrainRow_(o, dk, code, ch, bad) {
  if (!overCap_(o.spend) && !overCap_(o.revenue) && !overCap_(o.newRevenue)) return false;
  bad.push({ code: code, day: dk, kind: 'impossible', tab: CONFIG.GEO_TABS.GRAIN,
    detail: ch + ': Spend ' + fmtBig_(o.spend) + ' · Revenue ' + fmtBig_(o.revenue) +
            ' · New ' + fmtBig_(o.newRevenue) });
  o.spend = 0; o.revenue = 0; o.newRevenue = 0;
  return true;
}

/* ========================================================================== */
/*  PERIODS — the auto-advancing like-for-like comparison                     */
/*  On the 20th: 1–20 Aug vs 1–20 Jul. On the 21st: 1–21 Aug vs 1–21 Jul. The
    prior window ALWAYS holds the same number of days as the current one, so a
    part-month is never compared against a whole month.                        */
/* ========================================================================== */

function periodPair_(mode, asOfKey) {
  mode = MODES.indexOf(String(mode)) >= 0 ? String(mode) : CONFIG.DEFAULT_MODE;
  var today = dayKey_(new Date());
  // Whether somebody actually TYPED a day, as opposed to leaving the cell blank to
  // follow today. paintControls_ needs to know: writing today's date back into the
  // cell would pin the report to the day it was last built, and advancing by itself
  // overnight is the entire point of it.
  var asOfGiven = !!normDayKey_(asOfKey);
  var asOf = normDayKey_(asOfKey) || today;
  // A future "as of" would produce a window with no data in it and growth
  // figures that look like a crash. Clamp, and say so.
  var clamped = false;
  if (asOf > today) { asOf = today; clamped = true; }

  var y = +asOf.slice(0, 4), m = +asOf.slice(5, 7), d = +asOf.slice(8, 10);
  var cur, prior;

  if (mode === 'Month to date') {
    cur = { from: ymd_(y, m, 1), to: asOf };
    var py = y, pm = m - 1;
    if (pm < 1) { pm = 12; py -= 1; }
    // 31 March compares against 28/29 February, never against a day that does
    // not exist. The prior window is then SHORTER, which is stated on the tab.
    var pd = Math.min(d, lastDayOf_(py, pm));
    prior = { from: ymd_(py, pm, 1), to: ymd_(py, pm, pd) };

  } else if (mode === 'Last 15 days' || mode === 'Last 30 days') {
    var n = mode === 'Last 15 days' ? 15 : 30;
    cur = { from: shiftKey_(asOf, -(n - 1)), to: asOf };
    prior = { from: shiftKey_(asOf, -(2 * n - 1)), to: shiftKey_(asOf, -n) };

  } else {  // 'Last full month' — the last COMPLETE month vs the one before it.
    var ly = y, lm = m - 1;
    if (lm < 1) { lm = 12; ly -= 1; }
    cur = { from: ymd_(ly, lm, 1), to: ymd_(ly, lm, lastDayOf_(ly, lm)) };
    var by = ly, bm = lm - 1;
    if (bm < 1) { bm = 12; by -= 1; }
    prior = { from: ymd_(by, bm, 1), to: ymd_(by, bm, lastDayOf_(by, bm)) };
  }

  cur.days = daysBetween_(cur.from, cur.to);
  prior.days = daysBetween_(prior.from, prior.to);
  cur.label = rangeLabel_(cur.from, cur.to);
  prior.label = rangeLabel_(prior.from, prior.to);
  cur.short = shortLabel_(cur.from, cur.to);
  prior.short = shortLabel_(prior.from, prior.to);

  return {
    mode: mode, asOf: asOf, asOfGiven: asOfGiven, clamped: clamped, cur: cur, prior: prior,
    sameLength: cur.days === prior.days,
    key: periodKeyFor_(mode, asOf, cur)
  };
}

/* The sign-off key. It must stay STABLE for the whole reporting period, or a tick
   entered on the 20th would vanish on the 21st when the window grows by a day.
   So it names the period, not the window: the whole of August's month-to-date
   shares one key, and a new month starts with a clean sheet. */
function periodKeyFor_(mode, asOf, cur) {
  var ym = asOf.slice(0, 7);
  if (mode === 'Month to date')  return 'MTD:' + ym;
  if (mode === 'Last 30 days')   return 'L30:' + ym;
  if (mode === 'Last full month') return 'LM:' + cur.from.slice(0, 7);
  // Fortnights: the 1st-15th of a month is half A, the 16th onward is half B —
  // which is exactly the cadence this report is presented on.
  return 'F15:' + ym + (+asOf.slice(8, 10) <= 15 ? '-A' : '-B');
}

function rangeLabel_(from, to) {
  var a = asDate_(from), b = asDate_(to);
  if (from.slice(0, 7) === to.slice(0, 7)) {
    return a.getDate() + '–' + b.getDate() + ' ' + MON3[a.getMonth()] + ' ' + a.getFullYear();
  }
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return a.getDate() + ' ' + MON3[a.getMonth()] + ' – ' + b.getDate() + ' ' + MON3[b.getMonth()] + ' ' + b.getFullYear();
  }
  return a.getDate() + ' ' + MON3[a.getMonth()] + ' ' + a.getFullYear() + ' – ' +
         b.getDate() + ' ' + MON3[b.getMonth()] + ' ' + b.getFullYear();
}
/* The short form that goes in the sub-header, where the column is 100px wide. */
function shortLabel_(from, to) {
  var a = asDate_(from), b = asDate_(to);
  if (from.slice(0, 7) === to.slice(0, 7)) return a.getDate() + '–' + b.getDate() + ' ' + MON3[a.getMonth()];
  return a.getDate() + ' ' + MON3[a.getMonth()] + '–' + b.getDate() + ' ' + MON3[b.getMonth()];
}

/* Which mode / as-of the workbook is currently showing. Read off the first tab
   that has a valid value so every tab stays on ONE period — an exec report where
   the UK tab covers a different fortnight to the Canada tab is worse than
   useless, it is misleading. */
function currentControls_() {
  var out = { mode: CONFIG.DEFAULT_MODE, asOf: '' };
  try {
    var ss = reportSS_(), names = ourTabNames_();
    for (var i = 0; i < names.length; i++) {
      var sh = ss.getSheetByName(names[i]);
      if (!sh || sh.getLastRow() < 1) continue;
      var v = sh.getRange(1, 1, 1, 4).getValues()[0];
      var mode = String(v[1] || '').trim(), asOf = normDayKey_(v[3]);
      if (MODES.indexOf(mode) >= 0) { out.mode = mode; out.asOf = asOf; return out; }
    }
  } catch (e) {}
  return out;
}

/* ========================================================================== */
/*  AGGREGATION                                                               */
/* ========================================================================== */

function blank_() { return { spend: 0, orders: 0, revenue: 0, newRevenue: 0, matched: 0 }; }
function add_(t, v) {
  t.spend += v.spend; t.orders += v.orders; t.revenue += v.revenue;
  t.newRevenue += v.newRevenue; t.matched += v.matched;
}

/* Everything both reports need for ONE window, per entity:
     channels{}  per-channel attribution + spend
     paid        the CONFIG.CHANNELS subtotal
     all         every channel, including Direct/organic — the attributed total
     shopify     ground truth for the entity                                   */
function aggregate_(src, from, to) {
  var byEntity = {};
  CONFIG.ENTITIES.forEach(function (e) {
    byEntity[e.code] = {
      channels: {}, paid: blank_(), all: blank_(),
      shopify: { orders: 0, revenue: 0, newRev: 0, retRev: 0, blend: 0, days: 0, qlDays: 0 }
    };
  });
  var isPaid = {};
  CONFIG.CHANNELS.forEach(function (ch) { isPaid[ch] = 1; });

  Object.keys(src.grain).forEach(function (k) {
    var p = k.split('|');
    if (!inRange_(p[0], from, to)) return;
    var b = byEntity[p[1]]; if (!b) return;
    var ch = p[2], v = src.grain[k];
    var s = b.channels[ch] || (b.channels[ch] = blank_());
    add_(s, v);
    add_(b.all, v);
    if (isPaid[ch]) add_(b.paid, v);
  });

  Object.keys(src.shop).forEach(function (k) {
    var p = k.split('|');
    if (!inRange_(p[0], from, to)) return;
    var b = byEntity[p[1]]; if (!b) return;
    var v = src.shop[k];
    b.shopify.orders += v.orders;
    b.shopify.revenue += v.revenue;
    b.shopify.newRev += v.newRev;
    b.shopify.retRev += v.retRev;
    b.shopify.days++;
    // Blended = new + returning revenue where ShopifyQL gave us the split, so
    // "new-revenue ROAS + returning-revenue ROAS = overall ROAS" holds exactly.
    // Where it did not, fall back to the orders-API revenue for that day rather
    // than dropping the day's money out of the report.
    if (hasSplitBasis_(v.basis)) { b.shopify.qlDays++; b.shopify.blend += v.newRev + v.retRev; }
    else { b.shopify.blend += v.revenue; }
  });

  return { from: from, to: to, days: daysBetween_(from, to), byEntity: byEntity };
}

/* Which lines to print for an entity, in order. CONFIG.CHANNELS first (so the
   table's shape is stable even in a period where a channel spent nothing), then
   anything else the source reported in EITHER window, then the subtotals. */
function linesFor_(code, aCur, aPrior) {
  var out = CONFIG.CHANNELS.slice();
  if (CONFIG.SHOW_OTHER) {
    var extra = {};
    [aCur, aPrior].forEach(function (a) {
      var b = a.byEntity[code]; if (!b) return;
      Object.keys(b.channels).forEach(function (ch) { if (out.indexOf(ch) === -1) extra[ch] = 1; });
    });
    Object.keys(extra).sort().forEach(function (ch) { out.push(ch); });
  }
  if (CONFIG.SHOW_PAID_SUBTOTAL) out.push('PAID SUBTOTAL');
  out.push('OVERALL');
  return out;
}

/* One line's numbers for one window.
   CHANNEL and PAID lines are ATTRIBUTION-based (what our tracking can tie to a
   channel). The OVERALL line is SHOPIFY-based (what the store actually took).
   They will not add up while attribution coverage is below 100% — that gap is
   the point of the tracking-health block, not a bug to be papered over. */
function lineMetrics_(code, line, agg) {
  var b = agg.byEntity[code] || { channels: {}, paid: blank_(), all: blank_(),
    shopify: { orders: 0, revenue: 0, newRev: 0, retRev: 0, blend: 0, days: 0, qlDays: 0 } };
  if (line === 'OVERALL') {
    return {
      basis: 'shopify',
      spend: b.all.spend,                 // every channel's spend, not only the paid four
      newRev: b.shopify.newRev,
      rev: b.shopify.blend,
      conv: b.shopify.orders,
      hasData: b.shopify.days > 0,
      /* Whether the NEW-CUSTOMER half is measurable is a SEPARATE question from
         whether we have any Shopify data at all. Overall revenue comes from the
         orders API and is always there; the new/returning split comes from
         ShopifyQL and sometimes is not. Grading new-revenue ROAS off a split that
         does not exist would print a RED on the flagship metric — a report
         asserting the spend won no new customers, when the truth is that we could
         not see. So the two travel separately and a missing split reads ⚪. */
      newHasData: b.shopify.qlDays > 0,
      attrOrders: b.all.orders, matched: b.all.matched, attrRev: b.all.revenue,
      shopRev: b.shopify.revenue, qlDays: b.shopify.qlDays, days: b.shopify.days
    };
  }
  var m = (line === 'PAID SUBTOTAL') ? b.paid : (b.channels[line] || blank_());
  return {
    basis: 'attributed',
    spend: m.spend, newRev: m.newRevenue, rev: m.revenue, conv: m.orders,
    hasData: (m.orders > 0 || m.revenue > 0),
    // Channel rows get new-customer revenue per ORDER (each order carries its own
    // frozen new/returning flag), so it does not depend on the daily QL split.
    newHasData: (m.orders > 0 || m.revenue > 0),
    attrOrders: m.orders, matched: m.matched, attrRev: m.revenue,
    shopRev: '', qlDays: 0, days: 0
  };
}

/* ========================================================================== */
/*  RAG                                                                       */
/* ========================================================================== */

/* ROAS against a target. Three distinct "no grade" cases, kept distinct on
   purpose:
     no spend            -> '—'  there is nothing to grade; a ROAS needs a cost.
     spend, but no data  -> '⚪'  we cannot see this channel's revenue. NOT red:
                                 red would assert it sold nothing, which is a
                                 claim about the world we have no evidence for.
     spend and data      -> graded.                                            */
function ragRoas_(spend, revenue, hasData, target) {
  if (num_(spend) <= 0) return 'N';
  if (!hasData) return 'U';
  var roas = num_(revenue) / num_(spend);
  if (roas >= target.green) return 'G';
  if (roas >= target.amber) return 'A';
  return 'R';
}

/* Growth against the target. `hasSpend` separates "a channel we are funding and
   cannot measure" (⚪, needs fixing) from "a channel we are not running" (—). */
function ragGrowth_(prior, cur, hasSpend, hasDataEither, curMeasured) {
  prior = num_(prior); cur = num_(cur);
  /* A CHANGE MEASURED AGAINST AN UNMEASURED WINDOW IS NOT A CHANGE.
     Observed live on 2026-08-21: UK Google had £4,930 of new-customer revenue in
     July and NOTHING attributable in August, because attribution stopped putting a
     channel on the orders. This graded -100% RED — the report asserting the channel
     lost all its new customers — while the ROAS cell on the very same row correctly
     read ⚪. Two cells describing one fact, disagreeing. The prior window having
     data does not make this window's SILENCE a collapse, so an unmeasured current
     window reads ⚪ and the growth cell goes blank.
     Only `false` counts: an undefined curMeasured means the caller did not know, and
     the old behaviour is kept rather than silently turning every grade grey. */
  if (curMeasured === false) return hasSpend ? 'U' : 'N';
  if (!hasDataEither && prior === 0 && cur === 0) return hasSpend ? 'U' : 'N';
  if (prior <= 0) return cur > 0 ? 'G' : (hasSpend ? 'U' : 'N');
  var g = (cur - prior) / prior;
  if (g >= CONFIG.TARGETS.growth.green) return 'G';
  if (g >= CONFIG.TARGETS.growth.amber) return 'A';
  return 'R';
}
/* The growth number itself. Blank when the prior window was zero — a percentage
   change from nothing is not a number, and printing a huge one would be a lie
   dressed as precision. The cell says NEW instead and carries a note. */
function growthVal_(prior, cur, curMeasured) {
  prior = num_(prior); cur = num_(cur);
  // Same rule as the RAG beside it: a percentage change INTO an unmeasured window
  // is not a number. -100% next to an empty cell reads as a crash; it was a gap.
  if (curMeasured === false) return '';
  if (prior > 0) return round4_((cur - prior) / prior);
  if (cur > 0) return 'NEW';
  return '';
}

/* Worst-of, in words rather than in arithmetic: any RED makes the line RED; else
   any AMBER makes it AMBER; else an unmeasurable dimension makes it NO DATA —
   because a line we cannot see is not a line we can call green. */
function worstStatus_(codes) {
  var real = codes.filter(function (c) { return c && c !== 'N'; });
  if (!real.length) return 'N';
  if (real.indexOf('R') >= 0) return 'R';
  if (real.indexOf('A') >= 0) return 'A';
  if (real.indexOf('U') >= 0) return 'U';
  return 'G';
}
function healthFlag_(share) {
  if (share === '' || share == null) return 'N';
  if (share >= CONFIG.HEALTH.good) return 'G';
  if (share >= CONFIG.HEALTH.warn) return 'A';
  return 'R';
}
function ragIcon_(code) { return (RAG[code] || RAG.N).icon; }
function ragStatus_(code) {
  var r = RAG[code] || RAG.N;
  return code === 'N' ? '—' : r.icon + ' ' + r.word;
}
/* A money cell for the sheet: rounded to the cent, and blank rather than a hard
   zero so an empty line reads as empty. Rounding is not cosmetic — converting
   2400 GBP at 1.31 lands as 3143.999999999999, and while the number format hides
   that, the RAW value is what a copied cell or a SUM the team adds later sees. */
function money_(v) { return num_(v) ? round2_(v) : ''; }

function roasVal_(spend, revenue, hasData) {
  if (num_(spend) <= 0) return '';        // no cost, so there is no return on it
  // Nothing attributed at all: leave the cell EMPTY to agree with the ⚪ flag.
  // Printing 0.00x here would state that the channel returned nothing, which is a
  // claim about the world; what actually happened is that we could not see it.
  // A measured zero (orders exist, new-customer revenue is genuinely 0) still
  // prints 0.00x and still grades red — that one we did measure.
  if (hasData === false) return '';
  return round2_(num_(revenue) / num_(spend));
}

/* The tracking-health evidence flag. Pulled out of the builder so the one case
   that matters can be asserted: SPEND WITH NOTHING ATTRIBUTED is the loudest line
   on the tab — we are paying for a channel we cannot see — so it reads ⚪ "cannot
   verify", never — "nothing to look at". */
function healthEvidenceFlag_(isOverall, pct, spend) {
  if (pct !== '' && pct != null) return healthFlag_(pct);
  if (isOverall) return 'N';
  return num_(spend) > 0 ? 'U' : 'N';
}

/* ========================================================================== */
/*  THE MANUAL TRACKING-HEALTH SIGN-OFF                                       */
/*  Typed by a human, so the script must never invent it and must never destroy
    it. The tabs are rebuilt from scratch on every refresh, which would wipe
    anything written into a cell, so the sign-offs live in Script Properties
    keyed CODE|LINE|PERIOD and are re-rendered on every build.                 */
/* ========================================================================== */

function healthMap_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PROP.HEALTH);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function healthKey_(code, line, periodKey) { return code + '|' + line + '|' + periodKey; }
function getHealth_(map, code, line, periodKey) {
  return map[healthKey_(code, line, periodKey)] || null;
}
function setHealth_(code, line, periodKey, rec) {
  var map = healthMap_(), key = healthKey_(code, line, periodKey);
  var empty = !rec || (!rec.rag && !rec.signed && !rec.by && !rec.when && !rec.notes);
  if (empty) delete map[key];
  else {
    rec.savedAt = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
    map[key] = rec;
  }
  PropertiesService.getScriptProperties().setProperty(PROP.HEALTH, JSON.stringify(map));
  return map;
}
/* Where each tab's health block sits, so an edit can be traced back to the right
   country and line without re-deriving the whole layout. Written on every build. */
function layoutMap_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(PROP.LAYOUT);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveLayout_(tabName, rec) {
  var all = layoutMap_();
  all[tabName] = rec;
  PropertiesService.getScriptProperties().setProperty(PROP.LAYOUT, JSON.stringify(all));
}

/* Which of TEAM_RAG_OPTIONS a stored value is, as a RAG code. */
function teamRagCode_(v) {
  var s = String(v || '');
  if (/green/i.test(s)) return 'G';
  if (/amber/i.test(s)) return 'A';
  if (/red/i.test(s)) return 'R';
  return 'N';
}

/* ========================================================================== */
/*  SHARED TABLE PAINTING                                                     */
/* ========================================================================== */

/* Contiguous runs of the same group name, for the merged top header row. */
function groupSpans_(cols) {
  var out = [];
  for (var i = 0; i < cols.length; i++) {
    if (out.length && out[out.length - 1].name === cols[i].group) { out[out.length - 1].span++; continue; }
    out.push({ name: cols[i].group, start: i + 1, span: 1 });
  }
  return out;
}

/* Rows 4-5: the orange grouped header, in the shape of the MoM Comparison View.
   Single-column groups merge VERTICALLY across both rows (Channel, Status);
   multi-column groups merge horizontally with the periods underneath. */
function paintHeader_(sh, cols, rG, rH, per) {
  var W = cols.length;
  groupSpans_(cols).forEach(function (g) {
    if (g.span === 1) {
      sh.getRange(rG, g.start, 2, 1).merge().setValue(g.name);
    } else {
      sh.getRange(rG, g.start, 1, g.span).merge().setValue(g.name);
    }
  });
  var subs = cols.map(function (c) {
    return String(c.sub || '').replace('{P}', per.prior.short).replace('{C}', per.cur.short);
  });
  // Only write the sub row where the group did not already merge over it.
  cols.forEach(function (c, i) {
    if (!c.sub) return;
    sh.getRange(rH, i + 1).setValue(subs[i]);
  });

  sh.getRange(rG, 1, 1, W).setBackground(HDR_BG).setFontWeight('bold').setFontSize(11);
  sh.getRange(rH, 1, 1, W).setFontWeight('bold').setFontSize(10);
  cols.forEach(function (c, i) {
    if (!c.sub) return;                                  // vertically merged group
    var bg = c.sub === '{P}' ? PRIOR_BG
           : c.sub === '{C}' ? CUR_BG
           : c.kind === 'rag' ? HDR_BG
           : GROWTH_BG;
    var cell = sh.getRange(rH, i + 1).setBackground(bg);
    if (bg === HDR_BG) cell.setFontColor('#FFFFFF');
  });
  sh.getRange(rG, 1, 2, W).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true)
    .setBorder(true, true, true, true, true, true, '#7F7F7F', SpreadsheetApp.BorderStyle.SOLID);
  sh.setRowHeight(rG, 30);
  sh.setRowHeight(rH, 26);
}

/* Number formats, applied column by column off the spec. Money is per-currency,
   so a per-row override is possible (the summary tab needs it). */
/* ONE setNumberFormats call for the whole block rather than one per column.
   This was 21 Sheets calls per tab; across five country tabs, the summary and the
   health blocks it was a large part of the ~600 calls that made a rebuild time out
   with "Service Spreadsheets timed out". Same result, one round trip. */
function applyFormats_(sh, cols, r0, n, currency) {
  if (n <= 0) return;
  var money = moneyFmt_(currency);
  var row = cols.map(function (c) {
    switch (c.kind) {
      case 'money': return money;
      case 'pct':   return '+0.00%;-0.00%;0.00%';
      case 'pct1':  return '0.0%';
      case 'roas':  return '0.00"x"';
      case 'int':   return '#,##0';
      case 'date':  return 'yyyy-mm-dd';
      default:      return 'General';   // resetTab_ cleared formats, so this IS the default
    }
  });
  var grid = [];
  for (var i = 0; i < n; i++) grid.push(row);
  sh.getRange(r0, 1, n, cols.length).setNumberFormats(grid);
}

/* Paint the RAG columns from the codes we computed. Done with real backgrounds
   rather than conditional-format rules: the grade is already decided in the
   script, and a rule that re-derives it from the displayed text is one more
   place for the two to disagree. */
function paintRag_(sh, cols, r0, ragCodes) {
  cols.forEach(function (c, i) {
    if (c.kind !== 'rag') return;
    var bgs = [], fgs = [];
    ragCodes.forEach(function (row) {
      var r = RAG[row[c.key]] || RAG.N;
      bgs.push([r.bg]); fgs.push([r.fg]);
    });
    if (!bgs.length) return;
    var rng = sh.getRange(r0, i + 1, bgs.length, 1);
    rng.setBackgrounds(bgs).setFontColors(fgs).setFontWeight('bold')
       .setHorizontalAlignment('center');
  });
}

/* One setBackgrounds for the whole block instead of one call per striped row.
   null means "the default background", which is what a just-cleared cell already
   has — so the unstriped rows are unchanged. */
function bandRows_(sh, r0, n, W) {
  if (n <= 0 || W <= 0) return;
  var grid = [];
  for (var r = 0; r < n; r++) {
    // White rather than null: null is documented as 'reset' but an explicit colour
    // is unambiguous, and a just-cleared tab is white anyway.
    var colour = (r % 2 === 1) ? BAND_BG : '#FFFFFF';
    var row = [];
    for (var c = 0; c < W; c++) row.push(colour);
    grid.push(row);
  }
  sh.getRange(r0, 1, n, W).setBackgrounds(grid);
}

/* The period controls, identical on every tab. Changing either yellow cell on
   ANY tab rebuilds the whole workbook on that setting — one report, one period. */
function paintControls_(sh, per, W) {
  sh.getRange(1, 1).setValue('Period').setFontWeight('bold');
  sh.getRange(1, 2).setValue(per.mode)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(MODES, true).setAllowInvalid(false).build())
    .setBackground('#FFF2CC').setFontWeight('bold');
  sh.getRange(1, 3).setValue('As of').setFontWeight('bold');
  // Left BLANK unless somebody typed a date. A blank cell means "follow today", and
  // it has to STAY blank to keep doing that: stamping today's date in here would
  // freeze the whole report on the day it was last built.
  sh.getRange(1, 4).setValue(per.asOfGiven ? per.asOf : '').setNumberFormat('yyyy-mm-dd')
    .setBackground('#FFF2CC').setFontWeight('bold');
  if (W > 5) {
    sh.getRange(1, 5, 1, W - 4).merge()
      .setValue('◀ change either yellow cell — every country tab and the summary rebuild on it. ' +
        '"As of" cuts the report to an earlier day for a deck; LEAVE IT BLANK and the report ' +
        'follows today by itself (today is ' + per.asOf + ').')
      .setFontStyle('italic').setFontColor(MUTED).setHorizontalAlignment('left');
  }
}

/* The legend / warning strip. Always present so the geometry never moves, and it
   is where a stale source or a broken attribution feed gets said out loud. */
function legendText_(per, src, warn) {
  var t = CONFIG.TARGETS;
  var s = 'TARGETS  ·  New-revenue ROAS ≥ ' + t.roasNew.green.toFixed(2) + 'x 🟢 · ' +
    t.roasNew.amber.toFixed(2) + '–' + (t.roasNew.green - 0.01).toFixed(2) + 'x 🟡 · below ' +
    t.roasNew.amber.toFixed(2) + 'x 🔴   |   Blended ROAS ≥ ' + t.roasOverall.green.toFixed(2) + 'x 🟢 · ' +
    t.roasOverall.amber.toFixed(2) + '–' + (t.roasOverall.green - 0.01).toFixed(2) + 'x 🟡 · below ' +
    t.roasOverall.amber.toFixed(2) + 'x 🔴   |   Revenue growth ≥ +' + Math.round(t.growth.green * 100) +
    '% 🟢 · +' + Math.round(t.growth.amber * 100) + '% to +' + Math.round(t.growth.green * 100) +
    '% 🟡 · below +' + Math.round(t.growth.amber * 100) + '% 🔴   |   ⚪ = spend but no attributed ' +
    'revenue: unknown, NOT zero   |   Tracking health is signed off by hand in the block below the table.' +
    '   |   ALL MONEY IN ' + String(CONFIG.REPORT_CURRENCY).toUpperCase() + '.';
  var missing = src && src.fx ? Object.keys(src.fx.missing || {}) : [];
  if (missing.length) {
    s += '\n⚠ NO EXCHANGE RATE FOUND FOR: ' + missing.sort().join(', ') + ' — amounts in those ' +
      'currencies are NOT converted and are therefore wrong on a ' + CONFIG.REPORT_CURRENCY +
      ' report. Run the GEO engine\'s refreshFxRates(), or add them to CONFIG.FX here.';
  }
  var bad = (src && src.bad) || [];
  if (bad.length) {
    var byEnt = {};
    bad.forEach(function (b) { byEnt[b.code] = (byEnt[b.code] || 0) + 1; });
    s += '\n⚠ ' + bad.length + ' SOURCE ROW(S) QUARANTINED as unusable — ' +
      Object.keys(byEnt).sort().map(function (k) { return k + ' ' + byEnt[k]; }).join(', ') +
      '. Those days fall back to Shopify\'s orders-API revenue and their new/returning split reads ⚪ ' +
      'rather than a number this report cannot stand behind. Example: ' + bad[0].code + ' ' + bad[0].day +
      ' — ' + bad[0].detail + '.';
    // Named separately because the remedy is completely different: a date-formatted
    // cell needs a FORMAT fixed, not data re-pulled, and the two were being reported
    // with the same sentence.
    var dateish = bad.filter(function (b) { return /DATE-FORMATTED/.test(String(b.detail)); }).length;
    s += dateish
      ? '  ' + dateish + ' of them are DATE-FORMATTED CELLS — a money column on the GEO workbook is ' +
        'formatted as a date, so real numbers arrive here as dates (12/30/1899 is serial 0, ' +
        '11/14/1906 is serial 2510). Nothing is corrupt. In the GEO project run healNumberFormats(), ' +
        'then pullShopify() and rebuildAll(), and these rows come back.'
      : '  Fix it in the GEO workbook (menu: "Why is a revenue figure impossible?").';
  }
  if (!per.sameLength) {
    s += '\n⚠ ' + per.prior.label + ' is only ' + per.prior.days + ' days against ' + per.cur.days +
      ' — that month is shorter, so the comparison is as close to like-for-like as the calendar allows.';
  }
  if (per.clamped) s += '\n⚠ "As of" was in the future and has been clamped to today.';
  if (src.stale) {
    s += '\n⚠ SOURCE IS ' + src.staleDays + ' DAY(S) STALE — the GEO x Channel workbook last has data for ' +
      (src.maxDate || 'no date at all') + '. Run its refreshAll(), then rebuild this report.';
  }
  (warn || []).forEach(function (w) { s += '\n⚠ ' + w; });
  return s;
}

/* ========================================================================== */
/*  BUILD: one country tab                                                    */
/* ========================================================================== */

var R_CTL = 1, R_TITLE = 2, R_LEG = 3, R_G = 4, R_H = 5, R_D0 = 6;

/* Wipe a tab back to nothing before rebuilding it. The order matters and every
   step earns its place:
     unfreeze     - Sheets refuses a merge that a freeze line would cut, so the
                    freezes have to go before the new merges are made;
     breakApart   - clear() does NOT remove merges. Without this the merges from the
                    last build survive at their old rows, so a table that changed
                    height leaves stray merged cells behind it and the tab looks
                    broken after a few rebuilds;
     clear        - contents and formats;
     validations  - dropdowns and checkboxes are validations, not formats, so they
                    outlive clear() too and would stack up on rows that no longer
                    mean the same thing. */
function resetTab_(sh) {
  try { sh.setFrozenRows(0); sh.setFrozenColumns(0); } catch (e) {}
  /* Bounded to the range that was actually WRITTEN, not the whole 1000x26 grid.
     breakApart and clearDataValidations over a full sheet are two of the slowest
     calls in the API, and every stale merge or dropdown this needs to remove is
     inside the previous build's footprint by definition — nothing can have been
     merged where nothing was ever written. A small margin covers a table that
     shrank. This was a material part of the rebuild timing out. */
  var rows = Math.min(sh.getMaxRows(), Math.max(sh.getLastRow(), 1) + 10);
  var cols = Math.min(sh.getMaxColumns(), Math.max(sh.getLastColumn(), 1) + 5);
  try { sh.getRange(1, 1, rows, cols).breakApart(); } catch (e) {}
  sh.clear();
  sh.clearConditionalFormatRules();
  try { sh.getRange(1, 1, rows, cols).clearDataValidations(); } catch (e) {}
  try { sh.clearNotes(); } catch (e) {}
}

/* The legend cell holds newline-separated warnings, and a fixed row height either
   clips them or leaves a gap under them. Size it to what is actually in it. */
function legendHeight_(text) {
  var lines = String(text || '').split('\n').length;
  return Math.max(34, 18 * (lines + 1));
}

function buildEntityTab_(e, per, src, aCur, aPrior, health) {
  var sh = sheetFor_(entityTab_(e));
  resetTab_(sh);

  var cols = entityCols_(), W = cols.length, keys = cols.map(function (c) { return c.key; });
  var lines = linesFor_(e.code, aCur, aPrior);

  /* ---- row 1: controls ---- */
  paintControls_(sh, per, W);

  /* ---- row 2: title band. Painted across the row but deliberately NOT merged:
          a merge that straddles the frozen-column line is rejected by Sheets,
          and column A is frozen so the channel names stay put on a wide table. */
  sh.getRange(R_TITLE, 1, 1, W).setBackground(TITLE_BG);
  sh.getRange(R_TITLE, 1).setValue(
    'EXEC RAG  —  ' + e.label.toUpperCase() + '  ·  ' + per.cur.label + '  vs  ' + per.prior.label +
    '  ·  ' + per.mode + '  (' + CONFIG.REPORT_CURRENCY + ' — ' + fxNote_(e, src) + ')')
    .setFontSize(13).setFontWeight('bold').setHorizontalAlignment('left');
  sh.setRowHeight(R_TITLE, 28);

  /* ---- row 3: targets legend + any warnings ---- */
  var warn = entityWarnings_(e, aCur, src), legend = legendText_(per, src, warn);
  // Merged from column 2 because column 1 is frozen: Sheets rejects a freeze that
  // would cut a merged cell in half, and it throws rather than degrading.
  sh.getRange(R_LEG, 2, 1, W - 1).merge()
    .setValue(legend)
    .setWrap(true).setFontSize(9)
    .setFontColor(warn.length || src.stale ? WARN_FG : MUTED)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setRowHeight(R_LEG, legendHeight_(legend));

  /* ---- rows 4-5: grouped header ---- */
  paintHeader_(sh, cols, R_G, R_H, per);

  /* ---- body ---- */
  var body = [], rags = [], notes = {};
  // Keyed by row, and APPENDED to: a row can earn more than one note (the OVERALL
  // line that also grew from zero), and setNote replaces rather than adds, so a
  // plain list would silently drop the first explanation.
  function note_(rowIdx, text) {
    notes[rowIdx] = notes[rowIdx] ? notes[rowIdx] + '\n\n' + text : text;
  }
  lines.forEach(function (line) {
    var c = lineMetrics_(e.code, line, aCur), p = lineMetrics_(e.code, line, aPrior);
    var hasSpend = c.spend > 0 || p.spend > 0;
    var r = {
      line: lineLabel_(line),
      spendP: money_(p.spend), spendC: money_(c.spend),
      spendG: growthVal_(p.spend, c.spend),
      newP: money_(p.newRev), newC: money_(c.newRev),
      newG: growthVal_(p.newRev, c.newRev, c.newHasData),
      newGR: ragGrowth_(p.newRev, c.newRev, hasSpend, c.newHasData || p.newHasData, c.newHasData),
      rnP: roasVal_(p.spend, p.newRev, p.newHasData), rnC: roasVal_(c.spend, c.newRev, c.newHasData),
      rnR: ragRoas_(c.spend, c.newRev, c.newHasData, CONFIG.TARGETS.roasNew),
      ovP: money_(p.rev), ovC: money_(c.rev),
      ovG: growthVal_(p.rev, c.rev, c.hasData),
      ovGR: ragGrowth_(p.rev, c.rev, hasSpend, c.hasData || p.hasData, c.hasData),
      roP: roasVal_(p.spend, p.rev, p.hasData), roC: roasVal_(c.spend, c.rev, c.hasData),
      roR: ragRoas_(c.spend, c.rev, c.hasData, CONFIG.TARGETS.roasOverall),
      cvP: p.conv || '', cvC: c.conv || ''
    };
    r.status = worstStatus_([r.newGR, r.rnR, r.ovGR, r.roR]);

    // The RAG letters travel separately from the printed values: the cell shows
    // an icon, the painter needs the code.
    rags.push({ newGR: r.newGR, rnR: r.rnR, ovGR: r.ovGR, roR: r.roR, status: r.status });

    if ((r.newG === '' && p.newRev > 0) || (r.ovG === '' && p.rev > 0)) {
      note_(body.length, 'The growth cell is BLANK because this window has nothing measurable to ' +
        'compare against, not because the number fell to zero. ' + per.prior.label + ' had revenue ' +
        'on this line and ' + per.cur.label + ' has nothing ATTRIBUTABLE — which is a gap in tracking, ' +
        'not a collapse in sales. Printing -100% here would assert a crash this report has no ' +
        'evidence for. The banner above names the cause.');
    }
    if (r.newG === 'NEW' || r.ovG === 'NEW') {
      note_(body.length, 'The prior window had no revenue on this line, so a growth percentage does not ' +
        'exist. "NEW" means it went from zero to something, which is why the RAG is green.');
    }
    if (line === 'OVERALL') {
      note_(body.length, 'BLENDED is SHOPIFY ground truth for ' + e.label +
        ' — every order the store took, whether our tracking could attribute it or not. Spend is total ' +
        'spend across every channel. The channel rows above are ATTRIBUTION-based, so they will not add ' +
        'up to this line while coverage is below 100%.' +
        (c.days && c.qlDays < c.days ? '  Note: the new/returning split was available for ' + c.qlDays +
          ' of ' + c.days + ' days, so new-customer revenue is understated for the rest.' : ''));
    }

    body.push(keys.map(function (k) {
      var v = r[k];
      if (k === 'newGR' || k === 'rnR' || k === 'ovGR' || k === 'roR') return ragIcon_(v);
      if (k === 'status') return ragStatus_(v);
      return v === undefined ? '' : safeCell_(v);
    }));
  });

  var n = body.length;
  if (n) sh.getRange(R_D0, 1, n, W).setValues(body);

  /* ---- formats, banding, emphasis ---- */
  applyFormats_(sh, cols, R_D0, n, CONFIG.REPORT_CURRENCY);
  bandRows_(sh, R_D0, n, W);
  /* The emphasis rows go on BEFORE the RAG cells, so paintRag_ runs ONCE instead of
     twice. It used to paint, get covered by these backgrounds, and be painted again
     — five extra setBackgrounds calls per tab for a result that is identical if the
     order is simply right. The requirement is unchanged: the grade must still be
     visible on the two most-read rows of the table. */
  lines.forEach(function (line, i) {
    var row = R_D0 + i;
    if (line === 'PAID SUBTOTAL') sh.getRange(row, 1, 1, W).setBackground(PAID_BG).setFontWeight('bold');
    if (line === 'OVERALL')       sh.getRange(row, 1, 1, W).setBackground(OVERALL_BG).setFontWeight('bold');
  });
  paintRag_(sh, cols, R_D0, rags);
  sh.getRange(R_D0, 1, n, W).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(R_D0, 1, n, 1).setHorizontalAlignment('left').setFontWeight('bold');

  Object.keys(notes).forEach(function (k) { sh.getRange(R_D0 + (+k), 1).setNote(notes[k]); });
  sh.getRange(R_G, 1, n + 2, W)
    .setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);

  /* ---- the tracking-health block ---- */
  var hTop = R_D0 + n + 2;
  var hEnd = buildHealthBlock_(sh, e, per, lines, aCur, health, hTop, W);

  /* ---- footer ---- */
  var foot = hEnd + 2;
  sh.getRange(foot, 2, 1, W - 1).merge().setValue(footerText_(e, per, src)).setWrap(true)
    .setFontSize(9).setFontColor(MUTED).setHorizontalAlignment('left').setVerticalAlignment('top');
  sh.setRowHeight(foot, 108);

  /* ---- widths + freeze ---- */
  cols.forEach(function (c, i) { sh.setColumnWidth(i + 1, c.w); });
  sh.setFrozenRows(R_H);
  sh.setFrozenColumns(1);

  return sh;
}

/* What currency an entity's rows actually arrived in. The DATA wins over CONFIG:
   if a store's rows say CAD and CONFIG says USD, the rows are what was converted,
   so the rate printed on the tab must be the one actually applied. */
function entityCurrency_(e, src) {
  var seen = src && src.curByEntity && src.curByEntity[e.code];
  var list = seen ? Object.keys(seen) : [];
  if (list.length === 1) return list[0];
  if (list.length > 1) {
    // More than one currency in one GEO's rows: name the entity's own first so
    // the label is stable, and let entityWarnings_ say the rest out loud.
    var own = String(e.currency).toUpperCase();
    return list.indexOf(own) >= 0 ? own : list.sort()[0];
  }
  return String(e.currency).toUpperCase();
}
/* "converted from GBP at 1.2700, FX Rates tab 2026-08-20" — printed in the title
   so the rate travels with the number and nobody has to go looking for it. */
function fxNote_(e, src) {
  var cur = entityCurrency_(e, src);
  var report = String(CONFIG.REPORT_CURRENCY).toUpperCase();
  var fx = (src && src.fx) || readFx_();
  if (cur === report) return 'this store bills in ' + report + ', so no conversion';
  var r = fxRateFor_(cur);
  if (!r) return '⚠ NO RATE for ' + cur + ' — figures are UNCONVERTED ' + cur;
  return 'converted from ' + cur + ' at ' + r.toFixed(4) +
    (fx.updatedAt ? ', rate of ' + fx.updatedAt : '');
}

/* Warnings that are about the DATA rather than the report. The one that matters
   in practice: paid channels carrying spend but zero attributed orders, which is
   what a broken Source column upstream looks like from here. */
function entityWarnings_(e, aCur, src) {
  var out = [], b = aCur.byEntity[e.code];
  if (!b) return out;

  // A currency with no rate is the worst kind of error here: the numbers look
  // perfectly normal and are ~3.7x too high for AED, ~80x for INR. Say it loudly.
  var cur = entityCurrency_(e, src);
  if (cur !== String(CONFIG.REPORT_CURRENCY).toUpperCase() && !fxRateFor_(cur)) {
    out.push('NO EXCHANGE RATE FOR ' + cur + ' — every money figure on this tab is still in ' + cur +
      ', NOT ' + CONFIG.REPORT_CURRENCY + ', so it cannot be compared with the other GEOs. Fix: run the ' +
      'GEO engine\'s refreshFxRates(), or add "' + cur + '" to CONFIG.FX in this script.');
  }
  var seen = (src && src.curByEntity && src.curByEntity[e.code]) ? Object.keys(src.curByEntity[e.code]) : [];
  if (seen.length > 1) {
    out.push('This GEO\'s source rows carry MORE THAN ONE currency (' + seen.sort().join(', ') +
      '). Each row was converted at its own currency\'s rate, which is correct, but the rate shown in the ' +
      'title is only the main one.');
  }
  var spent = 0, attributed = 0, blindChannels = [];
  CONFIG.CHANNELS.forEach(function (ch) {
    var m = b.channels[ch]; if (!m) return;
    spent += m.spend; attributed += m.orders;
    if (m.spend > 0 && m.orders === 0) blindChannels.push(ch);
  });
  if (spent > 0 && attributed === 0) {
    out.push('ATTRIBUTION IS NOT IDENTIFYING CHANNELS for ' + e.label + ': the paid channels carry spend ' +
      'but ZERO attributed orders, so every channel ROAS below is ⚪ rather than a grade. The revenue is ' +
      'real and is in the OVERALL line — it is arriving without a channel on it. Fix upstream: run ' +
      'debugSources() in the GEO project to see what bds-unified is writing into Source.');
  } else if (blindChannels.length) {
    out.push('No attributed orders for ' + blindChannels.join(', ') + ' despite spend — those lines are ⚪, ' +
      'not red. Check the click-id capture and the Source value for those channels.');
  }
  /* A SUBSET CANNOT EXCEED THE WHOLE, and when it does the report has to say so
     rather than print both figures side by side as if they agreed. Seen live on
     2026-08-21: UK August attributed new-Cx revenue was $241,646 while the STORE's
     entire new-Cx revenue was $149,960 — 161% of it, on the Direct line alone.
     The two come from different measurements and are allowed to differ a little:
     channel rows use each order's own new/returning flag, the store total uses the
     ShopifyQL split. But one cannot be larger than the other, and the usual reason
     is that the per-order flag counts a GUEST CHECKOUT as a new customer — a guest
     has no customer record, so "first order?" reads yes for every one of them. */
  if (b.shopify.qlDays > 0 && b.shopify.newRev > 0 && b.all.newRevenue > b.shopify.newRev * 1.05) {
    out.push('ATTRIBUTED NEW-CX REVENUE EXCEEDS THE STORE TOTAL: the channel rows add to ' +
      money_(b.all.newRevenue) + ' of new-Cx revenue but ' + e.label + ' as a whole took only ' +
      money_(b.shopify.newRev) + ' (' + Math.round(100 * b.all.newRevenue / b.shopify.newRev) +
      '% of it). A subset cannot be bigger than the whole, so at least one of the two is wrong. ' +
      'Most likely the per-order new/returning flag is counting GUEST CHECKOUTS as new customers ' +
      '(a guest has no customer record, so every one reads as a first order). Treat the ' +
      'channel-level new-Cx figures as indicative and the OVERALL line as the truth until it is ' +
      'fixed; in the GEO project, diagnoseSplit() reports what share of orders the orders API can ' +
      'actually classify.');
  }
  var cov = b.shopify.revenue > 0 ? b.all.revenue / b.shopify.revenue : '';
  /* A TIGHTER BAND THAN THE NEW-CX GUARD ABOVE, deliberately. These two figures are
     the SAME measurement: attributed revenue uses each matched order's own Shopify
     amount, and the store total is the sum of those same order totals. So they
     cannot legitimately drift the way the per-order flag and the ShopifyQL split can
     — anything past ~1% is double-counted rows. The live case was 104.6%, which a 5%
     tolerance would have waved through. */
  if (cov !== '' && cov > 1.01) {
    out.push('ATTRIBUTION COVERAGE IS ' + Math.round(cov * 1000) / 10 + '% — ABOVE 100%, which is ' +
      'not possible: the orders our tracking can attribute add up to more revenue than the store ' +
      'actually took. That is duplicate attributed rows, not growth. In the GEO project the Match % ' +
      'on the health block below separates it: attributed orders that join no real Shopify order are ' +
      'ghosts, duplicate pixel fires or test hits.');
  }
  if (cov !== '' && cov < CONFIG.HEALTH.warn) {
    out.push('Attribution coverage is ' + Math.round(cov * 1000) / 10 + '% of ' + e.label +
      '\'s Shopify revenue, below the ' + Math.round(CONFIG.HEALTH.warn * 100) + '% floor — treat the ' +
      'channel lines as indicative and the OVERALL line as the truth.');
  }
  return out;
}

function footerText_(e, per, src) {
  return 'HOW TO READ THIS TAB.  ' +
    'Rows are channels; the last two rows are the PAID SUBTOTAL (the ' + CONFIG.CHANNELS.join(' + ') +
    ' lines only) and BLENDED.  ·  ' +
    'LABELS: "Cx" is customer · "BLENDED" is every order the store took (new Cx + existing Cx) · ' +
    '"Orders" was called Conversions · "Health Check" is the manual tick.  ·  ' +
    'CHANNEL and PAID rows are ATTRIBUTION-based: spend from the Ad Budget Tracker, revenue from the ' +
    'orders our tracking can tie to that channel, new-customer revenue from each order\'s own Shopify ' +
    'new/returning flag (frozen when first seen, so history cannot decay).  ·  ' +
    'The BLENDED row is SHOPIFY ground truth — all revenue the store took over total spend — so the ' +
    'channel rows do NOT add up to it while coverage is under 100%. That gap is the tracking-health ' +
    'question, and it is why the health block exists.  ·  ' +
    'New-revenue ROAS = new Cx revenue ÷ spend. Blended ROAS = all revenue (new Cx + existing Cx) ÷ ' +
    'spend.  ·  Growth compares the same number of days in each window: ' + per.cur.label + ' against ' +
    per.prior.label + ', recomputed every day, so you never compare a part-month against a whole one.  ·  ' +
    'A ⚪ is not a bad score — it means the number could not be measured, and the banner above says why.  ·  ' +
    'Tracking health is the ONLY RAG on this tab set by a human; it is never folded into Status, and each ' +
    'reporting period starts with a fresh sign-off (the history is kept on the "' + tabName_(RTAB.LOG) +
    '" tab).  ·  ' +
    'SOURCE: the GEO x Channel Performance workbook, tabs "' + CONFIG.GEO_TABS.GRAIN + '" and "' +
    CONFIG.GEO_TABS.SHOPIFY + '", last holding data for ' + (src.maxDate || '—') + '. This report reads ' +
    'them and computes nothing of its own — nothing here is typed in or pasted from a platform export.  ·  ' +
    'CURRENCY: every figure is in ' + CONFIG.REPORT_CURRENCY + ' — ' + fxNote_(e, src) + '. ONE rate is ' +
    'applied to BOTH periods, deliberately: converting each period at its own rate would fold a currency ' +
    'move into the growth %, and a channel could go red because sterling moved rather than because it ' +
    'sold less. So every growth % and every ROAS here is FX-neutral. The trade-off is that a ' +
    CONFIG.REPORT_CURRENCY + ' total will not tie to the penny against Shopify\'s own ' +
    CONFIG.REPORT_CURRENCY + ' display, which uses the rate on each order\'s own day — expected, not an ' +
    'error. The exact, ties-to-Shopify figures are the local-currency ones on the GEO workbook\'s ' +
    'country tabs.  ·  ' +
    'Countries are never combined: there is no cross-GEO total in this workbook, on purpose.';
}

/* ========================================================================== */
/*  BUILD: the tracking-health block (its own RAG line, set by your team)      */
/* ========================================================================== */

function buildHealthBlock_(sh, e, per, lines, aCur, health, top, fullWidth) {
  var cols = healthCols_(), W = cols.length;
  // The block sits UNDER the main table, so the two share physical columns and a
  // column has exactly one width. Rather than fight the table for it, the block
  // spans the table's full width and lets Notes — the one field a person actually
  // types prose into — merge across everything the table has spare to the right.
  fullWidth = Math.max(fullWidth || W, W);
  var manualFirst = 0, manualLast = 0;
  cols.forEach(function (c, i) {
    if (!c.manual) return;
    if (!manualFirst) manualFirst = i + 1;
    manualLast = i + 1;
  });

  sh.getRange(top, 1, 1, fullWidth).setBackground(HEALTH_HDR_BG).setFontColor('#FFFFFF');
  sh.getRange(top, 1).setValue('CONVERSION TRACKING HEALTH  —  ' + e.label.toUpperCase() +
    '  ·  ' + per.cur.label + '  ·  RAG set BY YOUR TEAM, never by the script')
    .setFontWeight('bold').setFontSize(12).setHorizontalAlignment('left');
  sh.setRowHeight(top, 26);

  var rH = top + 1;
  sh.getRange(rH, 1, 1, fullWidth).setBackground(HEALTH_TITLE_BG);
  sh.getRange(rH, 1, 1, W).setValues([cols.map(function (c) { return c.label; })])
    .setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(rH, 32);

  var r0 = rH + 1, body = [], rags = [], checks = [];
  lines.forEach(function (line) {
    var m = lineMetrics_(e.code, line, aCur);
    // Two different questions, so two different metrics — labelled, so nobody has
    // to guess which one a percentage is.
    //   channel / paid : Match %    of attributed orders, how many join a real
    //                               Shopify order (catches ghosts, dupes, tests).
    //   overall        : Coverage %  of the store's revenue we can explain at all.
    var isOverall = line === 'OVERALL';
    var metric = isOverall ? 'Coverage %' : 'Match %';
    var pct = isOverall
      ? (num_(m.shopRev) > 0 ? m.attrRev / m.shopRev : '')
      : (m.attrOrders > 0 ? m.matched / m.attrOrders : '');
    var auto = healthEvidenceFlag_(isOverall, pct, m.spend);
    var saved = getHealth_(health, e.code, line, per.key) || {};
    body.push([
      lineLabel_(line), m.attrOrders || '', m.matched || '', money_(m.attrRev),
      isOverall ? money_(m.shopRev) : '', metric, pct === '' ? '' : round4_(pct), ragIcon_(auto),
      saved.rag || '', saved.signed === true, safeCell_(saved.by || ''),
      saved.when ? asDate_(saved.when) : '', safeCell_(saved.notes || '')
    ]);
    rags.push({ auto: auto });
    checks.push(saved.signed === true);
  });

  var n = body.length;
  sh.getRange(r0, 1, n, W).setValues(body);
  applyFormats_(sh, cols, r0, n, CONFIG.REPORT_CURRENCY);
  bandRows_(sh, r0, n, fullWidth);
  paintRag_(sh, cols, r0, rags);
  sh.getRange(r0, 1, n, W).setVerticalAlignment('middle');
  sh.setRowHeights(r0, n, 30);   // one call, not one per row
  sh.getRange(r0, 1, n, 1).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(r0, 2, n, 7).setHorizontalAlignment('center');

  // Your columns: a picker for the RAG, a real checkbox for the tick, and free
  // text for who and what. Nothing here is ever overwritten by a rebuild.
  var ragCol = colIndexOf_(cols, 'teamRag'), sgCol = colIndexOf_(cols, 'signed');
  sh.getRange(r0, ragCol, n, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(TEAM_RAG_OPTIONS, true).setAllowInvalid(true).build())
    .setHorizontalAlignment('center').setFontWeight('bold');
  sh.getRange(r0, sgCol, n, 1).insertCheckboxes().setHorizontalAlignment('center');
  sh.getRange(r0, colIndexOf_(cols, 'when'), n, 1).setHorizontalAlignment('center');
  // One wash over every column your team types into, so the editable area is
  // obvious at a glance. It starts past the Auto Flag column, so it cannot cover
  // the computed grade.
  var notesCol = colIndexOf_(cols, 'notes');
  sh.getRange(r0, manualFirst, n, fullWidth - manualFirst + 1).setBackground('#FFFDE7');
  sh.getRange(r0, notesCol, n, 1).setWrap(true).setHorizontalAlignment('left');

  // Notes stretches across whatever the main table has spare. Merged AFTER the
  // values are written: writing into a range that already contains merges is
  // rejected, whereas merging over existing content keeps the top-left value.
  if (fullWidth > notesCol) {
    var span = fullWidth - notesCol + 1;
    sh.getRange(rH, notesCol, 1, span).merge().setHorizontalAlignment('center');
    for (var i = 0; i < n; i++) {
      sh.getRange(r0 + i, notesCol, 1, span).merge()
        .setWrap(true).setHorizontalAlignment('left').setVerticalAlignment('middle');
    }
  }

  sh.getRange(rH, 1, n + 1, fullWidth)
    .setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);

  var note = r0 + n + 1;
  sh.getRange(note, 2, 1, fullWidth - 1).merge().setValue(
    'Evidence is computed; the JUDGEMENT is yours. Match % = attributed orders that join a real Shopify ' +
    'order — it catches ghost rows, duplicate pixel fires and test hits. Coverage % (OVERALL only) = ' +
    'attributed revenue ÷ Shopify revenue, i.e. how much of the money our tracking can explain at all. ' +
    'Auto Flag is only a hint off those numbers (🟢 ≥ ' + Math.round(CONFIG.HEALTH.good * 100) + '%, 🟡 ≥ ' +
    Math.round(CONFIG.HEALTH.warn * 100) + '%). ' +
    'Team RAG, the tick, who checked it and the notes are typed by your team and are SAVED — a rebuild ' +
    'never wipes them. They are stored against this reporting period (' + per.key + '), so the next ' +
    'period starts blank and every past sign-off stays readable on the "' + tabName_(RTAB.LOG) + '" tab. ' +
    'Ticking Health Check stamps today into Date Checked if you left it empty.')
    .setWrap(true).setFontSize(9).setFontColor(MUTED)
    .setHorizontalAlignment('left').setVerticalAlignment('top');
  sh.setRowHeight(note, 60);

  // No column widths are set here on purpose: the main table above owns them, and
  // a second opinion would just be the last writer winning. The one field that
  // genuinely needs room — Notes — got it from the merge above.

  // Remember where this block is so an edit can be traced to a country and line.
  saveLayout_(sh.getName(), {
    code: e.code, top: r0, lines: lines, periodKey: per.key,
    ragCol: ragCol, signedCol: sgCol,
    byCol: colIndexOf_(cols, 'by'), whenCol: colIndexOf_(cols, 'when'),
    notesCol: colIndexOf_(cols, 'notes'),
    manualFirst: manualFirst, manualLast: manualLast
  });

  return note;
}
function colIndexOf_(cols, key) {
  for (var i = 0; i < cols.length; i++) if (cols[i].key === key) return i + 1;
  return 0;
}

/* ========================================================================== */
/*  BUILD: the cross-country summary  (one line per GEO, and NO total)        */
/* ========================================================================== */

function buildSummaryTab_(per, src, aCur, aPrior, health) {
  var sh = sheetFor_(tabName_(RTAB.SUMMARY));
  resetTab_(sh);

  var cols = summaryCols_(), W = cols.length, keys = cols.map(function (c) { return c.key; });
  // Country + Basis stay on screen while you scroll right. Every merge on this tab
  // therefore has to START past column 2: Sheets refuses to freeze a column that
  // holds only part of a merged cell, and it throws rather than degrading.
  var FROZEN = 2;

  paintControls_(sh, per, W);

  sh.getRange(R_TITLE, 1, 1, W).setBackground(TITLE_BG);
  sh.getRange(R_TITLE, 1).setValue('EXEC RAG SUMMARY  —  every GEO  ·  ' + per.cur.label +
    '  vs  ' + per.prior.label + '  ·  ' + per.mode + '  ·  all figures in ' + CONFIG.REPORT_CURRENCY)
    .setFontSize(13).setFontWeight('bold').setHorizontalAlignment('left');
  sh.setRowHeight(R_TITLE, 28);

  var legend = legendText_(per, src, []);
  sh.getRange(R_LEG, FROZEN + 1, 1, W - FROZEN).merge().setValue(legend)
    .setWrap(true).setFontSize(9).setFontColor(src.stale ? WARN_FG : MUTED)
    .setHorizontalAlignment('left').setVerticalAlignment('middle');
  sh.setRowHeight(R_LEG, legendHeight_(legend));

  paintHeader_(sh, cols, R_G, R_H, per);

  var body = [], rags = [], overallRows = [];
  CONFIG.ENTITIES.forEach(function (e) {
    var bases = [{ line: 'OVERALL', label: 'BLENDED (all revenue)' }];
    if (CONFIG.SHOW_PAID_SUBTOTAL) bases.push({ line: 'PAID SUBTOTAL', label: 'PAID CHANNELS ONLY' });
    bases.forEach(function (bs) {
      var c = lineMetrics_(e.code, bs.line, aCur), p = lineMetrics_(e.code, bs.line, aPrior);
      var hasSpend = c.spend > 0 || p.spend > 0;
      var isOverall = bs.line === 'OVERALL';
      var hPct = isOverall
        ? (num_(c.shopRev) > 0 ? c.attrRev / c.shopRev : '')
        : (c.attrOrders > 0 ? c.matched / c.attrOrders : '');
      var team = getHealth_(health, e.code, bs.line, per.key) || {};
      var r = {
        country: e.label, basis: bs.label, cur: fxLabel_(entityCurrency_(e, src)),
        spendP: money_(p.spend), spendC: money_(c.spend),
        newP: money_(p.newRev), newC: money_(c.newRev), newG: growthVal_(p.newRev, c.newRev, c.newHasData),
        newGR: ragGrowth_(p.newRev, c.newRev, hasSpend, c.newHasData || p.newHasData, c.newHasData),
        rnP: roasVal_(p.spend, p.newRev, p.newHasData), rnC: roasVal_(c.spend, c.newRev, c.newHasData),
        rnR: ragRoas_(c.spend, c.newRev, c.newHasData, CONFIG.TARGETS.roasNew),
        ovP: money_(p.rev), ovC: money_(c.rev), ovG: growthVal_(p.rev, c.rev, c.hasData),
        ovGR: ragGrowth_(p.rev, c.rev, hasSpend, c.hasData || p.hasData, c.hasData),
        roP: roasVal_(p.spend, p.rev, p.hasData), roC: roasVal_(c.spend, c.rev, c.hasData),
        roR: ragRoas_(c.spend, c.rev, c.hasData, CONFIG.TARGETS.roasOverall),
        hPct: hPct === '' ? '' : round4_(hPct),
        hTeam: team.rag || '— not signed off'
      };
      r.status = worstStatus_([r.newGR, r.rnR, r.ovGR, r.roR]);
      rags.push({ newGR: r.newGR, rnR: r.rnR, ovGR: r.ovGR, roR: r.roR, status: r.status });
      // Recorded as it is built rather than re-derived from a row stride: "every
      // other row" is only true while each entity happens to emit exactly two.
      if (isOverall) overallRows.push(body.length);
      body.push(keys.map(function (k) {
        var v = r[k];
        if (k === 'newGR' || k === 'rnR' || k === 'ovGR' || k === 'roR') return ragIcon_(v);
        if (k === 'status') return ragStatus_(v);
        return v === undefined ? '' : safeCell_(v);
      }));
    });
  });

  var n = body.length;
  if (n) sh.getRange(R_D0, 1, n, W).setValues(body);
  // One currency for every row, so the GEOs are directly comparable — which is
  // the whole reason the report converts at all.
  applyFormats_(sh, cols, R_D0, n, CONFIG.REPORT_CURRENCY);
  bandRows_(sh, R_D0, n, W);
  sh.getRange(R_D0, 1, n, W).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(R_D0, 1, n, 2).setHorizontalAlignment('left');
  sh.getRange(R_D0, 1, n, 1).setFontWeight('bold');
  // The BLENDED row of each country is the one an exec reads first.
  overallRows.forEach(function (i) {
    sh.getRange(R_D0 + i, 1, 1, W).setBackground(OVERALL_BG).setFontWeight('bold');
  });
  paintRag_(sh, cols, R_D0, rags);   // once — the bands above are already painted
  sh.getRange(R_G, 1, n + 2, W)
    .setBorder(true, true, true, true, true, true, GRID, SpreadsheetApp.BorderStyle.SOLID);

  var foot = R_D0 + n + 2;
  sh.getRange(foot, FROZEN + 1, 1, W - FROZEN).merge().setValue(
    'One line per GEO per basis. THERE IS DELIBERATELY NO TOTAL ROW: a blended ROAS across five markets ' +
    'hides exactly what this report exists to show, and PrintFabrix is a different business from ' +
    'Backdropsource. EVERY money column is in ' + CONFIG.REPORT_CURRENCY + ', so the GEOs ARE directly ' +
    'comparable row to row; the Rate column names the local currency each one was converted from and the ' +
    'rate used. One rate is applied to both periods, so the growth % and ROAS columns are FX-neutral. ' +
    'BLENDED is Shopify ground truth over total spend; PAID CHANNELS ONLY is attribution over the ' +
    CONFIG.CHANNELS.join(' + ') + ' spend. Tracking Health shows the computed evidence and, next to it, ' +
    'your team\'s sign-off for this period — it is never folded into Status. Open a country tab for the ' +
    'channel breakdown and to sign the health line off.')
    .setWrap(true).setFontSize(9).setFontColor(MUTED)
    .setHorizontalAlignment('left').setVerticalAlignment('top');
  sh.setRowHeight(foot, 76);

  cols.forEach(function (c, i) { sh.setColumnWidth(i + 1, c.w); });
  sh.setFrozenRows(R_H);
  sh.setFrozenColumns(FROZEN);
  return sh;
}

/* ========================================================================== */
/*  BUILD: Method + Health Log                                                */
/* ========================================================================== */

function buildMethodTab_(per, src) {
  var sh = sheetFor_(tabName_(RTAB.METHOD));
  sh.clear();
  var t = CONFIG.TARGETS;
  var rows = [
    ['Item', 'Exactly what it means', 'Where the number comes from'],

    ['THE PERIOD',
     'Two windows with the SAME number of days. Mode "' + per.mode + '" currently means ' +
     per.cur.label + ' against ' + per.prior.label + '. On Month to date the report auto-advances: on the ' +
     '20th it is 1–20 this month vs 1–20 last month; on the 21st it is 1–21 vs 1–21, with every growth % ' +
     'recomputed. Nobody edits anything. A month-end shorter than the current one is clamped (31 March ' +
     'compares to 28/29 February) and the tab says so.',
     'Computed from the calendar in ' + tz_() + '. Change it in cell B1 of any tab; "As of" in D1 cuts the ' +
     'report to an earlier day for a deck, and clearing it follows today again.'],

    ['Spent',
     'Ad-platform spend for that GEO and channel inside the window, in the store\'s own currency. Every ' +
     'campaign, no exclusions.',
     'Ad Budget Tracker "BDS Spent Input" (Meta Marketing API + the Google/Bing Ads platform scripts), ' +
     'read by the GEO engine. This report never touches an ad platform.'],

    ['Revenue (channel rows)',
     'ATTRIBUTED revenue: orders our tracking can tie to that channel. Where an attributed order joins a ' +
     'real Shopify order the SHOPIFY amount is used, not the value the pixel posted; unmatched orders fall ' +
     'back to the pixel value so no money is dropped. One order counts once, however many product rows ' +
     'the pixel sent.',
     'bds-unified "<CC> Order" purchase rows, joined per order to Shopify by the GEO engine.'],

    ['Revenue (BLENDED row)',
     'SHOPIFY ground truth: all revenue the store took in the window, new + returning customer revenue. ' +
     'This is why the channel rows do not add up to OVERALL — the difference is revenue our tracking ' +
     'could not attribute, which is the tracking-health question.',
     'Each store\'s own Shopify Admin API / ShopifyQL, via the GEO engine\'s "' + CONFIG.GEO_TABS.SHOPIFY + '" tab.'],

    ['New Cx revenue',
     'Revenue from customers whose FIRST order this was. Per channel, exactly — not a store-level ratio ' +
     'spread across channels. Each order inherits its own Shopify new/returning flag, and that flag is ' +
     'frozen the first time we see the order, so last month\'s new-customer revenue cannot quietly shrink ' +
     'when the same buyer comes back.',
     'GEO engine "Order Facts" (write-once Is New flag) joined to the attributed orders.'],

    ['New-revenue ROAS',
     'New-customer revenue ÷ spend. TARGET: ≥ ' + t.roasNew.green.toFixed(2) + 'x 🟢 · ' +
     t.roasNew.amber.toFixed(2) + '–' + (t.roasNew.green - 0.01).toFixed(2) + 'x 🟡 · below ' +
     t.roasNew.amber.toFixed(2) + 'x 🔴. Graded on the CURRENT window.',
     'Computed here from the two columns above.'],

    ['Blended ROAS',
     'All revenue (new + returning) ÷ spend. TARGET: ≥ ' + t.roasOverall.green.toFixed(2) + 'x 🟢 · ' +
     t.roasOverall.amber.toFixed(2) + '–' + (t.roasOverall.green - 0.01).toFixed(2) + 'x 🟡 · below ' +
     t.roasOverall.amber.toFixed(2) + 'x 🔴. On the BLENDED row this is everything the ' +
     'store took over everything it spent.',
     'Computed here.'],

    ['Revenue growth',
     'Current window ÷ prior window − 1, on BOTH new-customer revenue and overall revenue, each with its ' +
     'own flag — so a channel that is only re-selling to existing buyers cannot hide behind a healthy ' +
     'blended number. TARGET: ≥ +' + Math.round(t.growth.green * 100) + '% 🟢 · +' +
     Math.round(t.growth.amber * 100) + '% to +' + Math.round(t.growth.green * 100) + '% 🟡 · below +' +
     Math.round(t.growth.amber * 100) + '% 🔴. "NEW" means the prior window was zero, so a percentage ' +
     'does not exist; it grades green.',
     'Computed here from the two windows.'],

    ['Status',
     'The worst of the four graded flags on that line: any 🔴 makes it 🔴, else any 🟡 makes it 🟡, else an ' +
     'unmeasurable dimension makes it ⚪. A line we cannot see is not a line we can call green. Tracking ' +
     'health is NOT folded in — it is its own RAG line.',
     'Computed here.'],

    ['⚪ NO DATA',
     'Spend exists but no attributed revenue does, so the ratio cannot be measured. It is NOT red: red ' +
     'would assert the channel sold nothing, and we have no evidence for that. When a whole GEO is ' +
     'affected the banner above the table names the cause and the fix.',
     'Computed here.'],

    ['— (dash)',
     'Nothing to grade: no spend on that line in the current window, so there is no ROAS and no growth ' +
     'to judge.',
     'Computed here.'],

    ['Tracking health',
     'ITS OWN RAG LINE, AND THE ONLY ONE A HUMAN SETS. The block under each table shows the evidence — ' +
     'attributed orders, how many matched a real Shopify order (Match %), and for the GEO as a whole how ' +
     'much of Shopify\'s revenue our tracking can explain at all (Coverage %) — plus an automatic hint ' +
     'flag (🟢 ≥ ' + Math.round(CONFIG.HEALTH.good * 100) + '%, 🟡 ≥ ' + Math.round(CONFIG.HEALTH.warn * 100) +
     '%). Your team then sets Team RAG, ticks Health Check, and names who checked it. Those cells are saved ' +
     'against the reporting period and survive every rebuild; each new period starts blank and the history ' +
     'stays on the "' + tabName_(RTAB.LOG) + '" tab.',
     'Evidence computed here; the RAG, the tick, the name, the date and the notes are typed by your team.'],

    ['LABELS on this report',
     'Cx = customer. BLENDED = every order the store took, new Cx + existing Cx (this row was ' +
     'previously headed OVERALL). Orders = orders in the window (previously Conversions). ' +
     'Health Check = the manual tick your team sets on the tracking-health line (previously ' +
     'Signed off). The names changed; not one number did — and the stored sign-offs still key off ' +
     'the internal line name, so every tick entered before the rename is still attached to its line.',
     'Naming only.'],

    ['No cross-GEO total',
     'There is no total row anywhere in this workbook, by design. Averaging five markets — one of which ' +
     'is a different business — produces a number that is true of nothing.',
     '—'],

    ['Currency',
     'EVERY figure in this workbook is in ' + CONFIG.REPORT_CURRENCY + ', including the country tabs, so ' +
     'the five GEOs can be read and added up side by side. Conversion happens ONCE, as the source is read, ' +
     'at ONE rate per currency — the same rate for BOTH periods. That is deliberate: converting each ' +
     'period at its own rate would fold a currency move into the growth %, so a channel could go red ' +
     'because the pound moved rather than because it sold less. Every growth % and ROAS here is therefore ' +
     'FX-neutral. Consequence to expect: a ' + CONFIG.REPORT_CURRENCY + ' figure here will not tie to the ' +
     'penny against Shopify\'s own ' + CONFIG.REPORT_CURRENCY + ' report, which converts each order at ' +
     'its own day\'s rate. For a figure that ties exactly, read the local-currency tabs in the GEO ' +
     'workbook. A currency with no rate is left UNCONVERTED and shouted about in the tab banner — never ' +
     'silently treated as 1:1.',
     'Rates: ' + readFx_().source + (readFx_().updatedAt ? ', as of ' + readFx_().updatedAt : '') +
     '. Pin a rate with CONFIG.FX_PINNED.'],

    ['Freshness',
     'This report computes nothing itself, so it is exactly as fresh as the GEO engine\'s last run. The ' +
     'source currently holds data up to ' + (src.maxDate || '(nothing yet)') + '. Anything older than ' +
     CONFIG.STALE_DAYS + ' day(s) puts a warning banner on every tab.',
     'Rebuilt daily at ' + CONFIG.DAILY_HOUR + ':00, after the GEO engine\'s own refresh.'],

    ['Known caveat',
     'On "' + CONFIG.GEO_TABS.SHOPIFY + '", Orders and Revenue come from the Shopify orders API (so ' +
     'refunds and edits are reflected) while the new/returning split comes from ShopifyQL total_sales, ' +
     'which nets discounts and returns differently. They need not add to the penny. Where the split was ' +
     'unavailable for some days of a window, the BLENDED row\'s note says how many — new Cx revenue ' +
     'is understated for those days rather than guessed.',
     'Inherited from the GEO engine.']
  ];
  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1, 1, 3).setBackground(HDR_BG).setFontColor('#FFFFFF').setFontWeight('bold');
  sh.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold');
  sh.getRange(1, 1, rows.length, 3).setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 640); sh.setColumnWidth(3, 420);
  sh.setFrozenRows(1);
  return sh;
}

/* Every sign-off ever saved, newest period first. This is the audit trail: the
   country tabs only ever show the CURRENT period, because a fresh period needs a
   fresh judgement — but nothing is thrown away. */
function buildHealthLogTab_() {
  var sh = sheetFor_(tabName_(RTAB.LOG));
  sh.clear();
  var head = ['Period', 'Country', 'Line', 'Team RAG', 'Health Check', 'Checked By',
              'Date Checked', 'Notes', 'Saved At'];
  sh.getRange(1, 1, 1, head.length).setValues([head])
    .setBackground(HDR_BG).setFontColor('#FFFFFF').setFontWeight('bold');
  var map = healthMap_(), rows = [];
  Object.keys(map).forEach(function (k) {
    var p = k.split('|'), rec = map[k] || {};
    var e = entityByCode_(p[0]);
    rows.push([p[2] || '', e ? e.label : p[0], lineLabel_(p[1] || ''), rec.rag || '',
      rec.signed === true, safeCell_(rec.by || ''), rec.when ? asDate_(rec.when) : '',
      safeCell_(rec.notes || ''), rec.savedAt || '']);
  });
  // Newest period first, then country, then line — the order you would read it.
  rows.sort(function (a, b) {
    if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return a[2] < b[2] ? -1 : 1;
  });
  if (rows.length) {
    sh.getRange(2, 1, rows.length, head.length).setValues(rows);
    sh.getRange(2, 7, rows.length, 1).setNumberFormat('yyyy-mm-dd');
    sh.getRange(2, 8, rows.length, 1).setWrap(true);
    bandRows_(sh, 2, rows.length, head.length);
  } else {
    sh.getRange(2, 1).setValue('No sign-offs saved yet. Fill the Team RAG block on a country tab and it ' +
      'will appear here on the next rebuild.').setFontColor(MUTED);
  }
  [110, 110, 130, 110, 88, 130, 110, 420, 130].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.setFrozenRows(1);
  return sh;
}

/* ========================================================================== */
/*  ORCHESTRATION                                                             */
/* ========================================================================== */

/* The whole report. Reads the source ONCE, aggregates each window ONCE, and
   hands the same objects to every tab. */
function rebuildAll(modeArg, asOfArg) {
  var ctl = currentControls_();
  // Only take an argument that is actually usable. A menu item passes nothing, and
  // an unexpected value must fall back to what the workbook itself says rather than
  // quietly rebuilding every tab on a period nobody chose.
  var mode = (typeof modeArg === 'string' && MODES.indexOf(modeArg) >= 0) ? modeArg : ctl.mode;
  var asOf = (typeof asOfArg === 'string') ? asOfArg : ctl.asOf;
  var per = periodPair_(mode, asOf);
  // Checked BEFORE a single cell is written: this workbook may be one you already
  // use, and resetTab_ clears without asking.
  assertSafeTabs_();
  var src = loadSource_();
  var aCur = aggregate_(src, per.cur.from, per.cur.to);
  var aPrior = aggregate_(src, per.prior.from, per.prior.to);
  var health = healthMap_();

  CONFIG.ENTITIES.forEach(function (e) {
    buildEntityTab_(e, per, src, aCur, aPrior, health);
  });
  if (CONFIG.SHOW_SUMMARY_TAB) buildSummaryTab_(per, src, aCur, aPrior, health);
  buildMethodTab_(per, src);
  buildHealthLogTab_();
  orderTabs_();
  dropDefaultSheet_();

  var msg = VERSION + ' rebuilt — ' + per.mode + ': ' + per.cur.label + ' vs ' + per.prior.label +
    ' (' + per.cur.days + ' vs ' + per.prior.days + ' days) · period key ' + per.key +
    '\n  source: ' + src.grainRows + ' grain row(s), ' + src.shopRows + ' Shopify row(s), up to ' +
    (src.maxDate || 'nothing') + (src.stale ? ' — STALE by ' + src.staleDays + ' day(s)' : '') +
    '\n  tabs: ' + CONFIG.ENTITIES.map(function (e) { return e.label; }).join(', ');
  Logger.log(msg);
  return msg;
}
function refreshReport() { return rebuildAll(); }
function jobDailyRebuild() { rebuildAll(); }

/* Summary first — it is the page you present from — then the countries in CONFIG
   order, then the reference tabs. */
function orderTabs_() {
  try {
    var ss = reportSS_(), want = ourTabNames_();
    want.forEach(function (name, i) {
      var sh = ss.getSheetByName(name);
      if (!sh) return;
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(i + 1);
    });
  } catch (e) { Logger.log('tab ordering skipped: ' + e); }
}
function dropDefaultSheet_() {
  try {
    var ss = reportSS_(), s1 = ss.getSheetByName('Sheet1');
    if (s1 && ss.getSheets().length > 1 && s1.getLastRow() === 0) ss.deleteSheet(s1);
  } catch (e) {}
}

/* ========================================================================== */
/*  TRIGGERS                                                                  */
/* ========================================================================== */

/* Two very different edits happen on these tabs and they must behave
   differently:
     the period cells   -> rebuild the whole workbook (all tabs, one period);
     a health sign-off  -> SAVE it and do NOT rebuild. Re-rendering the sheet the
                           instant someone types into it would be slow and would
                           fight the person doing the typing.                   */
function onReportEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet(), name = sh.getName();
    var row = e.range.getRow(), col = e.range.getColumn();

    if (ourTabNames_().indexOf(name) === -1) return;

    // 1. The period controls (B1 = mode, D1 = as-of).
    if (row === R_CTL && (col === 2 || col === 4)) {
      var vals = sh.getRange(1, 1, 1, 4).getValues()[0];
      rebuildAll(String(vals[1] || '').trim(), normDayKey_(vals[3]));
      return;
    }

    // 2. A tracking-health sign-off.
    var lay = layoutMap_()[name];
    if (!lay || col < lay.manualFirst || col > lay.manualLast) return;
    var idx = row - lay.top;
    if (idx < 0 || idx >= lay.lines.length) return;

    // Ticking Health Check stamps the date if the person left it empty — the one
    // thing this handler writes back, and only into a cell that is still blank.
    if (col === lay.signedCol && e.range.getValue() === true) {
      var whenCell = sh.getRange(row, lay.whenCol);
      if (!String(whenCell.getValue() || '').trim()) {
        whenCell.setValue(new Date()).setNumberFormat('yyyy-mm-dd');
      }
    }

    // Read the whole line back in one go so the four fields are always saved
    // consistently with each other.
    var span = lay.manualLast - lay.manualFirst + 1;
    var v = sh.getRange(row, lay.manualFirst, 1, span).getValues()[0];
    function at(c) { return v[c - lay.manualFirst]; }
    var when = at(lay.whenCol);
    setHealth_(lay.code, lay.lines[idx], lay.periodKey, {
      rag:    String(at(lay.ragCol) || '').trim(),
      signed: at(lay.signedCol) === true,
      by:     String(at(lay.byCol) || '').trim(),
      when:   when ? normDayKey_(when) : '',
      notes:  String(at(lay.notesCol) || '').trim()
    });
  } catch (err) { Logger.log('onReportEdit: ' + err); }
}

function onReportOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('🚦 Exec RAG')
      .addItem('Rebuild the report now', 'rebuildAll')
      .addSeparator()
      .addItem('Period: month to date (auto-advancing)', 'setModeMTD')
      .addItem('Period: last 15 days', 'setMode15')
      .addItem('Period: last 30 days', 'setMode30')
      .addItem('Period: last full month', 'setModeLastMonth')
      .addSeparator()
      .addItem('Which version is loaded?', 'whatVersion')
      .addItem('Where is this report?', 'showWorkbook')
      .addItem('Check the source (freshness + access)', 'checkAccess')
      .addItem('Why is a channel ⚪ / all Direct?', 'debugAttribution')
      .addItem('Why is a revenue figure impossible?', 'debugImpossible')
      .addItem('Run the built-in self-test', 'selfTest')
      .addToUi();
  } catch (e) { Logger.log('onReportOpen: ' + e); }
}
function setModeMTD()       { rebuildAll('Month to date', ''); }
function setMode15()        { rebuildAll('Last 15 days', ''); }
function setMode30()        { rebuildAll('Last 30 days', ''); }
function setModeLastMonth() { rebuildAll('Last full month', ''); }

/* ========================================================================== */
/*  SETUP + DIAGNOSTICS                                                       */
/* ========================================================================== */

function setup() {
  createReportWorkbook_();
  var ss = reportSS_();

  // A workbook id remembered from an earlier run is a second, invisible answer to
  // "which sheet is the report in". Once CONFIG names one, drop it — otherwise
  // blanking CONFIG later would silently resurrect the OLD workbook.
  if (!isPlaceholder_(CONFIG.REPORT_SHEET_ID)) {
    try {
      var stale = PropertiesService.getScriptProperties().getProperty(PROP.SHEET);
      if (stale && stale !== CONFIG.REPORT_SHEET_ID) {
        PropertiesService.getScriptProperties().deleteProperty(PROP.SHEET);
        Logger.log('Forgot the previously remembered workbook (' + stale + '); CONFIG now decides. ' +
          'That old file is unused and safe to delete from Drive.');
      }
    } catch (e) {}
  }

  // Triggers are bound to ONE spreadsheet. If the report has moved workbooks, the
  // old triggers still point at the old file — the menu and the sign-off saving
  // would appear to work and quietly do nothing. Deleting all of them and
  // reinstalling against reportSS_() is why setup() must be re-run after a move.
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('jobDailyRebuild').timeBased().atHour(CONFIG.DAILY_HOUR).everyDays(1).create();
  ScriptApp.newTrigger('onReportEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('onReportOpen').forSpreadsheet(ss).onOpen().create();

  var built = rebuildAll();

  var msg = 'setup() done — ' + VERSION + '\n' +
    '  REPORT workbook: ' + ss.getName() + '\n    ' + ss.getUrl() + '\n' +
    (isPlaceholder_(CONFIG.REPORT_SHEET_ID)
      ? '  Paste this into CONFIG.REPORT_SHEET_ID so there is one obvious answer to "which sheet is it":\n' +
        '    ' + ss.getId() + '\n' : '') +
    '  SOURCE (read-only): ' + CONFIG.GEO_SHEET_ID + '\n' +
    '  daily rebuild at ' + CONFIG.DAILY_HOUR + ':00 (script project time zone)\n' +
    '  period controls live in B1 (mode) and D1 (as of) on every tab\n' +
    '  menu installed — reopen the workbook to see it\n\n' + built + '\n\n' +
    'Next: run checkProjectIsolation(), then checkAccess().';
  Logger.log(msg);
  return msg;
}

/* Create the report workbook if there is not one yet. Checks the remembered id
   BEFORE creating anything, so a second run can never leave a duplicate empty
   workbook in Drive for someone to open by mistake. */
function createReportWorkbook_() {
  var existing = reportSheetId_();
  if (existing) {
    try { return openById_(existing, 'REPORT_SHEET_ID'); }
    catch (e) {
      throw new Error('The remembered report workbook (' + existing + ') cannot be opened: ' + e.message +
        '. Clear the "' + PROP.SHEET + '" Script Property or paste a good id into CONFIG.REPORT_SHEET_ID.');
    }
  }
  var ss = SpreadsheetApp.create('Exec RAG Report — GEO x Channel');
  PropertiesService.getScriptProperties().setProperty(PROP.SHEET, ss.getId());
  Logger.log('Created the report workbook and remembered its id:\n  ' + ss.getId() + '\n  ' + ss.getUrl());
  return ss;
}

/* WHICH VERSION IS ACTUALLY RUNNING?  Run this FIRST whenever the tabs do not look
   like the file you pasted. It prints the version and the real column headings this
   loaded code will write — so a paste that did not land is obvious in one run,
   without counting line numbers or trusting an editor. */
function whatVersion() {
  function uniq(a) { return a.filter(function (v, i) { return v !== '' && a.indexOf(v) === i; }); }
  var lines = ['=== ' + VERSION + ' ==='];
  lines.push('');
  lines.push('If the version above does not say v2, the paste did NOT land and the tabs will');
  lines.push('keep their old headings no matter how many times you rebuild.');
  lines.push('');
  lines.push('COUNTRY TAB headings this code writes:');
  lines.push('  ' + uniq(entityCols_().map(function (c) { return c.group; })).join('  |  '));
  lines.push('SUMMARY TAB headings:');
  lines.push('  ' + uniq(summaryCols_().map(function (c) { return c.group; })).join('  |  '));
  lines.push('HEALTH BLOCK columns:');
  lines.push('  ' + healthCols_().map(function (c) { return c.label; }).join('  |  '));
  lines.push('');
  lines.push('The OVERALL line prints as : ' + lineLabel_('OVERALL'));
  lines.push('Expected on v2: Spent · New Cx Revenue · Blended Revenue · Blended ROAS ·');
  lines.push('                Orders · Health Check ✓ · and the row printing as BLENDED.');
  lines.push('');
  lines.push('Guards present in this build:');
  lines.push('  clashing tabs are fingerprinted : ' + (typeof tabFingerprint_ === 'function'));
  lines.push('  growth blanks on an unmeasured window: ' + (growthVal_(100, 0, false) === ''));
  var msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* WHERE IS IT? The single most useful diagnostic there is — a workbook this
   script created has had its URL logged exactly once, and that is easy to miss. */
function showWorkbook() {
  var lines = ['=== ' + VERSION + ' — where everything lives ==='];
  try {
    var ss = reportSS_();
    lines.push('REPORT (this script writes here):');
    lines.push('  ' + ss.getName());
    lines.push('  id  ' + ss.getId());
    lines.push('  url ' + ss.getUrl());
    lines.push('  tabs: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(' · '));
    lines.push('  this report builds: ' + ourTabNames_().join(' · ') +
      (CONFIG.TAB_PREFIX ? '   (CONFIG.TAB_PREFIX = "' + CONFIG.TAB_PREFIX + '")' : ''));
    var notOurs = ourTabNames_().filter(function (nm) {
      var t = ss.getSheetByName(nm); return t && !tabIsOurs_(t);
    });
    if (notOurs.length) {
      lines.push('  ⚠ NAME CLASH — these already exist and were NOT written by this script, so a build ' +
        'will refuse rather than wipe them: ' + notOurs.join(', ') + '. Set CONFIG.TAB_PREFIX.');
    }
    if (isPlaceholder_(CONFIG.REPORT_SHEET_ID)) {
      lines.push('  NOTE: CONFIG.REPORT_SHEET_ID is still a placeholder — the id above is only remembered ' +
        'in Script Properties. Paste it into CONFIG.');
    }
  } catch (e) { lines.push('REPORT: not created yet — run setup(). (' + e.message + ')'); }
  try {
    var g = geoSS_();
    lines.push('SOURCE (read-only, never written to):');
    lines.push('  ' + g.getName());
    lines.push('  url ' + g.getUrl());
  } catch (e2) { lines.push('SOURCE: cannot open CONFIG.GEO_SHEET_ID — ' + e2.message); }
  var msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e3) {}
  return msg;
}

/* Print exactly what is and is not wired, and how fresh the source is. Run this
   first whenever a number looks wrong — it is faster than guessing. */
function checkAccess() {
  var lines = ['=== ' + VERSION + ' source check ==='];
  var ok = true;

  try {
    var ss = reportSS_();
    lines.push('OK   report workbook: ' + ss.getName() + '  ' + ss.getUrl());
    var clash = ourTabNames_().filter(function (nm) {
      var t = ss.getSheetByName(nm); return t && !tabIsOurs_(t);
    });
    if (clash.length) {
      ok = false;
      lines.push('FAIL tab name clash: ' + clash.join(', ') + ' already exist in that workbook and were ' +
        'not written by this script. A build will REFUSE rather than overwrite them. Set ' +
        'CONFIG.TAB_PREFIX (e.g. "RAG ") or rename those tabs.');
    }
  } catch (e) { ok = false; lines.push('FAIL report workbook — ' + e.message); }

  var src = null;
  try {
    var g = geoSS_();
    lines.push('OK   source workbook: ' + g.getName());
    src = loadSource_();
    lines.push('OK   "' + CONFIG.GEO_TABS.GRAIN + '": ' + src.grainRows + ' row(s), latest ' +
      (src.grainMax || 'none'));
    lines.push('OK   "' + CONFIG.GEO_TABS.SHOPIFY + '": ' + src.shopRows + ' row(s), latest ' +
      (src.shopMax || 'none'));
    lines.push((src.stale ? 'WARN' : 'OK  ') + ' freshness: source holds data up to ' +
      (src.maxDate || 'nothing') + (src.stale
        ? ' — ' + src.staleDays + ' day(s) stale. Run the GEO engine\'s refreshAll(), then rebuild.'
        : ' (fresh)'));
  } catch (e2) {
    ok = false;
    lines.push('FAIL reading the source — ' + e2.message);
  }

  if (src) {
    // An entity code present in the source but missing from CONFIG would silently
    // never get a tab, which is exactly the kind of gap nobody notices.
    var configured = {};
    CONFIG.ENTITIES.forEach(function (e) { configured[e.code.toUpperCase()] = 1; });
    Object.keys(src.codesSeen).sort().forEach(function (code) {
      var e = entityByCode_(code);
      lines.push((e ? 'OK   ' : 'WARN ') + 'source entity "' + code + '": ' + src.codesSeen[code] +
        ' grain row(s)' + (e ? ' -> tab "' + e.label + '"' : ' -> NOT in CONFIG.ENTITIES, so it gets no tab'));
    });
    CONFIG.ENTITIES.forEach(function (e) {
      if (!src.codesSeen[e.code.toUpperCase()]) {
        lines.push('WARN configured entity "' + e.code + '" (' + e.label + ') has no rows in the source at ' +
          'all — its tab will be empty. Check it is configured in the GEO engine and that its spend rows ' +
          'carry that country code.');
      }
    });
    // FX, because an unconverted currency is invisible on the face of the report.
    var fx = src.fx;
    lines.push('OK   currency: reporting in ' + CONFIG.REPORT_CURRENCY + ' · rates from ' + fx.source +
      (fx.updatedAt ? ' (as of ' + fx.updatedAt + ')' : ''));
    CONFIG.ENTITIES.forEach(function (e) {
      var cur = entityCurrency_(e, src), r = fxRateFor_(cur);
      var same = cur === String(CONFIG.REPORT_CURRENCY).toUpperCase();
      lines.push((same || r ? 'OK   ' : 'FAIL ') + '  ' + e.label + ': ' + fxLabel_(cur) +
        (same ? '' : r ? '' : ' — amounts will stay in ' + cur + ' and be WRONG. Run the GEO engine\'s refreshFxRates().'));
      if (!same && String(e.currency).toUpperCase() !== cur) {
        lines.push('WARN   CONFIG says ' + e.label + ' bills in ' + e.currency + ' but its source rows say ' +
          cur + '. The rows were converted at the ' + cur + ' rate, which is right — fix CONFIG so the ' +
          'label matches.');
      }
    });
    if ((src.bad || []).length) {
      ok = false;
      lines.push('FAIL ' + src.bad.length + ' source row(s) hold values that cannot be money and have ' +
        'been quarantined. This is bad data in the GEO workbook, not in this report. Run ' +
        'debugImpossible() for the list.');
      src.bad.slice(0, 5).forEach(function (b) {
        lines.push('       ' + b.code + ' ' + b.day + ' [' + b.tab + '] ' + b.detail);
      });
      if (src.bad.length > 5) lines.push('       ... and ' + (src.bad.length - 5) + ' more.');
    }
    var miss = Object.keys(fx.missing || {});
    if (miss.length) {
      lines.push('FAIL no rate for: ' + miss.sort().join(', ') + ' — those amounts are UNCONVERTED.');
      ok = false;
    }

    var per = periodPair_(currentControls_().mode, currentControls_().asOf);
    lines.push('     period: ' + per.mode + ' -> ' + per.cur.label + ' vs ' + per.prior.label +
      ' (' + per.cur.days + ' vs ' + per.prior.days + ' days), sign-off key ' + per.key);
    if (src.maxDate && per.prior.from < src.maxDate) {
      var have = daysBetween_(per.prior.from, src.maxDate);
      if (have < 1) lines.push('WARN the prior window starts before any data the source holds.');
    }
  }

  lines.push(ok ? 'RESULT: good to build.' : 'RESULT: fix the FAIL line(s) above first.');
  var msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e3) {}
  return msg;
}

/* WHY IS A CHANNEL ⚪? Prints, per GEO, what the source actually says about each
   channel in the current window. If spend is there and orders are zero, the
   revenue is arriving without a channel on it — an upstream tracking problem
   that no logic in this file can fix, and the reason ⚪ exists. */
function debugAttribution() {
  var ctl = currentControls_(), per = periodPair_(ctl.mode, ctl.asOf);
  var src = loadSource_(), a = aggregate_(src, per.cur.from, per.cur.to);
  var lines = ['=== ' + VERSION + ' attribution check — ' + per.cur.label + ' ==='];
  CONFIG.ENTITIES.forEach(function (e) {
    var b = a.byEntity[e.code]; if (!b) return;
    lines.push('');
    lines.push(e.label + ' (' + e.code + ')');
    var chans = Object.keys(b.channels).sort();
    if (!chans.length) lines.push('  no rows at all in this window');
    chans.forEach(function (ch) {
      var m = b.channels[ch];
      lines.push('  ' + ch + ': spend ' + round2_(m.spend) + ' · attributed orders ' + m.orders +
        ' · matched ' + m.matched + ' · attributed revenue ' + round2_(m.revenue) +
        ' · new-cust revenue ' + round2_(m.newRevenue) +
        (m.spend > 0 && m.orders === 0 ? '   <-- SPEND BUT NO ORDERS: this is why it shows ⚪' : ''));
    });
    var cov = b.shopify.revenue > 0 ? Math.round(1000 * b.all.revenue / b.shopify.revenue) / 10 : '';
    lines.push('  Shopify: ' + b.shopify.orders + ' order(s), revenue ' + round2_(b.shopify.revenue) +
      ' · attributed total ' + round2_(b.all.revenue) + (cov === '' ? '' : ' · coverage ' + cov + '%'));
  });
  lines.push('');
  lines.push('If paid channels show spend with zero orders while a "Direct" line carries the revenue, the ' +
    'problem is upstream: bds-unified is writing no recognisable channel into Source. Run debugSources() ' +
    'in the GEO x Channel project to see the raw Source values. Nothing in this report can split revenue ' +
    'that arrives with no channel on it.');
  var msg = lines.join('\n');
  Logger.log(msg);
  return msg;
}

/* WHY IS A REVENUE FIGURE IMPOSSIBLE? Lists every source row this report refused
   to believe, so the bad data can be fixed where it lives. This report computes
   nothing, so it cannot repair the source — but it can point exactly at it. */
function debugImpossible() {
  var src = loadSource_();
  var bad = src.bad || [];
  var lines = ['=== ' + VERSION + ' impossible-value check ==='];
  if (!bad.length) {
    lines.push('Nothing quarantined — every source row is within the sanity tripwires.');
    lines.push('  per-day cap: ' + fmtBig_(CONFIG.SANITY.maxDailyRevenue) + ' ' + CONFIG.REPORT_CURRENCY);
    lines.push('  split band : ' + CONFIG.SANITY.splitMinRatio + 'x to ' +
      CONFIG.SANITY.splitMaxRatio + 'x the orders-API revenue');
    lines.push('  per-cell  : ' + fmtBig_(CONFIG.SANITY.maxDailyMoney) + ' money, ' +
      fmtBig_(CONFIG.SANITY.maxDailyCount) + ' for a count');
  } else {
    lines.push(bad.length + ' row(s) quarantined. These are values in the GEO workbook that cannot be');
    lines.push('money, so this report refused to print them. Fix them at the source:');
    var byTab = {};
    bad.forEach(function (b) { (byTab[b.tab] || (byTab[b.tab] = [])).push(b); });
    Object.keys(byTab).forEach(function (tab) {
      lines.push('');
      lines.push('  in "' + tab + '":');
      byTab[tab].slice(0, 40).forEach(function (b) {
        lines.push('    ' + b.code + '  ' + b.day + '  [' + b.kind + ']  ' + b.detail);
      });
      if (byTab[tab].length > 40) lines.push('    ... and ' + (byTab[tab].length - 40) + ' more.');
    });
    lines.push('');
    lines.push('LIKELY CAUSE of an "impossible" Returning/New Cust Revenue: the GEO engine\'s ShopifyQL');
    lines.push('reader picked the wrong column as its measure. A response can carry customer_id next to');
    lines.push('total_sales, and summing 13-digit ids produces exactly this magnitude (~1e15 per day).');
    lines.push('In the GEO project run debugShopifyQL() to see which column it chose.');
  }
  var msg = lines.join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* This file must be alone in its project: it declares CONFIG, VERSION, setup,
   num_, moneyFmt_ and more, all of which the GEO engine also declares. Sharing a
   project means whichever loads last wins and both misbehave. */
function checkProjectIsolation() {
  var foreign = ['DTAB', 'GRAIN_HEADERS', 'buildGrain', 'readAttributed_', 'pullShopify',
                 'MASTER_HEADERS', 'buildDailyMaster', 'MOM_HEADERS', 'buildCountryView'];
  var found = foreign.filter(function (n) {
    try { return typeof eval(n) !== 'undefined'; } catch (e) { return false; }
  });
  var msg = found.length
    ? '*** STOP — THIS PROJECT IS NOT ISOLATED ***\n' +
      'Found other BackdropSource modules in this same Apps Script project: ' + found.join(', ') + '\n\n' +
      'All .gs files in one project share one global scope, and these files declare many identical\n' +
      'names (CONFIG, VERSION, setup, num_, moneyFmt_, ...). Whichever loads last wins, so this\n' +
      'report and that module will both misbehave — this one may read the wrong CONFIG and write\n' +
      'to the wrong workbook.\n\n' +
      'FIX: script.google.com > New project (standalone), paste ONLY this file there, and remove it\n' +
      'from the other project. Renaming things to work around it is not a fix.'
    : 'OK — isolated. No other BackdropSource module in this project.\n' +
      'VERSION = ' + VERSION + ' · no web app here, so nothing needs deploying: edits take effect on the ' +
      'next run.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

/* ========================================================================== */
/*  SELF-TEST                                                                 */
/*  The period maths and the RAG boundaries are the two things that would be
    wrong in a way nobody notices for a fortnight, so they are asserted rather
    than eyeballed. Run selfTest() after changing either.                      */
/* ========================================================================== */

function selfTest() {
  var fails = [], n = 0;
  function eq(got, want, what) {
    n++;
    if (String(got) !== String(want)) fails.push(what + ': got ' + got + ', wanted ' + want);
  }

  /* --- the period pair: 20 Aug must compare against 1–20 JULY --- */
  var p = periodPair_('Month to date', '2026-08-20');
  eq(p.cur.from, '2026-08-01', 'MTD cur from');
  eq(p.cur.to, '2026-08-20', 'MTD cur to');
  eq(p.prior.from, '2026-07-01', 'MTD prior from');
  eq(p.prior.to, '2026-07-20', 'MTD prior to');
  eq(p.cur.days, 20, 'MTD cur days');
  eq(p.prior.days, 20, 'MTD prior days');
  eq(p.key, 'MTD:2026-08', 'MTD sign-off key');

  /* --- and the next day it advances by itself. Asserted on a pair of dates
         deliberately in the PAST, because an "as of" in the future is clamped to
         today on purpose — testing it with tomorrow would only re-test the clamp. */
  var pA = periodPair_('Month to date', '2026-05-20');
  var pB = periodPair_('Month to date', '2026-05-21');
  eq(pA.prior.to, '2026-04-20', 'MTD prior end follows the day of the month');
  eq(pB.prior.to, '2026-04-21', 'MTD auto-advance: one day later moves BOTH windows');
  eq(pB.cur.to, '2026-05-21', 'MTD auto-advance: the current window grows too');
  eq(pB.cur.days, pB.prior.days, 'both windows stay the same length as they advance');
  eq(pA.key, pB.key, 'the sign-off key stays stable as the window grows inside the month');
  eq(pB.key, 'MTD:2026-05', 'the sign-off key names the month, not the window');

  /* --- month-length clamp: 31 March compares to 28 Feb, not to a 31 Feb --- */
  var p3 = periodPair_('Month to date', '2026-03-31');
  eq(p3.prior.to, '2026-02-28', 'clamp to a short month');
  eq(p3.sameLength, false, 'clamped window is flagged as not like-for-like');
  var p4 = periodPair_('Month to date', '2024-03-30');   // 2024 is a leap year
  eq(p4.prior.to, '2024-02-29', 'leap year clamp');

  /* --- January rolls back into December of the previous year --- */
  var p5 = periodPair_('Month to date', '2026-01-09');
  eq(p5.prior.from, '2025-12-01', 'January prior year rollover');
  eq(p5.prior.to, '2025-12-09', 'January prior year rollover end');

  /* --- the fortnight windows do not overlap and are equal length --- */
  var p6 = periodPair_('Last 15 days', '2026-08-20');
  eq(p6.cur.from, '2026-08-06', '15d cur from');
  eq(p6.cur.to, '2026-08-20', '15d cur to');
  eq(p6.prior.from, '2026-07-22', '15d prior from');
  eq(p6.prior.to, '2026-08-05', '15d prior to');
  eq(p6.cur.days, 15, '15d cur length');
  eq(p6.prior.days, 15, '15d prior length');
  eq(p6.key, 'F15:2026-08-B', '15d sign-off key is the second half of the month');
  eq(periodPair_('Last 15 days', '2026-08-15').key, 'F15:2026-08-A', '15d first-half key');

  /* --- last full month --- */
  var p7 = periodPair_('Last full month', '2026-08-20');
  eq(p7.cur.from, '2026-07-01', 'last full month from');
  eq(p7.cur.to, '2026-07-31', 'last full month to');
  eq(p7.prior.to, '2026-06-30', 'the month before that');

  /* --- blank "as of" follows today AND stays blank in the cell. If this ever
         regresses, the report silently freezes on the day it was last built. --- */
  var pBlank = periodPair_('Month to date', '');
  eq(pBlank.asOfGiven, false, 'a blank as-of is not treated as a typed date');
  eq(pBlank.asOf, dayKey_(new Date()), 'a blank as-of resolves to today');
  eq(periodPair_('Month to date', '2026-05-20').asOfGiven, true, 'a typed as-of is remembered as typed');

  /* --- a future "as of" is clamped rather than producing an empty window --- */
  var future = dayKey_(addDays_(new Date(), 30));
  eq(periodPair_('Month to date', future).clamped, true, 'future as-of clamped');

  /* --- RAG boundaries, exactly as specified --- */
  var tN = CONFIG.TARGETS.roasNew, tO = CONFIG.TARGETS.roasOverall;
  eq(ragRoas_(100, 400, true, tN), 'G', 'new ROAS 4.00x is green');
  eq(ragRoas_(100, 399, true, tN), 'A', 'new ROAS 3.99x is amber');
  eq(ragRoas_(100, 300, true, tN), 'A', 'new ROAS 3.00x is amber');
  eq(ragRoas_(100, 299, true, tN), 'R', 'new ROAS 2.99x is red');
  eq(ragRoas_(100, 500, true, tO), 'G', 'overall ROAS 5.00x is green');
  eq(ragRoas_(100, 400, true, tO), 'A', 'overall ROAS 4.00x is amber');
  eq(ragRoas_(100, 399, true, tO), 'R', 'overall ROAS 3.99x is red');
  eq(ragRoas_(0, 500, true, tO), 'N', 'no spend cannot be graded');
  eq(ragRoas_(100, 0, false, tO), 'U', 'spend with no attribution is UNKNOWN, not red');

  /* --- growth boundaries --- */
  eq(ragGrowth_(100, 125, true, true), 'G', '+25% is green');
  eq(ragGrowth_(100, 124, true, true), 'A', '+24% is amber');
  eq(ragGrowth_(100, 110, true, true), 'A', '+10% is amber');
  eq(ragGrowth_(100, 109, true, true), 'R', '+9% is red');
  eq(ragGrowth_(100, 50, true, true), 'R', 'a fall is red');
  eq(ragGrowth_(0, 40, true, true), 'G', 'from zero to something is green');
  eq(ragGrowth_(0, 0, true, false), 'U', 'funded but unmeasurable is unknown');
  eq(ragGrowth_(0, 0, false, false), 'N', 'not running is not a grade');
  eq(growthVal_(0, 40), 'NEW', 'growth from zero prints NEW, not a fake percentage');
  eq(growthVal_(200, 250), 0.25, 'growth value');
  /* THE UK GOOGLE ROW, 2026-08-21. July had £4,930 of new-customer revenue and
     August had nothing ATTRIBUTABLE — attribution stopped putting a channel on the
     orders. The report graded that -100% RED, asserting the channel lost all its new
     customers, while the ROAS cell on the SAME ROW read ⚪. Two cells, one fact,
     opposite claims. Silence is not a collapse. */
  eq(growthVal_(4930.43, 0, false), '',
     'growth INTO an unmeasured window prints nothing, not -100%');
  eq(ragGrowth_(4930.43, 0, true, true, false), 'U',
     'and it grades ⚪, matching the ROAS cell beside it — not a false RED');
  // The same numbers with the window MEASURED are a real collapse and must stay red.
  eq(growthVal_(4930.43, 0, true), -1, 'a MEASURED zero really is -100%');
  eq(ragGrowth_(4930.43, 0, true, true, true), 'R', 'and that one grades RED, correctly');
  // Undefined means the caller did not say; the old behaviour must be untouched, or
  // every existing grade would quietly turn grey.
  eq(growthVal_(4930.43, 0), -1, 'an unspecified curMeasured keeps the old behaviour');
  eq(ragGrowth_(100, 125, true, true), 'G', 'and so does a normal graded growth');
  eq(ragGrowth_(4930.43, 0, false, true, false), 'N',
     'unmeasured AND unfunded is — rather than ⚪: nothing to fix there');
  // A growing line must not be blanked by accident.
  eq(growthVal_(1000, 1250, true), 0.25, 'a measured, growing line is unaffected');
  eq(ragGrowth_(1000, 1250, true, true, true), 'G', 'and still grades on its growth');

  /* End to end on the shape that produced it: spend in both windows, revenue
     attributed in the PRIOR window only. */
  (function () {
    var src = { grain: {
      '2026-07-10|UK|Google': { spend: 33164, orders: 2, revenue: 4930.43, newRevenue: 4930.43, matched: 2 },
      '2026-08-10|UK|Google': { spend: 25128, orders: 0, revenue: 0, newRevenue: 0, matched: 0 }
    }, shop: {} };
    var aP = aggregate_(src, '2026-07-01', '2026-07-31');
    var aC = aggregate_(src, '2026-08-01', '2026-08-31');
    var cP = lineMetrics_('UK', 'Google', aP), cC = lineMetrics_('UK', 'Google', aC);
    eq(cP.newHasData, true, 'July Google is measurable — it had orders');
    eq(cC.newHasData, false, 'August Google is NOT — spend but zero attributed orders');
    eq(growthVal_(cP.newRev, cC.newRev, cC.newHasData), '',
       'so the growth cell is blank on the tab');
    eq(ragGrowth_(cP.newRev, cC.newRev, true, cC.newHasData || cP.newHasData, cC.newHasData), 'U',
       'and the RAG is ⚪');
    eq(ragRoas_(cC.spend, cC.newRev, cC.newHasData, CONFIG.TARGETS.roasNew), 'U',
       'which now AGREES with the ROAS RAG on the same row — the point of the fix');
  })();

  /* --- the ROAS cell must agree with its own flag --- */
  eq(roasVal_(100, 0, false), '', 'unmeasurable ROAS prints nothing, not 0.00x');
  eq(roasVal_(100, 0, true), 0, 'a MEASURED zero does print 0.00x — that one we know');
  eq(roasVal_(0, 500, true), '', 'no spend, no ROAS');
  eq(roasVal_(100, 450, true), 4.5, 'ROAS value');

  /* --- and the health evidence flag on the line we are paying for blind --- */
  eq(healthEvidenceFlag_(false, '', 600), 'U', 'spend with nothing attributed must be flagged, not dashed');
  eq(healthEvidenceFlag_(false, '', 0), 'N', 'no spend and nothing attributed is genuinely nothing to check');
  eq(healthEvidenceFlag_(false, 1, 600), 'G', 'every attributed order matched');
  eq(healthEvidenceFlag_(false, 0.5, 600), 'R', 'half the attributed orders match nothing real');
  eq(healthEvidenceFlag_(true, 0.77, 0), 'A', 'coverage of 77% is amber');
  eq(healthEvidenceFlag_(true, '', 0), 'N', 'no Shopify revenue to measure coverage against');

  /* --- FX. In this harness the GEO workbook is unreachable, so readFx_ falls
         back to CONFIG.FX — which is exactly the path worth asserting, since it
         is what runs when the FX Rates tab is missing. --- */
  eq(toUSD_(100, 'USD'), 100, 'USD needs no conversion');
  eq(toUSD_(100, 'usd'), 100, 'currency codes are case-insensitive');
  // Asserted against the EFFECTIVE rate, not against CONFIG.FX: the live "FX Rates"
  // tab normally wins, so comparing to the fallback table made this test fail
  // whenever it actually had rates to work with — a false alarm from the menu.
  eq(round2_(toUSD_(100, 'GBP')), round2_(100 * fxRateFor_('GBP')), 'GBP converted at the effective rate');
  eq(round2_(toUSD_(1000, 'INR')), round2_(1000 * fxRateFor_('INR')), 'INR converted at the effective rate');
  eq(round2_(toUSD_(100, 'AED')), round2_(100 * fxRateFor_('AED')), 'AED converted at the effective rate');
  // And the fallback table is sane in its own right, since it is what runs when
  // the FX tab cannot be read.
  eq(CONFIG.FX.USD, 1, 'the fallback table has USD at parity');
  eq(CONFIG.FX.GBP > 1 && CONFIG.FX.INR < 1 && CONFIG.FX.AED < 1, true,
     'the fallback rates point the right way (a flipped rate is a 60x error, not a rounding one)');
  eq(CONFIG.ENTITIES.every(function (e) { return fxRateFor_(e.currency) > 0; }), true,
     'EVERY configured GEO has a usable rate from somewhere');
  eq(toUSD_(0, 'GBP'), 0, 'zero converts to zero');
  eq(toUSD_(100, ''), 100, 'a blank currency is left alone');
  // The dangerous case: an unknown currency must be RECORDED, not silently 1:1.
  eq(toUSD_(100, 'ZZZ'), 100, 'an unknown currency is left unconverted');
  eq(readFx_().missing.ZZZ >= 1, true, 'and the unknown currency is recorded so the tab can shout');
  eq(fxRateFor_('USD'), 1, 'the report currency is 1:1 with itself');
  eq(fxRateFor_('ZZZ'), 0, 'no rate reads as 0, not as 1');
  eq(/^GBP @ /.test(fxLabel_('GBP')), true, 'the rate label names the rate: ' + fxLabel_('GBP'));
  eq(fxLabel_('USD'), 'USD native', 'a USD store is labelled native');
  eq(fxLabel_('ZZZ'), 'ZZZ @ NO RATE', 'a missing rate is labelled, not hidden');
  eq(rowCurrency_('UK', ''), 'GBP', 'a blank currency cell falls back to the entity currency');
  eq(rowCurrency_('UK', 'usd'), 'USD', 'the row wins over CONFIG when it says something');
  eq(rowCurrency_('NOPE', ''), 'USD', 'an unknown entity falls back to the report currency');
  // Growth must be FX-neutral: the SAME rate on both windows cancels out.
  var gp = toUSD_(1000, 'GBP'), gc = toUSD_(1250, 'GBP');
  eq(growthVal_(gp, gc), growthVal_(1000, 1250), 'converting both windows leaves growth % unchanged');

  /* --- money cells are rounded to the cent: FX makes floats out of clean
         numbers, and the raw value outlives the number format --- */
  eq(money_(2400 * 1.31), 3144, 'a converted amount is rounded to the cent, not 3143.999999999999');
  eq(money_(0), '', 'a zero money cell is blank');
  eq(money_(''), '', 'an empty money cell stays empty');
  eq(money_(1234.567), 1234.57, 'money rounds to 2dp');

  /* --- status is the WORST, and an unknown can never read as green --- */
  eq(worstStatus_(['G', 'G', 'A', 'R']), 'R', 'any red -> red');
  eq(worstStatus_(['G', 'G', 'A', 'U']), 'A', 'amber beats unknown');
  eq(worstStatus_(['G', 'G', 'G', 'U']), 'U', 'an unmeasured line is not green');
  eq(worstStatus_(['G', 'G', 'G', 'N']), 'G', 'a not-applicable dimension is ignored');
  eq(worstStatus_(['N', 'N']), 'N', 'nothing to grade');

  /* --- the aggregation: one order = one conversion, ratios recomputed from
         totals rather than averaged (an average of daily ROAS is not the
         period's ROAS, and on low-spend days it is wildly misleading) --- */
  var fake = {
    grain: {
      '2026-08-01|UK|Google': { spend: 100, orders: 2, revenue: 500, newRevenue: 400, matched: 2 },
      '2026-08-02|UK|Google': { spend: 300, orders: 3, revenue: 900, newRevenue: 600, matched: 1 },
      '2026-08-02|UK|Direct': { spend: 0,   orders: 5, revenue: 700, newRevenue: 200, matched: 5 },
      '2026-07-15|UK|Google': { spend: 200, orders: 1, revenue: 400, newRevenue: 300, matched: 1 }
    },
    shop: {
      '2026-08-01|UK': { orders: 9, revenue: 1500, newRev: 900, retRev: 600, basis: 'shopifyql' },
      '2026-08-02|UK': { orders: 8, revenue: 1200, newRev: 700, retRev: 500, basis: 'shopifyql' }
    }
  };
  var ag = aggregate_(fake, '2026-08-01', '2026-08-31');
  var g = ag.byEntity.UK.channels.Google;
  eq(g.spend, 400, 'channel spend summed across days');
  eq(g.revenue, 1400, 'channel revenue summed across days');
  eq(ag.byEntity.UK.paid.spend, 400, 'paid subtotal excludes Direct spend');
  eq(ag.byEntity.UK.paid.revenue, 1400, 'paid subtotal excludes Direct revenue');
  eq(ag.byEntity.UK.all.revenue, 2100, 'ALL includes Direct — coverage would be a lie without it');
  eq(round2_(ag.byEntity.UK.shopify.blend), 2700, 'blended = new + returning from the QL split');

  var mo = lineMetrics_('UK', 'OVERALL', ag);
  eq(mo.spend, 400, 'OVERALL spend is total spend across every channel');
  eq(mo.rev, 2700, 'OVERALL revenue is Shopify ground truth, not the attributed sum');
  eq(mo.newRev, 1600, 'OVERALL new-customer revenue is Shopify ground truth');
  eq(roasVal_(mo.spend, mo.rev, mo.hasData), 6.75, 'OVERALL ROAS recomputed from the totals');
  // Recomputed-from-totals is not the same as the mean of the daily ratios:
  // day 1 is 15.00x and day 2 is 4.00x, whose mean is 9.50x — provably different.
  eq(ragRoas_(mo.spend, mo.rev, mo.hasData, tO), 'G', 'OVERALL grades on the recomputed ratio');

  /* --- a MISSING new/returning split must read ⚪, never a red 0.00x. Overall
         revenue comes from the orders API and is always there; the split comes
         from ShopifyQL and sometimes is not. Grading new-revenue ROAS off a split
         that does not exist would put a RED on the flagship metric and assert the
         spend won no new customers — which is a claim about the world, not a
         measurement. --- */
  var noSplit = {
    grain: { '2026-08-01|UK|Google': { spend: 1000, orders: 4, revenue: 5000, newRevenue: 0, matched: 4 } },
    shop:  { '2026-08-01|UK': { orders: 16, revenue: 18590.08, newRev: 0, retRev: 0, basis: 'orders-only' } }
  };
  var agNS = aggregate_(noSplit, '2026-08-01', '2026-08-31');
  var mNS = lineMetrics_('UK', 'OVERALL', agNS);
  eq(mNS.hasData, true, 'overall revenue is measurable — the orders API always has it');
  eq(mNS.newHasData, false, 'the new-customer half is NOT measurable without the QL split');
  eq(mNS.rev, 18590.08, 'blended falls back to the orders-API revenue');
  eq(roasVal_(mNS.spend, mNS.newRev, mNS.newHasData), '',
     'new-revenue ROAS prints NOTHING when the split is missing, not 0.00x');
  eq(ragRoas_(mNS.spend, mNS.newRev, mNS.newHasData, tN), 'U',
     'and it grades UNKNOWN, not RED — a false red on new customers is the worst call this report could make');
  eq(ragRoas_(mNS.spend, mNS.rev, mNS.hasData, tO), 'G',
     'overall ROAS still grades normally: that number really was measured');
  eq(worstStatus_(['U', 'G', 'G', 'G']), 'U', 'the line reads unknown rather than green');
  // With the split present, the same shape grades for real.
  var withSplit = {
    grain: noSplit.grain,
    shop:  { '2026-08-01|UK': { orders: 16, revenue: 18590.08, newRev: 5000, retRev: 1000, basis: 'shopifyql' } }
  };
  var mWS = lineMetrics_('UK', 'OVERALL', aggregate_(withSplit, '2026-08-01', '2026-08-31'));
  eq(mWS.newHasData, true, 'a present split is measurable');
  eq(roasVal_(mWS.spend, mWS.newRev, mWS.newHasData), 5, 'new-revenue ROAS = 5000/1000');
  eq(mWS.rev, 6000, 'blended = new + returning where the split exists');

  var mg = lineMetrics_('UK', 'Google', ag);
  eq(mg.basis, 'attributed', 'channel lines are attribution-based');
  eq(mg.newHasData, true, 'channel new-customer revenue is per-order, so it needs no daily split');
  eq(roasVal_(mg.spend, mg.newRev, mg.hasData), 2.5, 'channel new-revenue ROAS');
  eq(ragRoas_(mg.spend, mg.newRev, mg.hasData, tN), 'R', 'a 2.50x new-revenue ROAS is red');

  /* --- THE 2026-08-20 INCIDENT, asserted so it cannot come back. A GEO's
         Returning Cust Revenue arrived at ~2.56e15 per day and the report printed
         an Overall Revenue of $51,205,863,893,064,000 at 1,298,642,692,670x. --- */
  var badRows = [];
  var incident = { orders: 218, revenue: 26810.90, newRev: 4283.18, retRev: 2560293194653200,
                   basis: 'shopifyql' };
  eq(vetShopifyRow_(incident, '2026-08-01', 'UK', badRows), true, 'the impossible row is caught');
  eq(badRows.length, 1, 'and recorded once');
  eq(badRows[0].kind, 'impossible', 'flagged as impossible, not as a rounding quibble');
  eq(incident.retRev, 0, 'the value that cannot be money is discarded, never printed');
  eq(incident.newRev, 0, 'and the split it belonged to goes with it');
  eq(incident.basis, 'quarantined', 'the day is marked so aggregate_ falls back to orders-only');
  eq(incident.revenue, 26810.9, 'the orders-API revenue is SANE and is kept');
  eq(incident.orders, 218, 'the order COUNT is untouched — it was never in doubt');
  // And end-to-end: the OVERALL line now reports the orders-API revenue, with the
  // new-customer half honestly unknown rather than a fabricated red zero.
  var agInc = aggregate_({ grain: {}, shop: { '2026-08-01|UK': incident } },
                         '2026-08-01', '2026-08-31');
  var mInc = lineMetrics_('UK', 'OVERALL', agInc);
  eq(mInc.rev, 26810.9, 'OVERALL revenue falls back to the trustworthy measurement');
  eq(mInc.newHasData, false, 'the new/returning split is reported as unmeasurable');
  eq(roasVal_(1000, mInc.newRev, mInc.newHasData), '', 'so new-revenue ROAS prints nothing');
  eq(ragRoas_(1000, mInc.newRev, mInc.newHasData, tN), 'U', 'and grades ⚪, not a false red');

  /* --- the cross-check between the two measurements --- */
  var b2 = [];
  var wild = { orders: 5, revenue: 1000, newRev: 9000, retRev: 0, basis: 'shopifyql' };
  eq(vetShopifyRow_(wild, '2026-08-02', 'UK', b2), true, 'a split 9x the orders revenue is caught');
  eq(b2[0].kind, 'split', 'flagged as a disagreement between the two measurements');
  var half = { orders: 5, revenue: 1000, newRev: 200, retRev: 100, basis: 'shopifyql' };
  eq(vetShopifyRow_(half, '2026-08-02', 'UK', []), true, 'a split at 30% of revenue is caught too');
  // A normal day, including the penny-level disagreement the Method tab warns about.
  var fine = { orders: 14, revenue: 3080, newRev: 1694, retRev: 1300, basis: 'shopifyql' };
  eq(vetShopifyRow_(fine, '2026-08-03', 'UK', []), false, 'a NORMAL day passes untouched');
  eq(fine.newRev, 1694, 'and keeps its split');
  eq(fine.basis, 'shopifyql', 'and keeps its basis');
  // An orders-only day has no split to cross-check, so it must not be quarantined.
  var noQl = { orders: 9, revenue: 5000, newRev: 0, retRev: 0, basis: 'orders-only' };
  eq(vetShopifyRow_(noQl, '2026-08-04', 'UK', []), false, 'a day with no split is not an anomaly');
  eq(noQl.revenue, 5000, 'and keeps its revenue');
  // Zero-revenue days must not divide by zero into a false anomaly.
  var quiet = { orders: 0, revenue: 0, newRev: 0, retRev: 0, basis: 'shopifyql' };
  eq(vetShopifyRow_(quiet, '2026-08-05', 'UK', []), false, 'a day with no sales is not an anomaly');

  /* --- and the same tripwire on the grain --- */
  var b3 = [];
  var gBad = { spend: 120, orders: 3, revenue: 9.9e15, newRevenue: 0, matched: 3 };
  eq(vetGrainRow_(gBad, '2026-08-01', 'UK', 'Google', b3), true, 'an impossible channel revenue is caught');
  eq(gBad.revenue, 0, 'and discarded rather than inflating that channel\'s ROAS');
  eq(b3[0].tab, CONFIG.GEO_TABS.GRAIN, 'recorded against the tab it came from');
  eq(vetGrainRow_({ spend: 120, orders: 3, revenue: 600, newRevenue: 450, matched: 3 },
     '2026-08-01', 'UK', 'Google', []), false, 'a normal channel row passes');

  /* --- the per-CELL gates, which catch what magnitude alone cannot --- */
  var bc = { bad: [], code: 'UK', day: '2026-08-05', tab: 'Shopify Daily' };
  eq(srcMoney_('', 'USD', bc, 'Revenue'), 0, 'a BLANK money cell is a legitimate zero');
  eq(srcMoney_(null, 'USD', bc, 'Revenue'), 0, 'so is an absent one');
  eq(bc.bad.length, 0, 'and neither is reported — an orders-only day has blank split columns');
  eq(srcMoney_(1234.56, 'USD', bc, 'Revenue'), 1234.56, 'a plain number passes through');
  eq(srcMoney_('1,234.56', 'USD', bc, 'Revenue'), 1234.56, 'so does a typed one with separators');
  eq(bc.bad.length, 0, 'still nothing reported');
  // THE INCIDENT: a date in a money column. num_() would stringify it to ~5e14.
  eq(srcMoney_(new Date(Date.UTC(2026, 7, 5, 12)), 'USD', bc, 'Returning Cust Revenue'), null,
     'a DATE in a money column is refused, not silently turned into 5e14');
  eq(bc.bad.length, 1, 'and it is reported');
  eq(bc.bad[0].kind, 'unreadable', 'under its own kind, so the fix is obvious at the source');
  eq(bc.bad[0].tab, 'Shopify Daily', 'against the tab it came from');
  eq(/Returning Cust Revenue/.test(bc.bad[0].detail), true, 'naming the column');
  eq(srcMoney_(2560293194653200, 'USD', bc, 'Revenue'), null,
     'a number too large to be money is refused even though it IS a number');
  eq(srcMoney_('n/a', 'USD', bc, 'Revenue'), null, 'a label is not a zero');
  eq(srcCount_('', bc, 'Orders'), 0, 'a blank count is zero');
  eq(srcCount_(218, bc, 'Orders'), 218, 'a real count passes');
  eq(srcCount_(5e14, bc, 'Orders'), null, 'an impossible count is refused');

  /* --- and the whole reader down the incident path --- */
  var sHdr = ['Date', 'Entity', 'Orders', 'Revenue', 'New Cust Revenue',
              'Returning Cust Revenue', 'Revenue Basis', 'Currency'];
  var sRows = [sHdr,
    ['2026-08-05', 'UK', 218, 26810.90, 4283.18, new Date(Date.UTC(2026, 7, 5, 12)), 'shopifyql', 'USD'],
    ['2026-08-06', 'UK', 10, 1000, 400, 600, 'shopifyql', 'USD'],
    ['2026-08-07', 'UK', 5, 500, '', '', 'orders-only', 'USD']];
  var savedReader = readSourceTab_;
  readSourceTab_ = function () {
    return { rows: sRows, c: indexMap_(sHdr), empty: false, tab: 'Shopify Daily' };
  };
  var sGot;
  try { sGot = readShopify_(); } finally { readSourceTab_ = savedReader; }
  var d5 = sGot.map['2026-08-05|UK'];
  eq(d5.revenue, 26810.9, 'the sane orders-API revenue survives the bad cell beside it');
  eq(d5.orders, 218, 'and so does the order count');
  eq(d5.retRev, 0, 'the unreadable half is not printed');
  eq(d5.newRev, 0, 'and the half beside it goes with it — half a split is not a split');
  eq(d5.basis, 'quarantined', 'the day drops to orders-only so no view prints a false split');
  eq(sGot.bad.length, 1, 'exactly one row is quarantined');
  eq(sGot.bad[0].day, '2026-08-05', 'the right one');
  var d6 = sGot.map['2026-08-06|UK'];
  eq(d6.newRev, 400, 'a good day is untouched');
  eq(d6.basis, 'shopifyql', 'and keeps its split');
  var d7 = sGot.map['2026-08-07|UK'];
  eq(d7.basis, 'orders-only', 'a day with genuinely blank split columns is NOT quarantined');
  eq(d7.revenue, 500, 'and keeps its revenue');

  /* --- the prior window must not leak into the current one --- */
  var agPrior = aggregate_(fake, '2026-07-01', '2026-07-31');
  eq(agPrior.byEntity.UK.channels.Google.spend, 200, 'prior window reads only its own days');
  eq(agPrior.byEntity.UK.shopify.days, 0, 'no Shopify rows in the prior window');
  eq(lineMetrics_('UK', 'OVERALL', agPrior).hasData, false, 'a window with no Shopify data says so');

  /* --- a duplicated source row must not silently vanish --- */
  eq(Object.keys(fake.grain).length, 4, 'fixture intact');

  /* --- the tab-name prefix has to reach EVERY name, or the report would read
         one tab and write another --- */
  var savedPrefix = CONFIG.TAB_PREFIX;
  CONFIG.TAB_PREFIX = '';
  eq(tabName_('Method'), 'Method', 'no prefix by default');
  eq(entityTab_({ label: 'UK' }), 'UK', 'entity tab is its label');
  var plain = ourTabNames_();
  eq(plain.length, CONFIG.ENTITIES.length + 3, 'summary + 5 countries + Method + Health Log');
  eq(plain[0], 'Exec Summary', 'summary first — it is the page they present from');
  CONFIG.TAB_PREFIX = 'RAG ';
  eq(tabName_('Method'), 'RAG Method', 'the prefix applies');
  eq(entityTab_({ label: 'UK' }), 'RAG UK', 'and to country tabs');
  eq(ourTabNames_().every(function (x) { return x.indexOf('RAG ') === 0; }), true,
     'EVERY tab name carries the prefix — a half-applied prefix would read one tab and write another');
  CONFIG.TAB_PREFIX = savedPrefix;

  /* --- and the guard that stands between a name clash and lost data --- */
  function fakeSheet(cells) {
    var last = 0;
    Object.keys(cells).forEach(function (k) { last = Math.max(last, +k.split(',')[0]); });
    return {
      getLastRow: function () { return last; },
      getRange: function (r, c) { return { getValue: function () { return cells[r + ',' + c] || ''; } }; }
    };
  }
  eq(tabIsOurs_(fakeSheet({})), true, 'an empty tab is safe to build over');
  eq(tabIsOurs_(fakeSheet({ '1,1': 'Period', '2,1': 'EXEC RAG  —  UK  ·  1–20 Aug' })), true,
     'a country tab we wrote is recognised');
  eq(tabIsOurs_(fakeSheet({ '1,1': 'Period', '1,2': 'Country' })), true, 'the Health Log is recognised');
  eq(tabIsOurs_(fakeSheet({ '1,1': 'Item' })), true, 'the Method tab is recognised');
  eq(tabIsOurs_(fakeSheet({ '1,1': 'Date', '1,2': 'Orders', '2,1': '2026-08-01' })), false,
     'SOMEBODY ELSE\'S tab is NOT ours — this is what stops a rebuild wiping their data');
  eq(tabIsOurs_(fakeSheet({ '5,3': 'a stray note' })), false,
     'a tab with content anywhere is not assumed to be safe');
  /* THE 2026-08-21 DEADLOCK. A build that failed partway left the UK tab holding
     only the control row — A1 'Period' and nothing else — and the guard then
     refused to rebuild it on every run, forever. Refusing to overwrite a STRANGER'S
     tab is the whole point of this guard; refusing to finish OUR OWN half-written
     one is just a bug, and one that no amount of re-running could clear. */
  eq(tabIsOurs_(fakeSheet({ '1,1': 'Period' })), true,
     'a HALF-BUILT tab of ours (control row only) is adopted, not refused');
  eq(tabIsOurs_(fakeSheet({ '1,1': 'Period', '1,2': 'Month to date' })), true,
     'and one that got as far as writing the mode dropdown');
  /* But the GEO ENGINE's daily tabs carry the SAME country names and must still be
     refused: they are another script's work, and their first cell says Month. This
     is the case that makes pointing both scripts at one workbook detectable. */
  eq(tabIsOurs_(fakeSheet({ '1,1': 'Month', '1,2': '2026-08' })), false,
     'the GEO engine daily tab is NOT ours — it starts with Month, not Period');
  eq(tabIsOurs_(fakeSheet({ '1,1': 'Item' })), true, 'the Method tab is still recognised');

  /* --- the impossible-subset guards, from the real UK August figures --- */
  (function () {
    // Direct alone held $241,646 of new-Cx revenue while the whole store took
    // $149,960. A subset cannot exceed the whole; the report must say so.
    var over = { byEntity: { UK: {
      channels: { Direct: { spend: 0, orders: 40, revenue: 243316, newRevenue: 241646, matched: 40 } },
      paid: blank_(),
      all: { spend: 28575, orders: 40, revenue: 243316, newRevenue: 241646, matched: 40 },
      shopify: { orders: 218, revenue: 232607, newRev: 149960, retRev: 82647,
                 blend: 232607, days: 21, qlDays: 21 }
    } } };
    var w = entityWarnings_({ code: 'UK', label: 'UK', currency: 'USD' }, over,
                            { curByEntity: { UK: { USD: 1 } } });
    var joined = w.join(' | ');
    eq(/ATTRIBUTED NEW-CX REVENUE EXCEEDS THE STORE TOTAL/.test(joined), true,
       'new-Cx revenue above the store total is called out, not printed silently');
    eq(/161%/.test(joined), true, 'and the ratio is named so the size of it is obvious');
    eq(/GUEST CHECKOUTS/.test(joined), true, 'with the usual cause spelled out');
    eq(/COVERAGE IS 104.6% — ABOVE 100%/.test(joined), true,
       'and coverage above 100% is flagged as duplicates, not growth');
  })();
  (function () {
    // A NORMAL entity must trip neither guard.
    var okE = { byEntity: { UK: {
      channels: { Google: { spend: 100, orders: 4, revenue: 500, newRevenue: 300, matched: 4 } },
      paid: blank_(),
      all: { spend: 100, orders: 4, revenue: 500, newRevenue: 300, matched: 4 },
      shopify: { orders: 10, revenue: 900, newRev: 600, retRev: 300, blend: 900, days: 21, qlDays: 21 }
    } } };
    var w2 = entityWarnings_({ code: 'UK', label: 'UK', currency: 'USD' }, okE,
                             { curByEntity: { UK: { USD: 1 } } }).join(' | ');
    eq(/EXCEEDS THE STORE TOTAL/.test(w2), false, 'a sane entity is not accused of over-attribution');
    eq(/ABOVE 100%/.test(w2), false, 'nor of impossible coverage');
  })();
  eq(entityCols_().map(function (c) { return c.group; }).indexOf('Spent') >= 0, true,
     'the spend heading reads Spent');
  eq(entityCols_().map(function (c) { return c.group; }).indexOf('Spend'), -1,
     'and no heading still says Spend');

  /* --- the LABEL vocabulary, and the line KEY it must not disturb --- */
  var groups = entityCols_().map(function (c) { return c.group; });
  eq(groups.indexOf('New Cx Revenue') >= 0, true, 'the revenue group reads New Cx Revenue');
  eq(groups.indexOf('Blended Revenue') >= 0, true, 'Overall Revenue is now Blended Revenue');
  eq(groups.indexOf('Blended ROAS') >= 0, true, 'Overall ROAS is now Blended ROAS');
  eq(groups.indexOf('Orders') >= 0, true, 'Conversions is now Orders');
  // The words that were replaced must be gone from EVERY column heading, on both
  // tables — a half-applied rename is worse than none, because two headings then
  // describe the same number differently.
  var allGroups = groups.concat(summaryCols_().map(function (c) { return c.group; }));
  eq(allGroups.filter(function (g) { return /Customer/i.test(g); }), [],
     'no heading spells out Customer — it is Cx');
  eq(allGroups.filter(function (g) { return /^Overall/.test(g); }), [],
     'no heading still says Overall');
  eq(allGroups.filter(function (g) { return /Conversion/i.test(g); }), [],
     'no heading still says Conversions');
  var hLabels = healthCols_().map(function (c) { return c.label; });
  eq(hLabels.indexOf('Health Check ✓') >= 0, true, 'the manual tick is labelled Health Check');
  eq(hLabels.filter(function (l) { return /Signed off/i.test(l); }), [],
     'and no longer Signed off');

  /* THE POINT OF lineLabel_: the row PRINTS as BLENDED while the stored key stays
     OVERALL. Health sign-offs are keyed CODE|LINE|PERIOD in Script Properties, so if
     the rename had reached the key, every tick the team had already entered would
     have been orphaned — present in storage, invisible on the tab. */
  eq(lineLabel_('OVERALL'), 'BLENDED', 'the OVERALL line prints as BLENDED');
  eq(lineLabel_('PAID SUBTOTAL'), 'PAID SUBTOTAL', 'other lines print unchanged');
  eq(lineLabel_('Google'), 'Google', 'a channel prints unchanged');
  eq(healthKey_('UK', 'OVERALL', 'MTD:2026-08'), 'UK|OVERALL|MTD:2026-08',
     'the STORED key still says OVERALL, so old sign-offs still resolve');
  eq(linesFor_('UK', { byEntity: {} }, { byEntity: {} }).indexOf('OVERALL') >= 0, true,
     'and the line list still uses the OVERALL key internally');
  // A tick saved under the old key must still be found after the rename.
  (function () {
    var m = {};
    m[healthKey_('UK', 'OVERALL', 'MTD:2026-08')] = { rag: '🟢 Green', signed: true };
    var got = getHealth_(m, 'UK', 'OVERALL', 'MTD:2026-08');
    eq(!!(got && got.signed), true, 'a sign-off stored before the rename still reads back');
  })();

  /* --- column specs cannot drift out of alignment with the row builder --- */
  var ec = entityCols_();
  eq(groupSpans_(ec).reduce(function (s, g2) { return s + g2.span; }, 0), ec.length,
     'entity groups cover every column exactly once');
  var sc = summaryCols_();
  eq(groupSpans_(sc).reduce(function (s, g3) { return s + g3.span; }, 0), sc.length,
     'summary groups cover every column exactly once');
  var hc = healthCols_();
  var manualIdx = [];
  hc.forEach(function (c, i) { if (c.manual) manualIdx.push(i); });
  eq(manualIdx[manualIdx.length - 1] - manualIdx[0], manualIdx.length - 1,
     'the manual health columns are contiguous — onReportEdit assumes one span');
  eq(hc[hc.length - 1].manual, true, 'the manual columns are last, so a rebuild never has to move them');

  var msg = fails.length
    ? 'selfTest: ' + fails.length + ' of ' + n + ' FAILED\n  ' + fails.join('\n  ')
    : 'selfTest: all ' + n + ' assertions passed (' + VERSION + ').';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
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
//  BACKDROPSOURCE — EXEC RAG REPORT  (Google Apps Script)
//  The fortnightly exec scorecard: every GEO x channel graded Red / Amber /
//  Green against fixed targets, period-to-date against the SAME days of last
//  month, in its OWN workbook.
// ============================================================================
//
//  WHAT THIS IS FOR
//    You present this every 15 days. One tab per country — UK · Canada · India ·
//    UAE · PrintFabrix — each holding one table in the shape of your MoM
//    Comparison View: an orange grouped header, a PRIOR column and a CURRENT
//    column per metric, a growth %, and then the payoff — a RAG flag per metric
//    and one Status flag per line.
//
//      Channel | Spend (prior · current · growth) | New Cx Revenue
//      (prior · current · growth · RAG) | New-Revenue ROAS (prior · current ·
//      RAG) | Blended Revenue (prior · current · growth · RAG) | Blended ROAS
//      (prior · current · RAG) | Orders (prior · current) | Status
//
//    Rows are the channels — Google, Bing, Meta, LinkedIn — plus a PAID
//    SUBTOTAL line and an OVERALL line. Countries are NEVER rolled up together:
//    there is no cross-GEO total anywhere in this workbook, on purpose. A
//    blended ROAS across five markets hides exactly what this report exists to
//    show, and PrintFabrix is a different business from Backdropsource.
//
//  THE TABS
//    Exec Summary  one line per GEO (and a PAID-only line each), every RAG on
//                  one screen. This is the page you present from. No total row.
//    UK · Canada · India · UAE · PrintFabrix
//                  the table above, per country, plus the tracking-health
//                  sign-off block underneath it.
//    Method        every metric, target and caveat written out in plain English,
//                  so nobody has to ask what a number is computed on.
//    Health Log    every tracking-health sign-off your team has ever entered,
//                  newest period first. The country tabs only show the CURRENT
//                  period; nothing is ever thrown away.
//
//  THE PERIOD PICKER (cell B1 on any tab — it drives every tab at once)
//    Month to date     1st to today vs the 1st to the same day last month. The
//                      default, and the one that auto-advances. [RECOMMENDED]
//    Last 15 days      the last 15 days vs the 15 before them — the report's own
//                      presentation cadence, if you would rather cut it that way.
//    Last 30 days      the last 30 days vs the 30 before them.
//    Last full month   the last COMPLETE month vs the month before it.
//    Cell D1 ("As of") cuts the report to an earlier day for a deck. LEAVE IT
//    BLANK and the report follows today by itself — that is what makes the
//    comparison advance overnight with no one touching it.
//
//  THE TWO THINGS THAT MAKE IT AUTOMATIC
//
//    1. PERIOD-TO-DATE, NEVER A LIE OF TIMING.
//       On 20 August the report is 1–20 August against 1–20 JULY. On the 21st it
//       is 1–21 August against 1–21 July, with every growth % recomputed. You
//       change nothing. Comparing a part-month against a WHOLE previous month is
//       the single most common way an exec report accidentally reports a
//       collapse, so it is not possible here. The prior window always has the
//       same number of days as the current one, and it is clamped to the length
//       of that month (a 31 March report compares against 28 February, not
//       against a 31 February that does not exist).
//
//    2. RAG AGAINST FIXED TARGETS (CONFIG.TARGETS — change them in one place):
//         New-revenue ROAS   >= 4.00x  GREEN  ·  3.00–3.99x  AMBER  ·  < 3.00x  RED
//         Blended ROAS       >= 5.00x  GREEN  ·  4.00–4.99x  AMBER  ·  < 4.00x  RED
//         Revenue growth     >= +25%   GREEN  ·  +10% to +25% AMBER ·  < +10%   RED
//       Growth is graded on BOTH new-customer revenue and overall revenue, each
//       with its own flag, so a channel that is only re-selling to existing
//       buyers cannot hide behind a healthy blended number.
//       Tracking health is deliberately NOT folded into those flags — it is its
//       own RAG line, set BY HAND by your team, in the block underneath every
//       table. The script computes the evidence next to it (attributed orders,
//       matched orders, coverage %) and then leaves the judgement to a person.
//
//  EVERY FIGURE IS IN USD (CONFIG.REPORT_CURRENCY)
//    Including the country tabs, so the five GEOs can be read and added up side
//    by side. Conversion happens ONCE, as the source is read, at ONE rate per
//    currency — and the SAME rate for both periods. That last part is deliberate:
//    converting each period at its own rate would fold a currency move into the
//    growth %, and a channel could go red on an exec scorecard because sterling
//    moved rather than because it sold less. So every growth % and every ROAS
//    here is FX-neutral. The trade-off to expect: a USD total here will not tie
//    to the penny against Shopify's own USD report, which converts each order at
//    its own day's rate — for a figure that ties exactly, read the local-currency
//    tabs in the GEO workbook. Each tab's title names the rate it used.
//    Rates come from the GEO workbook's "FX Rates" tab (refreshed live by that
//    engine), falling back to CONFIG.FX. A currency with NO rate anywhere is left
//    UNCONVERTED and shouted about in the tab banner, the title and checkAccess —
//    never silently treated as 1:1, because an unconverted AED figure reads about
//    3.7x too high and nothing on the face of the report would show it.
//
//  ⚪ MEANS "WE CANNOT SEE IT", NOT "IT IS ZERO"
//    A channel with spend but no attributed revenue gets a grey ⚪, never a red
//    0.00x. Those are different statements and only one of them is true: a red
//    would be this report asserting the channel sold nothing, when what actually
//    happened is that our tracking could not tell us. Where a whole GEO is
//    affected the tab says so in a banner above the table, with the fix.
//
//  ONE VERSION OF THE TRUTH — THIS SCRIPT INGESTS NOTHING
//    It reads two tabs of the GEO x Channel Performance workbook and nothing
//    else. No Shopify credentials, no ad-platform calls, no pasted CSVs:
//      "GEO Channel Daily"  -> Date x Entity x Channel spend, conversions,
//                              attributed revenue, new-customer revenue, matched
//                              orders. Already joined per order over there.
//      "Shopify Daily"      -> Date x Entity ground truth: orders, revenue and
//                              the new/returning split.
//      "FX Rates"           -> the live local -> USD rates that engine already
//                              maintains, so this report and its USD columns
//                              agree instead of being two answers.
//    So spend still has exactly one owner (the Ad Budget Tracker), attribution
//    exactly one owner (bds-unified), and truth exactly one owner (Shopify).
//    If a number here is wrong it is wrong at its source and it is wrong in the
//    GEO workbook too — which is the point of not copying anything.
//    Consequence worth knowing: this report is only as fresh as the GEO engine's
//    last run. It checks, and every tab shows a banner when the source is stale.
//
//  WHY IT IS A SEPARATE FILE AND A SEPARATE PROJECT (house rule)
//    A new module gets its own file and its own Apps Script project. This file
//    never edits — only reads — the GEO workbook, and must NOT be pasted into
//    the GEO project: every .gs file in one project shares one global scope and
//    these two declare many of the same names (CONFIG, VERSION, setup, num_,
//    moneyFmt_, ...). Whichever loads last would win and both would misbehave.
//    Run checkProjectIsolation() if you are unsure — it detects exactly that.
//    There is no web app and no /exec here, so nothing needs deploying: edits
//    take effect on the next run.
//
//  SETUP  (about 5 minutes — there are no credentials to find)
//    1. script.google.com -> New project (STANDALONE) -> paste this whole file
//       -> Save. Do not add it to the GEO project.
//    2. Check CONFIG.GEO_SHEET_ID is your GEO x Channel Performance workbook.
//    3. Run  setup()  -> authorize. It installs the daily refresh, the menu and
//       the period controls, and builds every tab once. The report lives in the
//       workbook named in CONFIG.REPORT_SHEET_ID above — a SEPARATE file from the
//       GEO workbook, so nothing new appears in the GEO one. Re-running setup()
//       is safe and never creates a second workbook.
//    4. Run  checkAccess()  -> prints, in plain English, whether it can read the
//       GEO tabs, how fresh they are, and which entity codes it found.
//    Thereafter: it rebuilds itself daily. Reopen the workbook for the menu.
// ============================================================================
// ===========================================================================