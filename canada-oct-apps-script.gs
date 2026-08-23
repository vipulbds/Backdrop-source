/**
 * ============================================================================
 *  BACKDROPSOURCE — CANADA — Google Ads Offline Conversion Tracking (OCT)
 * ============================================================================
 *  Bound to NEW Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1hfHqs1Xkb4jlf51__ZoAlt8QNx2URlEcXnBr-MtZNLc/edit
 *
 *  WHAT THIS DOES
 *  --------------
 *  1) WEB APP (doPost/doGet) — receives every lead from catheme.liquid
 *     (the "Request A Free 2D Design Preview" and "Request Custom Size Quote"
 *     forms) and writes ONE ROW per lead to the "Leads" tab, including the
 *     captured GCLID + the conversion name/id/label + UTMs.
 *
 *  2) OCT UPLOAD — once your sales team marks a lead as paid, the conversion
 *     is sent to Google Ads. TWO ways are supported (pick ONE):
 *
 *       OPTION A (recommended, NO Google Ads API needed):
 *         "Scheduled Google Sheets upload" inside Google Ads.
 *         Run buildAdsUploadTab() — it maintains an "Ads Upload" tab in the
 *         exact format Google Ads expects. Then in Google Ads:
 *           Goals > Conversions > Uploads > Schedule > "Google Sheets"
 *           and point it at this spreadsheet's "Ads Upload" tab.
 *         No developer token, no OAuth, no conversion-action IDs — it matches
 *         conversions by NAME. Easiest for a no-server setup.
 *
 *       OPTION B (fully automated, needs Google Ads API):
 *         uploadPaidConversions() pushes paid leads straight to the Google Ads
 *         API. Requires a developer token, OAuth refresh token, and the numeric
 *         conversionAction IDs (see CONFIG.ADS / CONFIG.CONVERSION_ACTIONS).
 *
 *  WORKFLOW (the "Leads" tab is the source of truth)
 *  -------------------------------------------------
 *    - New lead arrives        -> Status = "Lead"  (set automatically)
 *    - Sales creates draft     -> change Status to "Draft"   (optional)
 *    - Customer pays           -> change Status to "Paid",
 *                                 fill "Order Value", "Currency" (e.g. CAD),
 *                                 and optionally "Paid At".
 *    - Run the upload          -> Option A: buildAdsUploadTab()  (then Ads pulls it)
 *                                 Option B: uploadPaidConversions()
 *      "Uploaded At" / "Upload Result" are stamped so nothing uploads twice.
 *
 *  DEPLOY
 *  ------
 *    Deploy > New deployment > Web app
 *      Execute as: Me   |   Who has access: Anyone
 *    Copy the /exec URL and paste it into catheme.liquid (APPS_URL).
 *    IMPORTANT: after ANY edit, redeploy as "Manage deployments > Edit >
 *    New version" or the OLD code keeps serving. Check the [VERSION] marker
 *    (open the /exec URL in a browser) to confirm a redeploy took effect.
 * ============================================================================
 */

var VERSION = 'canada-oct v3';

var CONFIG = {
  SHEET_ID:        '1hfHqs1Xkb4jlf51__ZoAlt8QNx2URlEcXnBr-MtZNLc',
  LEADS_TAB:       'Leads',
  ORDERS_TAB:      'Orders',
  ADS_UPLOAD_TAB:  'Ads Upload',   // Google Ads (gclid)
  BING_UPLOAD_TAB: 'Bing Upload',  // Microsoft/Bing Ads (msclkid)
  TIMEZONE:        'America/Toronto', // Canada store timezone
  DEFAULT_CURRENCY:'CAD',

  // ── Google Ads API — ONLY needed for OPTION B (uploadPaidConversions) ──
  ADS: {
    DEVELOPER_TOKEN:   '',     // from Google Ads > API Center
    CLIENT_ID:         '',     // OAuth client (Google Cloud console)
    CLIENT_SECRET:     '',
    REFRESH_TOKEN:     '',     // generated once for the Ads scope
    CUSTOMER_ID:       '',     // the Ads account, digits only, NO dashes
    LOGIN_CUSTOMER_ID: '',     // MCC/manager id if you use one, else leave blank
    API_VERSION:       'v18'
  },

  // OPTION B only: map each conversion NAME to its numeric Google Ads
  // conversionAction ID (Goals > Conversions > click a conversion > the long
  // number in the URL "...conversionActions/<THIS_NUMBER>").
  CONVERSION_ACTIONS: {
    'Request A Free 2D Design Preview': '',
    'Request Custom Size Quote':        ''
  }
};

var HEADERS = [
  'Timestamp', 'Status',
  'Conversion Name',
  'Name', 'Email', 'Phone', 'Source',
  'GCLID', 'GBRAID', 'WBRAID', 'FBCLID', 'MSCLKID',
  'UTM Source', 'UTM Medium', 'UTM Campaign', 'Page URL',
  'Order Value', 'Currency', 'Paid At',
  'Uploaded At', 'Upload Result'
];

// "Orders" tab — every completed order with its attribution (ads or organic).
var ORDER_HEADERS = [
  'Timestamp', 'Order ID', 'Order Number', 'Order Value', 'Currency', 'Source',
  'GCLID', 'GBRAID', 'WBRAID', 'FBCLID', 'MSCLKID',
  'UTM Source', 'UTM Medium', 'UTM Campaign',
  'Email', 'Name', 'Phone',
  'Uploaded At', 'Upload Result'
];

/* ============================== WEB APP ================================== */

function doPost(e) {
  var data = {};
  try {
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents); // sendBeacon sends a JSON string
    }
  } catch (err) {
    data = (e && e.parameter) ? e.parameter : {};
  }
  // merge any query-string params too (harmless fallback)
  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (k) {
      if (data[k] === undefined) data[k] = e.parameter[k];
    });
  }
  if (data.type === 'order' || data.order_id) return saveOrder_(data);
  return saveLead_(data);
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (p.type === 'order' || p.order_id) return saveOrder_(p);
  if (p.email || p.name || p.gclid || p.conversion_name) {
    return saveLead_(p); // GET fallback if sendBeacon is ever blocked
  }
  return jsonOut_({ ok: true, version: VERSION, message: 'Backdropsource Canada OCT endpoint is live.' });
}

function saveLead_(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { /* proceed anyway */ }
  try {
    var sheet = getTab_(CONFIG.LEADS_TAB, HEADERS);
    var ts = data.timestamp ? new Date(data.timestamp) : new Date();

    // Build the row keyed by column NAME, then lay it out in HEADERS order — so
    // reordering/removing columns never misaligns the data again.
    var v = {
      'Timestamp': ts,
      'Status': 'Lead',
      'Conversion Name': data.conversion_name || '',
      'Name':  data.name  || '',
      'Email': data.email || '',
      'Phone': data.phone || '',
      'Source': classifySource_(data),
      'GCLID':   data.gclid   || '',
      'GBRAID':  data.gbraid  || '',
      'WBRAID':  data.wbraid  || '',
      'FBCLID':  data.fbclid  || '',
      'MSCLKID': data.msclkid || '',
      'UTM Source':   data.utm_source   || '',
      'UTM Medium':   data.utm_medium   || '',
      'UTM Campaign': data.utm_campaign || '',
      'Page URL': data.page_url || ''
      // Order Value / Currency / Paid At / Uploaded At / Upload Result left blank
    };
    var row = HEADERS.map(function (h) { return v[h] !== undefined ? v[h] : ''; });
    sheet.appendRow(row);
    return jsonOut_({ ok: true, version: VERSION });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// Records a completed order (id + value + attribution) to the "Orders" tab.
// De-dupes on Order ID so a pixel firing twice can't create duplicate rows.
function saveOrder_(data) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var sheet = getTab_(CONFIG.ORDERS_TAB, ORDER_HEADERS);
    var orderId = String(data.order_id || '').trim();

    if (orderId) {  // skip if this order id is already recorded
      var existing = sheet.getDataRange().getValues();
      var idCol = indexMap_(existing[0])['Order ID'];
      for (var r = 1; r < existing.length; r++) {
        if (String(existing[r][idCol]).trim() === orderId) {
          return jsonOut_({ ok: true, version: VERSION, duplicate: true });
        }
      }
    }

    var ts = data.timestamp ? new Date(data.timestamp) : new Date();
    var v = {
      'Timestamp': ts,
      'Order ID': orderId,
      'Order Number': data.order_number || data.order_name || '',
      'Order Value': data.order_value || '',
      'Currency': data.currency || CONFIG.DEFAULT_CURRENCY,
      'Source': classifySource_(data),
      'GCLID':   data.gclid   || '',
      'GBRAID':  data.gbraid  || '',
      'WBRAID':  data.wbraid  || '',
      'FBCLID':  data.fbclid  || '',
      'MSCLKID': data.msclkid || '',
      'UTM Source':   data.utm_source   || '',
      'UTM Medium':   data.utm_medium   || '',
      'UTM Campaign': data.utm_campaign || '',
      'Email': data.email || '',
      'Name':  data.name  || '',
      'Phone': data.phone || ''
    };
    var row = ORDER_HEADERS.map(function (h) { return v[h] !== undefined ? v[h] : ''; });
    sheet.appendRow(row);
    return jsonOut_({ ok: true, version: VERSION });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ===================== OPTION A — GOOGLE SHEETS UPLOAD ==================== */
/**
 * Rebuilds the "Ads Upload" tab in Google Ads' import format from every
 * "Paid" lead that has a GCLID. Safe to run repeatedly (it regenerates the
 * tab). After running, set up a scheduled "Google Sheets" upload in Google Ads
 * pointing at this tab. Google Ads matches conversions by NAME, so the names
 * here MUST match your conversion names exactly:
 *   "Request A Free 2D Design Preview" / "Request Custom Size Quote".
 */
function buildAdsUploadTab() {
  var leads = getTab_(CONFIG.LEADS_TAB, HEADERS);
  var values = leads.getDataRange().getValues();
  if (values.length < 2) { return; }
  var head = values[0];
  var col = indexMap_(head);

  var out = getTab_(CONFIG.ADS_UPLOAD_TAB, null);
  out.clear();

  // Google Ads Google-Sheets template: a Parameters line, then column headers.
  var tzOffset = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'XXX'); // e.g. -04:00
  out.appendRow(['Parameters:TimeZone=' + tzOffset]);
  out.appendRow(['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency']);

  var count = 0;
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[col['Status']]).toLowerCase() !== 'paid') continue;
    var gclid = r[col['GCLID']];
    if (!gclid) continue;

    var when = r[col['Paid At']] || r[col['Timestamp']];
    var dt = (when instanceof Date) ? when : new Date(when);
    var convTime = Utilities.formatDate(dt, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ssXXX');

    out.appendRow([
      gclid,
      r[col['Conversion Name']],
      convTime,
      r[col['Order Value']] || 0,
      r[col['Currency']] || CONFIG.DEFAULT_CURRENCY
    ]);
    count++;
  }
  SpreadsheetApp.getActive && Logger.log('Ads Upload tab rebuilt with ' + count + ' paid conversion(s).');
}

/* ============= OPTION A (Microsoft/Bing) — GOOGLE SHEETS UPLOAD ========= */
/**
 * Same idea as buildAdsUploadTab() but for MICROSOFT / BING ADS — builds a
 * "Bing Upload" tab from every "Paid" lead that has an MSCLKID (came from a
 * Bing ad). Then in Microsoft Advertising, schedule an import from this tab.
 *
 * SETUP (one time, in Microsoft Advertising):
 *   1) Tools > Conversion tracking > Conversion goals > Create > "Offline
 *      conversion". Create one goal per conversion, named EXACTLY to match the
 *      "Conversion Name" column ("Request A Free 2D Design Preview" /
 *      "Request Custom Size Quote").
 *   2) Tools > Bulk operations > Scheduled imports > Create > source "Google
 *      Sheets" > pick this spreadsheet > the "Bing Upload" tab > map the
 *      columns > frequency Daily.
 *
 * Microsoft matches the sale to the click via the MSCLKID, so only leads that
 * carry one are exported here (Google's gclid leads go to the Ads Upload tab).
 */
function buildBingUploadTab() {
  var leads = getTab_(CONFIG.LEADS_TAB, HEADERS);
  var values = leads.getDataRange().getValues();
  if (values.length < 2) { return; }
  var col = indexMap_(values[0]);

  var out = getTab_(CONFIG.BING_UPLOAD_TAB, null);
  out.clear();
  out.appendRow(['Microsoft Click Id', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency Code']);

  var count = 0;
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[col['Status']]).toLowerCase() !== 'paid') continue;
    var msclkid = r[col['MSCLKID']];
    if (!msclkid) continue;

    var when = r[col['Paid At']] || r[col['Timestamp']];
    var dt = (when instanceof Date) ? when : new Date(when);
    var convTime = Utilities.formatDate(dt, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");

    out.appendRow([
      msclkid,
      r[col['Conversion Name']],
      convTime,
      r[col['Order Value']] || 0,
      r[col['Currency']] || CONFIG.DEFAULT_CURRENCY
    ]);
    count++;
  }
  Logger.log('Bing Upload tab rebuilt with ' + count + ' paid conversion(s).');
}

/* Convenience: refresh BOTH upload tabs at once. Put your ONE daily
   time-driven trigger on this function so Google + Bing stay current. */
function buildAllUploadTabs() {
  buildAdsUploadTab();
  buildBingUploadTab();
}

/* ===================== OPTION B — GOOGLE ADS API ========================= */
/**
 * Uploads every "Paid" lead that has a GCLID and is NOT yet uploaded straight
 * to the Google Ads API, then stamps "Uploaded At" / "Upload Result".
 * Requires CONFIG.ADS.* + CONFIG.CONVERSION_ACTIONS to be filled in.
 * Run on a time-driven trigger (e.g. hourly) or manually.
 */
function uploadPaidConversions() {
  if (!CONFIG.ADS.DEVELOPER_TOKEN || !CONFIG.ADS.CUSTOMER_ID) {
    throw new Error('Google Ads API not configured. Fill CONFIG.ADS, or use Option A (buildAdsUploadTab).');
  }
  var leads = getTab_(CONFIG.LEADS_TAB, HEADERS);
  var values = leads.getDataRange().getValues();
  var col = indexMap_(values[0]);
  var token = getAdsAccessToken_();
  var cid = String(CONFIG.ADS.CUSTOMER_ID).replace(/-/g, '');

  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (String(r[col['Status']]).toLowerCase() !== 'paid') continue;
    if (r[col['Uploaded At']]) continue;            // already done
    var gclid = r[col['GCLID']];
    if (!gclid) { stampRow_(leads, i, col, '', 'Skipped: no GCLID'); continue; }

    var convName = r[col['Conversion Name']];
    var actionId = CONFIG.CONVERSION_ACTIONS[convName];
    if (!actionId) { stampRow_(leads, i, col, '', 'Skipped: no conversionAction id for "' + convName + '"'); continue; }

    var when = r[col['Paid At']] || r[col['Timestamp']];
    var dt = (when instanceof Date) ? when : new Date(when);
    var conversion = {
      gclid: gclid,
      conversionAction: 'customers/' + cid + '/conversionActions/' + actionId,
      conversionDateTime: Utilities.formatDate(dt, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ssXXX'),
      conversionValue: Number(r[col['Order Value']]) || 0,
      currencyCode: r[col['Currency']] || CONFIG.DEFAULT_CURRENCY
    };

    var result = sendClickConversion_(cid, token, conversion);
    stampRow_(leads, i, col, new Date(), result);
  }
}

function sendClickConversion_(cid, token, conversion) {
  var url = 'https://googleads.googleapis.com/' + CONFIG.ADS.API_VERSION +
            '/customers/' + cid + ':uploadClickConversions';
  var headers = {
    'Authorization': 'Bearer ' + token,
    'developer-token': CONFIG.ADS.DEVELOPER_TOKEN
  };
  if (CONFIG.ADS.LOGIN_CUSTOMER_ID) {
    headers['login-customer-id'] = String(CONFIG.ADS.LOGIN_CUSTOMER_ID).replace(/-/g, '');
  }
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    muteHttpExceptions: true,
    payload: JSON.stringify({ conversions: [conversion], partialFailure: true })
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code >= 200 && code < 300) {
    var json = JSON.parse(body);
    if (json.partialFailureError) return 'Partial failure: ' + json.partialFailureError.message;
    return 'OK';
  }
  return 'HTTP ' + code + ': ' + body.slice(0, 300);
}

function getAdsAccessToken_() {
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    muteHttpExceptions: true,
    payload: {
      client_id:     CONFIG.ADS.CLIENT_ID,
      client_secret: CONFIG.ADS.CLIENT_SECRET,
      refresh_token: CONFIG.ADS.REFRESH_TOKEN,
      grant_type:    'refresh_token'
    }
  });
  var json = JSON.parse(res.getContentText());
  if (!json.access_token) throw new Error('Could not get Ads access token: ' + res.getContentText());
  return json.access_token;
}

/* ============================== HELPERS ================================== */

function getSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.SHEET_ID);
}

function getTab_(name, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers && sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function indexMap_(headerRow) {
  var m = {};
  headerRow.forEach(function (h, i) { m[h] = i; });
  return m;
}

function stampRow_(sheet, rowIndex, col, uploadedAt, result) {
  // rowIndex is 0-based into values[]; sheet rows are 1-based with a header row.
  var sheetRow = rowIndex + 1;
  if (uploadedAt) sheet.getRange(sheetRow, col['Uploaded At'] + 1).setValue(uploadedAt);
  sheet.getRange(sheetRow, col['Upload Result'] + 1).setValue(result);
}

// Human-readable attribution for the "Source" column. A lead carries at most
// one ad click-id; if none, it genuinely arrived without an ad click.
function classifySource_(d) {
  if (d.gclid)   return 'Google Ads (gclid)';
  if (d.gbraid)  return 'Google Ads (gbraid)';
  if (d.wbraid)  return 'Google Ads (wbraid)';
  if (d.msclkid) return 'Microsoft / Bing Ads';
  if (d.fbclid)  return 'Meta / Facebook';
  if (d.utm_source) return d.utm_source + (d.utm_medium ? ' / ' + d.utm_medium : '');
  return 'Direct / Organic';
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
