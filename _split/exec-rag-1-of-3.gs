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
