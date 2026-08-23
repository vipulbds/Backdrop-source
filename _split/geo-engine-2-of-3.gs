/* geo-engine — FILE 2 OF 3.
   This module is split across 3 files ONLY to keep each paste small enough
   to transfer reliably. All 3 go in the SAME Apps Script project: every .gs
   file in a project shares one global scope, so the behaviour is identical to
   the single file. Paste all 3 before running anything — until they are all
   present the project is genuinely incomplete and functions will be missing.
   Lines 1211-2529 of the original.
*/
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