/* exec-rag — FILE 2 OF 3.
   This module is split across 3 files ONLY to keep each paste small enough
   to transfer reliably. All 3 go in the SAME Apps Script project: every .gs
   file in a project shares one global scope, so the behaviour is identical to
   the single file. Paste all 3 before running anything — until they are all
   present the project is genuinely incomplete and functions will be missing.
   Lines 1139-2262 of the original.
*/
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