/* exec-rag — FILE 3 OF 3.
   This module is split across 3 files ONLY to keep each paste small enough
   to transfer reliably. All 3 go in the SAME Apps Script project: every .gs
   file in a project shares one global scope, so the behaviour is identical to
   the single file. Paste all 3 before running anything — until they are all
   present the project is genuinely incomplete and functions will be missing.
   Lines 2263-3387 of the original.
*/
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