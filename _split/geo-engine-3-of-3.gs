/* geo-engine — FILE 3 OF 3.
   This module is split across 3 files ONLY to keep each paste small enough
   to transfer reliably. All 3 go in the SAME Apps Script project: every .gs
   file in a project shares one global scope, so the behaviour is identical to
   the single file. Paste all 3 before running anything — until they are all
   present the project is genuinely incomplete and functions will be missing.
   Lines 2530-3558 of the original.
*/
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