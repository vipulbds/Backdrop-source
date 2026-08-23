/**
 * ============================================================================
 *  BACKDROPSOURCE — DRAFT ORDER LIFECYCLE TRACKING  (Google Apps Script)
 * ============================================================================
 *  Captures the FULL life cycle of every draft order across all stores.
 *    Events_Log     — append-only trace: ONE row per REAL change (no-op/dup
 *                     webhooks are skipped); the Note column says what changed.
 *    Lifecycle      — one row per draft (current state + metrics).
 *    Monthly Report — the dashboard (buildDashboard), period-filterable.
 *
 *  RECOVERY: resetLifecycle() then the backfills rebuild cleanly from Shopify.
 *  Maintenance can be driven over HTTP: ?action=reset|backfill&store=XX|format
 *  (all token-guarded). Re-deploy a NEW VERSION after editing doPost/doGet.
 * ============================================================================
 */

var VERSION = 'bds-draft-lifecycle v26';

// Split-view cutoff: drafts created BEFORE this date go to the Historical tab, on/after to the Live tab.
var SPLIT_DATE = '2026-07-01';

var CONFIG = {
  SHEET_ID:     '1Y4_c3XySxTkNtlccJK7RmJ1U8EEUaxRuc67KJlBqvtc',
  SHARED_TOKEN: '818e37b3e52d413c89e9ab048e0253dfe23357f215794c2bb205adb5b3eb9e48',   // must match ?token=… in the webhook URLs
  WEBAPP_URL:   'https://script.google.com/macros/s/AKfycbzSlfbNI8js-0RacM2EtNno9cfqSJMUUKzmGV2Ze3AqagJBsnkjxEF-4uEpXzCQ9OTE/exec',   // used by registerAllWebhooks()
  API_VERSION:  '2025-10',
  TIMEZONE:     'America/Chicago',

  // One entry per store. Dev Dashboard app → Client ID + Client Secret (traded
  // for a 24h token via the client-credentials grant). Needs read_draft_orders.
  STORES: [
    { code: 'USA', domain: 'bdsus.myshopify.com',               clientId: 'PASTE_USA_CLIENT_ID', clientSecret: 'PASTE_USA_CLIENT_SECRET' },
    { code: 'UK',  domain: 'backdropsourceuk.myshopify.com',    clientId: 'PASTE_UK_CLIENT_ID',  clientSecret: 'PASTE_UK_CLIENT_SECRET' },
    { code: 'CA',  domain: 'backdropsource-v1-0.myshopify.com', clientId: 'PASTE_CA_CLIENT_ID',  clientSecret: 'PASTE_CA_CLIENT_SECRET' },
    { code: 'AU',  domain: 'mousestored.myshopify.com',         clientId: 'PASTE_AU_CLIENT_ID',  clientSecret: 'PASTE_AU_CLIENT_SECRET' },
    { code: 'NZ',  domain: 'backdropsourcenz.myshopify.com',    clientId: 'PASTE_NZ_CLIENT_ID',  clientSecret: 'PASTE_NZ_CLIENT_SECRET' },
    { code: 'IN',  domain: 'backdropsource-india.myshopify.com', clientId: 'PASTE_IN_CLIENT_ID',  clientSecret: 'PASTE_IN_CLIENT_SECRET' },
    { code: 'UAE', domain: 'backdropsourceuae.myshopify.com',    clientId: 'PASTE_UAE_CLIENT_ID', clientSecret: 'PASTE_UAE_CLIENT_SECRET' },
    { code: 'FR',  domain: 'backdropsourcefrance.myshopify.com', clientId: 'PASTE_FR_CLIENT_ID',  clientSecret: 'PASTE_FR_CLIENT_SECRET' },
    { code: 'ES',  domain: 'backdropsource-spain.myshopify.com', clientId: 'PASTE_ES_CLIENT_ID',  clientSecret: 'PASTE_ES_CLIENT_SECRET' },
    { code: 'DE',  domain: 'backdropsourcegermany.myshopify.com', clientId: 'PASTE_DE_CLIENT_ID',  clientSecret: 'PASTE_DE_CLIENT_SECRET' }
  ]
};

var EVENTS_HEADERS = [
  'Received At', 'Store', 'Topic', 'Draft ID', 'Draft Name', 'Status',
  'Created At', 'Invoice Sent At', 'Completed At',
  'Email', 'Customer', 'Total', 'Currency', 'Line Items', 'Note', 'Tags'
];

var LIFECYCLE_HEADERS = [
  'Store', 'Draft ID', 'Draft Name', 'Outcome', 'Status',
  'Created At', 'Invoice Sent At', 'Completed At', 'Deleted At',
  'Hrs to Invoice', 'Hrs to Convert', 'Conversion Days', 'Age Days', 'Events',
  'Email', 'Customer', 'Total', 'Currency', 'Line Items',
  'Order ID', 'Order Name',
  'First Seen', 'Last Update', 'Tags', 'Note'
];

/* ============================== WEB APP ================================== */

function doPost(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (String(p.token || '') !== String(CONFIG.SHARED_TOKEN)) {
    return jsonOut_({ ok: false, error: 'bad token' });
  }
  var body = {};
  try { if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents); }
  catch (err) { body = {}; }

  var store = String(p.store || 'XX').toUpperCase();
  var topic = String(p.topic || '').toLowerCase();
  try {
    if (topic === 'draft_delete') return handleDelete_(store, body);
    if (topic === 'draft_create' || topic === 'draft_update') return handleUpsert_(store, topic, body);
    return jsonOut_({ ok: false, error: 'unknown topic: ' + topic });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var authed = String(p.token || '') === String(CONFIG.SHARED_TOKEN);
  if (p.action === 'report') { buildDashboard(p.period || ''); return jsonOut_({ ok: true, built: 'Dashboard' }); }
  if (p.action === 'reset'    && authed) { resetLifecycle(); return jsonOut_({ ok: true, did: 'resetLifecycle' }); }
  if (p.action === 'backfill' && authed) { return jsonOut_({ ok: true, did: 'backfill', result: backfillDrafts(p.store) }); }
  if (p.action === 'format'   && authed) { try { formatLifecycle_(); } catch (e1) {} try { formatEventsLog_(); } catch (e2) {} return jsonOut_({ ok: true, did: 'format' }); }
  if (p.action === 'dedupe'   && authed) { return jsonOut_({ ok: true, did: 'dedupe', result: dedupeEventsLog() }); }
  if (p.action === 'recompute'&& authed) { return jsonOut_({ ok: true, did: 'recompute', result: recomputeLifecycleMetrics() }); }
  if (p.action === 'split'    && authed) { return jsonOut_({ ok: true, did: 'split', result: buildSplitViews() }); }
  if (p.action === 'diagnose' && authed) { diagnoseDoc(); return jsonOut_({ ok: true, did: 'diagnose', note: 'see Executions log' }); }
  if (p.action === 'valuebands'&& authed) { return jsonOut_({ ok: true, did: 'valuebands', result: buildValueBandReport() }); }
  if (p.action === 'diagconv' && authed) { diagnoseConversion(); return jsonOut_({ ok: true, did: 'diagconv', note: 'see Executions log' }); }
  if (p.action === 'sample'   && authed) { sampleConversions(p.store, Number(p.n) || 15); return jsonOut_({ ok: true, did: 'sample', note: 'see Executions log' }); }
  return jsonOut_({ ok: true, version: VERSION, message: 'Backdropsource draft-order lifecycle endpoint is live.' });
}

/* ========================= CREATE / UPDATE ============================== */
/* Records only REAL changes. A duplicate/no-op webhook is skipped so Events_Log
   is a clean trace; the Note column records exactly what changed each time. */
function handleUpsert_(store, topic, body) {
  var d = parseDraft_(body);

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) {}
  try {
    var sheet = getTab_('Lifecycle', LIFECYCLE_HEADERS);
    var loc = findRow_(sheet, store, d.id);
    var prev = loc ? rowObj_(sheet, loc.row, loc.col) : null;

    var changes = diffDraft_(prev, d);   // '' if nothing we track changed
    if (prev && !changes) {
      return jsonOut_({ ok: true, version: VERSION, draft: d.name, skipped: 'no change' });
    }

    logEvent_(store, topic, d, changes);          // Note column = what changed
    var row = mergeLifecycle_(prev, store, d, null);
    writeLifecycleRow_(sheet, loc, row);
    return jsonOut_({ ok: true, version: VERSION, draft: d.name, outcome: row['Outcome'], changes: changes });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ============================== DELETE ================================== */
/* Delete payload is only { id }. Recover full detail from the Lifecycle row or,
   if that lookup misses, from the last create/update in Events_Log. */
function handleDelete_(store, body) {
  var id = String((body && body.id) || '').replace(/^gid.*\//, '');
  if (!id) { logEvent_(store, 'draft_delete', { id: '', status: 'deleted' }, 'deleted (no id in payload)'); return jsonOut_({ ok: false, error: 'no id in delete payload' }); }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) {}
  try {
    var sheet = getTab_('Lifecycle', LIFECYCLE_HEADERS);
    var loc = findRow_(sheet, store, id);
    var prev = loc ? rowObj_(sheet, loc.row, loc.col) : null;
    if (prev && asDate_(prev['Deleted At'])) { return jsonOut_({ ok: true, version: VERSION, deleted: id, duplicate: true }); }  // skip duplicate delete webhook
    var deletedAt = new Date();

    var snap = (prev && prev['Draft Name']) ? prev : (findSnapFromEvents_(store, id) || prev || {});

    var d = {
      id: id,
      name: snap['Draft Name'] || '',
      status: snap['Status'] || 'deleted',
      email: snap['Email'] || '',
      customer: snap['Customer'] || '',
      total: (snap['Total'] != null && snap['Total'] !== '') ? snap['Total'] : '',
      currency: snap['Currency'] || '',
      lineItems: snap['Line Items'] || '',
      createdAt: snap['Created At'] || '',
      invoiceSentAt: snap['Invoice Sent At'] || '',
      completedAt: snap['Completed At'] || '',
      note: snap['Note'] || '',
      tags: addTag_(snap['Tags'], 'deleted')
    };

    logEvent_(store, 'draft_delete', d, 'deleted');
    var row = mergeLifecycle_(prev, store, d, deletedAt);
    writeLifecycleRow_(sheet, loc, row);
    return jsonOut_({ ok: true, version: VERSION, deleted: id, tracked: !!(prev || d.name), tags: d.tags });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* Recover a draft's last-known detail from Events_Log when the Lifecycle lookup misses. */
function findSnapFromEvents_(store, id) {
  var sh = getSpreadsheet_().getSheetByName('Events_Log');
  if (!sh || sh.getLastRow() < 2) return null;
  var last = sh.getLastRow(), width = sh.getLastColumn();
  var col = indexMap_(sh.getRange(1, 1, 1, width).getValues()[0]);
  if (col['Draft ID'] == null || col['Store'] == null) return null;
  var scan = Math.min(last - 1, 20000);
  var vals = sh.getRange(last - scan + 1, 1, scan, width).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    var r = vals[i];
    if (String(r[col['Store']]) !== String(store)) continue;
    if (String(r[col['Draft ID']]) !== String(id)) continue;
    if (String(r[col['Topic']] || '') === 'draft_delete') continue;
    function g(h) { return (col[h] != null) ? r[col[h]] : ''; }
    return {
      'Draft Name': g('Draft Name'), 'Status': g('Status'), 'Email': g('Email'), 'Customer': g('Customer'),
      'Total': g('Total'), 'Currency': g('Currency'), 'Line Items': g('Line Items'),
      'Created At': g('Created At'), 'Invoice Sent At': g('Invoice Sent At'), 'Completed At': g('Completed At'),
      'Note': g('Note'), 'Tags': g('Tags')
    };
  }
  return null;
}

/* ===================== NORMALISE THE PAYLOAD ============================ */
function parseDraft_(body) {
  var b = body || {};
  return {
    id:            String(b.id || '').replace(/^gid.*\//, ''),
    name:          b.name || '',
    status:        b.status || '',
    email:         b.email || (b.customer && b.customer.email) || '',
    customer:      customerName_(b),
    total:         (b.total_price != null ? b.total_price : (b.subtotal_price != null ? b.subtotal_price : '')),
    currency:      b.currency || (b.presentment_currency || ''),
    createdAt:     asDate_(b.created_at),
    invoiceSentAt: asDate_(b.invoice_sent_at),
    completedAt:   asDate_(b.completed_at),
    lineItems:     lineItemsSummary_(b.line_items),
    tags:          (typeof b.tags === 'string') ? b.tags : (Array.isArray(b.tags) ? b.tags.join(', ') : ''),
    note:          b.note || ''
  };
}

function customerName_(b) {
  var c = b.customer || {};
  var n = [c.first_name, c.last_name].filter(String).join(' ').trim();
  if (n) return n;
  var s = b.shipping_address || b.billing_address || {};
  return [s.first_name, s.last_name].filter(String).join(' ').trim() || (s.name || '');
}

function lineItemsSummary_(items) {
  if (!items || !items.length) return '';
  return items.map(function (li) {
    var t = li.title || li.name || 'item';
    if (li.variant_title && li.variant_title !== 'Default Title') t += ' / ' + li.variant_title;
    return t + ' ×' + (li.quantity || 1);
  }).join('; ');
}

/* Human-readable diff of a draft vs its last known Lifecycle row.
   Returns '' when nothing we track changed (→ caller skips the event). */
function diffDraft_(prev, d) {
  if (!prev) return 'created';
  var chg = [];
  [['status', 'Status'], ['email', 'Email'], ['customer', 'Customer'],
   ['lineItems', 'Line Items'], ['tags', 'Tags'], ['note', 'Note']].forEach(function (f) {
    var a = String(prev[f[1]] == null ? '' : prev[f[1]]).trim();
    var b = String(d[f[0]] == null ? '' : d[f[0]]).trim();
    if (a !== b) chg.push(f[0] + ': "' + a + '" → "' + b + '"');
  });
  var ot = Number(prev['Total']) || 0, nt = Number(d.total) || 0;
  if (ot !== nt) chg.push('total: ' + ot + ' → ' + nt);
  [['invoiceSentAt', 'Invoice Sent At', 'invoice sent'],
   ['completedAt', 'Completed At', 'completed']].forEach(function (f) {
    var a = fmtCmp_(prev[f[1]]), b = fmtCmp_(d[f[0]]);
    if (a !== b) chg.push(f[2] + ': ' + (a || '∅') + ' → ' + (b || '∅'));
  });
  return chg.join('; ');
}
function fmtCmp_(v) { var dt = asDate_(v); return dt ? Utilities.formatDate(dt, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm') : ''; }

/* ================= BUILD / MERGE THE LIFECYCLE ROW ===================== */
function mergeLifecycle_(prev, store, d, deletedAt) {
  prev = prev || {};
  function keep(nv, pk) { return (nv !== '' && nv != null) ? nv : (prev[pk] != null ? prev[pk] : ''); }

  var createdAt     = firstDate_(d.createdAt,     prev['Created At']);
  var invoiceSentAt = firstDate_(d.invoiceSentAt, prev['Invoice Sent At']);
  var completedAt   = firstDate_(d.completedAt,   prev['Completed At']);
  var delAt         = deletedAt || asDate_(prev['Deleted At']);

  var total    = keep(d.total, 'Total');
  var status   = keep(d.status, 'Status');
  var events   = (Number(prev['Events']) || 0) + 1;
  var firstSeen = prev['First Seen'] || new Date();

  var outcome =
      delAt        ? (createdAt ? 'Deleted' : 'Deleted (untracked)')
    : completedAt  ? 'Converted'
    : (invoiceSentAt || status === 'invoice_sent') ? 'Invoice Sent'
    : 'Open';

  var hrsToInvoice = hoursBetween_(createdAt, invoiceSentAt); if (hrsToInvoice !== '' && hrsToInvoice < 0) hrsToInvoice = '';  // completed/sent before created = bad data, ignore
  var hrsToConvert = hoursBetween_(createdAt, completedAt);   if (hrsToConvert !== '' && hrsToConvert < 0) hrsToConvert = '';
  var convDays     = (hrsToConvert !== '') ? Math.floor(hrsToConvert / 24) : '';   // whole days elapsed (floor, never rounded up)
  var end = completedAt || delAt || new Date();
  var ageDays = createdAt ? Math.max(0, Math.round((end - createdAt) / 86400000)) : '';

  var row = {};
  row['Store'] = store;
  row['Draft ID'] = d.id;
  row['Draft Name'] = keep(d.name, 'Draft Name');
  row['Outcome'] = outcome;
  row['Status'] = status;
  row['Email'] = keep(d.email, 'Email');
  row['Customer'] = keep(d.customer, 'Customer');
  row['Total'] = total;
  row['Currency'] = keep(d.currency, 'Currency');
  row['Line Items'] = keep(d.lineItems, 'Line Items');
  row['Created At'] = createdAt || '';
  row['Invoice Sent At'] = invoiceSentAt || '';
  row['Completed At'] = completedAt || '';
  row['Deleted At'] = delAt || '';
  row['Order ID'] = prev['Order ID'] || '';
  row['Order Name'] = prev['Order Name'] || '';
  row['Hrs to Invoice'] = (hrsToInvoice !== '') ? round2_(hrsToInvoice) : '';
  row['Hrs to Convert'] = (hrsToConvert !== '') ? round2_(hrsToConvert) : '';
  row['Conversion Days'] = convDays;
  row['Age Days'] = ageDays;
  row['Events'] = events;
  row['First Seen'] = firstSeen;
  row['Last Update'] = new Date();
  row['Tags'] = keep(d.tags, 'Tags');
  row['Note'] = keep(d.note, 'Note');
  return row;
}

/* ========================= EVENTS_LOG APPEND =========================== */
function logEvent_(store, topic, d, note) {
  var sheet = getTab_('Events_Log', EVENTS_HEADERS);
  appendByHeader_(sheet, {
    'Received At': new Date(),
    'Store': store,
    'Topic': topic,
    'Draft ID': d.id || '',
    'Draft Name': d.name || '',
    'Status': d.status || '',
    'Email': d.email || '',
    'Customer': d.customer || '',
    'Total': (d.total != null ? d.total : ''),
    'Currency': d.currency || '',
    'Created At': d.createdAt || '',
    'Invoice Sent At': d.invoiceSentAt || '',
    'Completed At': d.completedAt || '',
    'Line Items': d.lineItems || '',
    'Note': note || '',
    'Tags': d.tags || ''
  }, EVENTS_HEADERS);
}

/* ======================= LIFECYCLE ROW I/O ============================= */
function findRow_(sheet, store, id) {
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var width = sheet.getLastColumn();
  var col = indexMap_(sheet.getRange(1, 1, 1, width).getValues()[0]);
  var vals = sheet.getRange(2, 1, last - 1, width).getValues();
  var sCol = col['Store'], iCol = col['Draft ID'];
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][sCol]) === String(store) && String(vals[i][iCol]) === String(id)) {
      return { row: i + 2, col: col };
    }
  }
  return null;
}

function rowObj_(sheet, rowNum, col) {
  var width = sheet.getLastColumn();
  var vals = sheet.getRange(rowNum, 1, 1, width).getValues()[0];
  var o = {};
  Object.keys(col).forEach(function (k) { o[k] = vals[col[k]]; });
  return o;
}

function writeLifecycleRow_(sheet, loc, row) {
  var hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var arr = objToRow_(row, hdr);   // write by the sheet's ACTUAL column order → reorder-proof
  if (loc) sheet.getRange(loc.row, 1, 1, arr.length).setValues([arr]);
  else sheet.appendRow(arr);
}
function objToRow_(obj, hdr) { return hdr.map(function (h) { var k = String(h).trim(); return (obj[k] !== undefined) ? obj[k] : ''; }); }

/* ========================= DASHBOARD ============================== */
var PERIODS = ['This Month', 'Last 3 Months', 'Last 6 Months', 'This Year', 'Last 12 Months', 'All Time'];
function monthStart_(y, m) { return new Date(y, m, 1); }
function periodRange_(label) {
  var now = new Date(), y = now.getFullYear(), m = now.getMonth();
  var from, to = monthStart_(y, m + 1);
  switch (label) {
    case 'Last 3 Months':  from = monthStart_(y, m - 2); break;
    case 'Last 6 Months':  from = monthStart_(y, m - 5); break;
    case 'This Year':      from = monthStart_(y, 0); to = monthStart_(y + 1, 0); break;
    case 'Last 12 Months': from = monthStart_(y, m - 11); break;
    case 'All Time':       from = new Date(2000, 0, 1); break;
    default:               from = monthStart_(y, m); break;
  }
  return { label: label, from: from, to: to };
}

function buildDashboard(periodLabel) {
  var ss = getSpreadsheet_();
  var life = ss.getSheetByName('Lifecycle');
  var rep = ss.getSheetByName('Monthly Report') || ss.insertSheet('Monthly Report');
  var props = PropertiesService.getDocumentProperties();

  if (!periodLabel) {
    var cur = (rep.getLastRow() >= 2) ? String(rep.getRange(2, 2).getValue() || '') : '';
    periodLabel = cur || props.getProperty('dashPeriod') || 'This Month';
  }
  if (PERIODS.indexOf(periodLabel) === -1) periodLabel = 'This Month';
  props.setProperty('dashPeriod', periodLabel);
  var pr = periodRange_(periodLabel), now = new Date(), NCOL = 11;

  clearSheet_(rep);

  rep.getRange(1, 1).setValue('DRAFT ORDER LIFECYCLE DASHBOARD');
  rep.getRange(1, 1, 1, NCOL).merge().setBackground(HEADER_BG).setFontColor('#FFFFFF')
     .setFontSize(18).setFontWeight('bold').setVerticalAlignment('middle').setHorizontalAlignment('center');
  rep.setRowHeight(1, 44);
  rep.getRange(2, 1).setValue('Period:').setFontWeight('bold').setHorizontalAlignment('right');
  rep.getRange(2, 2).setValue(periodLabel)
     .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PERIODS, true).setAllowInvalid(false).build())
     .setFontWeight('bold').setBackground('#FFF3CD').setHorizontalAlignment('center');
  var toShown = new Date(pr.to.getTime() - 86400000);
  rep.getRange(2, 3).setValue(Utilities.formatDate(pr.from, CONFIG.TIMEZONE, 'yyyy-MM-dd') + '  →  ' +
     Utilities.formatDate(toShown, CONFIG.TIMEZONE, 'yyyy-MM-dd')).setFontColor('#5F6368');
  rep.getRange(2, 8).setValue('Generated ' + Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm'))
     .setFontColor('#9AA0A6').setFontStyle('italic').setHorizontalAlignment('right');
  rep.getRange(2, 8, 1, NCOL - 7).merge();

  if (!life || life.getLastRow() < 2) { rep.getRange(4, 1).setValue('No draft data in this period.'); try { rep.setHiddenGridlines(true); } catch (e) {} return; }

  var vals = life.getDataRange().getValues();
  var c = indexMap_(vals[0]);
  var all = newBucket_(), byStore = {}, order = [], byMonth = {}, months = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    var created = asDate_(r[c['Created At']]);
    if (!created || created < pr.from || created >= pr.to) continue;
    var s = String(r[c['Store']] || 'XX');
    if (!byStore[s]) { byStore[s] = newBucket_(); order.push(s); }
    var mk = Utilities.formatDate(created, CONFIG.TIMEZONE, 'yyyy-MM');
    if (!byMonth[mk]) { byMonth[mk] = newBucket_(); months.push(mk); }
    tally_(all, r, c, now);
    tally_(byStore[s], r, c, now);
    tally_(byMonth[mk], r, c, now);
  }
  CONFIG.STORES.forEach(function (s) { var code = String(s.code || '').toUpperCase(); if (code && !byStore[code]) { byStore[code] = newBucket_(); order.push(code); } });
  order.sort(); months.sort();

  rep.getRange(4, 1).setValue('KEY NUMBERS — ' + periodLabel.toUpperCase() + ' (all stores)');
  rep.getRange(4, 1, 1, NCOL).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  var kpis = [
    ['Drafts Created', all.created, '0', '#EAF1FB'],
    ['Converted', all.converted, '0', '#E4F5E9'],
    ['Conversion Rate', (all.created ? all.converted / all.created : 0), '0.0%', '#E4F5E9'],
    ['Avg Conversion Days', avgConvDays_(all.convHrs), '#,##0', '#FEF7E0'],   // whole days (floor of avg hours ÷ 24)
    ['Deleted', all.deleted, '0', '#FBE4E7'],
    ['Value Converted', round2_(all.valConverted), '#,##0', '#E4F5E9']
  ];
  for (var k = 0; k < kpis.length; k++) {
    rep.getRange(5, k + 1).setValue(kpis[k][0]).setFontWeight('bold').setBackground('#F1F3F4')
       .setHorizontalAlignment('center').setWrap(true).setFontSize(9).setFontColor('#5F6368');
    rep.getRange(6, k + 1).setValue(kpis[k][1]).setFontSize(16).setFontWeight('bold')
       .setHorizontalAlignment('center').setBackground(kpis[k][3]).setNumberFormat(kpis[k][2]);
  }
  rep.setRowHeight(6, 34);

  rep.getRange(8, 1).setValue('BY COUNTRY');
  rep.getRange(8, 1, 1, NCOL).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  var mHead = ['Country', 'Created', 'Converted', 'Deleted', 'Open', 'Invoice Sent',
               'Conv Rate', 'Avg Conv Days', 'Value Created', 'Value Converted', 'Value Lost'];
  var mStart = 9;
  rep.getRange(mStart, 1, 1, mHead.length).setValues([mHead])
     .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  var mRows = order.map(function (s) {
    var b = byStore[s];
    return [s, b.created, b.converted, b.deleted, b.open, b.invoiceSent,
      (b.created ? b.converted / b.created : 0), avgConvDays_(b.convHrs),
      round2_(b.valCreated), round2_(b.valConverted), round2_(b.valLost)];
  });
  var afterMatrix = mStart;
  if (mRows.length) {
    rep.getRange(mStart + 1, 1, mRows.length, mHead.length).setValues(mRows)
       .setHorizontalAlignment('center').setVerticalAlignment('middle');
    afterMatrix = mStart + mRows.length;
    rep.getRange(mStart + 1, 7, mRows.length, 1).setNumberFormat('0.0%');
    rep.getRange(mStart + 1, 8, mRows.length, 1).setNumberFormat('#,##0');   // Avg Conv Days: whole days (floor)
    rep.getRange(mStart + 1, 9, mRows.length, 3).setNumberFormat('#,##0');
    applyBanding_(rep, mStart + 1, 1, mRows.length, mHead.length);
    rep.getRange(mStart + 1, 1, mRows.length, 1)
       .setBackgrounds(order.map(function (s) { return [countryBg_(s)]; })).setFontWeight('bold');
  }

  var trendStart = 0, tCount = 0;
  if (months.length > 1) {
    var thr = afterMatrix + 2;
    rep.getRange(thr, 1).setValue('BY MONTH (TREND)');
    rep.getRange(thr, 1, 1, NCOL).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
    trendStart = thr + 1;
    rep.getRange(trendStart, 1, 1, 5).setValues([['Month', 'Created', 'Converted', 'Deleted', 'Conv Rate']])
       .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    var tRows = months.map(function (mk) { var b = byMonth[mk]; return [mk, b.created, b.converted, b.deleted, (b.created ? b.converted / b.created : 0)]; });
    tCount = tRows.length;
    rep.getRange(trendStart + 1, 1, tCount, 5).setValues(tRows)
       .setHorizontalAlignment('center').setVerticalAlignment('middle');
    rep.getRange(trendStart + 1, 5, tCount, 1).setNumberFormat('0.0%');
    applyBanding_(rep, trendStart + 1, 1, tCount, 5);
    afterMatrix = trendStart + tCount;
  }

  var oRow = afterMatrix + 2;
  rep.getRange(oRow, 1, 1, 2).setValues([['Outcome', 'Count']]).setFontWeight('bold').setBackground('#E8EEF7').setHorizontalAlignment('center');
  rep.getRange(oRow + 1, 1, 3, 2).setValues([['Converted', all.converted], ['Open', all.open], ['Deleted', all.deleted]]).setHorizontalAlignment('center');
  rep.getRange(oRow, 4, 1, 2).setValues([['Funnel Stage', 'Count']]).setFontWeight('bold').setBackground('#E8EEF7').setHorizontalAlignment('center');
  rep.getRange(oRow + 1, 4, 3, 2).setValues([['Created', all.created], ['Invoice Sent', all.invoiceSent], ['Converted', all.converted]]).setHorizontalAlignment('center');

  var chartRow = oRow + 6;
  if (mRows.length) {
    addColChart_(rep, 'Draft outcomes by country',
      [rep.getRange(mStart, 1, mRows.length + 1, 1), rep.getRange(mStart, 2, mRows.length + 1, 4)],
      chartRow, 1, ['#9AA0A6', '#34A853', '#EA4335', '#4285F4']);
    addColChart_(rep, 'Avg conversion days by country',
      [rep.getRange(mStart, 1, mRows.length + 1, 1), rep.getRange(mStart, 8, mRows.length + 1, 1)],
      chartRow, 7, ['#F09300']);
    addColChart_(rep, 'Value: created vs converted vs lost, by country',
      [rep.getRange(mStart, 1, mRows.length + 1, 1), rep.getRange(mStart, 9, mRows.length + 1, 3)],
      chartRow + 18, 1, ['#9AA0A6', '#34A853', '#EA4335']);
  }
  addPieChart_(rep, 'Outcome split (' + periodLabel + ')', rep.getRange(oRow, 1, 4, 2), chartRow + 18, 7, ['#34A853', '#4285F4', '#EA4335']);
  if (months.length > 1) {
    addLineChart_(rep, 'Monthly trend: created vs converted vs deleted',
      [rep.getRange(trendStart, 1, tCount + 1, 4)], chartRow + 36, 1, ['#9AA0A6', '#34A853', '#EA4335']);
  }

  rep.setColumnWidth(1, 130);
  for (var w = 2; w <= NCOL; w++) rep.setColumnWidth(w, 96);
  var noteRow = chartRow + (months.length > 1 ? 55 : 37);
  rep.getRange(noteRow, 1).setValue('Conversion = draft completed → order. Value columns are each store’s local currency (cross-store totals nominal). Deleted drafts from before webhook go-live are not recoverable.')
     .setFontColor('#9AA0A6').setFontStyle('italic').setFontSize(9);
  rep.getRange(noteRow, 1, 1, NCOL).merge().setWrap(true);
  try { rep.setHiddenGridlines(true); } catch (e) {}
}

function newBucket_() {
  return { created: 0, converted: 0, deleted: 0, open: 0, invoiceSent: 0,
           stale7: 0, stale14: 0, stale30: 0, convDays: [], convHrs: [], openAges: [],
           valCreated: 0, valConverted: 0, valLost: 0, valOpen: 0 };
}

function tally_(b, r, c, now) {
  b.created++;
  var outcome = String(r[c['Outcome']] || '');
  var total = Number(r[c['Total']]) || 0;
  b.valCreated += total;
  var reachedInvoice = r[c['Invoice Sent At']] || outcome === 'Invoice Sent' || outcome === 'Converted';
  if (reachedInvoice) b.invoiceSent++;
  if (outcome === 'Converted') {
    b.converted++; b.valConverted += total;
    var ch = Number(r[c['Hrs to Convert']]); if (!isNaN(ch) && ch >= 0) b.convHrs.push(ch);  // avg from hours; ignore impossible negatives
  } else if (outcome.indexOf('Deleted') === 0) {
    b.deleted++; b.valLost += total;
  } else {
    b.open++; b.valOpen += total;
    var created = asDate_(r[c['Created At']]);
    if (created) {
      var age = (now - created) / 86400000;
      b.openAges.push(age);
      if (age > 7) b.stale7++;
      if (age > 14) b.stale14++;
      if (age > 30) b.stale30++;
    }
  }
}

/* ===================== MAINTENANCE (time trigger) ====================== */
function runLifecycleMaintenance() {
  try { reageOpenDrafts_(); } catch (e) { Logger.log('reage: ' + e); }
  try { formatLifecycle_(); } catch (e) { Logger.log('formatLifecycle: ' + e); }
  try { formatEventsLog_(); } catch (e) { Logger.log('formatEvents: ' + e); }
  try { buildDashboard(); } catch (e) { Logger.log('report: ' + e); }
}

/* ============= DASHBOARD MENU + PERIOD FILTER TRIGGERS ================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📊 Draft Dashboard')
    .addItem('This Month', 'dashThisMonth')
    .addItem('Last 3 Months', 'dashLast3')
    .addItem('Last 6 Months', 'dashLast6')
    .addItem('This Year', 'dashThisYear')
    .addItem('Last 12 Months', 'dashLast12')
    .addItem('All Time', 'dashAllTime')
    .addSeparator()
    .addItem('↻ Refresh current view', 'dashRefresh')
    .addItem('💵 Value-band analysis', 'buildValueBandReport')
    .addToUi();
}
function dashThisMonth() { buildDashboard('This Month'); }
function dashLast3() { buildDashboard('Last 3 Months'); }
function dashLast6() { buildDashboard('Last 6 Months'); }
function dashThisYear() { buildDashboard('This Year'); }
function dashLast12() { buildDashboard('Last 12 Months'); }
function dashAllTime() { buildDashboard('All Time'); }
function dashRefresh() { buildDashboard(); }

function setupDashboard() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'onDashboardEdit' || fn === 'runLifecycleMaintenance') ScriptApp.deleteTrigger(t);
  });
  var ss = getSpreadsheet_();
  ScriptApp.newTrigger('onDashboardEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('runLifecycleMaintenance').timeBased().everyMinutes(15).create();
  Logger.log('Setup complete: Period dropdown is live + 15-min auto-refresh installed.');
}
function onDashboardEdit(e) {
  try {
    var rng = e.range;
    if (rng.getSheet().getName() !== 'Monthly Report') return;
    if (rng.getRow() === 2 && rng.getColumn() === 2) buildDashboard(String(rng.getValue() || ''));
  } catch (err) { Logger.log('onEdit: ' + err); }
}

function reageOpenDrafts_() {
  var sheet = getSpreadsheet_().getSheetByName('Lifecycle');
  if (!sheet || sheet.getLastRow() < 2) return;
  var vals = sheet.getDataRange().getValues();
  var c = indexMap_(vals[0]);
  var now = new Date();
  var ageCol = c['Age Days'] + 1;
  for (var i = 1; i < vals.length; i++) {
    var outcome = String(vals[i][c['Outcome']] || '');
    if (outcome === 'Open' || outcome === 'Invoice Sent') {
      var created = asDate_(vals[i][c['Created At']]);
      if (created) sheet.getRange(i + 1, ageCol).setValue(Math.round((now - created) / 86400000));
    }
  }
}

/* ============== OPTIONAL: enrich converted drafts with order # ========= */
function enrichOrderNumbers_() {
  if (!CONFIG.STORES.length) { Logger.log('No STORES configured.'); return; }
  var byCode = {}; CONFIG.STORES.forEach(function (s) { byCode[s.code] = s; });
  var sheet = getSpreadsheet_().getSheetByName('Lifecycle');
  if (!sheet || sheet.getLastRow() < 2) return;
  var vals = sheet.getDataRange().getValues();
  var c = indexMap_(vals[0]);
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][c['Outcome']]) !== 'Converted') continue;
    if (String(vals[i][c['Order Name']] || '')) continue;
    var st = byCode[String(vals[i][c['Store']])]; if (!st) continue;
    var id = String(vals[i][c['Draft ID']]);
    var q = 'query($id:ID!){draftOrder(id:$id){order{id name}}}';
    var res = shopifyGraphQL_(st, q, { id: 'gid://shopify/DraftOrder/' + id });
    var o = res && res.data && res.data.draftOrder && res.data.draftOrder.order;
    if (o) {
      sheet.getRange(i + 1, c['Order ID'] + 1).setValue(String(o.id).replace(/^gid.*\//, ''));
      sheet.getRange(i + 1, c['Order Name'] + 1).setValue(o.name || '');
    }
    Utilities.sleep(300);
  }
}

/* ================= HISTORICAL BACKFILL (last ~2 years) ================= */
function backfillAll() { CONFIG.STORES.forEach(function (s) { backfillDrafts(s.code); }); }
function backfillNZ()  { backfillDrafts('NZ');  }
function backfillUSA() { backfillDrafts('USA'); }
function backfillUK()  { backfillDrafts('UK');  }
function backfillCA()  { backfillDrafts('CA');  }
function backfillAU()  { backfillDrafts('AU');  }
function backfillIN()  { backfillDrafts('IN');  }
function backfillUAE() { backfillDrafts('UAE'); }
function backfillFR()  { backfillDrafts('FR');  }
function backfillES()  { backfillDrafts('ES');  }
function backfillDE()  { backfillDrafts('DE');  }

function backfillDrafts(storeCode, monthsBack) {
  if (!storeCode) { backfillAll(); return { status: 'all' }; }
  var st = storeByCode_(storeCode);
  if (!st) { Logger.log('Unknown store: ' + storeCode); return { status: 'error', msg: 'unknown store ' + storeCode }; }
  monthsBack = monthsBack || 24;
  var d = new Date();
  var since = Utilities.formatDate(new Date(d.getFullYear(), d.getMonth() - monthsBack, d.getDate()), 'UTC', 'yyyy-MM-dd');

  var sheet = getTab_('Lifecycle', LIFECYCLE_HEADERS);
  var hdr = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = indexMap_(hdr);
  var keys = existingKeys_(sheet, col);
  var props = PropertiesService.getDocumentProperties(), pkey = 'backfill_' + st.code;
  var cursor = props.getProperty(pkey) || null;

  var q = 'query($cursor:String,$q:String){draftOrders(first:50, after:$cursor, query:$q){' +
          'pageInfo{hasNextPage endCursor} edges{node{ id name status createdAt invoiceSentAt completedAt email tags note2 ' +
          'totalPriceSet{shopMoney{amount currencyCode}} customer{firstName lastName} ' +
          'lineItems(first:5){edges{node{title quantity}}} order{id name} }}}}';

  var t0 = new Date().getTime(), added = 0, seen = 0;
  while (true) {
    var res = shopifyGraphQL_(st, q, { cursor: cursor, q: 'created_at:>=' + since });
    var conn = res && res.data && res.data.draftOrders;
    if (!conn) { Logger.log(st.code + ' backfill API error: ' + JSON.stringify(res).slice(0, 400)); return { status: 'error', store: st.code, msg: JSON.stringify(res).slice(0, 200) }; }
    var newRows = [];
    conn.edges.forEach(function (e) {
      seen++;
      var dd = nodeToDraft_(e.node);
      if (!dd.id) return;
      var key = st.code + '|' + dd.id;
      if (keys[key]) return;
      keys[key] = 1;
      newRows.push(objToRow_(historicalRow_(st.code, dd), hdr));
    });
    if (newRows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, hdr.length).setValues(newRows);
      added += newRows.length;
    }
    if (conn.pageInfo && conn.pageInfo.hasNextPage) {
      cursor = conn.pageInfo.endCursor;
      props.setProperty(pkey, cursor);
      if (new Date().getTime() - t0 > 300000) {
        Logger.log(st.code + ': paused — added ' + added + ' (' + seen + ' seen).');
        return { status: 'paused', store: st.code, added: added, seen: seen };
      }
      Utilities.sleep(400);
    } else {
      props.deleteProperty(pkey);
      Logger.log(st.code + ': backfill COMPLETE — added ' + added + ' new (' + seen + ' seen).');
      return { status: 'complete', store: st.code, added: added, seen: seen };
    }
  }
}

function nodeToDraft_(node) {
  var cust = node.customer || {};
  var money = node.totalPriceSet && node.totalPriceSet.shopMoney;
  var li = ((node.lineItems && node.lineItems.edges) || []).map(function (e) {
    var x = e.node; return (x.title || 'item') + ' ×' + (x.quantity || 1);
  }).join('; ');
  return {
    id: String(node.id || '').replace(/^gid.*\//, ''),
    name: node.name || '',
    status: String(node.status || '').toLowerCase(),
    email: node.email || '',
    customer: [cust.firstName, cust.lastName].filter(String).join(' ').trim(),
    total: money ? Number(money.amount) : '',
    currency: money ? money.currencyCode : '',
    createdAt: asDate_(node.createdAt),
    invoiceSentAt: asDate_(node.invoiceSentAt),
    completedAt: asDate_(node.completedAt),
    lineItems: li,
    tags: (node.tags && node.tags.length) ? node.tags.join(', ') : '',
    note: node.note2 || '',
    orderId: node.order ? String(node.order.id || '').replace(/^gid.*\//, '') : '',
    orderName: node.order ? (node.order.name || '') : ''
  };
}

function historicalRow_(store, d) {
  var row = mergeLifecycle_(null, store, d, null);
  if (d.orderName) { row['Order ID'] = d.orderId; row['Order Name'] = d.orderName; }
  return row;
}

function existingKeys_(sheet, col) {
  var keys = {}, last = sheet.getLastRow();
  if (last < 2) return keys;
  var vals = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  var sc = col['Store'], ic = col['Draft ID'];
  vals.forEach(function (r) { keys[String(r[sc]) + '|' + String(r[ic])] = 1; });
  return keys;
}

function storeByCode_(code) {
  return CONFIG.STORES.filter(function (s) { return String(s.code).toUpperCase() === String(code).toUpperCase(); })[0];
}

/* ==================== WEBHOOK REGISTRATION (one-time) ==================== */
var WEBHOOK_TOPICS = [
  { enum: 'DRAFT_ORDERS_CREATE', slug: 'draft_create' },
  { enum: 'DRAFT_ORDERS_UPDATE', slug: 'draft_update' },
  { enum: 'DRAFT_ORDERS_DELETE', slug: 'draft_delete' }
];

function registerAllWebhooks() {
  if (!CONFIG.STORES.length) { Logger.log('Fill CONFIG.STORES first.'); return; }
  CONFIG.STORES.forEach(function (st) {
    var existing = existingWebhookUrls_(st);
    WEBHOOK_TOPICS.forEach(function (t) {
      var url = CONFIG.WEBAPP_URL + '?store=' + encodeURIComponent(st.code) +
                '&topic=' + t.slug + '&token=' + encodeURIComponent(CONFIG.SHARED_TOKEN);
      if (existing[t.enum] && existing[t.enum][url]) { Logger.log(st.code + ' ' + t.enum + ': already registered ✓ (skipped)'); return; }
      var q = 'mutation($topic:WebhookSubscriptionTopic!,$url:URL!){' +
              'webhookSubscriptionCreate(topic:$topic,webhookSubscription:{callbackUrl:$url,format:JSON}){' +
              'webhookSubscription{id} userErrors{field message}}}';
      var res = shopifyGraphQL_(st, q, { topic: t.enum, url: url });
      if (!res) { Logger.log(st.code + ' ' + t.enum + ': FAILED — no API response'); return; }
      var payload = res.data && res.data.webhookSubscriptionCreate;
      var errs = payload && payload.userErrors;
      if (errs && errs.length) Logger.log(st.code + ' ' + t.enum + ': ERROR ' + JSON.stringify(errs));
      else if (payload && payload.webhookSubscription && payload.webhookSubscription.id) Logger.log(st.code + ' ' + t.enum + ': OK ' + payload.webhookSubscription.id);
      else Logger.log(st.code + ' ' + t.enum + ': UNEXPECTED ' + JSON.stringify(res).slice(0, 200));
    });
  });
}

function existingWebhookUrls_(st) {
  var q = 'query{webhookSubscriptions(first:100){edges{node{topic endpoint{__typename ... on WebhookHttpEndpoint{callbackUrl}}}}}}';
  var res = shopifyGraphQL_(st, q, {}), map = {};
  var edges = (res && res.data && res.data.webhookSubscriptions && res.data.webhookSubscriptions.edges) || [];
  edges.forEach(function (e) {
    var topic = e.node.topic, url = e.node.endpoint && e.node.endpoint.callbackUrl;
    if (topic && url) { (map[topic] = map[topic] || {})[url] = true; }
  });
  return map;
}

function showTokenScopes() {
  CONFIG.STORES.forEach(function (st) {
    if (st.token) { Logger.log(st.code + ': legacy static token'); return; }
    var resp = UrlFetchApp.fetch('https://' + st.domain + '/admin/oauth/access_token', {
      method: 'post',
      payload: { grant_type: 'client_credentials', client_id: st.clientId, client_secret: st.clientSecret },
      muteHttpExceptions: true
    });
    var b = {}; try { b = JSON.parse(resp.getContentText()); } catch (e) {}
    if (b.access_token) Logger.log(st.code + ' granted scopes: ' + (b.scope || '(none)'));
    else Logger.log(st.code + ' token error: ' + resp.getContentText().slice(0, 200));
  });
}

function listAllWebhooks() {
  CONFIG.STORES.forEach(function (st) {
    var q = 'query{webhookSubscriptions(first:50){edges{node{id topic endpoint{__typename ... on WebhookHttpEndpoint{callbackUrl}}}}}}';
    var res = shopifyGraphQL_(st, q, {});
    Logger.log(st.code + ': ' + JSON.stringify(res && res.data));
  });
}

function deleteOurWebhooks_() {
  CONFIG.STORES.forEach(function (st) {
    var q = 'query{webhookSubscriptions(first:100){edges{node{id endpoint{__typename ... on WebhookHttpEndpoint{callbackUrl}}}}}}';
    var res = shopifyGraphQL_(st, q, {});
    var edges = (res && res.data && res.data.webhookSubscriptions && res.data.webhookSubscriptions.edges) || [];
    edges.forEach(function (e) {
      var url = e.node.endpoint && e.node.endpoint.callbackUrl;
      if (url && url.indexOf(CONFIG.WEBAPP_URL) === 0) {
        var m = 'mutation($id:ID!){webhookSubscriptionDelete(id:$id){deletedWebhookSubscriptionId userErrors{message}}}';
        shopifyGraphQL_(st, m, { id: e.node.id });
        Logger.log(st.code + ' deleted ' + e.node.id);
      }
    });
  });
}

/* Client-credentials grant → 24h token, memoised per execution. */
var _tokenCache = {};
function getAccessToken_(st) {
  if (_tokenCache[st.code]) return _tokenCache[st.code];
  if (st.token) return (_tokenCache[st.code] = st.token);
  var resp = UrlFetchApp.fetch('https://' + st.domain + '/admin/oauth/access_token', {
    method: 'post',
    payload: { grant_type: 'client_credentials', client_id: st.clientId, client_secret: st.clientSecret },
    muteHttpExceptions: true
  });
  var txt = resp.getContentText(), body = {};
  try { body = JSON.parse(txt); } catch (e) {}
  if (!body.access_token) {
    var hint = /shop-404|Store unavailable/i.test(txt) ? ' → store not found: check the .myshopify.com domain'
             : /invalid_client|Unauthorized|401/i.test(txt) ? ' → bad clientId/clientSecret, or app not installed' : '';
    Logger.log(st.code + ' token error (HTTP ' + resp.getResponseCode() + ')' + hint + ': ' + txt.slice(0, 200));
    return null;
  }
  return (_tokenCache[st.code] = body.access_token);
}

function shopifyGraphQL_(st, query, variables) {
  var token = getAccessToken_(st);
  if (!token) return null;
  var resp = UrlFetchApp.fetch('https://' + st.domain + '/admin/api/' + CONFIG.API_VERSION + '/graphql.json', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Shopify-Access-Token': token },
    payload: JSON.stringify({ query: query, variables: variables || {} }),
    muteHttpExceptions: true
  });
  try { return JSON.parse(resp.getContentText()); }
  catch (e) { Logger.log(st.code + ' non-JSON: ' + resp.getContentText().slice(0, 300)); return null; }
}

/* ========================= SHEET FORMATTING ============================ */
var HEADER_BG = '#1B2D55', HEADER_FG = '#FFFFFF';
var OUTCOME_COLORS = {
  'Open': '#F1F3F4', 'Invoice Sent': '#FEF7E0', 'Converted': '#CDEBD3',
  'Deleted': '#FADCE4', 'Deleted (untracked)': '#F6DBC9'
};
var TOPIC_COLORS = { 'draft_create': '#D6EEDC', 'draft_update': '#FEF3CD', 'draft_delete': '#FADBD8' };
var COUNTRY_BG = {
  USA:'#D6E4F7', US:'#D6E4F7', CA:'#FADBD8', UK:'#E8D9FB', GB:'#E8D9FB',
  AU:'#D6EEDC', IN:'#FDE3CC', IND:'#FDE3CC', DE:'#CFEDEA', FR:'#E3F0D4', NZ:'#FCE9C9',
  IE:'#D9DEF5', SG:'#F8D9E6', AE:'#E4D7CF', UAE:'#E4D7CF', ES:'#F0D9EC'
};
var COUNTRY_BG_PALETTE = ['#D6E4F7','#FADBD8','#E8D9FB','#D6EEDC','#FDE3CC','#CFEDEA','#E3F0D4','#FCE9C9','#D9DEF5','#F8D9E6','#E4D7CF'];
function countryBg_(code) {
  code = String(code || '').toUpperCase();
  if (COUNTRY_BG[code]) return COUNTRY_BG[code];
  var h = 0; for (var i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return COUNTRY_BG_PALETTE[h % COUNTRY_BG_PALETTE.length];
}

/* ONE-TIME: collapse duplicate / no-change rows already in Events_Log. For each
   draft (in time order) it keeps the first row of each distinct STATE and drops
   consecutive identical ones (Shopify's re-sent / no-op webhooks). Real state
   transitions — and duplicate deletes — are handled correctly. */
function dedupeEventsLog() {
  var sh = getSpreadsheet_().getSheetByName('Events_Log');
  if (!sh || sh.getLastRow() < 3) { Logger.log('Events_Log: nothing to dedupe.'); return { kept: 0, dropped: 0 }; }
  var vals = sh.getDataRange().getValues();
  var hdr = vals[0], col = indexMap_(hdr);
  var sigCols = ['Store', 'Draft ID', 'Status', 'Created At', 'Invoice Sent At', 'Completed At',
                 'Total', 'Currency', 'Line Items', 'Email', 'Customer', 'Tags'];
  var lastSig = {}, out = [hdr], dropped = 0;
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    var dk = String(r[col['Store']]) + '|' + String(r[col['Draft ID']]);
    var sig = sigCols.map(function (cn) { var v = (col[cn] != null) ? r[col[cn]] : ''; return (v instanceof Date) ? v.getTime() : String(v == null ? '' : v); }).join('¦');
    if (lastSig[dk] === sig) { dropped++; continue; }   // identical to previous kept row for this draft → drop
    lastSig[dk] = sig;
    out.push(r);
  }
  sh.clearContents();
  sh.getRange(1, 1, out.length, hdr.length).setValues(out);
  try { formatEventsLog_(); } catch (e) {}
  Logger.log('dedupeEventsLog: kept ' + (out.length - 1) + ', dropped ' + dropped + '.');
  return { kept: out.length - 1, dropped: dropped };
}

/* MAINTENANCE: re-derive Hrs to Invoice / Hrs to Convert / Conversion Days / Age Days
   from each row's existing date columns, applying the negative-value guards. Fixes bad
   values (e.g. AU's negative avg) in place — no Shopify calls, no re-backfill. */
function recomputeLifecycleMetrics() {
  var sh = getSpreadsheet_().getSheetByName('Lifecycle');
  if (!sh || sh.getLastRow() < 2) return { updated: 0 };
  var rng = sh.getDataRange(), vals = rng.getValues(), col = indexMap_(vals[0]);
  var now = new Date(), fixed = 0;
  var iCr = col['Created At'], iInv = col['Invoice Sent At'], iComp = col['Completed At'], iDel = col['Deleted At'];
  var iHi = col['Hrs to Invoice'], iHc = col['Hrs to Convert'], iCd = col['Conversion Days'], iAge = col['Age Days'];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    var cr = asDate_(r[iCr]), inv = asDate_(r[iInv]), comp = asDate_(r[iComp]), del = asDate_(r[iDel]);
    var hi = hoursBetween_(cr, inv); if (hi !== '' && hi < 0) hi = '';
    var hc = hoursBetween_(cr, comp); if (hc !== '' && hc < 0) hc = '';
    var cd = (hc !== '') ? Math.floor(hc / 24) : '';   // whole days elapsed (floor)
    var end = comp || del || now;
    var age = cr ? Math.max(0, Math.round((end - cr) / 86400000)) : '';
    if (r[iHi] !== (hi !== '' ? round2_(hi) : '') || r[iHc] !== (hc !== '' ? round2_(hc) : '') ||
        r[iCd] !== cd || r[iAge] !== age) fixed++;
    r[iHi] = (hi !== '') ? round2_(hi) : '';
    r[iHc] = (hc !== '') ? round2_(hc) : '';
    r[iCd] = cd;
    r[iAge] = age;
  }
  rng.setValues(vals);
  try { formatLifecycle_(); } catch (e) {}
  Logger.log('recomputeLifecycleMetrics: scanned ' + (vals.length - 1) + ', changed ' + fixed + '.');
  return { scanned: vals.length - 1, changed: fixed };
}

/* ================= VALUE-BAND CONVERSION ANALYSIS (own tab) =============
   Avg Hrs to Convert (converted drafts only; hrs > 0, so blank/0 are excluded) sliced by
   ORDER VALUE in USD and by period (2025 and 2026-YTD), per country + ALL. Order totals are
   converted local→USD via FX_TO_USD — EDIT those to your booked rates. Built by script because
   a live =QUERY can't convert currencies. Run buildValueBandReport() (or ?action=valuebands). */
var FX_TO_USD = {   // local currency → USD — EDIT to your actual rates
  USD: 1, GBP: 1.27, CAD: 0.73, AUD: 0.66, NZD: 0.60, INR: 0.012, AED: 0.272, EUR: 1.08
};
var STORE_CCY = { USA: 'USD', UK: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', IN: 'INR', UAE: 'AED' };
// Minimum conversion time (days) to include in the Value Band report. 0 = include ALL orders that
// completed the cycle (draft → order), 0 days and up. Set to e.g. 3 to exclude quick 0–2 day conversions.
var MIN_CONVERT_DAYS = 0;
var VALUE_BANDS = [
  { label: '< $1,000',        test: function (u) { return u < 1000; } },
  { label: '$1,000–$3,000',   test: function (u) { return u >= 1000 && u <= 3000; } },
  { label: '$3,001–$5,000',   test: function (u) { return u > 3000 && u <= 5000; } },
  { label: '$5,001–$10,000',  test: function (u) { return u > 5000 && u <= 10000; } },
  { label: '$10,001–$15,000', test: function (u) { return u > 10000 && u <= 15000; } },
  { label: '$15,001–$25,000', test: function (u) { return u > 15000 && u <= 25000; } },
  { label: '$25,001+',        test: function (u) { return u > 25000; } }
];
function usdTotal_(total, ccy, store) {
  var n = Number(total); if (isNaN(n)) return null;
  var code = String(ccy || STORE_CCY[store] || '').toUpperCase();
  var rate = (FX_TO_USD[code] != null) ? FX_TO_USD[code] : FX_TO_USD[STORE_CCY[store]];
  if (rate == null) rate = 1;
  return n * rate;
}
function bandIndex_(usd) { for (var i = 0; i < VALUE_BANDS.length; i++) if (VALUE_BANDS[i].test(usd)) return i; return -1; }

function buildValueBandReport() {
  var ss = getSpreadsheet_(), life = ss.getSheetByName('Lifecycle');
  if (!life || life.getLastRow() < 2) return { error: 'no Lifecycle data' };
  var vals = life.getDataRange().getValues(), c = indexMap_(vals[0]);
  var iStore = c['Store'], iCr = c['Created At'], iHc = c['Hrs to Convert'], iTot = c['Total'], iCcy = c['Currency'], iOut = c['Outcome'];

  var periods = [
    { key: '2025', label: '2025',       from: new Date(2025, 0, 1).getTime(), to: new Date(2026, 0, 1).getTime() },
    { key: '2026', label: '2026 (YTD)', from: new Date(2026, 0, 1).getTime(), to: new Date(2100, 0, 1).getTime() }
  ];
  var acc = { '2025': {}, '2026': {} };                 // per band
  var ov  = { '2025': {}, '2026': {} };                 // overall (all bands combined)
  var cust = { '2025': {}, '2026': {} };                // custom orders only ($3,000+ USD)
  function cell(pk, st, bi) { (acc[pk][st] = acc[pk][st] || [])[bi] = acc[pk][st][bi] || { sum: 0, n: 0 }; return acc[pk][st][bi]; }
  function ovc(pk, st) { return ov[pk][st] || (ov[pk][st] = []); }     // keep all hrs values → mean + median
  function custc(pk, st) { return cust[pk][st] || (cust[pk][st] = []); }
  var consideredN = 0, excludedN = 0, quickN = 0;       // data-completeness counters
  var minHrs = MIN_CONVERT_DAYS * 24;
  var filterDesc = (MIN_CONVERT_DAYS > 0)
    ? 'orders that took ' + MIN_CONVERT_DAYS + '+ days (quick 0–' + (MIN_CONVERT_DAYS - 1) + ' day conversions excluded)'
    : 'all completed orders (draft → order), 0 days and up';

  for (var r = 1; r < vals.length; r++) {
    var row = vals[r];
    if (String(row[iOut] || '') !== 'Converted') continue;            // must COMPLETE the cycle: draft → order (skip open / invoice-sent / deleted)
    var hcRaw = row[iHc], hc = Number(hcRaw);
    if (hcRaw === '' || hcRaw == null || isNaN(hc) || hc < 0) { excludedN++; continue; }   // converted but no valid conversion time
    if (minHrs > 0 && hc < minHrs) { quickN++; continue; }            // (only if MIN_CONVERT_DAYS > 0) drop quick conversions
    var created = asDate_(row[iCr]); if (!created) continue;
    var st = String(row[iStore] || 'XX').toUpperCase();
    var usd = usdTotal_(row[iTot], row[iCcy], st);
    if (usd == null) continue;
    var bi = bandIndex_(usd); if (bi < 0) continue;
    var t = created.getTime();
    for (var pI = 0; pI < periods.length; pI++) {
      var p = periods[pI];
      if (t >= p.from && t < p.to) {
        consideredN++;
        var a = cell(p.key, st, bi);    a.sum += hc; a.n++;
        var g = cell(p.key, 'All', bi); g.sum += hc; g.n++;
        ovc(p.key, st).push(hc);        // overall (all bands) — keep values for mean + median
        ovc(p.key, 'All').push(hc);
        if (bi >= 2) { custc(p.key, st).push(hc); custc(p.key, 'All').push(hc); }   // $3,000+ = custom/negotiated orders
      }
    }
  }

  var name = 'Value Band Analysis';
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clear();
  try { sh.getBandings().forEach(function (b) { b.remove(); }); } catch (e) {}
  try { sh.setConditionalFormatRules([]); } catch (e) {}

  var bands = VALUE_BANDS.map(function (v) { return v.label; }), NC = 1 + bands.length;
  sh.getRange(1, 1).setValue('VALUE-BAND CONVERSION — DAYS to convert  (' + filterDesc + ')');
  sh.getRange(1, 1, 1, NC).merge().setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 40);
  sh.getRange(2, 1).setValue('FX→USD: ' + Object.keys(FX_TO_USD).map(function (k) { return k + ' ' + FX_TO_USD[k]; }).join('  ·  ') + '   — edit FX_TO_USD (and MIN_CONVERT_DAYS) in the script')
    .setFontColor('#5F6368').setFontStyle('italic').setFontSize(9);
  sh.getRange(2, 1, 1, NC).merge();
  sh.getRange(3, 1).setValue('Counted — completed the cycle (draft → order): ' + consideredN +
    (MIN_CONVERT_DAYS > 0 ? '   ·   Excluded quick <' + MIN_CONVERT_DAYS + 'd: ' + quickN : '') +
    '   ·   converted but no valid conversion time: ' + excludedN +
    '   ·   BLANK = none in that band/period.')
    .setFontColor('#5F6368').setFontStyle('italic').setFontSize(9);
  sh.getRange(3, 1, 1, NC).merge();

  var stores = CONFIG.STORES.map(function (s) { return String(s.code).toUpperCase(); }).sort();
  var cur = 5;
  cur = writeOverallTable_(sh, cur, stores, cust, 'CUSTOM ORDERS ($3,000+) — DAYS TO CONVERT  (' + filterDesc + ')') + 3;
  cur = writeOverallTable_(sh, cur, stores, ov, 'OVERALL — DAYS TO CONVERT (all order values; ' + filterDesc + ')') + 3;
  periods.forEach(function (p) {
    cur = writeBandMatrix_(sh, cur, NC, p.label + ' — AVG DAYS TO CONVERT (order value in USD)', bands, stores, acc[p.key], 'avg') + 2;
    cur = writeBandMatrix_(sh, cur, NC, p.label + ' — CONVERTED DRAFTS (count)', bands, stores, acc[p.key], 'count') + 2;
  });

  sh.setColumnWidth(1, 90);
  for (var w = 2; w <= NC; w++) sh.setColumnWidth(w, 118);
  // no setFrozenColumns — rows 1–2 are merged full-width, and freezing a column would split the merge
  try { sh.setHiddenGridlines(true); } catch (e) {}
  Logger.log('buildValueBandReport → "' + name + '"');
  return { built: name, bands: bands.length };
}

/* One matrix: rows = countries + ALL, cols = value bands; cell = avg hrs (mode 'avg') or count.
   Returns the last data row written. */
function writeBandMatrix_(sh, startRow, NC, title, bands, stores, storeAcc, mode) {
  sh.getRange(startRow, 1).setValue(title);
  sh.getRange(startRow, 1, 1, NC).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center');
  var hr = startRow + 1;
  sh.getRange(hr, 1, 1, NC).setValues([['Country'].concat(bands)])
    .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  var order = stores.concat(['All']), rows = [], bg = [];
  order.forEach(function (st) {
    var line = [st === 'All' ? 'ALL' : st];
    for (var bi = 0; bi < bands.length; bi++) {
      var a = storeAcc[st] && storeAcc[st][bi];
      // 'avg' = average the HOURS, then convert to whole DAYS (floor); 'count' = number of drafts
      line.push((a && a.n > 0) ? (mode === 'avg' ? Math.floor((a.sum / a.n) / 24) : a.n) : '');
    }
    rows.push(line);
    bg.push([st === 'All' ? '#DCE3F0' : countryBg_(st)]);
  });
  sh.getRange(hr + 1, 1, rows.length, NC).setValues(rows).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(hr + 1, 1, rows.length, 1).setBackgrounds(bg).setFontWeight('bold');
  sh.getRange(hr + 1, 2, rows.length, NC - 1).setNumberFormat('#,##0');
  applyBanding_(sh, hr + 1, 2, rows.length, NC - 1);
  return hr + rows.length;
}

/* OVERALL summary: per country (+ ALL), AVG and MEDIAN days to convert across ALL value bands,
   plus draft count, for 2025 and 2026. Median resists the flood of fast small orders that drags
   the mean down, so it's the more representative "typical order" number. Days = hrs ÷ 24 (floor). */
function writeOverallTable_(sh, startRow, stores, ov, title) {
  var NC2 = 7;
  sh.getRange(startRow, 1).setValue(title || 'OVERALL — DAYS TO CONVERT');
  sh.getRange(startRow, 1, 1, NC2).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center').setWrap(true);
  var hr = startRow + 1;
  sh.getRange(hr, 1, 1, NC2).setValues([['Country', '2025 Avg Days', '2025 Median Days', '2025 Drafts', '2026 Avg Days', '2026 Median Days', '2026 Drafts']])
    .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  var order = stores.concat(['All']), rows = [], bg = [];
  order.forEach(function (st) {
    function stat(pk) {
      var a = ov[pk][st]; if (!a || !a.length) return ['', '', ''];
      var sum = 0; a.forEach(function (x) { sum += x; });
      return [Math.floor((sum / a.length) / 24), Math.floor(median_(a) / 24), a.length];
    }
    rows.push([st === 'All' ? 'ALL' : st].concat(stat('2025')).concat(stat('2026')));
    bg.push([st === 'All' ? '#DCE3F0' : countryBg_(st)]);
  });
  sh.getRange(hr + 1, 1, rows.length, NC2).setValues(rows).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.getRange(hr + 1, 1, rows.length, 1).setBackgrounds(bg).setFontWeight('bold');
  sh.getRange(hr + 1, 2, rows.length, NC2 - 1).setNumberFormat('#,##0');
  applyBanding_(sh, hr + 1, 2, rows.length, NC2 - 1);
  return hr + rows.length;
}

/* SPLIT VIEWS: two STATIC snapshot tabs — one for drafts created BEFORE SPLIT_DATE, one for
   on/after. They live in their OWN dedicated spreadsheet, NOT the master — the master is now
   so large (~3M cells) that writing a big new tab into it re-saves the whole document and times
   out. We READ the master Lifecycle (reads are fine) and WRITE to a small separate file (fast).
   The file's ID is remembered; the first run creates it and returns its URL. */
/* RELIABLE: write the split tabs to a dedicated file (a big write into the master ~always
   times out — the master is at the doc-size limit) and drop a one-click link tab in the
   master so it's effectively in the same place. */
function buildSplitViews() {
  var r = splitInto_(getViewsSpreadsheet_());
  try { addViewsLinkToMaster_(r.url); } catch (e) { Logger.log('link: ' + e); }
  return r;
}
function buildSplitViewsToMaster() { return splitInto_(getSpreadsheet_()); }      // NOT recommended — times out; master too large to hold an 18k tab

/* Tiny one-cell write in the master: a '➡ Draft Views' tab that links to the dedicated file.
   A single-cell write can't time out (only big writes do). */
function addViewsLinkToMaster_(url) {
  if (!url) return;
  var ss = getSpreadsheet_(), name = '➡ Draft Views';
  var sh = ss.getSheetByName(name) || ss.insertSheet(name, 0);
  sh.getRange('A1').setFormula('=HYPERLINK("' + url + '","📂  Open the Historical / Live split views")')
    .setFontSize(14).setFontWeight('bold').setFontColor('#1155CC');
  sh.getRange('A2').setValue('The two split tabs live in a dedicated file — the master is too large to hold them. Click the link above.')
    .setFontColor('#5F6368').setFontStyle('italic');
  sh.setColumnWidth(1, 560);
  return name;
}

function splitInto_(target) {
  var life = getSpreadsheet_().getSheetByName('Lifecycle');
  if (!life || life.getLastRow() < 2) return { error: 'no Lifecycle data' };
  var vals = life.getDataRange().getValues();                 // READ master — reliable
  var hdr = vals[0], col = indexMap_(hdr), iCr = col['Created At'];
  var p = SPLIT_DATE.split('-');
  var cut = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();  // local midnight of cutoff
  function crv(r) { var d = asDate_(r[iCr]); return d ? d.getTime() : 0; }
  var hist = [], live = [];
  for (var i = 1; i < vals.length; i++) {
    var t = crv(vals[i]);
    if (t && t < cut) hist.push(vals[i]);
    else live.push(vals[i]);                                  // on/after cutoff (and undated) → Live
  }
  hist.sort(function (a, b) { return crv(b) - crv(a); });     // newest first
  live.sort(function (a, b) { return crv(b) - crv(a); });
  writeViewSnapshot_(target, 'Historical (pre-Jul 2026)', hdr, hist);
  writeViewSnapshot_(target, 'Live (from Jul 2026)', hdr, live);
  var s1 = target.getSheetByName('Sheet1');
  if (s1 && target.getSheets().length > 1) { try { target.deleteSheet(s1); } catch (e) {} }
  Logger.log('split → historical=' + hist.length + ' live=' + live.length + ' @ ' + target.getUrl());
  return { historical: hist.length, live: live.length, cutoff: SPLIT_DATE, url: target.getUrl() };
}

/* SLIM THE MASTER so the split tabs (and everything else) can be written without timing out.
   Reclaims the empty grid on Lifecycle/Events_Log — Lifecycle alone is ~41k×38 but only
   ~21k×25 is used (~1M wasted cells). Run this BEFORE buildSplitViews. Deletes only empty
   rows/columns + the empty Live tab — never touches your data. */
function slimMaster() {
  var ss = getSpreadsheet_(), report = [];
  [['Lifecycle', LIFECYCLE_HEADERS.length], ['Events_Log', EVENTS_HEADERS.length]].forEach(function (pl) {
    var sh = ss.getSheetByName(pl[0]); if (!sh) return;
    var keepCols = pl[1], usedR = Math.max(2, sh.getLastRow());
    var maxC = sh.getMaxColumns(), maxR = sh.getMaxRows();
    if (maxC > keepCols) { sh.deleteColumns(keepCols + 1, maxC - keepCols); report.push(pl[0] + ' cols ' + maxC + '→' + keepCols); }
    if (maxR > usedR)    { sh.deleteRows(usedR + 1, maxR - usedR);          report.push(pl[0] + ' rows ' + maxR + '→' + usedR); }
  });
  var live = ss.getSheetByName('Live (from Jul 2026)');
  if (live && live.getLastRow() < 2) { try { ss.deleteSheet(live); report.push('removed empty Live tab'); } catch (e) {} }
  Logger.log('slimMaster: ' + (report.join('; ') || 'nothing to trim'));
  return report;
}

/* The (fallback) separate views file, if you ever use buildSplitViewsToFile(). ID stored in
   Document Properties; first use creates it and logs its URL. */
function getViewsSpreadsheet_() {
  var props = PropertiesService.getDocumentProperties();
  var id = props.getProperty('viewsSheetId');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }   // recreate if it was deleted
  var ss = SpreadsheetApp.create('BackdropSource — Draft Views (Historical / Live)');
  props.setProperty('viewsSheetId', ss.getId());
  Logger.log('Created Draft Views spreadsheet: ' + ss.getUrl());
  return ss;
}

/* ONE-CLICK: remove the colliding 15-min trigger, trim stray Lifecycle columns, then build
   both split tabs — all in ONE execution so nothing else can lock the document mid-run.
   Run this instead of buildSplitViews when you keep hitting the timeout. */
function prepAndSplit() {
  var paused = pauseMaintenance();
  var trimmed = trimLifecycleColumns();
  var r = buildSplitViews();
  Logger.log('prepAndSplit: paused ' + paused + ' trigger(s), trimmed ' + trimmed + ' col(s) → ' + JSON.stringify(r));
  Logger.log('Re-enable the 15-min auto-refresh later with setupDashboard().');
  return r;
}

/* Remove the 15-min maintenance trigger (the concurrent writer that locks the doc). */
function pauseMaintenance() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runLifecycleMaintenance') { ScriptApp.deleteTrigger(t); n++; }
  });
  Logger.log('pauseMaintenance: removed ' + n + ' trigger(s). Re-enable with setupDashboard().');
  return n;
}

/* Delete any columns in Lifecycle beyond our 25 tracked headers (stray leftovers). */
function trimLifecycleColumns() {
  var sh = getSpreadsheet_().getSheetByName('Lifecycle');
  if (!sh) return 0;
  var extra = sh.getLastColumn() - LIFECYCLE_HEADERS.length;
  if (extra > 0) { sh.deleteColumns(LIFECYCLE_HEADERS.length + 1, extra); Logger.log('trimLifecycleColumns: deleted ' + extra + ' extra column(s).'); return extra; }
  Logger.log('trimLifecycleColumns: none to delete.');
  return 0;
}

function writeViewSnapshot_(ss, name, hdr, data) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);   // REUSE the tab — NO deleteSheet (that op times out on a big doc)
  var width = hdr.length, need = data.length + 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  sh.getRange(1, 1, 1, width).setValues([hdr]);
  for (var i = 0; i < data.length; i += 2000) {               // small batches, NO flush (flush forces a full-doc save → timeout)
    var chunk = data.slice(i, i + 2000);
    sh.getRange(2 + i, 1, chunk.length, width).setValues(chunk);
  }
  var lastData = 1 + data.length;                             // wipe leftover rows from any previous, larger snapshot
  if (sh.getMaxRows() > lastData) sh.getRange(lastData + 1, 1, sh.getMaxRows() - lastData, width).clearContent();
  formatViewSheet_(sh, data.length);
}

/* DIAGNOSTIC: report why the document is slow — sheet sizes, installed triggers, and any
   stray formulas in Lifecycle (a live =QUERY there makes every write time out). Run it and
   read View → Logs (or Execution log). It only reads, so it won't time out on writes. */
function diagnoseDoc() {
  var ss = getSpreadsheet_();
  Logger.log('===== SHEETS (used / max) =====');
  ss.getSheets().forEach(function (s) {
    Logger.log(s.getName() + '  ->  rows ' + s.getLastRow() + '/' + s.getMaxRows() +
               ', cols ' + s.getLastColumn() + '/' + s.getMaxColumns() +
               ', charts ' + s.getCharts().length + ', CF-rules ' + s.getConditionalFormatRules().length);
  });
  Logger.log('===== TRIGGERS (delete runLifecycleMaintenance before setup) =====');
  var trg = ScriptApp.getProjectTriggers();
  if (!trg.length) Logger.log('(none)');
  trg.forEach(function (t) { Logger.log(t.getHandlerFunction() + '  [' + t.getEventType() + ']'); });
  Logger.log('===== STRAY FORMULAS / EXTRA COLUMNS in Lifecycle =====');
  var life = ss.getSheetByName('Lifecycle');
  if (!life) { Logger.log('no Lifecycle sheet'); return; }
  var lc = life.getLastColumn();
  if (lc > LIFECYCLE_HEADERS.length)
    Logger.log('⚠ Lifecycle uses ' + lc + ' columns but only ' + LIFECYCLE_HEADERS.length +
               ' are ours — DELETE columns ' + colLetter_(LIFECYCLE_HEADERS.length + 1) + ' onward.');
  var scan = Math.min(life.getLastRow(), 3);
  var found = [];
  if (scan >= 1) {
    life.getRange(1, 1, scan, lc).getFormulas().forEach(function (r, ri) {
      r.forEach(function (f, ci) { if (f) found.push(colLetter_(ci + 1) + (ri + 1) + ' = ' + f.slice(0, 50)); });
    });
  }
  Logger.log(found.length ? ('⚠ formulas found (delete these): ' + found.join('  |  ')) : 'no stray formulas in the first rows ✓');
}

/* DIAGNOSTIC: the real distribution of conversion time (Hrs to Convert, converted drafts) so we
   can see WHY the average looks low. Prints, per 2025 / 2026: mean + median + how many drafts
   fall in each speed bucket (<1 day … 30d+). Read the Execution log. It only reads. */
function diagnoseConversion() {
  var ss = getSpreadsheet_(), life = ss.getSheetByName('Lifecycle');
  if (!life || life.getLastRow() < 2) { Logger.log('no Lifecycle data'); return; }
  var vals = life.getDataRange().getValues(), c = indexMap_(vals[0]);
  var iHc = c['Hrs to Convert'], iCr = c['Created At'];
  var buckets = [['<1 day', 0, 24], ['1-2 days', 24, 48], ['2-3 days', 48, 72], ['3-5 days', 72, 120],
                 ['5-7 days', 120, 168], ['7-10 days', 168, 240], ['10-14 days', 240, 336],
                 ['14-21 days', 336, 504], ['21-30 days', 504, 720], ['30+ days', 720, 1e12]];
  var per = { '2025': { arr: [], b: buckets.map(function () { return 0; }) },
              '2026': { arr: [], b: buckets.map(function () { return 0; }) } };
  for (var i = 1; i < vals.length; i++) {
    var hc = Number(vals[i][iHc]); if (isNaN(hc) || hc <= 0) continue;
    var cr = asDate_(vals[i][iCr]); if (!cr) continue;
    var y = cr.getFullYear(), pk = (y === 2025) ? '2025' : (y >= 2026 ? '2026' : null); if (!pk) continue;
    var P = per[pk]; P.arr.push(hc);
    for (var bi = 0; bi < buckets.length; bi++) { if (hc >= buckets[bi][1] && hc < buckets[bi][2]) { P.b[bi]++; break; } }
  }
  ['2025', '2026'].forEach(function (pk) {
    var P = per[pk], n = P.arr.length;
    if (!n) { Logger.log('=== ' + pk + ': no converted drafts ==='); return; }
    var sum = 0; P.arr.forEach(function (x) { sum += x; });
    Logger.log('===== ' + pk + ' — ' + n + ' converted drafts (hrs > 0) =====');
    Logger.log('MEAN = ' + (sum / n / 24).toFixed(1) + ' days   ·   MEDIAN = ' + (median_(P.arr) / 24).toFixed(1) + ' days');
    buckets.forEach(function (bk, bi) {
      Logger.log('  ' + bk[0] + ': ' + P.b[bi] + '  (' + Math.round(P.b[bi] / n * 100) + '%)');
    });
  });
}

/* VERIFY: dump the newest N converted drafts for a store with all three timestamps, so you can
   compare "Created" to when the customer FIRST contacted you. If Created sits right next to the
   invoice/order (hrsToInvoice ~0), the draft was made LATE — the 7–8-day mockup phase happened
   BEFORE the draft existed and isn't in Shopify. Run sampleConversions('USA', 15); read the log. */
function sampleConversions(storeCode, n) {
  storeCode = String(storeCode || 'USA').toUpperCase(); n = n || 15;
  var life = getSpreadsheet_().getSheetByName('Lifecycle');
  if (!life || life.getLastRow() < 2) { Logger.log('no Lifecycle data'); return; }
  var vals = life.getDataRange().getValues(), c = indexMap_(vals[0]);
  var iSt = c['Store'], iNm = c['Draft Name'], iCr = c['Created At'], iInv = c['Invoice Sent At'],
      iCo = c['Completed At'], iHi = c['Hrs to Invoice'], iHc = c['Hrs to Convert'], iTot = c['Total'], iCcy = c['Currency'], iOut = c['Outcome'];
  function f(v) { var d = asDate_(v); return d ? Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm') : '—'; }
  Logger.log('===== SAMPLE CONVERTED DRAFTS — ' + storeCode + ' (newest first) =====');
  Logger.log('Draft | Created | Invoice Sent | Completed | hrsToInvoice | hrsToConvert | Total');
  var shown = 0, invHrs = [], convHrs = [];
  for (var i = vals.length - 1; i >= 1; i--) {
    var r = vals[i];
    if (String(r[iSt]).toUpperCase() !== storeCode) continue;
    if (String(r[iOut] || '') !== 'Converted') continue;
    var hi = Number(r[iHi]), hc = Number(r[iHc]);
    if (!isNaN(hi)) invHrs.push(hi);
    if (!isNaN(hc)) convHrs.push(hc);
    if (shown < n) {
      Logger.log([r[iNm], f(r[iCr]), f(r[iInv]), f(r[iCo]), r[iHi] + 'h', r[iHc] + 'h', r[iTot] + ' ' + r[iCcy]].join('  |  '));
      shown++;
    }
  }
  Logger.log('---- ' + storeCode + ' medians across ' + convHrs.length + ' converted drafts ----');
  Logger.log('Created → Invoice Sent (median): ' + (median_(invHrs) / 24).toFixed(1) + ' days   ·   Created → Order (median): ' + (median_(convHrs) / 24).toFixed(1) + ' days');
  Logger.log('If BOTH are ~0, the draft is created right at invoicing → the mockup/negotiation cycle is entirely BEFORE the draft and cannot be measured from draft timestamps.');
}

/* Style a static snapshot tab (same column layout as Lifecycle). n = number of data rows. */
function formatViewSheet_(sh, n) {
  var col = {}; LIFECYCLE_HEADERS.forEach(function (h, i) { col[h] = i; });
  var lastCol = LIFECYCLE_HEADERS.length;

  sh.getRange(1, 1, 1, lastCol).setBackground(HEADER_BG).setFontColor(HEADER_FG)
    .setFontWeight('bold').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 36);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);

  if (n >= 1) {
    sh.getRange(2, 1, n, lastCol).setHorizontalAlignment('center').setVerticalAlignment('middle');
    [['Total', '#,##0.00'], ['Hrs to Invoice', '0"h"'], ['Hrs to Convert', '0"h"'],
     ['Conversion Days', '#,##0'], ['Age Days', '#,##0'], ['Events', '0'],
     ['Created At', 'yyyy-mm-dd hh:mm'], ['Invoice Sent At', 'yyyy-mm-dd hh:mm'],
     ['Completed At', 'yyyy-mm-dd hh:mm'], ['Deleted At', 'yyyy-mm-dd hh:mm'],
     ['First Seen', 'yyyy-mm-dd hh:mm'], ['Last Update', 'yyyy-mm-dd hh:mm']]
      .forEach(function (f) { if (col[f[0]] != null) sh.getRange(2, col[f[0]] + 1, n, 1).setNumberFormat(f[1]); });
    sh.getBandings().forEach(function (b) { b.remove(); });
    applyBanding_(sh, 2, 1, n, lastCol);
  }
  sh.setConditionalFormatRules(
    cfCountryRules_(sh, col['Store']).concat(cfMapRules_(sh, col['Outcome'], OUTCOME_COLORS))
  );
  setWidths_(sh, col, { 'Draft Name': 80, 'Customer': 150, 'Email': 200, 'Line Items': 280,
    'Created At': 130, 'Invoice Sent At': 130, 'Completed At': 130, 'Deleted At': 130,
    'First Seen': 130, 'Last Update': 130, 'Tags': 170, 'Note': 220 });
}

/* RECOVERY: wipe Lifecycle clean + reset header, then re-run the backfills. */
function resetLifecycle() {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName('Lifecycle') || ss.insertSheet('Lifecycle');
  sh.clear();
  try { sh.getBandings().forEach(function (b) { b.remove(); }); } catch (e) {}
  try { sh.setConditionalFormatRules([]); } catch (e) {}
  sh.getRange(1, 1, 1, LIFECYCLE_HEADERS.length).setValues([LIFECYCLE_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  var props = PropertiesService.getDocumentProperties();
  CONFIG.STORES.forEach(function (s) { props.deleteProperty('backfill_' + s.code); });
  Logger.log('Lifecycle wiped + header reset.');
}

function formatLifecycle_() {
  var sh = getSpreadsheet_().getSheetByName('Lifecycle');
  if (!sh || sh.getLastRow() < 1) return;
  var lastRow = sh.getLastRow(), fullCol = sh.getLastColumn();
  var col = indexMap_(sh.getRange(1, 1, 1, fullCol).getValues()[0]);       // resolve names across whole header (first-wins)
  var lastCol = Math.min(fullCol, LIFECYCLE_HEADERS.length);               // but only ever format the tracked columns

  sh.getRange(1, 1, 1, lastCol).setBackground(HEADER_BG).setFontColor(HEADER_FG)
    .setFontWeight('bold').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 36);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);

  var n = lastRow - 1;
  if (n >= 1) {
    sh.getRange(2, 1, n, lastCol).setBackground(null)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');   // centre all data rows
    setColFormat_(sh, col, 'Total', n, '#,##0.00');
    setColFormat_(sh, col, 'Hrs to Invoice', n, '0"h"');
    setColFormat_(sh, col, 'Hrs to Convert', n, '0"h"');
    setColFormat_(sh, col, 'Conversion Days', n, '#,##0');   // whole days (floored value, never rounded up)
    setColFormat_(sh, col, 'Age Days', n, '#,##0');
    setColFormat_(sh, col, 'Events', n, '0');
    ['Created At', 'Invoice Sent At', 'Completed At', 'Deleted At', 'First Seen', 'Last Update']
      .forEach(function (h) { setColFormat_(sh, col, h, n, 'yyyy-mm-dd hh:mm'); });
    sh.getBandings().forEach(function (b) { b.remove(); });
    applyBanding_(sh, 2, 1, n, lastCol);
  }
  sh.setConditionalFormatRules(
    cfCountryRules_(sh, col['Store']).concat(cfMapRules_(sh, col['Outcome'], OUTCOME_COLORS))
  );
  setWidths_(sh, col, { 'Draft Name': 80, 'Customer': 150, 'Email': 200, 'Line Items': 280,
    'Created At': 130, 'Invoice Sent At': 130, 'Completed At': 130, 'Deleted At': 130,
    'First Seen': 130, 'Last Update': 130, 'Tags': 170, 'Note': 220 });
}

function formatEventsLog_() {
  var sh = getSpreadsheet_().getSheetByName('Events_Log');
  if (!sh || sh.getLastRow() < 1) return;
  var lastRow = sh.getLastRow(), fullCol = sh.getLastColumn();
  var col = indexMap_(sh.getRange(1, 1, 1, fullCol).getValues()[0]);
  var lastCol = Math.min(fullCol, EVENTS_HEADERS.length);

  sh.getRange(1, 1, 1, lastCol).setBackground(HEADER_BG).setFontColor(HEADER_FG)
    .setFontWeight('bold').setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(1, 32);
  sh.setFrozenRows(1);

  var n = lastRow - 1;
  if (n >= 1) {
    sh.getRange(2, 1, n, lastCol).setBackground(null)
      .setHorizontalAlignment('center').setVerticalAlignment('middle');   // centre all data rows
    setColFormat_(sh, col, 'Total', n, '#,##0.00');
    ['Received At', 'Created At', 'Invoice Sent At', 'Completed At']
      .forEach(function (h) { setColFormat_(sh, col, h, n, 'yyyy-mm-dd hh:mm'); });
    sh.getBandings().forEach(function (b) { b.remove(); });
    applyBanding_(sh, 2, 1, n, lastCol);
  }
  sh.setConditionalFormatRules(
    cfCountryRules_(sh, col['Store']).concat(cfMapRules_(sh, col['Topic'], TOPIC_COLORS))
  );
  setWidths_(sh, col, { 'Received At': 130, 'Created At': 130, 'Invoice Sent At': 130,
    'Completed At': 130, 'Email': 200, 'Customer': 150, 'Line Items': 260, 'Note': 340, 'Tags': 160 });
}

/* --- formatting + chart helpers --- */
function setColFormat_(sh, col, name, n, fmt) { if (col[name] != null && n > 0) sh.getRange(2, col[name] + 1, n, 1).setNumberFormat(fmt); }
function setWidths_(sh, col, map) { Object.keys(map).forEach(function (h) { if (col[h] != null) sh.setColumnWidth(col[h] + 1, map[h]); }); }
function applyBanding_(sh, startRow, startCol, n, nCols) {
  if (n < 1) return;
  try { sh.getRange(startRow, startCol, n, nCols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false); } catch (e) {}
}
function colLetter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m - 1) / 26); } return s; }
function storeCodesFor_(sh, ci) {
  var codes = CONFIG.STORES.map(function (s) { return String(s.code || '').toUpperCase(); }).filter(Boolean);
  if (ci != null && sh.getLastRow() > 1) {
    sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var v = String(r[0] || '').toUpperCase(); if (v) codes.push(v);
    });
  }
  return codes.filter(function (v, i, a) { return a.indexOf(v) === i; });
}
function cfCountryRules_(sh, ci) {
  if (ci == null) return [];
  var L = colLetter_(ci + 1), rng = sh.getRange(L + '2:' + L);
  return storeCodesFor_(sh, ci).map(function (code) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(code).setBackground(countryBg_(code)).setRanges([rng]).build();
  });
}
function cfMapRules_(sh, ci, map) {
  if (ci == null) return [];
  var L = colLetter_(ci + 1), rng = sh.getRange(L + '2:' + L);
  return Object.keys(map).map(function (k) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(map[k]).setRanges([rng]).build();
  });
}
function clearSheet_(sheet) {
  sheet.getCharts().forEach(function (ch) { sheet.removeChart(ch); });
  try { sheet.getBandings().forEach(function (bd) { bd.remove(); }); } catch (e) {}
  try { sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart(); } catch (e) {}
  sheet.clear();
}
function addColChart_(sheet, title, ranges, row, col, colors) {
  var b = sheet.newChart().asColumnChart().setNumHeaders(1).setPosition(row, col, 5, 5)
    .setOption('title', title).setOption('height', 340).setOption('width', 560)
    .setOption('legend', { position: 'bottom' }).setOption('titleTextStyle', { fontSize: 13, bold: true });
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
function addLineChart_(sheet, title, ranges, row, col, colors) {
  var b = sheet.newChart().asLineChart().setNumHeaders(1).setPosition(row, col, 5, 5)
    .setOption('title', title).setOption('height', 340).setOption('width', 560)
    .setOption('legend', { position: 'bottom' }).setOption('titleTextStyle', { fontSize: 13, bold: true })
    .setOption('curveType', 'function').setOption('pointSize', 5);
  if (colors) b.setOption('colors', colors);
  ranges.forEach(function (r) { b.addRange(r); });
  sheet.insertChart(b.build());
}

/* ============================== HELPERS ================================= */
function getSpreadsheet_() { return SpreadsheetApp.openById(CONFIG.SHEET_ID); }

function getTab_(name, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers && headers.length) {
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      var cur = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(String);
      var missing = headers.filter(function (h) { return cur.indexOf(h) === -1; });
      if (missing.length) sheet.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
  }
  return sheet;
}

function appendByHeader_(sheet, v, fallbackHeaders) {
  var lastCol = sheet.getLastColumn();
  var hdr = (lastCol > 0) ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : (fallbackHeaders || []);
  if (!hdr.length) hdr = fallbackHeaders || [];
  var row = hdr.map(function (h) { var k = String(h).trim(); return (v[k] !== undefined) ? v[k] : ''; });
  sheet.appendRow(row);
}

// First-wins: if a header name repeats (e.g. a user QUERY adds another "Store"
// column), the FIRST (canonical) column wins so the script never targets it.
function indexMap_(headerRow) { var m = {}; headerRow.forEach(function (h, i) { if (m[h] === undefined) m[h] = i; }); return m; }

function asDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v;
  var d = new Date(v); return isNaN(d.getTime()) ? '' : d;
}
function firstDate_(a, b) { return asDate_(a) || asDate_(b) || ''; }
function addTag_(tags, tag) {
  var list = String(tags || '').trim();
  list = list ? list.split(/\s*,\s*/) : [];
  if (list.indexOf(tag) === -1) list.push(tag);
  return list.join(', ');
}
function hoursBetween_(a, b) { a = asDate_(a); b = asDate_(b); return (a && b) ? (b - a) / 3600000 : ''; }
function round2_(n) { n = Number(n); return isNaN(n) ? '' : Math.round(n * 100) / 100; }
function avg_(arr) { if (!arr || !arr.length) return ''; var s = 0; arr.forEach(function (x) { s += x; }); return round2_(s / arr.length); }
function median_(arr) { if (!arr || !arr.length) return ''; var a = arr.slice().sort(function (x, y) { return x - y; }); var m = Math.floor(a.length / 2); return (a.length % 2) ? a[m] : (a[m - 1] + a[m]) / 2; }
// average conversion is computed on HOURS, then converted to whole days by FLOOR (complete days
// elapsed) — so 40h (1.67 days) reads as 1, never rounded up to 2.
function avgConvDays_(hrsArr) { var a = avg_(hrsArr); return (a === '') ? '' : Math.floor(a / 24); }

function jsonOut_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
