/**
 * ============================================================================
 *  BACKDROPSOURCE — CENTRALIZED DAILY AD BUDGET TRACKER  (Google Apps Script)
 * ============================================================================
 *  ONE sheet that puts AD SPEND (Meta, Google, Bing, LinkedIn, TikTok) next to
 *  CONVERSIONS (Shopify), per DAY x COUNTRY x PLATFORM, and computes
 *  CPA / ROAS / AOV / CTR / CPC — with a period-filterable dashboard.
 *
 *  DATA SOURCES
 *   SPEND  → the "Spend Input" tab (UPSERTED on Date+Country+Platform+Campaign,
 *            so re-running a day never double-counts):
 *      • Meta        — pulled HERE via the Marketing API (System-User token).
 *      • Google Ads  — a Google Ads Script (google-ads-spend-script.js) POSTs
 *                      yesterday's cost to this web app daily (no dev token needed).
 *      • Bing        — a Microsoft Advertising Script (bing-ads-spend-script.js) POSTs likewise.
 *      • LinkedIn / TikTok / anything — typed/pasted into "Spend Input", or POSTed
 *                      by any tool to  /exec?type=spend&token=…
 *
 *   CONVERSIONS  → TWO independent views, so you get BOTH the totals and the split:
 *      • Shopify TOTALS   — pullShopifyDaily() hits each store's Admin API
 *                      (client-credentials grant, needs read_orders) → "Shopify Daily":
 *                      ground-truth orders + revenue per Date x Country (NOT per platform).
 *      • ATTRIBUTED split — read LIVE from the existing UNIFIED TRACKING sheet
 *                      (CONFIG.TRACKING_SHEET_ID) "<CC> Order" PURCHASE rows, whose
 *                      Source column already knows each order's ad platform.
 *
 *  OUTPUT TABS
 *      "Spend Input"  — every spend row (API + script + manual), upserted.
 *      "Shopify Daily"— ground-truth orders/revenue per Date x Country.
 *      "Daily Master" — the JOIN: Date x Country x Platform + Spend + attributed
 *                       Conversions/Revenue + CPA/ROAS/AOV/CTR/CPC. Rebuilt each run.
 *      "Dashboard"    — KPI strip + by-platform + by-country matrices + trend + charts,
 *                       filtered by the Period dropdown (or the "💰 Ad Budget" menu).
 *
 *  SETUP  (see the companion chat steps)
 *    1. Create a Google Sheet; put its ID in CONFIG.SHEET_ID.
 *    2. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone.
 *       Copy the /exec URL into CONFIG.WEBAPP_URL and set a long CONFIG.SHARED_TOKEN.
 *    3. Shopify totals: reuse your draft-lifecycle apps (Client ID/Secret) but the
 *       app must have the read_orders scope — fill CONFIG.STORES, run pullShopifyDaily().
 *    4. Meta: create a System User + token with ads_read, put the token + each
 *       country's AD-ACCOUNT id (act_… number, NOT the pixel id) in CONFIG.META.
 *    5. Google/Bing: paste the two companion scripts into those platforms (they
 *       carry the same WEBAPP_URL + token) on a DAILY schedule.
 *    6. Run setup() once → menu + Period dropdown + daily auto-refresh triggers.
 *    Re-deploy after edits: Manage deployments > Edit > Version: New version.
 * ============================================================================
 */

var VERSION = 'bds-budget v1';

var CONFIG = {
  SHEET_ID:          'PASTE_NEW_SHEET_ID',                       // this tracker's Google Sheet
  TRACKING_SHEET_ID: '15wnVR1TSrEnBuEg6QCLRUxJ3ptuTyOdlOriF28viAQ0',   // the bds-unified sheet (attributed orders)
  LIFECYCLE_SHEET_ID: '1Y4_c3XySxTkNtlccJK7RmJ1U8EEUaxRuc67KJlBqvtc',  // the Draft Order Lifecycle sheet — Billboard email reads its "Lifecycle" tab for draft created/deleted/conversion stats
  TAB_PREFIX:        'BDS ',                                     // every tab THIS script creates is prefixed → it can be dropped into your EXISTING workbook and will NEVER collide with (or touch) your current tabs
  WEBAPP_URL:        'https://script.google.com/macros/s/AKfycbz6uM49s-aLbb3s_Mhg7GB9eUCa1ZCd0kk09KCAEmwCzD47W_k_U83EP_wbyGJvp4UJ/exec',   // ✅ THIS tracker's own /exec (verified: "version":"bds-budget v1"). The ad scripts POST here — NOT the bds-unified URL.
  SHARED_TOKEN:      'bds-6b60c0c88900b42519c19d5f194bccadeb4e93278aeefad5',   // MUST equal TOKEN in the Google/Bing scripts (verified: the ad scripts send exactly this). After changing, REDEPLOY the same deployment (New version).
  TIMEZONE:          'America/Chicago',
  API_VERSION:       '2025-10',
  LOOKBACK_DAYS:     60,                                         // each pull refreshes the trailing N days (fills month views, corrects late data)

  // All report money is converted to REPORT_CURRENCY (USD). FX = 1 unit of a
  // currency → USD (fallback defaults; refreshFxRates() overwrites these with
  // LIVE rates from a free no-key API and caches them per document). Edit any
  // number below to hard-override a rate.
  REPORT_CURRENCY: 'USD',
  FX: { USD: 1, CAD: 0.73, GBP: 1.27, AUD: 0.66, NZD: 0.60, EUR: 1.08, INR: 0.012, SGD: 0.74, AED: 0.27 },
  // Optional PINNED rates that WIN over the live rates. Shopify converts each order at its
  // order-date rate while this tracker uses one live rate, so USD totals differ ~1-3%. To
  // make a currency match Shopify's USD exactly, put Shopify's displayed rate here, e.g.
  // FX_PINNED: { GBP: 1.301, CAD: 0.727 }. Empty {} = use live rates. (Local-currency data is identical either way.)
  FX_PINNED: {},

  // One entry per store. TWO ways to authenticate — either works, the script auto-detects:
  //  (A) client-credentials: fill clientId + clientSecret (Dev-Dashboard app; add read_orders + read_reports scopes).
  //  (B) in-admin custom app (RECOMMENDED for exact match + customer data): store admin → Settings →
  //      Apps and sales channels → Develop apps → Create app → scopes read_orders + read_reports + read_customers →
  //      Install → copy the Admin API access token, and put it in `token: 'shpat_…'` below. In-admin custom apps
  //      get Protected Customer Data (Level 1 & 2) automatically — no request/review — so ShopifyQL + emails work.
  //      If `token` is set it is used and clientId/clientSecret are ignored.
  STORES: [
    { code: 'USA', domain: 'bdsus.myshopify.com',               token: '', clientId: 'PASTE_USA_CLIENT_ID', clientSecret: 'PASTE_USA_CLIENT_SECRET' },
    { code: 'UK',  domain: 'backdropsourceuk.myshopify.com',    token: '', clientId: 'PASTE_UK_CLIENT_ID',  clientSecret: 'PASTE_UK_CLIENT_SECRET' },
    { code: 'CA',  domain: 'backdropsource-v1-0.myshopify.com', token: '', clientId: 'PASTE_CA_CLIENT_ID',  clientSecret: 'PASTE_CA_CLIENT_SECRET' },
    { code: 'AU',  domain: 'mousestored.myshopify.com',         token: '', clientId: 'PASTE_AU_CLIENT_ID',  clientSecret: 'PASTE_AU_CLIENT_SECRET' },
    { code: 'NZ',  domain: 'backdropsourcenz.myshopify.com',    token: '', clientId: 'PASTE_NZ_CLIENT_ID',  clientSecret: 'PASTE_NZ_CLIENT_SECRET' },
    { code: 'UAE', domain: 'PASTE_UAE_STORE.myshopify.com',     token: '', clientId: 'PASTE_UAE_CLIENT_ID', clientSecret: 'PASTE_UAE_CLIENT_SECRET' },
    { code: 'FR',  domain: 'backdropsourcefrance.myshopify.com', token: '', clientId: 'PASTE_FR_CLIENT_ID',  clientSecret: 'PASTE_FR_CLIENT_SECRET' },
    { code: 'ES',  domain: 'backdropsource-spain.myshopify.com', token: '', clientId: 'PASTE_ES_CLIENT_ID',  clientSecret: 'PASTE_ES_CLIENT_SECRET' },
    { code: 'DE',  domain: 'backdropsourcegermany.myshopify.com', token: '', clientId: 'PASTE_DE_CLIENT_ID',  clientSecret: 'PASTE_DE_CLIENT_SECRET' }
  ],

  // Meta Marketing API. ONE System-User token can read all the ad accounts it's
  // assigned to. `id` = the numeric ad-account id (Ads Manager > Account Settings;
  // the number after "act_"). Leave a PASTE_ id to skip that country.
  META: {
    apiVersion: 'v21.0',
    token: 'PASTE_META_SYSTEM_USER_TOKEN',
    accounts: [
      { country: 'USA', id: 'PASTE_USA_AD_ACCOUNT_ID', currency: 'USD' },
      { country: 'CA',  id: 'PASTE_CA_AD_ACCOUNT_ID',  currency: 'CAD' },
      { country: 'UK',  id: 'PASTE_UK_AD_ACCOUNT_ID',  currency: 'GBP' },
      // ONE Meta account ("Backdropsource AUS/NZ") runs BOTH AU + NZ → split by campaign-name prefix ("AU | …" / "NZ | …").
      // Do NOT list this account id twice as separate AU and NZ entries — that double-counts its spend.
      { countries: ['AU', 'NZ'], id: 'PASTE_AUS_NZ_AD_ACCOUNT_ID', currency: 'AUD' },
      { country: 'UAE', id: 'PASTE_UAE_AD_ACCOUNT_ID', currency: 'AED' }
    ]
  },

  // Daily summary delivery — see the WHATSAPP SUMMARY section below for setup.
  WHATSAPP: {
    ENABLED: true,                  // ON — the daily report is sent automatically by the trigger
    CHANNELS: ['email', 'whatsapp'],// send the DAILY report to BOTH channels. Remove one to disable it. 'email' → EMAIL.to below; 'whatsapp' → the PROVIDER below. Each is sent independently, so one failing never blocks the other.
    PROVIDER: 'callmebot',          // the WhatsApp METHOD used when 'whatsapp' is in CHANNELS: 'callmebot' (free bot) | 'cloud' (Meta WhatsApp Cloud API, needs approved template). Email always uses EMAIL.to.
    PERIOD: 'yesterday',            // summarise 'yesterday' or 'today'
    MTD: true,                      // ALSO send a MONTH-TO-DATE summary (1st → the same anchor day), e.g. "1–5 Aug". false = daily only
    SEND_HOUR: 15,                  // send HOUR in the Apps Script PROJECT time zone → set Project Settings ⚙ → Time zone = (GMT+05:30) India Standard Time, so 15 = 3 PM IST
    SEND_MINUTE: 20,                // send MINUTE → 15 + 20 = 3:20 PM IST (Apps Script fires within a ~15-min window of this time). Re-run setup() after changing.
    EMAIL: { to: ['marketingtoolkit@carotechs.com'] },       // PROVIDER 'email' → sent from YOUR Google account via Apps Script (rock-solid). Add any number of recipients.
    CALLMEBOT: [
      // ⚠️ CallMeBot's bot number changed → use +34 623 78 64 49 (save it as a contact, WhatsApp "I allow callmebot to send me messages", get the apikey; "Recover APIKey" re-sends it).
      { phone: '+91XXXXXXXXXX', apikey: 'PASTE_APIKEY_1' },   // recipient 1 — each phone must first authorise CallMeBot (see setup)
      { phone: '+91XXXXXXXXXX', apikey: 'PASTE_APIKEY_2' }    // recipient 2 — add / remove { phone, apikey } lines freely (comma between them)
    ],
    CLOUD: { token: 'PASTE_WABA_TOKEN', phoneNumberId: 'PASTE_PHONE_NUMBER_ID', wabaId: 'PASTE_WABA_ID', to: ['+91XXXXXXXXXX'],
      template: 'daily_ad_summary',           // DAILY headline template (WhatsApp Manager → Message Templates). Blank '' = send plain TEXT (only delivers inside the 24h reply window → testing only).
      monthlyTemplate: 'monthly_ad_summary',  // MONTHLY template — includes draft-order stats (created/value/deleted/conversion). Sent with the Billboard. Blank '' = don't send a monthly WhatsApp.
      templateLang: 'en' }                    // language code for BOTH templates — MUST equal the approved template's language EXACTLY. Your daily_ad_summary is 'en' (plain English). Run listWhatsAppTemplates() to confirm; mismatch → error 132001.
  }
};

// Tab names this script OWNS — all prefixed via CONFIG.TAB_PREFIX so they can be
// dropped into an existing workbook without ever colliding with your current tabs.
// The script only ever creates/updates tabs in this list; it never reads or writes
// any tab it didn't make.
var TAB = {
  SPEND:   CONFIG.TAB_PREFIX + 'Spent Input',
  SHOPIFY: CONFIG.TAB_PREFIX + 'Shopify Daily',
  MASTER:  CONFIG.TAB_PREFIX + 'Daily Master',
  DASH:    CONFIG.TAB_PREFIX + 'Dashboard',
  DAILY:   CONFIG.TAB_PREFIX + 'Daily Budget',
  ROLLUP:  CONFIG.TAB_PREFIX + 'Weekly Rollup',
  OPT:     CONFIG.TAB_PREFIX + 'Optimisation',
  FX:      CONFIG.TAB_PREFIX + 'FX Rates',
  ORDERS:  CONFIG.TAB_PREFIX + 'Shopify Orders'
};

// Tabs renamed across versions → the first time getTab_ runs it renames the OLD sheet
// in place (keeping every row of data) instead of creating a new empty one. new name → old name.
var TAB_RENAMES = {};
TAB_RENAMES[CONFIG.TAB_PREFIX + 'Spent Input'] = CONFIG.TAB_PREFIX + 'Spend Input';

// Per-country default currency (used when a spend/attributed row has none).
var COUNTRY_CFG = {
  USA: { currency: 'USD' }, CA: { currency: 'CAD' }, UK: { currency: 'GBP' },
  AU:  { currency: 'AUD' }, NZ: { currency: 'NZD' }, UAE: { currency: 'AED' },
  FR:  { currency: 'EUR' }, ES: { currency: 'EUR' }, DE:  { currency: 'EUR' }
};

// Normalise country codes → the ONE canonical store code the tracker uses, so a feed that
// posts a variant (US, GB, AE…) folds into USA / UK / UAE instead of showing as a 2nd country.
// Applied on every spend WRITE and READ; a one-off "Fix country codes" menu item merges old rows.
var COUNTRY_ALIAS = { US: 'USA', USA: 'USA', GB: 'UK', UK: 'UK', AE: 'UAE', UAE: 'UAE', CA: 'CA', AU: 'AU', NZ: 'NZ' };
function canonCountry_(v) { var cc = String(v == null ? 'XX' : v).trim().toUpperCase(); return COUNTRY_ALIAS[cc] || cc; }

// Canonical paid platforms (+ Direct for organic attributed revenue).
var PLATFORMS = ['Google', 'Meta', 'Bing', 'LinkedIn', 'TikTok', 'Direct'];

// Free/consumer email providers → "Personal"; anything else with an @ → "Business/Professional".
// (A customer email whose domain isn't in this list is treated as a business/work address.)
var PERSONAL_EMAIL_DOMAINS = {
  'gmail.com':1,'googlemail.com':1,'yahoo.com':1,'yahoo.co.uk':1,'yahoo.ca':1,'yahoo.com.au':1,'ymail.com':1,'rocketmail.com':1,
  'hotmail.com':1,'hotmail.co.uk':1,'hotmail.ca':1,'hotmail.com.au':1,'outlook.com':1,'outlook.co.uk':1,'live.com':1,'live.co.uk':1,
  'msn.com':1,'icloud.com':1,'me.com':1,'mac.com':1,'aol.com':1,'gmx.com':1,'gmx.net':1,'mail.com':1,'proton.me':1,'protonmail.com':1,
  'yandex.com':1,'zoho.com':1,'inbox.com':1,'fastmail.com':1,'hey.com':1,'pm.me':1
};

var SPEND_HEADERS   = ['Date', 'Country', 'Platform', 'Campaign', 'Spend', 'Currency', 'Impressions', 'Clicks', 'Ingest', 'Updated At', 'Notes'];
var SHOPIFY_HEADERS = ['Date', 'Country', 'Orders', 'Paid Orders', 'Pending Orders', 'Paid Revenue', 'Pending Revenue', 'Revenue', 'Currency', 'New Customers', 'Repeat Customers', 'Personal Emails', 'Business Emails', 'Updated At'];
var SHOPIFY_ORDER_HEADERS = ['Date', 'Country', 'Order', 'Financial Status', 'Bucket', 'Amount (local)', 'Currency', 'Amount USD', 'Pulled At'];   // per-order audit trail behind Shopify Daily
var MASTER_HEADERS  = ['Date', 'Country', 'Platform', 'Spend', 'Currency', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Conversions', 'Revenue', 'CPA', 'ROAS', 'AOV'];

/* ============================== WEB APP ================================== */
/* Companion ad-platform scripts POST spend here as JSON to /exec?token=SECRET. */

function doPost(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (String(p.token || '') !== String(CONFIG.SHARED_TOKEN)) return jsonOut_({ ok: false, error: 'bad token' });
  var body = {};
  try { if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  Object.keys(p).forEach(function (k) { if (body[k] === undefined) body[k] = p[k]; });   // querystring fallback
  var type = String(body.type || 'spend').toLowerCase();
  try {
    if (type === 'spend')      return saveSpend_(body);
    if (type === 'spendbatch') return saveSpendBatch_(body);   // MANY day-rows in ONE request (platform scripts) → avoids per-day fetch timeouts
    if (type === 'rebuild')    { buildDailyMaster(); return jsonOut_({ ok: true, built: TAB.MASTER }); }
    return jsonOut_({ ok: false, error: 'unknown type: ' + type });
  } catch (err) { return jsonOut_({ ok: false, error: String(err) }); }
}

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  if (p.type === 'spend' && String(p.token || '') === String(CONFIG.SHARED_TOKEN)) return saveSpend_(p);   // GET beacon fallback
  if (p.action === 'rebuild') { buildDailyMaster(); return jsonOut_({ ok: true, built: TAB.MASTER }); }
  return jsonOut_({ ok: true, version: VERSION, message: 'Backdropsource Ad Budget Tracker endpoint is live.' });
}

/* Upsert one spend row on Date + Country + Platform + Campaign (re-runs overwrite). */
function saveSpend_(d) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) {}
  try {
    var sh = getTab_(TAB.SPEND, SPEND_HEADERS);
    var dk = normDayKey_(d.date) || dayKey_(new Date());
    var cc = canonCountry_(d.country);
    var pf = canonPlatform_(d.platform);
    var camp = String(d.campaign || '');
    var v = {
      'Date': dk, 'Country': cc, 'Platform': pf, 'Campaign': camp,
      'Spend': round2_(num_(d.spend)), 'Currency': d.currency || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || '',
      'Impressions': num_(d.impressions), 'Clicks': num_(d.clicks),
      'Ingest': d.ingest || 'api', 'Updated At': new Date(), 'Notes': d.notes || ''
    };
    var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
    for (var i = 1; i < vals.length; i++) {
      if (normDayKey_(vals[i][c['Date']]) === dk &&
          canonCountry_(vals[i][c['Country']]) === cc &&
          canonPlatform_(vals[i][c['Platform']]) === pf &&
          String(vals[i][c['Campaign']] || '') === camp) {
        SPEND_HEADERS.forEach(function (h) { var ci = c[h]; if (ci != null && v[h] !== undefined) sh.getRange(i + 1, ci + 1).setValue(v[h]); });
        return jsonOut_({ ok: true, upsert: 'update', key: dk + '|' + cc + '|' + pf + '|' + camp });
      }
    }
    appendByHeader_(sh, v, SPEND_HEADERS);
    return jsonOut_({ ok: true, upsert: 'insert', key: dk + '|' + cc + '|' + pf + '|' + camp });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* Batch upsert MANY spend rows in ONE web-app request — ONE lock, ONE sheet read, ONE write.
   The platform scripts (Google/Bing/etc.) send a whole 60-day push as a single call, so a
   slow/cold response can't time out request-by-request. body.rows = [{date,country,platform,
   campaign,spend,impressions,clicks,currency,ingest,notes}, ...]. Upsert key = Date+Country+
   Platform+Campaign, identical to saveSpend_ (re-runs overwrite, never double-count). */
function saveSpendBatch_(body) {
  var rows = (body && body.rows) || [];
  if (!rows.length) return jsonOut_({ ok: true, updated: 0, inserted: 0, total: 0 });
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {}
  try {
    var sh = getTab_(TAB.SPEND, SPEND_HEADERS);
    var vals = sh.getDataRange().getValues(), hdr = vals[0], c = indexMap_(hdr);
    function keyOf(dk, cc, pf, camp) { return dk + '|' + cc + '|' + pf + '|' + camp; }
    var idx = {};
    for (var i = 1; i < vals.length; i++) {
      idx[keyOf(normDayKey_(vals[i][c['Date']]), canonCountry_(vals[i][c['Country']]),
                canonPlatform_(vals[i][c['Platform']]), String(vals[i][c['Campaign']] || ''))] = i;
    }
    var updated = 0, inserted = 0;
    rows.forEach(function (r) {
      var dk = normDayKey_(r.date) || dayKey_(new Date());
      var cc = canonCountry_(r.country);
      var pf = canonPlatform_(r.platform);
      var camp = String(r.campaign || '');
      var v = { 'Date': dk, 'Country': cc, 'Platform': pf, 'Campaign': camp,
        'Spend': round2_(num_(r.spend)), 'Currency': r.currency || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || '',
        'Impressions': num_(r.impressions), 'Clicks': num_(r.clicks),
        'Ingest': r.ingest || 'api', 'Updated At': new Date(), 'Notes': r.notes || '' };
      var k = keyOf(dk, cc, pf, camp), rowArr;
      if (idx[k] != null) { rowArr = vals[idx[k]]; updated++; }
      else { rowArr = hdr.map(function () { return ''; }); vals.push(rowArr); idx[k] = vals.length - 1; inserted++; }
      hdr.forEach(function (h, ci) { var key = String(h).trim(); if (v[key] !== undefined) rowArr[ci] = safeCell_(v[key]); });
    });
    sh.getRange(1, 1, vals.length, hdr.length).setValues(vals);   // single write-back
    return jsonOut_({ ok: true, updated: updated, inserted: inserted, total: rows.length });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (e) {} }
}

/* ======================= META SPEND (Marketing API) ===================== */
/* Daily spend/impressions/clicks per ad account → upserted into "Spend Input".
   A CONFIG.META.accounts entry is either:
     • single-country  { country:'USA', id:'…', currency:'USD' }  → account-level pull, all spend → that country.
     • SHARED account   { countries:['AU','NZ'], id:'…', currency:'AUD' }  → ONE Meta account that runs BOTH
       countries (e.g. "Backdropsource AUS/NZ"). Pulls at CAMPAIGN level and splits each campaign to a country
       by its NAME prefix ("AU | …" / "NZ | …"). This prevents the double-count you get if the same account id
       is listed under two separate single-country entries. Spend is aggregated per country+day and tagged with
       the account's REAL currency, so it upserts cleanly over the old account-level rows. */
function pullMetaSpend(daysBack) {
  daysBack = daysBack || CONFIG.LOOKBACK_DAYS;
  var token = CONFIG.META.token;
  if (!token || token.indexOf('PASTE_') === 0) { Logger.log('Meta: no token configured.'); return; }
  var now = new Date();
  var since = dayKey_(addDays_(now, -(daysBack - 1))), until = dayKey_(now);
  var total = 0, seenAcct = {};
  CONFIG.META.accounts.forEach(function (a) {
    if (!a.id || String(a.id).indexOf('PASTE_') === 0) return;
    var acct = String(a.id).replace(/^act_/, '');   // tolerate a pasted "act_123" handle
    var countries = a.countries || (a.country ? [a.country] : []);
    if (!countries.length) { Logger.log('Meta: account ' + acct + ' has no country/countries — skipped.'); return; }
    if (seenAcct[acct]) { Logger.log('⚠ Meta account ' + acct + ' is listed MORE THAN ONCE in CONFIG.META.accounts — skipping the duplicate to avoid double-counting. If it serves several countries, use ONE entry with countries:[…].'); return; }
    seenAcct[acct] = 1;
    var split = (countries.length > 1) || a.split === true;   // shared account → split by campaign name
    var fields = 'spend,impressions,clicks,account_currency' + (split ? ',campaign_name' : '');
    var url = 'https://graph.facebook.com/' + CONFIG.META.apiVersion + '/act_' + acct +
      '/insights?level=' + (split ? 'campaign' : 'account') + '&time_increment=1&fields=' + fields + '&limit=500' +
      '&time_range=' + encodeURIComponent(JSON.stringify({ since: since, until: until })) +
      '&access_token=' + encodeURIComponent(token);
    var agg = {}, realCur = a.currency || '', unmatched = {}, guard = 0;
    while (url && guard++ < 60) {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var j = {}; try { j = JSON.parse(res.getContentText()); } catch (e) {}
      if (j.error) { Logger.log(countries.join('/') + ' Meta error: ' + JSON.stringify(j.error).slice(0, 220)); break; }
      (j.data || []).forEach(function (row) {
        if (row.account_currency) realCur = row.account_currency;
        var cc;
        if (split) {
          cc = metaCountryFromCampaign_(row.campaign_name, countries);
          if (!cc) { unmatched[row.campaign_name || '(unnamed)'] = 1; return; }   // don't mis-assign — skip + report
        } else { cc = countries[0]; }
        var k = cc + '|' + row.date_start;
        var o = agg[k] || (agg[k] = { cc: cc, date: row.date_start, spend: 0, impr: 0, clicks: 0 });
        o.spend += num_(row.spend); o.impr += num_(row.impressions); o.clicks += num_(row.clicks);
      });
      url = (j.paging && j.paging.next) ? j.paging.next : '';
    }
    if (a.currency && realCur && String(realCur).toUpperCase() !== String(a.currency).toUpperCase())
      Logger.log('⚠ ' + countries.join('/') + ' Meta account currency is ' + realCur + ' but CONFIG says ' + a.currency + ' — using the REAL ' + realCur + ' (fix CONFIG.META to silence).');
    Object.keys(agg).forEach(function (k) {
      var o = agg[k];
      saveSpend_({ date: o.date, country: o.cc, platform: 'Meta', campaign: '',
        spend: o.spend, impressions: o.impr, clicks: o.clicks, currency: realCur, ingest: 'meta-api' });
      total++;
    });
    var um = Object.keys(unmatched);
    if (um.length) Logger.log('⚠ Meta account ' + acct + ': ' + um.length + ' campaign(s) did NOT start with a configured country code ' + JSON.stringify(countries) + ' → their spend was SKIPPED (not mis-assigned). Rename them to start with the country ("AU | …") or fix countries:[…]. Examples: ' + um.slice(0, 6).join(' · '));
  });
  Logger.log('Meta: upserted ' + total + ' country-day row(s).');
}

// For a SHARED Meta account, map a campaign to its country by the name prefix ("AU | Sale…", "NZ | …").
// Returns the matching configured country code, or '' if none matches (caller skips it — never mis-assigns).
function metaCountryFromCampaign_(name, countries) {
  var head = String(name || '').toUpperCase().split('|')[0];        // text before the first '|' → "AU ", "NZ "
  var tokens = head.split(/[^A-Z]+/).filter(Boolean);               // ["AU"] / ["NZ"]
  for (var i = 0; i < countries.length; i++) {
    var cc = String(countries[i]).toUpperCase();
    if (tokens.indexOf(cc) !== -1) return canonCountry_(cc);        // country code appears as a leading token
  }
  return '';
}

// ONE-OFF cleanup: delete ALL Meta rows from Spent Input, so the next "Pull Meta spend" rewrites them
// with NO leftover double-counted rows (needed after the AU/NZ shared-account fix — the old pull wrote
// the whole account under BOTH AU and NZ). Meta re-pulls the full lookback window, so nothing is lost.
function clearMetaRows() {
  var sh = getSpreadsheet_().getSheetByName(TAB.SPEND);
  if (!sh || sh.getLastRow() < 2) { Logger.log('No ' + TAB.SPEND + ' rows.'); return; }
  var vals = sh.getDataRange().getValues(), hdr = vals[0], c = indexMap_(hdr);
  var keep = [], removed = 0;
  for (var i = 1; i < vals.length; i++) {
    if (canonPlatform_(vals[i][c['Platform']]) === 'Meta') { removed++; continue; }
    keep.push(vals[i]);
  }
  clearSheet_(sh);
  sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (keep.length) sh.getRange(2, 1, keep.length, hdr.length).setValues(keep);
  try { formatSpend_(); } catch (e) {}
  Logger.log('Cleared ' + removed + ' Meta row(s) from ' + TAB.SPEND + '. Now run "Pull Meta spend" to rewrite them cleanly, then Rebuild.');
}
function menuClearMeta() { clearMetaRows(); }

/* META SETUP HELPER — lists EVERY ad account your System-User token can see, with the exact
   account_id + name + currency to paste into CONFIG.META.accounts. Run this right after you paste
   the token (menu "Pull Meta spend" is the real pull; this one just discovers the IDs).
   Editor → pick debugMeta → Run → View › Logs.  (id = the number only, no "act_".) */
function debugMeta() {
  var token = CONFIG.META.token;
  if (!token || token.indexOf('PASTE') === 0) { Logger.log('Meta: paste your System-User token into CONFIG.META.token first, then run debugMeta again.'); return; }
  var url = 'https://graph.facebook.com/' + CONFIG.META.apiVersion +
            '/me/adaccounts?fields=account_id,name,currency,account_status&limit=500&access_token=' + encodeURIComponent(token);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var j = {}; try { j = JSON.parse(res.getContentText()); } catch (e) {}
  if (j.error) {
    Logger.log('❌ Meta token error: ' + JSON.stringify(j.error).slice(0, 300));
    Logger.log('→ Fix: the token needs the ads_read permission AND the System User must be assigned each ad account (Business Settings › Users › System Users › Add Assets › Ad Accounts). Then regenerate the token.');
    return;
  }
  var list = j.data || [];
  Logger.log('=== ✅ Meta ad accounts THIS TOKEN can see (' + list.length + ') ===');
  list.forEach(function (a) {
    var st = (a.account_status === 1) ? 'ACTIVE' : ('status ' + a.account_status);
    Logger.log('  account_id = ' + a.account_id + '   ·   ' + (a.name || '(no name)') + '   ·   ' + (a.currency || '?') + '   ·   ' + st);
  });
  Logger.log('→ Paste each account_id into the MATCHING country in CONFIG.META.accounts (id = the number only, no "act_"). Then run "Pull Meta spend".');
}
function menuMetaList() { debugMeta(); }

/* ======================= SHOPIFY TOTALS (Admin API) ===================== */
/* Revenue per Date x Country → "Shopify Daily", reproducing Shopify Analytics
   "Total sales" week-by-week:
     • SALE  = the order's ORIGINAL total (totalPriceSet) booked on its CREATED date;
     • REVERSAL = (totalPrice − currentTotal), split by TYPE onto its OWN date: each REFUND on its
       refund date; a CANCELLATION on cancelledAt; a RETURN/edit (Shopify exposes NO clean
       recognition date for these in the orders API) falls back to the ORDER date.
   → refunds & cancellations land in the exact Shopify week; returns net on the order's week, so the
   MONTHLY total is always exact and only heavy-RETURN weeks can differ a little. (Do NOT date the
   remainder by updatedAt — any later edit moves it, dumping old reversals onto recent weeks and
   producing false NEGATIVE weeks.)
   currentTotal is Shopify's net-of-everything figure, so (total − current) is the exact
   reversal amount; placing it on the reversal DATE (not the order date) is what makes each
   WEEK match Shopify (a reversal in a different week than the order used to inflate the
   later week). Proven on CA: reversals = CA$99,740/60d (16.5% of sales), only 3% refunds —
   the rest cancellations/returns, which ONLY the total−current delta captures.
   Pulled by UPDATED_AT so an order reversed in-window is caught even if created earlier;
   the SALE is booked only for orders CREATED in-window, the REVERSAL only if dated in-window.
   Needs the read_orders scope. */
function pullShopifyDaily(daysBack) {
  daysBack = daysBack || CONFIG.LOOKBACK_DAYS;
  var sinceDate = addDays_(new Date(), -(daysBack)), sinceMs = sinceDate.getTime();
  var sinceISO = Utilities.formatDate(sinceDate, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var q = 'query($cursor:String,$q:String){orders(first:75, after:$cursor, query:$q, sortKey:UPDATED_AT){' +
          'pageInfo{hasNextPage endCursor} edges{node{name createdAt cancelledAt test displayFinancialStatus ' +
          'totalPriceSet{shopMoney{amount currencyCode}} currentTotalPriceSet{shopMoney{amount currencyCode}} ' +
          'refunds{createdAt totalRefundedSet{shopMoney{amount}}}}}}}';
  var now = new Date(), allOrders = [];
  CONFIG.STORES.forEach(function (st) {
    if (!st.domain || st.domain.indexOf('PASTE') === 0) return;
    var tz = shopTz_(st);   // bucket by the STORE's own timezone → day/week boundaries match Shopify Analytics
    var agg = {}, cursor = null, guard = 0, throttle = 0;
    function day_(dk, ccy) { var a = agg[dk] || (agg[dk] = { orders: 0, paidOrders: 0, pendOrders: 0, paidRev: 0, pendRev: 0, currency: '' }); if (ccy && !a.currency) a.currency = ccy; return a; }
    function sdk_(dt) { return Utilities.formatDate(dt, tz, 'yyyy-MM-dd'); }   // store-local calendar day
    while (guard++ < 300) {
      var res = shopifyGraphQL_(st, q, { cursor: cursor, q: 'updated_at:>=' + sinceISO });
      var conn = res && res.data && res.data.orders;
      if (!conn) {
        if (res && /THROTTLED/i.test(JSON.stringify(res.errors || '')) && throttle++ < 6) { Utilities.sleep(2500); continue; }   // back off + retry same page
        Logger.log(st.code + ' orders API error: ' + JSON.stringify(res).slice(0, 300)); break;
      }
      conn.edges.forEach(function (e) {
        var n = e.node; if (n.test) return;
        var dt = asDate_(n.createdAt); if (!dt) return;
        var tpM = n.totalPriceSet && n.totalPriceSet.shopMoney, ctM = n.currentTotalPriceSet && n.currentTotalPriceSet.shopMoney;
        var ccy = (tpM && tpM.currencyCode) || (ctM && ctM.currencyCode) || ((COUNTRY_CFG[st.code] && COUNTRY_CFG[st.code].currency) || '');
        var tp = tpM ? (Number(tpM.amount) || 0) : (ctM ? (Number(ctM.amount) || 0) : 0);   // ORIGINAL total (before reversals)
        var ct = ctM ? (Number(ctM.amount) || 0) : tp;                                       // CURRENT total (after reversals)
        var fs = String(n.displayFinancialStatus || '').toUpperCase();
        var pending = (fs === 'PENDING' || fs === 'AUTHORIZED');   // awaiting payment → Pending column; everything else → Paid
        // SALE — original total on the CREATED date, for orders created inside the window
        if (dt.getTime() >= sinceMs) {
          var dk = sdk_(dt);
          var a = day_(dk, ccy);
          a.orders++;
          if (pending) { a.pendOrders++; a.pendRev += tp; } else { a.paidOrders++; a.paidRev += tp; }
          allOrders.push([dk, st.code, n.name || '', fs, (pending ? 'Pending' : 'Paid'), round2_(tp), ccy, round2_(fxToUSD_(tp, ccy)), now]);
        }
        // REVERSALS — each REFUND on its own refund date; the remaining returns/cancellations/edits
        // (no refund object) on cancelledAt, else the ORDER date. NEVER updatedAt — a later edit moves
        // it and would dump historical reversals onto recent weeks (→ false negative weeks).
        var delta = tp - ct;
        if (delta > 0.005) {
          var refundSum = 0;
          (n.refunds || []).forEach(function (rf) {
            var rm = rf.totalRefundedSet && rf.totalRefundedSet.shopMoney, ra = rm ? (Number(rm.amount) || 0) : 0; if (!ra) return;
            refundSum += ra;
            var rdt = asDate_(rf.createdAt) || dt;
            if (rdt.getTime() >= sinceMs) {
              var rk = sdk_(rdt), rr = day_(rk, ccy);
              if (pending) rr.pendRev -= ra; else rr.paidRev -= ra;
              allOrders.push([rk, st.code, n.name || '', 'REFUND', 'Reversal', round2_(-ra), ccy, round2_(-fxToUSD_(ra, ccy)), now]);
            }
          });
          var remainder = delta - refundSum;   // returns / cancellations / edits (not classic refunds)
          if (remainder > 0.005) {
            var xDate = asDate_(n.cancelledAt) || dt;   // cancel date if cancelled; else net on the order date (returns have no clean date in the orders API)
            if (xDate.getTime() >= sinceMs) {
              var xk = sdk_(xDate), xr = day_(xk, ccy);
              if (pending) xr.pendRev -= remainder; else xr.paidRev -= remainder;
              allOrders.push([xk, st.code, n.name || '', 'RETURN/CANCEL', 'Reversal', round2_(-remainder), ccy, round2_(-fxToUSD_(remainder, ccy)), now]);
            }
          }
        }
      });
      if (conn.pageInfo && conn.pageInfo.hasNextPage) { cursor = conn.pageInfo.endCursor; Utilities.sleep(300); }
      else break;
    }
    // EXACT MATCH: overlay Shopify's own "Total sales" (ShopifyQL) as the authoritative daily
    // Revenue (Blended). Orders-based Paid/Pending stay as the split; Blended now = the dashboard.
    try {
      var qlMap = shopifyQLDailySales_(st, daysBack);
      if (qlMap) {
        var qn = 0;
        Object.keys(qlMap).forEach(function (dk) {
          var a = agg[dk] || (agg[dk] = { orders: 0, paidOrders: 0, pendOrders: 0, paidRev: 0, pendRev: 0, currency: '' });
          a.qlRev = qlMap[dk];
          if (!a.currency) a.currency = (COUNTRY_CFG[st.code] && COUNTRY_CFG[st.code].currency) || '';
          qn++;
        });
        Logger.log(st.code + ' ShopifyQL exact "Total sales" applied for ' + qn + ' day(s).');
      } else {
        Logger.log(st.code + ' ShopifyQL unavailable → Revenue stays order-based (add read_reports to enable exact match).');
      }
    } catch (e) { Logger.log(st.code + ' ShopifyQL error: ' + e); }
    // CUSTOMER STATS (new/returning + personal/business email) — separate query so a missing
    // read_customers scope can't break revenue; days without data just leave those columns blank.
    try {
      var custMap = pullShopifyCustomers_(st, daysBack, tz);
      if (custMap) {
        Object.keys(custMap).forEach(function (dk) {
          var a = agg[dk] || (agg[dk] = { orders: 0, paidOrders: 0, pendOrders: 0, paidRev: 0, pendRev: 0, currency: '' });
          var cm = custMap[dk]; a.newC = cm.newC; a.retC = cm.retC; a.pers = cm.pers; a.biz = cm.biz;
        });
        Logger.log(st.code + ' customer stats applied for ' + Object.keys(custMap).length + ' day(s).');
      }
    } catch (e) { Logger.log(st.code + ' customer stats error: ' + e); }
    // AUTHORITATIVE New vs Returning — Shopify's OWN split (ShopifyQL new_or_returning_customer),
    // so it matches Shopify Analytics exactly. The orders-API numberOfOrders count above returns 0
    // Repeat for these stores (guest checkouts / field not populated), so this OVERWRITES newC/retC
    // whenever ShopifyQL is available; the orders-based values stay only as a fallback.
    try {
      var nrMap = shopifyQLCustomers_(st, daysBack);
      if (nrMap) {
        Object.keys(nrMap).forEach(function (dk) {
          var a = agg[dk] || (agg[dk] = { orders: 0, paidOrders: 0, pendOrders: 0, paidRev: 0, pendRev: 0, currency: '' });
          a.newC = nrMap[dk].newC; a.retC = nrMap[dk].retC;
        });
        Logger.log(st.code + ' ShopifyQL new/returning applied for ' + Object.keys(nrMap).length + ' day(s).');
      } else {
        Logger.log(st.code + ' ShopifyQL new/returning unavailable → kept orders-based split (add read_reports to enable exact match).');
      }
    } catch (e) { Logger.log(st.code + ' QL customers error: ' + e); }
    upsertShopifyDaily_(st.code, agg);
    Logger.log(st.code + ' Shopify daily: ' + Object.keys(agg).length + ' day(s).');
  });
  try { writeShopifyOrders_(allOrders); } catch (e) { Logger.log('writeShopifyOrders: ' + e); }
}

/* Normalise ShopifyQL parseErrors → '' when there are NO errors. The field can come back as null,
   an empty string, OR an EMPTY ARRAY []. An empty array is TRUTHY in JS, so a naive `if (parseErrors)`
   wrongly treats a perfectly valid query as failed (this made new/returning + exact revenue return
   null for every store). Returns a non-empty string ONLY when there is a real parse error. */
function qlErr_(pe) {
  if (pe == null) return '';
  if (typeof pe === 'string') return pe.trim();
  if (Object.prototype.toString.call(pe) === '[object Array]') return pe.length ? JSON.stringify(pe) : '';
  return JSON.stringify(pe);
}

/* EXACT SHOPIFY MATCH — Shopify's OWN analytics engine (ShopifyQL) returns "Total sales" per day,
   already netting returns/refunds/cancellations on the exact dates Shopify recognizes them, so
   summing these days over any week/month equals the Analytics dashboard to the cent. Returns
   { 'yyyy-mm-dd': totalSales } in the STORE's currency, or null if unavailable (→ caller keeps the
   order-based figure). Needs the read_reports scope. */
function shopifyQLDailySales_(st, daysBack) {
  var ql = 'FROM sales SHOW total_sales GROUP BY day SINCE -' + (daysBack || CONFIG.LOOKBACK_DAYS) + 'd UNTIL today ORDER BY day';
  var gql = 'query($q:String!){shopifyqlQuery(query:$q){__typename parseErrors tableData{rows columns{name dataType displayName}}}}';   // flat type; data field is `rows` (JSON), not rowData
  var res = shopifyGraphQL_(st, gql, { q: ql });
  var sq = res && res.data && res.data.shopifyqlQuery;
  if (!sq) { Logger.log(st.code + ' ShopifyQL: no response (' + JSON.stringify((res && res.errors) || res).slice(0, 180) + ')'); return null; }
  var pe1 = qlErr_(sq.parseErrors); if (pe1) { Logger.log(st.code + ' ShopifyQL parseErrors: ' + pe1.slice(0, 180)); return null; }
  var td = sq.tableData;
  var rowsData = td && (td.rows || td.rowData);   // `rows` = JSON: an array of ROW OBJECTS {day:'…', total_sales:'…'} (some schemas return positional arrays)
  if (!td || !rowsData || !rowsData.length) { Logger.log(st.code + ' ShopifyQL: no rows'); return null; }
  var cols = td.columns || [], dayIdx = -1, salesIdx = -1, dayCol = null, salesCol = null;
  cols.forEach(function (c, i) {
    var nm = String(c.name || '').toLowerCase(), dt = String(c.dataType || '').toLowerCase();
    if (salesCol == null && nm.indexOf('sales') !== -1) { salesCol = c.name; salesIdx = i; }
    if (dayCol == null && (nm === 'day' || nm.indexOf('day') !== -1 || nm.indexOf('date') !== -1 || dt.indexOf('date') !== -1 || dt.indexOf('time') !== -1)) { dayCol = c.name; dayIdx = i; }
  });
  if (dayIdx < 0) { dayIdx = 0; dayCol = cols[0] && cols[0].name; }
  if (salesIdx < 0) { salesIdx = cols.length - 1; salesCol = cols[cols.length - 1] && cols[cols.length - 1].name; }
  var map = {};
  rowsData.forEach(function (row) {
    if (!row) return;
    var dv, sv;
    if (row instanceof Array) { dv = row[dayIdx]; sv = row[salesIdx]; }   // positional-array row
    else { dv = row[dayCol]; sv = row[salesCol]; }                         // object row keyed by column name (what Shopify returns)
    var dk = normDayKey_(dv); if (!dk) return;
    map[dk] = num_(sv);
  });
  return map;
}

/* NEW vs RETURNING customers per day — Shopify's OWN split via ShopifyQL's new_or_returning_customer
   dimension (the SAME data as Analytics ▸ "New vs returning customers": your July USA = New 623,
   Returning 374). This replaces the orders-API numberOfOrders count, which returned 0 Repeat for
   these stores. Returns { 'yyyy-mm-dd': {newC, retC} } in the store's calendar, or null if
   unavailable. Needs read_reports (same scope as the exact "Total sales" query). */
function shopifyQLCustomers_(st, daysBack) {
  var ql = 'FROM sales SHOW customers GROUP BY day, new_or_returning_customer SINCE -' + (daysBack || CONFIG.LOOKBACK_DAYS) + 'd UNTIL today';
  var gql = 'query($q:String!){shopifyqlQuery(query:$q){parseErrors tableData{rows columns{name dataType}}}}';
  var res = shopifyGraphQL_(st, gql, { q: ql });
  var sq = res && res.data && res.data.shopifyqlQuery;
  if (!sq) { Logger.log(st.code + ' QL customers: no response (' + JSON.stringify((res && res.errors) || res).slice(0, 160) + ')'); return null; }
  var pe2 = qlErr_(sq.parseErrors); if (pe2) { Logger.log(st.code + ' QL customers parseErrors: ' + pe2.slice(0, 180)); return null; }
  var td = sq.tableData, rowsData = td && (td.rows || td.rowData);
  if (!td || !rowsData || !rowsData.length) { Logger.log(st.code + ' QL customers: no rows'); return null; }
  var cols = td.columns || [], dayCol = null, typeCol = null, custCol = null, dayIdx = -1, typeIdx = -1, custIdx = -1;
  cols.forEach(function (c, i) {
    var nm = String(c.name || '').toLowerCase(), dt = String(c.dataType || '').toLowerCase();
    if (dayCol == null && (nm === 'day' || nm.indexOf('day') !== -1 || nm.indexOf('date') !== -1 || dt.indexOf('date') !== -1 || dt.indexOf('time') !== -1)) { dayCol = c.name; dayIdx = i; }
    else if (typeCol == null && (nm.indexOf('return') !== -1 || nm.indexOf('new_or') !== -1)) { typeCol = c.name; typeIdx = i; }   // the new_or_returning_customer DIMENSION (checked before the customers MEASURE, which also contains "customer")
    else if (custCol == null && nm.indexOf('customer') !== -1) { custCol = c.name; custIdx = i; }
  });
  if (custCol == null) { Logger.log(st.code + ' QL customers: no customers column in ' + JSON.stringify(cols.map(function (c) { return c.name; }))); return null; }
  var map = {};
  rowsData.forEach(function (row) {
    if (!row) return;
    var dv, tv, cv;
    if (row instanceof Array) { dv = row[dayIdx]; tv = (typeIdx >= 0 ? row[typeIdx] : ''); cv = row[custIdx]; }
    else { dv = row[dayCol]; tv = (typeCol ? row[typeCol] : ''); cv = row[custCol]; }
    var dk = normDayKey_(dv); if (!dk) return;
    var m = map[dk] || (map[dk] = { newC: 0, retC: 0 });
    var t = String(tv == null ? '' : tv).toLowerCase(), n = num_(cv);
    if (t.indexOf('return') !== -1 || t.indexOf('repeat') !== -1) m.retC += n; else m.newC += n;   // anything not explicitly "returning" → new
  });
  return map;
}

/* CUSTOMER STATS per day — NEW vs RETURNING customers (→ Returning Customer Rate) and
   PERSONAL vs BUSINESS email split. Reads each order's customer + email, so it needs the
   read_customers scope (customer email is Protected Customer Data). Counts DISTINCT customers
   per day (a customer with 2 orders that day counts once); returning = the customer's lifetime
   order count > 1. Returns { 'yyyy-mm-dd': {newC,retC,pers,biz} } or null if the scope is missing
   (→ caller leaves those columns blank; revenue is unaffected — this is a SEPARATE query). */
function pullShopifyCustomers_(st, daysBack, tz) {
  var sinceDate = addDays_(new Date(), -(daysBack)), sinceMs = sinceDate.getTime();
  var sinceISO = Utilities.formatDate(sinceDate, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var q = 'query($cursor:String,$q:String){orders(first:100, after:$cursor, query:$q, sortKey:CREATED_AT){' +
          'pageInfo{hasNextPage endCursor} edges{node{createdAt test email customer{id numberOfOrders}}}}}';
  var byDay = {}, cursor = null, guard = 0;
  while (guard++ < 300) {
    var res = shopifyGraphQL_(st, q, { cursor: cursor, q: 'created_at:>=' + sinceISO });
    var conn = res && res.data && res.data.orders;
    if (!conn) {
      Logger.log(st.code + ' customer data unavailable (add read_customers scope to the app): ' + JSON.stringify((res && res.errors) || res).slice(0, 200));
      return null;
    }
    conn.edges.forEach(function (e) {
      var n = e.node; if (n.test) return;
      var dt = asDate_(n.createdAt); if (!dt || dt.getTime() < sinceMs) return;
      var dk = Utilities.formatDate(dt, tz, 'yyyy-MM-dd');
      var day = byDay[dk] || (byDay[dk] = { seen: {}, newC: 0, retC: 0, pers: 0, biz: 0 });
      var cust = n.customer;
      var email = String(n.email || '').toLowerCase();
      var cid = (cust && cust.id) || ('guest:' + (email || ('x' + guard)));   // group by customer; guests w/o id fall back to email
      if (day.seen[cid]) return;   // count each customer once per day
      day.seen[cid] = 1;
      var num = cust ? Number(cust.numberOfOrders || 1) : 1;
      if (num > 1) day.retC++; else day.newC++;
      var at = email.indexOf('@');
      if (at !== -1) { if (PERSONAL_EMAIL_DOMAINS[email.slice(at + 1)]) day.pers++; else day.biz++; }
    });
    if (conn.pageInfo && conn.pageInfo.hasNextPage) { cursor = conn.pageInfo.endCursor; Utilities.sleep(250); }
    else break;
  }
  var out = {};
  Object.keys(byDay).forEach(function (dk) { var d = byDay[dk]; out[dk] = { newC: d.newC, retC: d.retC, pers: d.pers, biz: d.biz }; });
  return out;
}

/* Per-order audit trail (replaced each pull) so every Paid/Pending number in the
   reports is traceable to the exact orders behind it. Filter by Country + Bucket
   + date range and sum "Amount USD" to reconcile against Weekly Rollup / Shopify Daily. */
function writeShopifyOrders_(rows) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(TAB.ORDERS) || ss.insertSheet(TAB.ORDERS);
  clearSheet_(sh);
  sh.getRange(1, 1, 1, SHOPIFY_ORDER_HEADERS.length).setValues([SHOPIFY_ORDER_HEADERS])
    .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
  sh.setFrozenRows(1);
  rows.sort(function (a, b) { if (a[0] !== b[0]) return a[0] < b[0] ? 1 : -1; return a[1] < b[1] ? -1 : (a[1] > b[1] ? 1 : 0); });   // date desc, country asc
  if (rows.length) {
    sh.getRange(2, 1, rows.length, SHOPIFY_ORDER_HEADERS.length).setValues(rows);
    sh.getRange(2, 6, rows.length, 1).setNumberFormat('#,##0.00');
    sh.getRange(2, 8, rows.length, 1).setNumberFormat('#,##0.00');
    sh.getRange(2, 9, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    applyBanding_(sh, 2, 1, rows.length, SHOPIFY_ORDER_HEADERS.length);
    var L = colLetter_(5), rng = sh.getRange(L + '2:' + L);   // Bucket column colours
    sh.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Paid').setBackground('#CDEBD3').setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Pending').setBackground('#FCEFA1').setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Reversal').setBackground('#F4C7C3').setRanges([rng]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Other').setBackground('#F1F3F4').setRanges([rng]).build()
    ]);
  }
  sh.setColumnWidth(3, 120);
  centerAll_(sh);
  Logger.log('Shopify Orders (audit): ' + rows.length + ' order(s).');
}

function upsertShopifyDaily_(cc, agg) {
  var sh = getTab_(TAB.SHOPIFY, SHOPIFY_HEADERS);
  var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
  var index = {};
  for (var i = 1; i < vals.length; i++) index[normDayKey_(vals[i][c['Date']]) + '|' + String(vals[i][c['Country']]).toUpperCase()] = i + 1;
  Object.keys(agg).forEach(function (dk) {
    var a = agg[dk], key = dk + '|' + cc;
    var v = { 'Date': dk, 'Country': cc, 'Orders': a.orders,
      'Paid Orders': a.paidOrders, 'Pending Orders': a.pendOrders,
      'Paid Revenue': round2_(a.paidRev), 'Pending Revenue': round2_(a.pendRev), 'Revenue': round2_(a.qlRev != null ? a.qlRev : (a.paidRev + a.pendRev)),
      'Currency': a.currency || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || '',
      'New Customers': (a.newC != null ? a.newC : ''), 'Repeat Customers': (a.retC != null ? a.retC : ''),
      'Personal Emails': (a.pers != null ? a.pers : ''), 'Business Emails': (a.biz != null ? a.biz : ''),
      'Updated At': new Date() };
    if (index[key]) SHOPIFY_HEADERS.forEach(function (h) { var ci = c[h]; if (ci != null) sh.getRange(index[key], ci + 1).setValue(v[h]); });
    else appendByHeader_(sh, v, SHOPIFY_HEADERS);
  });
}

/* =================== ATTRIBUTED SPLIT (bds-unified sheet) =============== */
/* Read the live tracking sheet's "<CC> Order" PURCHASE rows; group by
   Day x Country x Platform (Source → platform). Returns { key: {orders,revenue} }. */
function readAttributed_() {
  var out = {};
  if (!CONFIG.TRACKING_SHEET_ID || CONFIG.TRACKING_SHEET_ID.indexOf('PASTE') === 0) return out;
  var ss;
  try { ss = SpreadsheetApp.openById(CONFIG.TRACKING_SHEET_ID); }
  catch (e) { Logger.log('tracking sheet open failed: ' + e); return out; }
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (!/ Order$/.test(name)) return;
    var cc = canonCountry_(name.replace(/ Order$/, ''));
    if (sh.getLastRow() < 2) return;
    var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
    var tsC = c['Timestamp'], stC = c['Stage'], srcC = c['Source'], valC = c['Value'], curC = c['Currency'];
    if (tsC == null || stC == null) return;
    var ccCur = (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || 'USD';
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][stC]).toLowerCase() !== 'purchase') continue;
      var dt = asDate_(vals[i][tsC]); if (!dt) continue;
      var key = dayKey_(dt) + '|' + cc + '|' + platformOf_(vals[i][srcC]);
      var o = out[key] || (out[key] = { orders: 0, revenue: 0 });
      o.orders++;
      o.revenue += fxToUSD_(valC != null ? vals[i][valC] : 0, (curC != null ? vals[i][curC] : '') || ccCur);
    }
  });
  return out;
}

/* Sum "Spend Input" per Day x Country x Platform (across campaigns). */
function readSpend_() {
  var sh = getTab_(TAB.SPEND, SPEND_HEADERS);
  var out = {};
  if (sh.getLastRow() < 2) return out;
  var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
  for (var i = 1; i < vals.length; i++) {
    var dk = normDayKey_(vals[i][c['Date']]); if (!dk) continue;
    var cc = canonCountry_(vals[i][c['Country']]);
    var pf = canonPlatform_(vals[i][c['Platform']]);
    var key = dk + '|' + cc + '|' + pf;
    var o = out[key] || (out[key] = { spend: 0, impr: 0, clicks: 0, currency: 'USD' });
    o.spend += fxToUSD_(vals[i][c['Spend']], vals[i][c['Currency']] || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency));
    o.impr += num_(vals[i][c['Impressions']]);
    o.clicks += num_(vals[i][c['Clicks']]);
  }
  return out;
}

/* ========================= BUILD DAILY MASTER =========================== */
/* Join Spend + attributed Conversions/Revenue → one row per Day x Country x
   Platform, with CPA/ROAS/AOV/CTR/CPC. Overwrites the tab, then rebuilds the dashboard. */
function buildDailyMaster() {
  var spend = readSpend_(), attr = readAttributed_();
  var keys = {};
  Object.keys(spend).forEach(function (k) { keys[k] = 1; });
  Object.keys(attr).forEach(function (k) { keys[k] = 1; });

  var rows = Object.keys(keys).map(function (k) {
    var parts = k.split('|'), cc = parts[1];
    var s = spend[k] || { spend: 0, impr: 0, clicks: 0, currency: '' };
    var a = attr[k]  || { orders: 0, revenue: 0 };
    var currency = CONFIG.REPORT_CURRENCY;   // everything normalised to USD
    var ctr  = s.impr   ? s.clicks / s.impr : '';
    var cpc  = s.clicks ? s.spend / s.clicks : '';
    var cpa  = a.orders ? s.spend / a.orders : '';
    var roas = s.spend  ? a.revenue / s.spend : '';
    var aov  = a.orders ? a.revenue / a.orders : '';
    return [parts[0], cc, parts[2], round2_(s.spend), currency, s.impr, s.clicks,
      ctr === '' ? '' : round4_(ctr), cpc === '' ? '' : round2_(cpc),
      a.orders, round2_(a.revenue),
      cpa === '' ? '' : round2_(cpa), roas === '' ? '' : round2_(roas), aov === '' ? '' : round2_(aov)];
  });

  rows.sort(function (x, y) {
    if (x[0] !== y[0]) return x[0] < y[0] ? 1 : -1;   // Date desc (newest first)
    if (x[1] !== y[1]) return x[1] < y[1] ? -1 : 1;   // Country asc
    return x[2] < y[2] ? -1 : (x[2] > y[2] ? 1 : 0);  // Platform asc
  });

  var sh = getTab_(TAB.MASTER, MASTER_HEADERS);
  sh.clear();
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange(1, 1, 1, MASTER_HEADERS.length).setValues([MASTER_HEADERS]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, MASTER_HEADERS.length).setValues(rows);
  sh.setFrozenRows(1);
  formatMaster_();
  buildDashboard();
  Logger.log('Daily Master rebuilt: ' + rows.length + ' row(s).');
}

/* ============================ ORCHESTRATION ============================= */
function refreshAll() {                       // daily trigger + "Refresh ALL" menu
  try { refreshFxRates(); }   catch (e) { Logger.log('refreshFxRates: ' + e); }
  try { pullMetaSpend(); }    catch (e) { Logger.log('pullMetaSpend: ' + e); }
  try { pullShopifyDaily(); } catch (e) { Logger.log('pullShopifyDaily: ' + e); }
  try { buildReports(); }     catch (e) { Logger.log('buildReports: ' + e); }
}
function rebuildAll()      { buildReports(); }                     // cheap: re-render reports from existing data (30-min trigger)
function menuPullShopify() { pullShopifyDaily(); buildReports(); }
function menuPullMeta()    { pullMetaSpend();    buildReports(); }
function menuDashboard()   { buildDailyMaster(); }                 // optional analytical view (Daily Master + Dashboard)
function menuRefreshFx()   { refreshFxRates(); buildReports(); }
function menuReconcile()   { reconcileShopify(); }                 // print LOCAL-currency weekly Shopify totals to Logs for exact checking
function menuReconcileSpend() { reconcileSpend(); }               // print LOCAL-currency weekly spend per country×platform (verify Bing/Google/Meta vs each ad UI)

/* Prints each COUNTRY × PLATFORM weekly spend in its OWN ACCOUNT CURRENCY (from BDS
   Spend Input, stored un-converted). Compare a line to that platform's own dashboard
   (Microsoft/Bing Ads, Google Ads, Meta Ads Manager) for the SAME dates & currency —
   it should match. This separates the two kinds of "Bing mismatch":
     • numbers match here but differ in the report  → it's ONLY the USD conversion (expected).
     • numbers are LOW / missing days here          → a real data gap (e.g. the Microsoft
       Advertising Script couldn't read some days) → fix the feed, not the rate.
   Run via menu "💰 Ad Budget › Reconcile SPEND (local $)", then read the Execution log. */
function reconcileSpend() {
  var sh = getSpreadsheet_().getSheetByName(TAB.SPEND);
  if (!sh || sh.getLastRow() < 2) { Logger.log('No ' + TAB.SPEND + ' data yet — pull/paste spend first.'); return; }
  var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]), agg = {};
  for (var i = 1; i < vals.length; i++) {
    var dk = normDayKey_(vals[i][c['Date']]); if (!dk) continue;
    var cc = canonCountry_(vals[i][c['Country']]);
    var pf = canonPlatform_(vals[i][c['Platform']]);
    var cur = vals[i][c['Currency']] || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || '';
    var sp = num_(vals[i][c['Spend']]);
    var p = dk.split('-'), y = +p[0], m = +p[1] - 1, day = +p[2], mk = p[0] + '-' + p[1], wk = weekIndexFor_(y, m, day);
    var key = cc + '|' + pf;
    var w = (((agg[key] = agg[key] || {})[mk] = agg[key][mk] || {})[wk] = agg[key][mk][wk] || { spend: 0, cur: cur, min: day, max: day, days: 0 });
    w.spend += sp; w.cur = cur; if (day < w.min) w.min = day; if (day > w.max) w.max = day; w.days++;
  }
  var out = ['=== LOCAL-CURRENCY SPEND RECONCILIATION ===',
             'Compare each line to that platform\'s own dashboard (Microsoft/Google/Meta Ads) for the SAME dates & currency.',
             'These are UN-converted (account currency). A gap HERE = a real data feed issue (e.g. missing days).', ''];
  Object.keys(agg).sort().forEach(function (key) {
    out.push('# ' + key.replace('|', '  ·  '));
    Object.keys(agg[key]).sort().forEach(function (mk) {
      var p = mk.split('-'), m = +p[1] - 1;
      Object.keys(agg[key][mk]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (wk) {
        var w = agg[key][mk][wk];
        out.push('  ' + MONTHS[m] + ' ' + w.min + '–' + w.max + '  ' + w.cur +
                 '  Spend = ' + round2_(w.spend) + '   (' + w.days + ' day-rows)');
      });
    });
    out.push('');
  });
  Logger.log(out.join('\n'));
}

/* SPEND COVERAGE — the fastest answer to "why is Spent $0 for a country?". For the last N days it
   lists EVERY expected Country × Platform and shows the last date data arrived + the N-day total, or
   "✗ NO DATA — feed not running" when nothing has ever posted. A ✗ means that platform's script is
   NOT installed/scheduled in that account (or its schedule was disabled) — install/schedule it there;
   no code change makes spend appear until the account is actually pushing. Menu "Spend coverage (who's feeding?)". */
var COVERAGE_PLATS = ['Google', 'Bing', 'Meta', 'LinkedIn'];
function spendCoverage(days) {
  days = days || 7;
  var sh = getSpreadsheet_().getSheetByName(TAB.SPEND);
  var sinceKey = dayKey_(addDays_(new Date(), -(days - 1)));
  var seen = {};   // 'CC|PF' -> { total, last, currency, rows }
  if (sh && sh.getLastRow() >= 2) {
    var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
    for (var i = 1; i < vals.length; i++) {
      var dk = normDayKey_(vals[i][c['Date']]); if (!dk || dk < sinceKey) continue;
      var cc = canonCountry_(vals[i][c['Country']]), pf = canonPlatform_(vals[i][c['Platform']]);
      var k = cc + '|' + pf, s = seen[k] || (seen[k] = { total: 0, last: '', cur: '', rows: 0 });
      s.total += num_(vals[i][c['Spend']]); s.rows++;
      s.cur = vals[i][c['Currency']] || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || '';
      if (dk > s.last) s.last = dk;
    }
  }
  var out = ['=== SPEND COVERAGE — last ' + days + ' day(s), since ' + sinceKey + ' ===',
             'A ✗ = that account\'s ad-platform script is NOT feeding the tracker (install/schedule it in that account).', ''];
  var missing = 0, feeding = 0;
  Object.keys(COUNTRY_CFG).forEach(function (cc) {
    out.push('# ' + cc);
    COVERAGE_PLATS.forEach(function (pf) {
      var s = seen[cc + '|' + pf];
      if (s && s.rows) { feeding++; out.push('   ✓ ' + pad_(pf) + ' ' + round2_(s.total) + ' ' + s.cur + '   (last ' + s.last + ', ' + s.rows + ' day-rows)'); }
      else { missing++; out.push('   ✗ ' + pad_(pf) + ' NO DATA — feed not running'); }
    });
    out.push('');
  });
  out.push('SUMMARY: ' + feeding + ' feed(s) live, ' + missing + ' missing. Meta pulls here (needs CONFIG.META token); Google/Bing are pushed by their per-account scripts.');
  Logger.log(out.join('\n'));
  function pad_(s) { s = String(s); while (s.length < 9) s += ' '; return s; }
}
function menuCoverage() { spendCoverage(7); }

/* Prints each country's weekly revenue in its OWN LOCAL CURRENCY (from BDS Shopify Daily,
   which is stored un-converted). Compare a line to Shopify › Analytics › "Total sales"
   for the SAME country, SAME dates, in the SAME currency — it should match to the cent.
   If local matches but the USD report differs, the difference is ONLY the FX rate (Shopify
   uses each order's order-date rate; pin CONFIG.FX_PINNED to Shopify's rate to align USD).
   Run via menu "💰 Ad Budget › Reconcile vs Shopify (local $)", then View › Logs. */
function reconcileShopify() {
  var sh = getSpreadsheet_().getSheetByName(TAB.SHOPIFY);
  if (!sh || sh.getLastRow() < 2) { Logger.log('No ' + TAB.SHOPIFY + ' data yet — run "Pull Shopify revenue" first.'); return; }
  var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]), byWeek = {};
  for (var i = 1; i < vals.length; i++) {
    var dk = normDayKey_(vals[i][c['Date']]); if (!dk) continue;
    var cc = canonCountry_(vals[i][c['Country']]);
    var cur = vals[i][c['Currency']] || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency) || '';
    var paid = num_(vals[i][c['Paid Revenue']]), pend = num_(vals[i][c['Pending Revenue']]);
    var rev = num_(vals[i][c['Revenue']]);   // authoritative "Total sales" (ShopifyQL if applied, else Paid+Pending)
    var p = dk.split('-'), y = +p[0], m = +p[1] - 1, day = +p[2], mk = p[0] + '-' + p[1], wk = weekIndexFor_(y, m, day);
    var w = (((byWeek[cc] = byWeek[cc] || {})[mk] = byWeek[cc][mk] || {})[wk] = byWeek[cc][mk][wk] || { paid: 0, pend: 0, rev: 0, cur: cur, min: day, max: day });
    w.paid += paid; w.pend += pend; w.rev += rev; w.cur = cur; if (day < w.min) w.min = day; if (day > w.max) w.max = day;
  }
  var out = ['=== LOCAL-CURRENCY RECONCILIATION ===',
             '"Total sales" = the authoritative Revenue column (ShopifyQL exact) — should match Shopify › Analytics › "Total sales" to the cent for the same country/dates/currency.',
             'If "Total sales" instead equals the order-based (Paid+Pending) figure, ShopifyQL did NOT apply → re-run Pull Shopify revenue / add read_reports to that store\'s app.', ''];
  Object.keys(byWeek).sort().forEach(function (cc) {
    out.push('# ' + cc);
    Object.keys(byWeek[cc]).sort().forEach(function (mk) {
      var p = mk.split('-'), m = +p[1] - 1;
      Object.keys(byWeek[cc][mk]).map(Number).sort(function (a, b) { return a - b; }).forEach(function (wk) {
        var w = byWeek[cc][mk][wk];
        out.push('  ' + MONTHS[m] + ' ' + w.min + '–' + w.max + '  ' + w.cur +
                 '  Total sales = ' + round2_(w.rev) +
                 '   (order-based Paid ' + round2_(w.paid) + ' + Pending ' + round2_(w.pend) + ' = ' + round2_(w.paid + w.pend) + ')');
      });
    });
    out.push('');
  });
  Logger.log(out.join('\n'));
}

/* ONE-OFF: merge legacy country-code variants in "Spend Input" into the canonical store code
   (US→USA, GB→UK, AE→UAE). Canonical rows win; an aliased row that duplicates an existing
   canonical Date+Country+Platform+Campaign is DROPPED (no double-count), otherwise its code is
   rewritten. Run from the menu once after a feed posted the wrong code, then it self-corrects. */
function menuFixCountries() { fixCountryCodes(); }
function fixCountryCodes() {
  var sh = getSpreadsheet_().getSheetByName(TAB.SPEND);
  if (!sh || sh.getLastRow() < 2) { Logger.log('No ' + TAB.SPEND + ' rows to fix.'); return; }
  var vals = sh.getDataRange().getValues(), hdr = vals[0], c = indexMap_(hdr);
  function keyOf(row) {
    return normDayKey_(row[c['Date']]) + '|' + canonCountry_(row[c['Country']]) + '|' +
           canonPlatform_(row[c['Platform']]) + '|' + String(row[c['Campaign']] || '');
  }
  var seen = {}, keep = [], renamed = 0, dropped = 0;
  for (var i = 1; i < vals.length; i++) {   // pass 1 — rows already in canonical code win
    var raw = String(vals[i][c['Country']] || '').toUpperCase();
    if (canonCountry_(raw) !== raw) continue;
    var k = keyOf(vals[i]); if (seen[k]) { dropped++; continue; }
    seen[k] = 1; keep.push(vals[i]);
  }
  for (var j = 1; j < vals.length; j++) {   // pass 2 — aliased rows: rename if new, drop if dup
    var raw2 = String(vals[j][c['Country']] || '').toUpperCase();
    if (canonCountry_(raw2) === raw2) continue;
    var k2 = keyOf(vals[j]); if (seen[k2]) { dropped++; continue; }
    seen[k2] = 1; vals[j][c['Country']] = canonCountry_(raw2); renamed++; keep.push(vals[j]);
  }
  clearSheet_(sh);
  sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (keep.length) sh.getRange(2, 1, keep.length, hdr.length).setValues(keep);
  try { formatSpend_(); } catch (e) {}
  Logger.log('Country cleanup: renamed ' + renamed + ' row(s) to canonical codes, dropped ' + dropped + ' duplicate(s).');
  try { buildReports(); } catch (e) { Logger.log('buildReports: ' + e); }
}

/* ============================ CURRENCY (→ USD) ========================= */
/* Every money value in the reports is converted to CONFIG.REPORT_CURRENCY (USD).
   Raw tabs keep each store's LOCAL currency; conversion happens only when the
   reports read them, so the audit trail stays honest. */
var _fxCache = null;
function FX_RATES_() {
  if (_fxCache) return _fxCache;
  var merged = {};
  Object.keys(CONFIG.FX).forEach(function (k) { merged[k.toUpperCase()] = CONFIG.FX[k]; });   // defaults
  try {
    var p = PropertiesService.getDocumentProperties().getProperty('fxRates');
    if (p) { var o = JSON.parse(p); if (o && o.rates) Object.keys(o.rates).forEach(function (k) { merged[k.toUpperCase()] = o.rates[k]; }); }
  } catch (e) {}
  if (CONFIG.FX_PINNED) Object.keys(CONFIG.FX_PINNED).forEach(function (k) { merged[k.toUpperCase()] = CONFIG.FX_PINNED[k]; });   // pinned rates win over live/default
  var ov = fxOverrides_();                                                                                                         // the FX Rates tab's editable "Your rate" column wins over EVERYTHING
  Object.keys(ov).forEach(function (k) { merged[k] = ov[k]; });
  return (_fxCache = merged);
}
// Read the user-typed rates from the "Your rate → USD" column of the FX Rates tab. Whatever a
// person types there is EXACTLY the rate the report multiplies by, so USD matches their own
// conversion to the cent. Blank cell = use the live rate. Cached per execution.
var _fxOverrides = null;
function fxOverrides_() {
  if (_fxOverrides) return _fxOverrides;
  var out = {};
  try {
    var sh = getSpreadsheet_().getSheetByName(TAB.FX);
    if (sh && sh.getLastRow() >= 3) {
      var vals = sh.getDataRange().getValues();
      var hdrRow = -1, cCur = -1, cOvr = -1;
      for (var r = 0; r < Math.min(vals.length, 4); r++) {                       // find the header row + its columns
        var low = vals[r].map(function (x) { return String(x).toLowerCase(); });
        var ci = low.indexOf('currency');
        if (ci !== -1) { hdrRow = r; cCur = ci; low.forEach(function (h, i) { if (h.indexOf('your rate') !== -1) cOvr = i; }); break; }
      }
      if (hdrRow !== -1 && cOvr !== -1) {
        for (var i = hdrRow + 1; i < vals.length; i++) {
          var cur = String(vals[i][cCur] || '').toUpperCase().trim(); if (!cur) continue;
          var raw = vals[i][cOvr], n = (raw === '' || raw == null) ? NaN : Number(raw);
          if (!isNaN(n) && n > 0) out[cur] = n;
        }
      }
    }
  } catch (e) {}
  return (_fxOverrides = out);
}
// Convert a local amount to USD. FX table = 1 local unit → USD. Unknown currency → unchanged.
function fxToUSD_(amount, currency) {
  amount = num_(amount);
  var cur = String(currency || CONFIG.REPORT_CURRENCY).toUpperCase();
  if (!cur || cur === CONFIG.REPORT_CURRENCY) return amount;
  var rate = FX_RATES_()[cur];
  return rate ? amount * rate : amount;
}
// Pull LIVE rates (1 USD → each) from a free no-key API, invert to local→USD, cache per document.
function refreshFxRates() {
  try {
    var res = UrlFetchApp.fetch('https://open.er-api.com/v6/latest/USD', { muteHttpExceptions: true });
    var j = JSON.parse(res.getContentText());
    if (j && j.result === 'success' && j.rates) {
      var out = { USD: 1 };
      Object.keys(j.rates).forEach(function (c) { var r = Number(j.rates[c]); if (r) out[c.toUpperCase()] = Math.round((1 / r) * 1e6) / 1e6; });
      PropertiesService.getDocumentProperties().setProperty('fxRates', JSON.stringify({ at: dayKey_(new Date()), rates: out }));
      _fxCache = null; _fxOverrides = null;
      Logger.log('FX refreshed: 1 CAD=' + out.CAD + ' USD · 1 GBP=' + out.GBP + ' · 1 AUD=' + out.AUD + ' · 1 NZD=' + out.NZD + ' USD.');
      try { buildFxTab_(out); } catch (e) {}
      return out;
    }
    Logger.log('FX refresh failed (kept existing rates): ' + res.getContentText().slice(0, 160));
  } catch (e) { Logger.log('FX refresh error (kept existing rates): ' + e); }
  return null;
}
// Visible, EDITABLE rate card. Column C ("Your rate → USD") is yours to type in: whatever you
// put there is exactly what the report multiplies by, so USD matches your own conversion to the
// cent. Blank = use the live rate. Your typed rates are PRESERVED across every FX refresh.
function buildFxTab_(liveRates) {
  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName(TAB.FX) || ss.insertSheet(TAB.FX);
  var prevOv = fxOverrides_();                                       // preserve what the user typed, across refreshes
  // LIVE column = defaults ← stored live ← this refresh's rates ← CONFIG.FX_PINNED (NOT the sheet override).
  var live = {};
  Object.keys(CONFIG.FX).forEach(function (k) { live[k.toUpperCase()] = CONFIG.FX[k]; });
  try { var p = PropertiesService.getDocumentProperties().getProperty('fxRates'); if (p) { var o = JSON.parse(p); if (o && o.rates) Object.keys(o.rates).forEach(function (k) { live[k.toUpperCase()] = o.rates[k]; }); } } catch (e) {}
  if (liveRates) Object.keys(liveRates).forEach(function (k) { live[k.toUpperCase()] = liveRates[k]; });
  if (CONFIG.FX_PINNED) Object.keys(CONFIG.FX_PINNED).forEach(function (k) { live[k.toUpperCase()] = CONFIG.FX_PINNED[k]; });

  clearSheet_(sh);
  sh.getRange(1, 1, 1, 4).merge().setValue('FX → USD   ·   the report multiplies each store’s LOCAL total by the “Rate used” column')
    .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(1, 1, 1, 4).setWrap(true);
  var head = ['Currency', 'Live rate (1 unit → USD)', 'Your rate → USD  (optional — type to match Shopify/Google)', 'Rate used → USD'];
  sh.getRange(2, 1, 1, 4).setValues([head]).setBackground(SUBHEAD_BG).setFontWeight('bold').setHorizontalAlignment('center').setWrap(true);

  var seen = {}, curs = [];
  ['USD'].concat(Object.keys(COUNTRY_CFG).map(function (k) { return COUNTRY_CFG[k].currency; })).forEach(function (cur) {
    cur = String(cur).toUpperCase(); if (seen[cur]) return; seen[cur] = 1; curs.push(cur);
  });
  var rows = curs.map(function (cur) {
    return [cur, (live[cur] != null ? live[cur] : ''), (prevOv[cur] != null ? prevOv[cur] : ''), ''];   // col D = formula, set below
  });
  sh.getRange(3, 1, rows.length, 4).setValues(rows).setHorizontalAlignment('center').setVerticalAlignment('middle');
  for (var i = 0; i < rows.length; i++) { var rr = 3 + i; sh.getRange(rr, 4).setFormula('=IF(C' + rr + '="",B' + rr + ',C' + rr + ')'); }
  sh.getRange(3, 2, rows.length, 3).setNumberFormat('#,##0.000000');
  sh.getRange(3, 3, rows.length, 1).setBackground('#FFF9C4');        // highlight the editable column
  var noteRow = rows.length + 4;
  sh.getRange(noteRow, 1, 1, 4).merge().setValue(
    'WHY USD CAN DIFFER FROM A MANUAL CONVERSION:  the LOCAL totals match Shopify exactly, but USD = local × a rate — and Google, XE, and this API each print a slightly different rate at a different minute, so the USD drifts ~1–3%. To make USD match YOUR number exactly: type the rate you use into the yellow “Your rate” column (e.g. for 1 GBP = 1.27 USD, type 1.27), then run “↻ Rebuild reports only”. Leave a cell blank to use the live rate. Live rates via open.er-api.com; last refresh ' +
    Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm') + '.')
    .setFontColor('#5F6368').setFontStyle('italic').setWrap(true);
  sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 150); sh.setColumnWidth(3, 300); sh.setColumnWidth(4, 130);
  _fxOverrides = null;                                                // re-read overrides (incl. any we just wrote) on next use
}

/* ======================= WHATSAPP DAILY SUMMARY ======================== */
/* Sends a spend + revenue + ROAS summary (per country, USD) to WhatsApp once a day.
   RECOMMENDED provider = 'email' (free, reliable, no third-party bot): put recipients in
     CONFIG.WHATSAPP.EMAIL.to, set ENABLED=true, run setup(). Sent from your Google account.
   CallMeBot (free WhatsApp bot) — FLAKY, its number changed:
     1. Save +34 623 78 64 49 as a contact, WhatsApp it "I allow callmebot to send me messages".
        (If no reply in 2 min: send "Recover APIKey", or retry after 24h — its free queue throttles.)
     2. CallMeBot replies with an "apikey". Put { phone:'+<countrycode><number>', apikey:'...' }
        into CONFIG.WHATSAPP.CALLMEBOT (one line per recipient).
     3. Set CONFIG.WHATSAPP.ENABLED = true, PROVIDER='callmebot', run setup().
   CLOUD (Meta WhatsApp Cloud API): works, but a daily business-initiated message needs an
   APPROVED template — free text only sends inside the 24h reply window. */
function sendWhatsAppSummary() {   // the DAILY TRIGGER handler — respects ENABLED (so the auto-send can be turned off)
  var w = CONFIG.WHATSAPP;
  if (!w || !w.ENABLED) { Logger.log('Daily auto-summary disabled (CONFIG.WHATSAPP.ENABLED = false). Menu "Send now" still works.'); return; }
  sendDailySummaryNow_();
}
function menuWhatsApp() { sendDailySummaryNow_(); }   // manual "Send now" — ALWAYS sends, even if ENABLED = false
function sendDailySummaryNow_() {
  var w = CONFIG.WHATSAPP || {};
  var dk = (w.PERIOD === 'today') ? dayKey_(new Date()) : dayKey_(addDays_(new Date(), -1));
  sendSummaryVia_(w, dailySummaryData_(dk));                          // 1) single day (yesterday / today)
  if (w.MTD !== false) {                                              // 2) MONTH-TO-DATE (1st → same anchor day), e.g. "1–5 Aug 2026"
    var mtd = monthToDateData_(w);
    if (mtd) sendSummaryVia_(w, mtd);
  }
}
// Route a summary DATA object to EVERY channel in CONFIG.WHATSAPP.CHANNELS (email + whatsapp), each in
// its own try so one failing never blocks the other. WhatsApp method = PROVIDER ('cloud' template+PDF, or
// 'callmebot' text). Back-compat: if CHANNELS is unset, it falls back to the single channel from PROVIDER.
function sendSummaryVia_(w, data) {
  var chans = (w.CHANNELS && w.CHANNELS.length) ? w.CHANNELS
            : [ (w.PROVIDER === 'cloud' || w.PROVIDER === 'callmebot') ? 'whatsapp' : 'email' ];
  if (chans.indexOf('email') !== -1) {
    try { sendEmailSummary_(data); } catch (e) { Logger.log('email send error: ' + e); }
  }
  if (chans.indexOf('whatsapp') !== -1) {
    try {
      if (w.PROVIDER === 'cloud') sendWhatsAppCloud_(data);
      else sendWhatsAppCallMeBot_(buildDailySummaryText_(data));
    } catch (e) { Logger.log('whatsapp send error: ' + e); }
  }
}
// Month-to-date data: 1st of THIS month → the same anchor day the daily uses (yesterday, or today if
// PERIOD='today'). Label like "1–5 Aug 2026 (MTD)". Returns null on the 1st (nothing this month yet).
function monthToDateData_(w) {
  w = w || CONFIG.WHATSAPP || {};
  var now = new Date(), y = now.getFullYear(), mo = now.getMonth();
  var toDate = (w.PERIOD === 'today') ? now : addDays_(now, -1);
  var fromKey = dayKey_(ymUTC_(y, mo, 1)), toKey = dayKey_(toDate);
  if (toKey < fromKey) return null;   // today is the 1st (with PERIOD='yesterday') → no month-to-date range yet
  var label = parseInt(fromKey.slice(8), 10) + '–' + parseInt(toKey.slice(8), 10) + ' ' + MONTHS[mo].slice(0, 3) + ' ' + y + ' (MTD)';
  return summaryData_(fromKey, toKey, label);
}

// Gather the day's FULL breakdown per country (USD): per-platform spend + Pending/Paid revenue,
// so email + WhatsApp share the same numbers. Platform columns match the Weekly Rollup.
var SUMMARY_PLATS = ['Google', 'Bing', 'Meta', 'LinkedIn'];   // ABM folds into LinkedIn via canonPlatform_
function dailySummaryData_(dk) { return summaryData_(dk, dk, dk); }   // ONE day → daily report
function summaryData_(fromKey, toKey, label) {   // aggregate spend + revenue per country over an INCLUSIVE date range (day or whole month)
  var byCC = {};
  function cc_(cc) { return byCC[cc] || (byCC[cc] = { plat: {}, spend: 0, paid: 0, pend: 0, rev: 0, orders: 0, newC: 0, retC: 0, pers: 0, biz: 0 }); }
  Object.keys(COUNTRY_CFG).forEach(function (cc) { cc_(canonCountry_(cc)); });   // seed EVERY store country so it ALWAYS appears (even at $0) — a country with no data in the range no longer silently drops out of the report
  var spSh = getTab_(TAB.SPEND, SPEND_HEADERS);
  if (spSh.getLastRow() >= 2) {
    var sv = spSh.getDataRange().getValues(), sc = indexMap_(sv[0]);
    for (var i = 1; i < sv.length; i++) {
      var _sd = normDayKey_(sv[i][sc['Date']]); if (!_sd || _sd < fromKey || _sd > toKey) continue;
      var cc = canonCountry_(sv[i][sc['Country']]);
      var pf = canonPlatform_(sv[i][sc['Platform']]);
      var usd = fxToUSD_(sv[i][sc['Spend']], sv[i][sc['Currency']] || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency));
      var o = cc_(cc); o.plat[pf] = (o.plat[pf] || 0) + usd; o.spend += usd;
    }
  }
  var shSh = getSpreadsheet_().getSheetByName(TAB.SHOPIFY);
  if (shSh && shSh.getLastRow() >= 2) {
    var rv = shSh.getDataRange().getValues(), rc = indexMap_(rv[0]);
    for (var j = 1; j < rv.length; j++) {
      var _rd = normDayKey_(rv[j][rc['Date']]); if (!_rd || _rd < fromKey || _rd > toKey) continue;
      var c2 = canonCountry_(rv[j][rc['Country']]);
      var cur = rv[j][rc['Currency']] || (COUNTRY_CFG[c2] && COUNTRY_CFG[c2].currency);
      var o2 = cc_(c2);
      o2.paid += fxToUSD_(rv[j][rc['Paid Revenue']], cur);
      o2.pend += fxToUSD_(rv[j][rc['Pending Revenue']], cur);
      o2.rev  += fxToUSD_(rv[j][rc['Revenue']], cur);   // authoritative "Total sales" (ShopifyQL if set)
      o2.orders += num_(rv[j][rc['Orders']]);
      o2.newC += num_(rv[j][rc['New Customers']]);
      o2.retC += num_(rv[j][rc['Repeat Customers']]);
      o2.pers += num_(rv[j][rc['Personal Emails']]);
      o2.biz  += num_(rv[j][rc['Business Emails']]);
    }
  }
  var tot = { plat: {}, spend: 0, paid: 0, pend: 0, rev: 0, orders: 0, newC: 0, retC: 0, pers: 0, biz: 0 };
  var byCountry = Object.keys(byCC).sort().map(function (cc) {
    var o = byCC[cc], rev = o.rev, custN = o.newC + o.retC;   // authoritative "Total sales" (Revenue col = ShopifyQL if set, else paid+pend)
    tot.spend += o.spend; tot.paid += o.paid; tot.pend += o.pend; tot.rev += rev; tot.orders += o.orders;
    tot.newC += o.newC; tot.retC += o.retC; tot.pers += o.pers; tot.biz += o.biz;
    SUMMARY_PLATS.forEach(function (p) { tot.plat[p] = (tot.plat[p] || 0) + (o.plat[p] || 0); });
    return { cc: cc, plat: o.plat, spend: o.spend, paid: o.paid, pend: o.pend, rev: rev, orders: o.orders,
             roas: o.spend ? rev / o.spend : null, revSpendPct: rev ? o.spend / rev : null,
             newC: o.newC, retC: o.retC, crr: custN ? o.retC / custN : null, pers: o.pers, biz: o.biz };
  });
  var totCust = tot.newC + tot.retC;
  return { dk: (label || fromKey), PLAT: SUMMARY_PLATS, byCountry: byCountry, totals: tot,
           spendTot: tot.spend, revTot: tot.rev, ordTot: tot.orders, roas: tot.spend ? tot.rev / tot.spend : null,
           crr: totCust ? tot.retC / totCust : null, persTot: tot.pers, bizTot: tot.biz };
}

// EMAIL delivery (most reliable) — a formatted HTML TABLE, sent from the sheet owner's Google account.
function sendEmailSummary_(data) {
  var e = CONFIG.WHATSAPP && CONFIG.WHATSAPP.EMAIL, to = (e && e.to) || [];
  to = to.filter(function (a) { return a && String(a).indexOf('@') !== -1; });
  if (!to.length) { Logger.log('Email summary: no recipients in CONFIG.WHATSAPP.EMAIL.to'); return; }
  var subject = 'BackdropSource — D2D Outlay Vs Topline+Bottomline Traceability (' + data.dk + ')';
  var html = buildDailySummaryHtml_(data);
  var plain = buildDailySummaryText_(data).replace(/[*`_]/g, '');   // clean fallback for text-only clients
  var sent = 0;
  to.forEach(function (addr) {
    try { MailApp.sendEmail({ to: addr, subject: subject, htmlBody: html, body: plain }); sent++; }
    catch (err) { Logger.log('Email error ' + addr + ': ' + err); }
  });
  Logger.log('Daily summary (email): sent to ' + sent + ' recipient(s).');
}

// WhatsApp/plain text — a monospace ``` table ``` so columns line up in WhatsApp.
// COUNTRY-WISE Spend · Revenue · Blended ROAS. Spend shows '—' for stores that run NO ads
// (nothing was spent), while Revenue is ALWAYS shown in full — so revenue-only countries
// (e.g. FR/ES/DE, no ad spend) still display their sales instead of a row of dashes.
function buildDailySummaryText_(data) {
  var m = fmtMoney_;
  function rx(x) { return x != null ? x.toFixed(2) + 'x' : '—'; }   // ROAS format
  function mc(n) { n = Math.round(Number(n) || 0); var neg = n < 0; var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (neg ? '-' : '') + s; }   // whole-$ + thousands separators
  function sp(x) { return x ? mc(x) : '—'; }   // spend: '—' when no ad spend was run
  var CW = 7, SW = 8, RW = 10, OW = 6, W = CW + SW + RW + OW;   // column widths
  var L = [];
  L.push('📊 *BackdropSource — D2D Outlay Vs Topline+Bottomline Traceability*');
  L.push('_' + data.dk + '  ·  all values USD_');
  L.push('');
  L.push('*Spend:* $' + m(data.spendTot) + '    *Revenue:* $' + m(data.revTot) + '    *Orders:* ' + data.ordTot);
  if (data.byCountry.length) {
    var t = data.totals, tbl = [];
    tbl.push(padR_('Country', CW) + padL_('Spend', SW) + padL_('Rev', RW) + padL_('ROAS', OW));
    tbl.push(Array(W + 1).join('-'));
    data.byCountry.forEach(function (r) {
      tbl.push(padR_(r.cc, CW) +
        padL_(sp(r.spend), SW) +      // Spend — '—' when the store runs no ads
        padL_(mc(r.rev), RW) +        // Revenue — always shown in full
        padL_(rx(r.roas), OW));       // Blended ROAS (total sales ÷ spend; '—' when no spend)
    });
    tbl.push(Array(W + 1).join('-'));
    tbl.push(padR_('TOTAL', CW) +
      padL_(sp(t.spend), SW) +
      padL_(mc(t.rev), RW) +
      padL_(rx(data.roas), OW));
    L.push('*Revenue by country* (Spend · Revenue · ROAS):');
    L.push('```' + tbl.join('\n') + '```');
    L.push('_Full per-platform + Paid/Pending breakdown in the email._');
  } else {
    L.push(''); L.push('_(no spend/revenue recorded for ' + data.dk + ' yet)_');
  }
  return L.join('\n');
}

// EMAIL body — the FULL breakdown table (per-platform spend + Pending/Paid/Blended revenue +
// ROAS + Rev<>Spend%), matching the Weekly Rollup layout. Inline-styled for email clients.
function buildDailySummaryHtml_(data) {
  var m = fmtMoney_, nav = '#1B2D55', sub = '#CFE0F5', line = '#E0E0E0', cols = data.PLAT;
  function roas(x) { return x != null ? x.toFixed(2) + 'x' : '—'; }
  function pct(x) { return x != null ? Math.round(x * 100) + '%' : '—'; }
  function th(t, al) { return '<th style="padding:8px 9px;text-align:' + (al || 'center') + ';font-size:12px;white-space:nowrap;">' + t + '</th>'; }
  function td(t, al, extra) { return '<td style="padding:7px 9px;text-align:' + (al || 'center') + ';font-size:13px;border-top:1px solid ' + line + ';' + (extra || '') + '">' + t + '</td>'; }
  var header = '<tr style="background:' + sub + ';">' + th('Country', 'center') +
    cols.map(function (p) { return th(p); }).join('') +
    th('Spent') + th('Pending') + th('Paid') + th('Blended') + th('ROAS Pending') + th('ROAS Paid') + th('ROAS Blended') + th('Rev &lt;&gt; Spend %') + '</tr>';
  var rows = data.byCountry.map(function (r, i) {
    var bg = i % 2 ? '#FFFFFF' : '#F8F9FB';
    return '<tr style="background:' + bg + ';">' + td(r.cc, 'center', 'font-weight:bold;') +
      cols.map(function (p) { return td('$' + m(r.plat[p] || 0)); }).join('') +
      td('$' + m(r.spend)) + td('$' + m(r.pend)) + td('$' + m(r.paid)) + td('<b>$' + m(r.rev) + '</b>') +
      td(roas(r.spend ? r.pend / r.spend : null)) + td(roas(r.spend ? r.paid / r.spend : null)) + td(roas(r.roas)) + td(pct(r.revSpendPct)) + '</tr>';
  }).join('');
  var t = data.totals;
  var totalRow = '<tr style="background:#FFF9C4;font-weight:bold;border-top:2px solid ' + nav + ';">' + td('TOTAL', 'center') +
    cols.map(function (p) { return td('$' + m(t.plat[p] || 0)); }).join('') +
    td('$' + m(t.spend)) + td('$' + m(t.pend)) + td('$' + m(t.paid)) + td('$' + m(t.rev)) +
    td(roas(t.spend ? t.pend / t.spend : null)) + td(roas(t.spend ? t.paid / t.spend : null)) + td(roas(t.spend ? t.rev / t.spend : null)) +
    td(t.rev ? Math.round(t.spend / t.rev * 100) + '%' : '—') + '</tr>';
  var kpis = [['Spent', '$' + m(data.spendTot)], ['Revenue', '$' + m(data.revTot)],
              ['ROAS', (data.roas != null ? data.roas.toFixed(2) : '0') + 'x'], ['Orders', String(data.ordTot)],
              ['CRR', (data.crr != null ? Math.round(data.crr * 100) + '%' : '—')]];
  var kpiCells = kpis.map(function (k) {
    return '<td style="padding:12px;background:#F1F3F4;border-radius:6px;text-align:center;">' +
      '<div style="font-size:11px;color:#5F6368;text-transform:uppercase;letter-spacing:.5px;">' + k[0] + '</div>' +
      '<div style="font-size:20px;font-weight:bold;color:#202124;margin-top:2px;">' + k[1] + '</div></td>';
  }).join('<td style="width:8px;"></td>');

  // Customers block — New/Returning (→ Return %) + Personal/Business email split, per country + total.
  var hasCust = (t.newC + t.retC + t.pers + t.biz) > 0;
  var crrPct = function (num, den) { return den ? Math.round(num / den * 100) + '%' : '—'; };
  var custBlock;
  if (hasCust) {
    var cHead = '<tr style="background:' + sub + ';">' + th('Country', 'center') +
      th('New') + th('Repeat') + th('CRR') + th('Personal') + th('Business') + '</tr>';
    var cRows = data.byCountry.map(function (r, i) {
      var bg = i % 2 ? '#FFFFFF' : '#F8F9FB', cn = r.newC + r.retC;
      return '<tr style="background:' + bg + ';">' + td(r.cc, 'center', 'font-weight:bold;') +
        td(String(r.newC)) + td(String(r.retC)) + td(crrPct(r.retC, cn)) + td(String(r.pers)) + td(String(r.biz)) + '</tr>';
    }).join('');
    var cTot = '<tr style="background:#FFF9C4;font-weight:bold;border-top:2px solid ' + nav + ';">' + td('TOTAL', 'center') +
      td(String(t.newC)) + td(String(t.retC)) + td(crrPct(t.retC, t.newC + t.retC)) + td(String(t.pers)) + td(String(t.biz)) + '</tr>';
    custBlock = '<div style="font-weight:bold;margin:20px 0 6px;color:' + nav + ';font-size:14px;">Customers — Repeat rate (CRR) &amp; Email type</div>' +
      '<div style="overflow-x:auto;"><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid ' + line + ';border-radius:6px;overflow:hidden;">' +
      '<thead>' + cHead + '</thead><tbody>' + cRows + '</tbody><tfoot>' + cTot + '</tfoot></table></div>' +
      '<div style="font-size:11px;color:#9AA0A6;margin-top:6px;">CRR (Customer Repeat Rate) = repeat ÷ (new + repeat) customers. Personal = free email providers (gmail, yahoo…); Business = work/company domains.</div>';
  } else {
    custBlock = '<div style="font-size:11px;color:#9AA0A6;margin-top:14px;">Customer repeat rate (CRR) &amp; personal/business email split will appear here once the Shopify app has the <b>read_customers</b> scope.</div>';
  }
  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;color:#202124;">' +
    '<div style="background:' + nav + ';color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">' +
    '<div style="font-size:17px;font-weight:bold;">📊 ' + (data.title || 'BackdropSource — D2D Outlay Vs Topline+Bottomline Traceability') + '</div>' +
    '<div style="font-size:12px;opacity:.85;margin-top:2px;">' + (data.subtitle || (data.dk + '  ·  all values in USD')) + '</div></div>' +
    '<table role="presentation" style="width:100%;border-collapse:separate;margin:14px 0;"><tr>' + kpiCells + '</tr></table>' +
    '<div style="overflow-x:auto;"><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid ' + line + ';border-radius:6px;overflow:hidden;">' +
    '<thead>' + header + '</thead>' +
    '<tbody>' + (rows || '<tr><td colspan="' + (cols.length + 9) + '" style="padding:16px;text-align:center;color:#9AA0A6;">No data for ' + data.dk + ' yet</td></tr>') + '</tbody>' +
    '<tfoot>' + totalRow + '</tfoot></table></div>' +
    '<div class="pdf-break"></div>' +   // PDF: Customers table starts on its own page
    custBlock +
    '<div style="font-size:11px;color:#9AA0A6;margin-top:12px;">Spent = each ad platform (USD). Blended = Shopify "Total sales" (Pending = awaiting payment · Paid = captured). Rev &lt;&gt; Spend % = spent ÷ revenue. Auto-sent daily ~3 PM IST by the Ad Budget Tracker.</div></div>';
}

/* ===================== MONTHLY REPORTS (Billboard + Payments) ========== */
/* Two emails sent on the 1st of each month for the PRIOR (complete) month, to the same
   CONFIG.WHATSAPP.EMAIL.to recipients:
     1. BILLBOARD  — full-month spend (per platform) + revenue + ROAS per country (the daily table, monthly).
     2. PAYMENTS   — per country: payment received (Paid) vs still pending, with Pending %.  */
function buildBillboardHtml_(data) {
  data.title = 'BackdropSource — Billboard';
  data.subtitle = 'Monthly Report · ' + data.dk + ' · all values in USD';
  // full spend/revenue/ROAS table, aggregated over the month + a Draft Orders section (created/deleted/conversion)
  // — the Draft Orders table starts on its OWN page in the PDF (class="pdf-break").
  return buildDailySummaryHtml_(data) + '<div class="pdf-break"></div>' + buildDraftStatsHtml_(data.draftStats, data.dk);
}

// Read the Draft Order Lifecycle sheet and aggregate, for drafts CREATED in [fromKey,toKey],
// per store + a grand total: count + USD value created, deleted (count + USD value), converted,
// and the draft→order conversion rate (converted ÷ created for that cohort). Values → USD via fxToUSD_.
function draftStatsForPeriod_(fromKey, toKey) {
  var empty = { byCountry: [], totals: { created: 0, createdVal: 0, converted: 0, convertedVal: 0, deleted: 0, deletedVal: 0, convRate: null } };
  if (!CONFIG.LIFECYCLE_SHEET_ID || CONFIG.LIFECYCLE_SHEET_ID.indexOf('PASTE') === 0) return empty;
  var ss; try { ss = SpreadsheetApp.openById(CONFIG.LIFECYCLE_SHEET_ID); } catch (e) { Logger.log('Draft stats: cannot open lifecycle sheet — ' + e); return empty; }
  var sh = ss.getSheetByName('Lifecycle');
  if (!sh || sh.getLastRow() < 2) return empty;
  var v = sh.getDataRange().getValues(), c = indexMap_(v[0]);
  var iCreated = c['Created At'], iOut = c['Outcome'], iTot = c['Total'], iCur = c['Currency'], iStore = c['Store'];
  if (iCreated == null || iOut == null) { Logger.log('Draft stats: Lifecycle is missing Created At / Outcome columns.'); return empty; }
  var by = {};
  function g(cc) { return by[cc] || (by[cc] = { cc: cc, created: 0, createdVal: 0, converted: 0, convertedVal: 0, deleted: 0, deletedVal: 0 }); }
  for (var i = 1; i < v.length; i++) {
    var dk = normDayKey_(v[i][iCreated]); if (!dk || dk < fromKey || dk > toKey) continue;   // cohort = drafts CREATED in the period
    var cc = String(v[i][iStore] == null ? 'XX' : v[i][iStore]).trim().toUpperCase() || 'XX';
    var out = String(v[i][iOut] || '');
    var usd = fxToUSD_(v[i][iTot], v[i][iCur]);
    var o = g(cc);
    o.created++; o.createdVal += usd;
    if (out === 'Converted') { o.converted++; o.convertedVal += usd; }
    else if (out.indexOf('Deleted') === 0) { o.deleted++; o.deletedVal += usd; }   // 'Deleted' + 'Deleted (untracked)'
  }
  var tot = { created: 0, createdVal: 0, converted: 0, convertedVal: 0, deleted: 0, deletedVal: 0 };
  var rows = Object.keys(by).sort().map(function (cc) {
    var o = by[cc];
    tot.created += o.created; tot.createdVal += o.createdVal;
    tot.converted += o.converted; tot.convertedVal += o.convertedVal;
    tot.deleted += o.deleted; tot.deletedVal += o.deletedVal;
    o.convRate = o.created ? o.converted / o.created : null;
    return o;
  });
  tot.convRate = tot.created ? tot.converted / tot.created : null;
  return { byCountry: rows, totals: tot };
}

// A standalone Draft Orders table appended to the Billboard email.
function buildDraftStatsHtml_(stats, dk) {
  var m = fmtMoney_, nav = '#1B2D55', sub = '#CFE0F5', line = '#E0E0E0';
  function th(t) { return '<th style="padding:9px 11px;text-align:center;font-size:12px;white-space:nowrap;">' + t + '</th>'; }
  function td(t, extra) { return '<td style="padding:8px 11px;text-align:center;font-size:13px;border-top:1px solid ' + line + ';' + (extra || '') + '">' + t + '</td>'; }
  function pct(x) { return x != null ? Math.round(x * 100) + '%' : '—'; }
  var s = stats || { byCountry: [], totals: {} };
  var header = '<tr style="background:' + sub + ';">' + th('Country') + th('Drafts Created') + th('Draft Value') + th('Deleted') + th('Deleted Value') + th('Converted') + th('Converted Value') + th('Conversion Rate') + '</tr>';
  var rows = (s.byCountry || []).map(function (r, i) {
    var bg = i % 2 ? '#FFFFFF' : '#F8F9FB';
    return '<tr style="background:' + bg + ';">' + td(r.cc, 'font-weight:bold;') +
      td(String(r.created)) + td('$' + m(r.createdVal)) +
      td(String(r.deleted)) + td('$' + m(r.deletedVal)) +
      td(String(r.converted)) + td('$' + m(r.convertedVal || 0)) + td('<b>' + pct(r.convRate) + '</b>') + '</tr>';
  }).join('');
  var t = s.totals || {};
  var totalRow = '<tr style="background:#FFF9C4;font-weight:bold;border-top:2px solid ' + nav + ';">' + td('TOTAL') +
    td(String(t.created || 0)) + td('$' + m(t.createdVal || 0)) +
    td(String(t.deleted || 0)) + td('$' + m(t.deletedVal || 0)) +
    td(String(t.converted || 0)) + td('$' + m(t.convertedVal || 0)) + td(pct(t.convRate != null ? t.convRate : null)) + '</tr>';
  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:22px auto 0;color:#202124;">' +
    '<div style="font-weight:bold;margin:0 0 8px;color:' + nav + ';font-size:15px;">🧾 Draft Orders — Created · Deleted · Conversion (' + dk + ')</div>' +
    '<div style="overflow-x:auto;"><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid ' + line + ';border-radius:6px;overflow:hidden;">' +
    '<thead>' + header + '</thead><tbody>' + (rows || '<tr><td colspan="8" style="padding:16px;text-align:center;color:#9AA0A6;">No drafts created in ' + dk + '</td></tr>') + '</tbody><tfoot>' + totalRow + '</tfoot></table></div>' +
    '<div style="font-size:11px;color:#9AA0A6;margin-top:8px;">Drafts created in the period (values converted to USD). <b>Converted Value</b> = USD value of the drafts that converted to orders. Conversion Rate = converted ÷ created for that cohort; drafts created late in the month may convert later, so the newest month can read low. Source: Draft Order Lifecycle tracker.</div></div>';
}
function buildPaymentsHtml_(data) {
  var m = fmtMoney_, nav = '#1B2D55', sub = '#CFE0F5', line = '#E0E0E0';
  function th(t) { return '<th style="padding:9px 12px;text-align:center;font-size:12px;white-space:nowrap;">' + t + '</th>'; }
  function td(t, extra) { return '<td style="padding:8px 12px;text-align:center;font-size:13px;border-top:1px solid ' + line + ';' + (extra || '') + '">' + t + '</td>'; }
  function pct(x) { return x != null ? Math.round(x * 100) + '%' : '—'; }
  var header = '<tr style="background:' + sub + ';">' + th('Country') + th('Payment Received') + th('Received %') + th('Still Pending') + th('Pending %') + th('Total') + '</tr>';
  var rows = data.byCountry.map(function (r, i) {
    var bg = i % 2 ? '#FFFFFF' : '#F8F9FB', total = r.paid + r.pend;
    return '<tr style="background:' + bg + ';">' + td(r.cc, 'font-weight:bold;') +
      td('$' + m(r.paid)) + td(pct(total ? r.paid / total : null)) +
      td('$' + m(r.pend)) + td(pct(total ? r.pend / total : null)) +
      td('<b>$' + m(total) + '</b>') + '</tr>';
  }).join('');
  var t = data.totals, tt = t.paid + t.pend;
  var totalRow = '<tr style="background:#FFF9C4;font-weight:bold;border-top:2px solid ' + nav + ';">' + td('TOTAL') +
    td('$' + m(t.paid)) + td(pct(tt ? t.paid / tt : null)) +
    td('$' + m(t.pend)) + td(pct(tt ? t.pend / tt : null)) +
    td('$' + m(tt)) + '</tr>';
  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:0 auto;color:#202124;">' +
    '<div style="background:' + nav + ';color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">' +
    '<div style="font-size:17px;font-weight:bold;">💳 BackdropSource — Payments: Received vs Pending</div>' +
    '<div style="font-size:12px;opacity:.85;margin-top:2px;">Monthly Report · ' + data.dk + ' · all values in USD</div></div>' +
    '<div style="overflow-x:auto;"><table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid ' + line + ';border-radius:6px;overflow:hidden;margin-top:14px;">' +
    '<thead>' + header + '</thead><tbody>' + (rows || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#9AA0A6;">No data for ' + data.dk + '</td></tr>') + '</tbody><tfoot>' + totalRow + '</tfoot></table></div>' +
    '<div style="font-size:11px;color:#9AA0A6;margin-top:10px;">Payment Received = Paid revenue · Received % = Paid ÷ Total · Still Pending = awaiting payment · Pending % = Pending ÷ Total · Total = Paid + Pending. Auto-sent on the 1st of each month for the prior month.</div></div>';
}

// Monthly WhatsApp — a document-header template: short body ({{1}}..{{9}} = month ad totals + draft
// stats) + the FULL Billboard breakdown attached as a PDF. Fires only when Cloud WhatsApp is active
// and CLOUD.monthlyTemplate is set + approved. `billHtml` = the Billboard email HTML (reused for the PDF).
//   {{1}} month  {{2}} spend  {{3}} revenue  {{4}} ROAS  {{5}} drafts created  {{6}} draft value
//   {{7}} deleted count  {{8}} deleted value  {{9}} conversion rate
function sendMonthlyWhatsApp_(data, label, billHtml) {
  var w = CONFIG.WHATSAPP || {};
  if (!w.ENABLED || w.PROVIDER !== 'cloud') { Logger.log('Monthly WhatsApp skipped (ENABLED=' + !!w.ENABLED + ', PROVIDER=' + w.PROVIDER + ').'); return; }
  var c = w.CLOUD || {};
  if (!c.monthlyTemplate || String(c.monthlyTemplate).indexOf('PASTE') === 0) { Logger.log('Monthly WhatsApp skipped: CLOUD.monthlyTemplate not set.'); return; }
  if (!c.token || String(c.token).indexOf('PASTE') === 0) { Logger.log('Monthly WhatsApp skipped: CLOUD.token not set.'); return; }
  var m = fmtMoney_, d = (data.draftStats && data.draftStats.totals) || {};
  var bodyParams = [
    label,                                                          // {{1}} month, e.g. "July 2026"
    '$' + m(data.spendTot),                                         // {{2}} spend
    '$' + m(data.revTot),                                           // {{3}} revenue
    (data.roas != null ? data.roas.toFixed(2) : '0') + 'x',         // {{4}} ROAS
    String(d.created || 0),                                         // {{5}} drafts created
    '$' + m(d.createdVal || 0),                                     // {{6}} draft value
    String(d.deleted || 0),                                         // {{7}} deleted count
    '$' + m(d.deletedVal || 0),                                     // {{8}} deleted value
    (d.convRate != null ? Math.round(d.convRate * 100) + '%' : '—') // {{9}} conversion rate
  ];
  var html = billHtml || buildBillboardHtml_(data);   // full breakdown (spend/revenue table + draft-orders table) → PDF
  sendCloudTemplate_(c, c.monthlyTemplate, bodyParams, html, 'Backdrop-Monthly-' + String(label).replace(/\s+/g, '-'));
}

function jobMonthlyReports() {   // AUTO (1st of month) → the PREVIOUS, complete month
  var now = new Date(), y = now.getFullYear(), m = now.getMonth();
  var pm = m - 1, py = y; if (pm < 0) { pm = 11; py = y - 1; }
  sendMonthlyReports_(py, pm);
}
function menuMonthlyNow() {   // MANUAL → the CURRENT month so far (e.g. run in Aug → August 1–today)
  var now = new Date(); sendMonthlyReports_(now.getFullYear(), now.getMonth());
}
function menuMonthlyLast() { jobMonthlyReports(); }   // MANUAL → the PRIOR complete month (e.g. run in Aug → the full July report). Same as the automatic 1st-of-month send.
function sendMonthlyReports_(year, monthIdx) {
  var mm = ('0' + (monthIdx + 1)).slice(-2);
  var fromKey = year + '-' + mm + '-01';
  var toKey = year + '-' + mm + '-' + ('0' + daysInMonth_(year, monthIdx)).slice(-2);
  var label = MONTHS[monthIdx] + ' ' + year;
  var to = (CONFIG.WHATSAPP && CONFIG.WHATSAPP.EMAIL && CONFIG.WHATSAPP.EMAIL.to) || [];
  to = to.filter(function (a) { return a && String(a).indexOf('@') !== -1; });
  if (!to.length) { Logger.log('Monthly reports: no recipients in CONFIG.WHATSAPP.EMAIL.to'); return; }
  var data = summaryData_(fromKey, toKey, label);
  data.draftStats = draftStatsForPeriod_(fromKey, toKey);   // read the Draft Order Lifecycle sheet for this month's cohort
  var billHtml = buildBillboardHtml_(data);   // spend/revenue/ROAS + draft-order stats (sets data.title/subtitle)
  var payHtml = buildPaymentsHtml_(data);     // payments received vs pending
  var combined = billHtml + '<div class="pdf-break"></div>' + payHtml;   // ONE email: Billboard + Payments together (Payments on its own PDF page)
  var sent = 0;
  to.forEach(function (addr) {
    try { MailApp.sendEmail({ to: addr, subject: 'BackdropSource — Billboard (' + label + ')', htmlBody: combined }); sent++; } catch (e) { Logger.log('Billboard email ' + addr + ': ' + e); }
  });
  try { sendMonthlyWhatsApp_(data, label, combined); } catch (e) { Logger.log('Monthly WhatsApp: ' + e); }   // monthly WhatsApp headline + full PDF (Billboard + Payments), only if Cloud WhatsApp is on
  Logger.log('Monthly reports (' + label + '): sent combined Billboard + Payments to ' + sent + ' recipient(s).');
}

function fmtMoney_(n) {   // 2 decimals + thousands separators, so rounded parts always sum to the shown total (matches Shopify)
  n = Number(n) || 0; var neg = n < 0, s = Math.abs(n).toFixed(2).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + s.join('.');
}
function padR_(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
function padL_(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

function sendWhatsAppCallMeBot_(text) {
  var list = (CONFIG.WHATSAPP && CONFIG.WHATSAPP.CALLMEBOT) || [], sent = 0;
  list.forEach(function (r) {
    if (!r.phone || !r.apikey || String(r.apikey).indexOf('PASTE') === 0 || String(r.phone).indexOf('X') !== -1) return;
    var url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent(r.phone) +
              '&text=' + encodeURIComponent(text) + '&apikey=' + encodeURIComponent(r.apikey);
    try { var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); Logger.log('WhatsApp ' + r.phone + ': HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 120)); sent++; }
    catch (e) { Logger.log('WhatsApp ' + r.phone + ' error: ' + e); }
    Utilities.sleep(1500);   // CallMeBot allows ~1 message/second
  });
  Logger.log('WhatsApp (CallMeBot): sent to ' + sent + ' recipient(s).');
}
// Cloud WhatsApp — sends the APPROVED headline template daily (survives the 24h window).
// Accepts the summary `data` object; if CLOUD.template is blank it falls back to plain TEXT
// (which ONLY delivers inside the 24h reply window — fine for testing, NOT for the daily job).
// DAILY Cloud WhatsApp — a document-header template: short headline body + the FULL per-country
// breakdown attached as a PDF (same table as the email). Falls back to plain text if no template set
// (text only delivers inside the 24h reply window → testing only).
function sendWhatsAppCloud_(data) {
  var c = CONFIG.WHATSAPP && CONFIG.WHATSAPP.CLOUD;
  if (!c || !c.token || String(c.token).indexOf('PASTE') === 0) { Logger.log('Cloud WhatsApp not configured.'); return; }
  if (typeof data === 'string') { sendCloudText_(c, data); return; }                          // backward-compat: pre-built string
  var useTemplate = !!c.template && String(c.template).indexOf('PASTE') !== 0;
  if (!useTemplate) { sendCloudText_(c, buildDailySummaryText_(data)); return; }               // no template → plain text (24h window only)
  var m = fmtMoney_;
  var bodyParams = [                                                                           // {{1}}..{{5}} — MUST match the approved template
    String(data.dk),                                                  // {{1}} date
    '$' + m(data.spendTot),                                           // {{2}} spend
    '$' + m(data.revTot),                                             // {{3}} revenue
    (data.roas != null ? data.roas.toFixed(2) : '0') + 'x',           // {{4}} ROAS
    String(data.ordTot)                                               // {{5}} orders
  ];
  sendCloudTemplate_(c, c.template, bodyParams, buildDailySummaryHtml_(data), 'Backdrop-Ads-' + data.dk);
}

// Send an approved template that has a DOCUMENT header: render `html` → PDF, upload once, then send
// to every recipient with { header:document(pdf), body:params }. If `html` is falsy, sends body-only.
function sendCloudTemplate_(c, templateName, bodyParams, html, pdfName) {
  var to = c.to || []; if (!to.length) { Logger.log('Cloud WhatsApp: no recipients in CLOUD.to.'); return; }
  var mediaId = null;
  if (html) {
    try { mediaId = uploadWhatsAppMedia_(c, htmlToPdf_(html, pdfName), 'application/pdf'); }
    catch (e) { Logger.log('Cloud WhatsApp: PDF build failed — ' + e); }
    if (!mediaId) Logger.log('Cloud WhatsApp: no media id — the send below will fail if the template requires a document header.');
  }
  to.forEach(function (dest) {
    var comps = [];
    if (mediaId) comps.push({ type: 'header', parameters: [{ type: 'document', document: { id: mediaId, filename: pdfName + '.pdf' } }] });
    comps.push({ type: 'body', parameters: bodyParams.map(function (p) { return { type: 'text', text: sanitizeParam_(p) }; }) });
    var url = 'https://graph.facebook.com/' + CONFIG.META.apiVersion + '/' + c.phoneNumberId + '/messages';
    var payload = { messaging_product: 'whatsapp', to: String(dest).replace(/[^0-9]/g, ''), type: 'template',
      template: { name: templateName, language: { code: c.templateLang || 'en_US' }, components: comps } };
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + c.token }, payload: JSON.stringify(payload), muteHttpExceptions: true });
    Logger.log('Cloud WhatsApp ' + dest + ': HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 180));
  });
}

// Upload a file blob to WhatsApp Cloud media (multipart) → returns a reusable media id (~30 days) for template headers.
function uploadWhatsAppMedia_(c, blob, mime) {
  var url = 'https://graph.facebook.com/' + CONFIG.META.apiVersion + '/' + c.phoneNumberId + '/media';
  var res = UrlFetchApp.fetch(url, { method: 'post', headers: { Authorization: 'Bearer ' + c.token },
    payload: { messaging_product: 'whatsapp', type: mime, file: blob }, muteHttpExceptions: true });
  var code = res.getResponseCode(), body = res.getContentText();
  if (code !== 200) { Logger.log('WhatsApp media upload FAILED: HTTP ' + code + ' ' + body.slice(0, 200)); return null; }
  try { return JSON.parse(body).id || null; } catch (e) { Logger.log('WhatsApp media upload: bad JSON ' + body.slice(0, 120)); return null; }
}

// Plain free-text Cloud message (no template). ONLY delivers inside the 24h reply window — testing/fallback.
function sendCloudText_(c, text) {
  (c.to || []).forEach(function (dest) {
    var url = 'https://graph.facebook.com/' + CONFIG.META.apiVersion + '/' + c.phoneNumberId + '/messages';
    var payload = { messaging_product: 'whatsapp', to: String(dest).replace(/[^0-9]/g, ''), type: 'text', text: { body: text } };
    var res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + c.token }, payload: JSON.stringify(payload), muteHttpExceptions: true });
    Logger.log('Cloud WhatsApp ' + dest + ': HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 180));
  });
}
// WhatsApp template params can't contain newlines/tabs/>4 consecutive spaces — flatten so a send can't be rejected.
function sanitizeParam_(s) { return String(s).replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim(); }

// LIST every WhatsApp template on your account (name · language · status · category), so you can match
// CONFIG.WHATSAPP.CLOUD.template / monthlyTemplate / templateLang EXACTLY. Editor → run
// listWhatsAppTemplates → View › Logs. Error 132001 on send = the name+language you configured
// doesn't match an APPROVED row here (usually language 'en' vs 'en_US', or not yet Approved).
function listWhatsAppTemplates() {
  var c = CONFIG.WHATSAPP && CONFIG.WHATSAPP.CLOUD;
  if (!c || !c.token || String(c.token).indexOf('PASTE') === 0) { Logger.log('Set CLOUD.token first.'); return; }
  var waba = c.wabaId;
  if (!waba || String(waba).indexOf('PASTE') === 0) { Logger.log('Set CONFIG.WHATSAPP.CLOUD.wabaId to your WhatsApp Business Account ID (the "WhatsApp Business Account ID" on the API Setup page).'); return; }
  var url = 'https://graph.facebook.com/' + CONFIG.META.apiVersion + '/' + waba + '/message_templates?fields=name,language,status,category,components&limit=200';
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + c.token }, muteHttpExceptions: true });
  var body = res.getContentText();
  if (res.getResponseCode() !== 200) { Logger.log('List templates FAILED: HTTP ' + res.getResponseCode() + ' ' + body.slice(0, 300)); return; }
  var j = {}; try { j = JSON.parse(body); } catch (e) {}
  var arr = (j && j.data) || [];
  Logger.log('=== WhatsApp templates on WABA ' + waba + ' (' + arr.length + ') ===');
  if (!arr.length) Logger.log('  (none yet — create daily_ad_summary + monthly_ad_summary in WhatsApp Manager)');
  arr.forEach(function (t) {
    var hdr = 'none', vars = 0;
    (t.components || []).forEach(function (comp) {
      if (String(comp.type).toUpperCase() === 'HEADER') hdr = String(comp.format || 'TEXT').toUpperCase();
      if (String(comp.type).toUpperCase() === 'BODY') { var mm = String(comp.text || '').match(/\{\{\d+\}\}/g); vars = mm ? mm.length : 0; }
    });
    Logger.log('  name=' + t.name + '   ·   lang=' + t.language + '   ·   ' + t.status + '   ·   ' + (t.category || '') + '   ·   header=' + hdr + '   ·   bodyVars=' + vars);
  });
  Logger.log('→ For THIS script: daily_ad_summary needs header=DOCUMENT + bodyVars=5; monthly_ad_summary needs header=DOCUMENT + bodyVars=9. CLOUD.template/monthlyTemplate must match an APPROVED name and CLOUD.templateLang must equal its lang.');
}
// Render report HTML → a PDF blob (WhatsApp document header). The email HTML caps its container at
// max-width:760px with overflow-x:auto — fine on screen (scrolls) but in a PDF that CLIPS the wide
// table's right-hand columns (the ROAS ones). So for print we: force A4 LANDSCAPE, KILL the 760px
// cap + the overflow clip (div overrides), shrink the font so all 13 columns fit, and put each table
// on its OWN page (elements marked class="pdf-break" get a page-break-before).
function htmlToPdf_(html, name) {
  var css = '<style>' +
    '@page{size:A4 landscape;margin:7mm;}' +
    'body{font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
    'div{max-width:none !important;overflow:visible !important;}' +          // undo max-width:760px + overflow-x:auto → no more right-edge clipping
    'table{width:100% !important;border-collapse:collapse;table-layout:auto;page-break-inside:auto;}' +
    'tr{page-break-inside:avoid;}' +
    'th,td{font-size:9px !important;padding:3px 4px !important;white-space:nowrap;}' +   // smaller so every column fits the page width
    '.pdf-break{page-break-before:always;height:0;line-height:0;}' +
    '</style>';
  var full = '<!DOCTYPE html><html><head><meta charset="utf-8">' + css + '</head><body>' + html + '</body></html>';
  return Utilities.newBlob(full, 'text/html', name + '.html').getAs('application/pdf').setName(name + '.pdf');
}

/* ============================ DASHBOARD ================================= */
var PERIODS = ['Today', 'Yesterday', 'Last 7 Days', 'Last 14 Days', 'Last 30 Days', 'This Month', 'Last Month', 'This Year', 'All Time'];

function buildDashboard(periodLabel) {
  var ss = getSpreadsheet_();
  var master = ss.getSheetByName(TAB.MASTER);
  var shop = ss.getSheetByName(TAB.SHOPIFY);
  var rep = ss.getSheetByName(TAB.DASH) || ss.insertSheet(TAB.DASH);
  var props = PropertiesService.getDocumentProperties();

  if (!periodLabel) {
    var cur = (rep.getLastRow() >= 2) ? String(rep.getRange(2, 2).getValue() || '') : '';
    periodLabel = cur || props.getProperty('dashPeriod') || 'Last 30 Days';
  }
  if (PERIODS.indexOf(periodLabel) === -1) periodLabel = 'Last 30 Days';
  props.setProperty('dashPeriod', periodLabel);
  var pr = periodRange_(periodLabel), NCOL = 11;

  clearSheet_(rep);

  // ---------- Title + period control ----------
  rep.getRange(1, 1).setValue('CENTRALIZED DAILY AD BUDGET TRACKER');
  rep.getRange(1, 1, 1, NCOL).merge().setBackground(HEADER_BG).setFontColor('#FFFFFF')
     .setFontSize(18).setFontWeight('bold').setVerticalAlignment('middle').setHorizontalAlignment('center');
  rep.setRowHeight(1, 44);
  rep.getRange(2, 1).setValue('Period:').setFontWeight('bold').setHorizontalAlignment('right');
  rep.getRange(2, 2).setValue(periodLabel)
     .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PERIODS, true).setAllowInvalid(false).build())
     .setFontWeight('bold').setBackground('#FFF3CD').setHorizontalAlignment('center');
  rep.getRange(2, 3).setValue(pr.fromKey + '  →  ' + pr.toKey).setFontColor('#5F6368');
  rep.getRange(2, 8).setValue('Generated ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm'))
     .setFontColor('#9AA0A6').setFontStyle('italic').setHorizontalAlignment('right');
  rep.getRange(2, 8, 1, NCOL - 7).merge();

  // ---------- Aggregate the Daily Master within the window ----------
  var byP = {}, byC = {}, byD = {}, dOrder = [];
  PLATFORMS.forEach(function (p) { byP[p] = budBucket_(); });
  if (master && master.getLastRow() > 1) {
    var mv = master.getDataRange().getValues(), mc = indexMap_(mv[0]);
    for (var i = 1; i < mv.length; i++) {
      var dk = normDayKey_(mv[i][mc['Date']]); if (!dk || dk < pr.fromKey || dk > pr.toKey) continue;
      var cc = canonCountry_(mv[i][mc['Country']]), pf = String(mv[i][mc['Platform']] || 'Other');
      var sp = num_(mv[i][mc['Spend']]), im = num_(mv[i][mc['Impressions']]), ck = num_(mv[i][mc['Clicks']]),
          cv = num_(mv[i][mc['Conversions']]), rv = num_(mv[i][mc['Revenue']]);
      if (!byP[pf]) byP[pf] = budBucket_();
      if (!byC[cc]) byC[cc] = budBucket_();
      if (!byD[dk]) { byD[dk] = budBucket_(); dOrder.push(dk); }
      addBud_(byP[pf], sp, im, ck, cv, rv);
      addBud_(byC[cc], sp, im, ck, cv, rv);
      addBud_(byD[dk], sp, im, ck, cv, rv);
    }
  }

  // ---------- Shopify totals within the window ----------
  var shopByC = {}, shopAll = { orders: 0, revenue: 0 };
  if (shop && shop.getLastRow() > 1) {
    var sv = shop.getDataRange().getValues(), scix = indexMap_(sv[0]);
    for (var j = 1; j < sv.length; j++) {
      var sdk = normDayKey_(sv[j][scix['Date']]); if (!sdk || sdk < pr.fromKey || sdk > pr.toKey) continue;
      var scc = canonCountry_(sv[j][scix['Country']]);
      var so = num_(sv[j][scix['Orders']]), sr = fxToUSD_(sv[j][scix['Revenue']], sv[j][scix['Currency']] || (COUNTRY_CFG[scc] && COUNTRY_CFG[scc].currency));
      if (!shopByC[scc]) shopByC[scc] = { orders: 0, revenue: 0 };
      shopByC[scc].orders += so; shopByC[scc].revenue += sr;
      shopAll.orders += so; shopAll.revenue += sr;
    }
  }
  dOrder.sort();

  var all = budBucket_();
  Object.keys(byP).forEach(function (p) { var b = byP[p]; all.spend += b.spend; all.impr += b.impr; all.clicks += b.clicks; all.conv += b.conv; all.revenue += b.revenue; });

  if (!all.spend && !all.revenue && !shopAll.revenue) {
    rep.getRange(4, 1).setValue('No spend or conversion data in this period. Pull spend + Shopify, then rebuild.').setFontColor('#9AA0A6').setFontStyle('italic');
    try { rep.setHiddenGridlines(true); } catch (e) {}
    return;
  }

  // ---------- KPI strip (all platforms · all countries · nominal cross-currency) ----------
  rep.getRange(4, 1).setValue('KEY NUMBERS — ' + periodLabel.toUpperCase() + ' (all stores, USD)');
  rep.getRange(4, 1, 1, NCOL).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11);
  var kpis = [
    ['Total Spend',         round2_(all.spend),                                   '#,##0',        '#EAF1FB'],
    ['Attributed Revenue',  round2_(all.revenue),                                 '#,##0',        '#E4F5E9'],
    ['ROAS',                all.spend ? round2_(all.revenue / all.spend) : 0,     '#,##0.00"x"',  '#E4F5E9'],
    ['Conversions',         all.conv,                                             '#,##0',        '#EAF1FB'],
    ['CPA',                 all.conv ? round2_(all.spend / all.conv) : 0,         '#,##0.00',     '#FEF7E0'],
    ['Shopify Revenue',     round2_(shopAll.revenue),                             '#,##0',        '#EDE7F6'],
    ['Shopify Orders',      shopAll.orders,                                       '#,##0',        '#EDE7F6'],
    ['Attribution %',       shopAll.revenue ? all.revenue / shopAll.revenue : 0,  '0.0%',         '#FBE0C4']
  ];
  for (var k = 0; k < kpis.length; k++) {
    rep.getRange(5, k + 1).setValue(kpis[k][0]).setFontWeight('bold').setBackground('#F1F3F4')
       .setHorizontalAlignment('center').setWrap(true).setFontSize(9).setFontColor('#5F6368');
    rep.getRange(6, k + 1).setValue(kpis[k][1]).setFontSize(15).setFontWeight('bold')
       .setHorizontalAlignment('center').setBackground(kpis[k][3]).setNumberFormat(kpis[k][2]);
  }
  rep.setRowHeight(6, 34);

  // ---------- BY PLATFORM matrix ----------
  rep.getRange(8, 1).setValue('BY PLATFORM');
  rep.getRange(8, 1, 1, NCOL).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11);
  var pHead = ['Platform', 'Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Conversions', 'Revenue', 'CPA', 'ROAS', 'AOV'];
  var pStart = 9;
  rep.getRange(pStart, 1, 1, pHead.length).setValues([pHead])
     .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  var pList = PLATFORMS.filter(function (p) { return byP[p] && (byP[p].spend || byP[p].conv || byP[p].revenue); });
  Object.keys(byP).forEach(function (p) { if (pList.indexOf(p) === -1 && (byP[p].spend || byP[p].conv || byP[p].revenue)) pList.push(p); });
  var pRows = pList.map(function (p) {
    var b = byP[p];
    return [p, round2_(b.spend), b.impr, b.clicks, b.impr ? b.clicks / b.impr : '', b.clicks ? round2_(b.spend / b.clicks) : '',
      b.conv, round2_(b.revenue), b.conv ? round2_(b.spend / b.conv) : '', b.spend ? round2_(b.revenue / b.spend) : '', b.conv ? round2_(b.revenue / b.conv) : ''];
  });
  var pEnd = pStart;
  if (pRows.length) {
    rep.getRange(pStart + 1, 1, pRows.length, pHead.length).setValues(pRows);
    pEnd = pStart + pRows.length;
    rep.getRange(pStart + 1, 2, pRows.length, 1).setNumberFormat('#,##0');
    rep.getRange(pStart + 1, 3, pRows.length, 2).setNumberFormat('#,##0');
    rep.getRange(pStart + 1, 5, pRows.length, 1).setNumberFormat('0.00%');
    rep.getRange(pStart + 1, 6, pRows.length, 1).setNumberFormat('#,##0.00');
    rep.getRange(pStart + 1, 7, pRows.length, 1).setNumberFormat('#,##0');
    rep.getRange(pStart + 1, 8, pRows.length, 1).setNumberFormat('#,##0');
    rep.getRange(pStart + 1, 9, pRows.length, 1).setNumberFormat('#,##0.00');
    rep.getRange(pStart + 1, 10, pRows.length, 1).setNumberFormat('#,##0.00"x"');
    rep.getRange(pStart + 1, 11, pRows.length, 1).setNumberFormat('#,##0.00');
    applyBanding_(rep, pStart + 1, 1, pRows.length, pHead.length);
    rep.getRange(pStart + 1, 1, pRows.length, 1)
       .setBackgrounds(pList.map(function (p) { return [PLATFORM_BG[p] || '#F1F3F4']; })).setFontWeight('bold');
  }

  // ---------- BY COUNTRY matrix (attributed vs Shopify ground truth) ----------
  var cHeadRow = pEnd + 2;
  rep.getRange(cHeadRow, 1).setValue('BY COUNTRY');
  rep.getRange(cHeadRow, 1, 1, NCOL).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11);
  var cHead = ['Country', 'Spend', 'Conversions', 'Attr Revenue', 'Shopify Orders', 'Shopify Revenue', 'Attr ROAS', 'Blended ROAS', 'CPA', 'Coverage %'];
  var cStart = cHeadRow + 1;
  rep.getRange(cStart, 1, 1, cHead.length).setValues([cHead])
     .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  var cList = {}; Object.keys(byC).forEach(function (c) { cList[c] = 1; }); Object.keys(shopByC).forEach(function (c) { cList[c] = 1; });
  var cCodes = Object.keys(cList).sort();
  var cRows = cCodes.map(function (cc) {
    var b = byC[cc] || budBucket_(), s = shopByC[cc] || { orders: 0, revenue: 0 };
    return [cc, round2_(b.spend), b.conv, round2_(b.revenue), s.orders, round2_(s.revenue),
      b.spend ? round2_(b.revenue / b.spend) : '', b.spend ? round2_(s.revenue / b.spend) : '',
      b.conv ? round2_(b.spend / b.conv) : '', s.revenue ? b.revenue / s.revenue : ''];
  });
  var cEnd = cStart;
  if (cRows.length) {
    rep.getRange(cStart + 1, 1, cRows.length, cHead.length).setValues(cRows);
    cEnd = cStart + cRows.length;
    rep.getRange(cStart + 1, 2, cRows.length, 5).setNumberFormat('#,##0');
    rep.getRange(cStart + 1, 7, cRows.length, 2).setNumberFormat('#,##0.00"x"');
    rep.getRange(cStart + 1, 9, cRows.length, 1).setNumberFormat('#,##0.00');
    rep.getRange(cStart + 1, 10, cRows.length, 1).setNumberFormat('0.0%');
    applyBanding_(rep, cStart + 1, 1, cRows.length, cHead.length);
    rep.getRange(cStart + 1, 1, cRows.length, 1)
       .setBackgrounds(cCodes.map(function (cc) { return [countryBg_(cc)]; })).setFontWeight('bold');
  }

  // ---------- BY DATE trend table (drives the line chart) ----------
  var tStart = 0, tCount = 0;
  if (dOrder.length > 1) {
    var tHeadRow = cEnd + 2;
    rep.getRange(tHeadRow, 1).setValue('BY DAY (TREND)');
    rep.getRange(tHeadRow, 1, 1, NCOL).merge().setBackground('#E8EEF7').setFontWeight('bold').setFontSize(11);
    tStart = tHeadRow + 1;
    rep.getRange(tStart, 1, 1, 4).setValues([['Date', 'Spend', 'Revenue', 'Conversions']])
       .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    var tRows = dOrder.map(function (dk) { var b = byD[dk]; return [dk, round2_(b.spend), round2_(b.revenue), b.conv]; });
    tCount = tRows.length;
    rep.getRange(tStart + 1, 1, tCount, 4).setValues(tRows);
    rep.getRange(tStart + 1, 2, tCount, 2).setNumberFormat('#,##0');
    applyBanding_(rep, tStart + 1, 1, tCount, 4);
    cEnd = tStart + tCount;
  }

  // ---------- Charts ----------
  var chartRow = cEnd + 3;
  if (pRows.length) {
    addColChart_(rep, 'Spend vs Revenue by platform',
      [rep.getRange(pStart, 1, pRows.length + 1, 1), rep.getRange(pStart, 2, pRows.length + 1, 1), rep.getRange(pStart, 8, pRows.length + 1, 1)],
      chartRow, 1, ['#5B8DEF', '#34A853']);
    addColChart_(rep, 'ROAS by platform',
      [rep.getRange(pStart, 1, pRows.length + 1, 1), rep.getRange(pStart, 10, pRows.length + 1, 1)],
      chartRow, 7, ['#F09300']);
    addPieChart_(rep, 'Spend share by platform',
      rep.getRange(pStart, 1, pRows.length + 1, 2), chartRow + 18, 1, pList.map(function (p) { return PLATFORM_CHART[p] || '#9AA0A6'; }));
  }
  if (dOrder.length > 1) {
    addLineChart_(rep, 'Daily trend: spend vs revenue',
      [rep.getRange(tStart, 1, tCount + 1, 3)], chartRow + 18, 7, ['#EA4335', '#34A853']);
  }

  // ---------- widths, caveat, polish ----------
  rep.setColumnWidth(1, 120);
  for (var w = 2; w <= NCOL; w++) rep.setColumnWidth(w, 100);
  var noteRow = chartRow + 38;
  rep.getRange(noteRow, 1).setValue('ROAS/CPA/AOV use ATTRIBUTED (pixel-tracked) conversions per platform. "Shopify Revenue/Orders" are ground-truth totals; "Blended ROAS" = Shopify revenue ÷ spend; "Coverage %" = attributed ÷ Shopify revenue (the gap = unattributed/organic orders). ALL money is converted to USD at current FX rates — see the "' + TAB.FX + '" tab.')
     .setFontColor('#9AA0A6').setFontStyle('italic').setFontSize(9);
  rep.getRange(noteRow, 1, 1, NCOL).merge().setWrap(true);
  centerAll_(rep);
  rep.getRange(noteRow, 1).setHorizontalAlignment('left');   // keep the caveat paragraph left-aligned for readability
  try { rep.setHiddenGridlines(true); } catch (e) {}
}

function budBucket_() { return { spend: 0, impr: 0, clicks: 0, conv: 0, revenue: 0 }; }
function addBud_(b, sp, im, ck, cv, rv) { b.spend += sp; b.impr += im; b.clicks += ck; b.conv += cv; b.revenue += rv; }

/* Day-granular period windows (inclusive ISO-date keys, TZ-safe string compare). */
function periodRange_(label) {
  var now = new Date(), todayKey = dayKey_(now);
  var p = todayKey.split('-'), y = +p[0], m = +p[1] - 1;
  var fromKey, toKey = todayKey;
  switch (label) {
    case 'Today':        fromKey = todayKey; break;
    case 'Yesterday':    fromKey = toKey = dayKey_(addDays_(now, -1)); break;
    case 'Last 7 Days':  fromKey = dayKey_(addDays_(now, -6)); break;
    case 'Last 14 Days': fromKey = dayKey_(addDays_(now, -13)); break;
    case 'Last 30 Days': fromKey = dayKey_(addDays_(now, -29)); break;
    case 'This Month':   fromKey = dayKey_(ymUTC_(y, m, 1)); break;
    case 'Last Month':   fromKey = dayKey_(ymUTC_(y, m - 1, 1)); toKey = dayKey_(addDays_(ymUTC_(y, m, 1), -1)); break;
    case 'This Year':    fromKey = dayKey_(ymUTC_(y, 0, 1)); break;
    case 'All Time':     fromKey = '2000-01-01'; break;
    default:             fromKey = dayKey_(addDays_(now, -29)); break;
  }
  return { label: label, fromKey: fromKey, toKey: toKey };
}

/* ===================== MENU + PERIOD DROPDOWN + SETUP =================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('💰 Ad Budget')
    .addItem('↻ Refresh ALL (pull + build reports)', 'refreshAll')
    .addItem('↻ Rebuild reports only', 'rebuildAll')
    .addSeparator()
    .addItem('Pull Shopify revenue', 'menuPullShopify')
    .addItem('Meta: list my ad accounts (setup)', 'menuMetaList')
    .addItem('Pull Meta spend', 'menuPullMeta')
    .addItem('Clear Meta rows (before re-pull, fixes double-count)', 'menuClearMeta')
    .addItem('Refresh FX rates (→ USD)', 'menuRefreshFx')
    .addItem('Reconcile vs Shopify (local $)', 'menuReconcile')
    .addItem('Reconcile SPEND (local $)', 'menuReconcileSpend')
    .addItem('Spend coverage (who\'s feeding?)', 'menuCoverage')
    .addItem('Verify New/Returning (all countries)', 'menuVerifyCustomers')
    .addItem('Fix country codes (merge US → USA)', 'menuFixCountries')
    .addItem('Send WhatsApp summary now', 'menuWhatsApp')
    .addItem('Send LAST month\'s report (Billboard + Payments)', 'menuMonthlyLast')
    .addItem('Send THIS month\'s report so far (Billboard + Payments)', 'menuMonthlyNow')
    .addSeparator()
    .addItem('Analytics view (optional Daily Master + Dashboard)', 'menuDashboard')
    .addToUi();
}
function dashToday()     { buildDashboard('Today'); }
function dashYesterday() { buildDashboard('Yesterday'); }
function dashL7()        { buildDashboard('Last 7 Days'); }
function dashL30()       { buildDashboard('Last 30 Days'); }
function dashThisMonth() { buildDashboard('This Month'); }
function dashLastMonth() { buildDashboard('Last Month'); }
function dashThisYear()  { buildDashboard('This Year'); }
function dashAllTime()   { buildDashboard('All Time'); }

/* Run ONCE: installs the daily schedule + the in-sheet Period dropdown.
   IMPORTANT: set Project Settings ⚙ → Time zone = (GMT+05:30) India Standard Time so the hours below are IST. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (['onBudgetEdit', 'refreshAll', 'rebuildAll', 'sendWhatsAppSummary', 'jobPullSpend', 'jobPullRevenue', 'jobMonthlyReports'].indexOf(fn) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('jobPullSpend').timeBased().everyDays(1).atHour(14).nearMinute(0).create();      // ~2:00 PM IST — Meta spend + rebuild (Google/Bing scripts post from their own platforms; schedule those ~1–2 PM)
  ScriptApp.newTrigger('jobPullRevenue').timeBased().everyDays(1).atHour(14).nearMinute(15).create();   // ~2:15 PM IST — FX + Shopify revenue (ShopifyQL exact) + rebuild; refreshes the trailing 60 days so YESTERDAY & TODAY are re-corrected every run
  ScriptApp.newTrigger('sendWhatsAppSummary').timeBased().everyDays(1).atHour(CONFIG.WHATSAPP.SEND_HOUR || 15).nearMinute(CONFIG.WHATSAPP.SEND_MINUTE || 0).create();   // e.g. 15:20 = ~3:20 PM IST — DAILY email (handler no-ops unless CONFIG.WHATSAPP.ENABLED = true)
  ScriptApp.newTrigger('jobMonthlyReports').timeBased().onMonthDay(1).atHour(CONFIG.WHATSAPP.SEND_HOUR || 15).nearMinute(30).create();   // 1st of each month — Billboard + Payments emails for the PRIOR month
  ScriptApp.newTrigger('rebuildAll').timeBased().everyMinutes(30).create();                             // keep reports fresh between the scheduled pulls
  getTab_(TAB.SPEND, SPEND_HEADERS);
  getTab_(TAB.SHOPIFY, SHOPIFY_HEADERS);
  try { refreshFxRates(); } catch (e) { Logger.log('refreshFxRates: ' + e); }
  buildReports();
  Logger.log('Setup complete → spend ~2:00 PM, revenue ~2:15 PM, email ~3:00 PM (PROJECT time zone). Set Project TZ = IST, and CONFIG.WHATSAPP.ENABLED = true for the auto-email.');
}

/* Scheduled jobs (called by the daily triggers). Spend first (2:00), revenue 15 min later (2:15)
   so the 3:00 email has both. Each rebuilds the reports; the 30-min rebuild fills any gaps. */
function jobPullSpend() {
  try { pullMetaSpend(); } catch (e) { Logger.log('pullMetaSpend: ' + e); }
  try { buildReports(); } catch (e) { Logger.log('buildReports: ' + e); }
}
function jobPullRevenue() {
  try { refreshFxRates(); }   catch (e) { Logger.log('refreshFxRates: ' + e); }
  try { pullShopifyDaily(); } catch (e) { Logger.log('pullShopifyDaily: ' + e); }
  try { buildReports(); }     catch (e) { Logger.log('buildReports: ' + e); }
}
function onBudgetEdit(e) {
  try {
    var rng = e.range;
    if (rng.getSheet().getName() !== TAB.DASH) return;
    if (rng.getRow() === 2 && rng.getColumn() === 2) buildDashboard(String(rng.getValue() || ''));
  } catch (err) { Logger.log('onEdit: ' + err); }
}

/* ============================================================================
 *  REPORTS — the tabs that mirror your workbook screenshots
 *    "Daily Budget"  : Country|Month|Week|Date | Google Meta Bing LinkedIn ABM | Total
 *    "Weekly Rollup" : Country|Month|Week | Spent(per-platform + Blended) |
 *                      Revenue(Payment Pending | Paid | Blended) | ROAS(Paid | Blended | Spend/Rev%)
 *    "Optimisation"  : manual campaign log — created with headers, NEVER overwritten.
 *  Spend = platform columns (from Spend Input). Revenue = Shopify Daily paid/pending.
 *  Weeks = calendar Mon–Sun with partial first/last week (matches "1st (1-3)"…).
 * ==========================================================================*/

// Per-tab spend columns: {h: header label, p: canonical platform key}. ABM == LinkedIn
// (your ABM budget runs on LinkedIn) → ONE spend bucket, shown as "ABM" in Daily Budget
// and "LinkedIn" in Weekly Rollup, matching your workbook. Blended/Total always sums ALL
// of the group's spend, so a platform without its own column (e.g. TikTok) is never lost.
var DAILY_COLS  = [{ h: 'Google', p: 'Google' }, { h: 'Meta', p: 'Meta' }, { h: 'Bing', p: 'Bing' }, { h: 'ABM', p: 'LinkedIn' }];
var ROLLUP_COLS = [{ h: 'Google', p: 'Google' }, { h: 'Bing', p: 'Bing' }, { h: 'Meta', p: 'Meta' }, { h: 'LinkedIn', p: 'LinkedIn' }];
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var YELLOW = '#FFF200', SUBHEAD_BG = '#CFE0F5', YELLOW_TINT = '#FFFBCC';
var OPT_HEADERS = ['Country','Month','Week','Date','Campaign Name','Campaign Type','Maker','Checker','Owner','Updated Time','Annotations','SOW','Priority','Status','Execution Follow Up','Remarks'];

function buildReports() {
  try { buildDailyBudget_(); }          catch (e) { Logger.log('buildDailyBudget: ' + e); }
  try { buildRollup_(); }               catch (e) { Logger.log('buildRollup: ' + e); }
  try { buildOptimisationSkeleton_(); } catch (e) { Logger.log('buildOptimisation: ' + e); }
  try { formatAll_(); }                 catch (e) { Logger.log('formatAll: ' + e); }   // center-align + decorate the raw tabs (Spend Input, Shopify Daily, Daily Master) every rebuild
}

/* ---------- week math: calendar weeks Mon–Sun, partial first/last week ---------- */
function isoDow_(y, m, d) { var wd = new Date(Date.UTC(y, m, d, 12)).getUTCDay(); return wd === 0 ? 7 : wd; }   // Mon=1..Sun=7
function daysInMonth_(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
function ordinal_(n) { var s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function weekIndexFor_(y, m, d) { var w1End = 8 - isoDow_(y, m, 1); return (d <= w1End) ? 1 : (2 + Math.floor((d - w1End - 1) / 7)); }
function weekLabelFor_(y, m, idx, capDay) {
  var w1End = 8 - isoDow_(y, m, 1), dim = daysInMonth_(y, m), start, end;
  if (idx === 1) { start = 1; end = Math.min(w1End, dim); }
  else { start = w1End + 1 + 7 * (idx - 2); end = Math.min(start + 6, dim); }
  if (capDay && start <= capDay && end > capDay) end = capDay;   // current/partial week → stop label at the last day WITH DATA (never show future days)
  return ordinal_(idx) + ' (' + start + '-' + end + ')';
}
function monthRangeLabel_(y, m) { return '1-' + daysInMonth_(y, m); }
function dkDisp_(dk) { var p = dk.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }   // yyyy-MM-dd → dd.MM.yyyy

/* ---------- read + group the raw tabs ---------- */
function readSpendGrouped_() {
  var sh = getTab_(TAB.SPEND, SPEND_HEADERS);
  var byDay = {}, byWeek = {}, countries = {}, maxDay = {};
  if (sh.getLastRow() < 2) return { byDay: byDay, byWeek: byWeek, countries: countries, maxDay: maxDay };
  var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
  for (var i = 1; i < vals.length; i++) {
    var dk = normDayKey_(vals[i][c['Date']]); if (!dk) continue;
    var cc = canonCountry_(vals[i][c['Country']]);
    var pf = canonPlatform_(vals[i][c['Platform']]);
    var sp = fxToUSD_(vals[i][c['Spend']], vals[i][c['Currency']] || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency));
    countries[cc] = 1;
    var p = dk.split('-'), y = +p[0], m = +p[1] - 1, day = +p[2], mk = p[0] + '-' + p[1], wk = weekIndexFor_(y, m, day);
    var dd = ((byDay[cc] = byDay[cc] || {})[dk] = byDay[cc][dk] || { cols: {}, total: 0 });
    dd.cols[pf] = (dd.cols[pf] || 0) + sp; dd.total += sp;
    var ww = (((byWeek[cc] = byWeek[cc] || {})[mk] = byWeek[cc][mk] || {})[wk] = byWeek[cc][mk][wk] || { cols: {}, total: 0 });
    ww.cols[pf] = (ww.cols[pf] || 0) + sp; ww.total += sp;
    var md = (maxDay[cc] = maxDay[cc] || {}); if (!md[mk] || day > md[mk]) md[mk] = day;
  }
  return { byDay: byDay, byWeek: byWeek, countries: countries, maxDay: maxDay };
}
function readShopifyGrouped_() {
  var sh = getSpreadsheet_().getSheetByName(TAB.SHOPIFY);
  var byWeek = {}, maxDay = {};
  if (!sh || sh.getLastRow() < 2) return { byWeek: byWeek, maxDay: maxDay };
  var vals = sh.getDataRange().getValues(), c = indexMap_(vals[0]);
  for (var i = 1; i < vals.length; i++) {
    var dk = normDayKey_(vals[i][c['Date']]); if (!dk) continue;
    var cc = canonCountry_(vals[i][c['Country']]);
    var cur = vals[i][c['Currency']] || (COUNTRY_CFG[cc] && COUNTRY_CFG[cc].currency);
    var paid = fxToUSD_(vals[i][c['Paid Revenue']], cur), pend = fxToUSD_(vals[i][c['Pending Revenue']], cur);
    var blend = fxToUSD_(vals[i][c['Revenue']], cur);   // authoritative "Total sales" (ShopifyQL if set, else paid+pend)
    var p = dk.split('-'), y = +p[0], m = +p[1] - 1, day = +p[2], mk = p[0] + '-' + p[1], wk = weekIndexFor_(y, m, day);
    var ww = (((byWeek[cc] = byWeek[cc] || {})[mk] = byWeek[cc][mk] || {})[wk] = byWeek[cc][mk][wk] || { paid: 0, pend: 0, blend: 0 });
    ww.paid += paid; ww.pend += pend; ww.blend += blend;
    var md = (maxDay[cc] = maxDay[cc] || {}); if (!md[mk] || day > md[mk]) md[mk] = day;
  }
  return { byWeek: byWeek, maxDay: maxDay };
}

/* ---------- "Daily Budget" tab (platform columns per day) ---------- */
function buildDailyBudget_() {
  var g = readSpendGrouped_(), ss = getSpreadsheet_();
  var sh = ss.getSheetByName(TAB.DAILY) || ss.insertSheet(TAB.DAILY);
  clearSheet_(sh);
  var NC = 4 + DAILY_COLS.length + 1;   // Country,Month,Week,Date + platforms + Total
  sh.getRange(1, 1, 1, 4).setBackground(HEADER_BG);
  sh.getRange(1, 5, 1, DAILY_COLS.length + 1).merge().setValue('Daily Budget (USD)')
    .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  var head = ['Country', 'Month', 'Week', 'Date'].concat(DAILY_COLS.map(function (d) { return d.h; })).concat(['Total']);
  sh.getRange(2, 1, 1, NC).setValues([head]).setBackground(SUBHEAD_BG).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(2, NC).setBackground(YELLOW);
  sh.setFrozenRows(2);

  var out = [];
  Object.keys(g.countries).sort().forEach(function (cc) {
    var days = Object.keys(g.byDay[cc] || {}).sort();   // dates ascending
    var prevCc = '', prevMonth = '', prevWeek = '';
    days.forEach(function (dk) {
      var p = dk.split('-'), y = +p[0], m = +p[1] - 1, day = +p[2], mk2 = p[0] + '-' + p[1];
      var cap = (g.maxDay[cc] && g.maxDay[cc][mk2]) || 0;
      var monthName = MONTHS[m], weekLbl = weekLabelFor_(y, m, weekIndexFor_(y, m, day), cap), dd = g.byDay[cc][dk];
      var row = [
        (cc !== prevCc) ? cc : '',
        (monthName !== prevMonth || cc !== prevCc) ? monthName : '',
        (weekLbl !== prevWeek || monthName !== prevMonth || cc !== prevCc) ? weekLbl : '',
        dkDisp_(dk)
      ];
      DAILY_COLS.forEach(function (def) { row.push(round2_(dd.cols[def.p] || 0)); });
      row.push(round2_(dd.total));
      out.push(row);
      prevCc = cc; prevMonth = monthName; prevWeek = weekLbl;
    });
  });
  if (out.length) {
    sh.getRange(3, 1, out.length, NC).setValues(out);
    sh.getRange(3, 5, out.length, DAILY_COLS.length + 1).setNumberFormat('#,##0.00');
    sh.getRange(3, NC, out.length, 1).setFontWeight('bold');
    applyBanding_(sh, 3, 1, out.length, NC);
  }
  sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 80); sh.setColumnWidth(3, 90); sh.setColumnWidth(4, 100);
  centerAll_(sh);
  Logger.log('Daily Budget: ' + out.length + ' day-row(s).');
}

/* ---------- "Weekly Rollup" tab (Spent / Revenue / ROAS, weekly + monthly totals) ---------- */
function rollupRowArray_(country, month, week, sp, rv, NC) {
  var blendSpend = sp.total || 0, pend = rv.pend || 0, paid = rv.paid || 0, blendRev = (rv.blend != null ? rv.blend : (pend + paid));   // Blended = Shopify "Total sales" (exact)
  var row = []; for (var i = 0; i < NC; i++) row.push('');
  row[0] = country; row[1] = month; row[2] = week;
  var idx = 3;
  ROLLUP_COLS.forEach(function (def) { row[idx++] = round2_((sp.cols && sp.cols[def.p]) || 0); });
  row[idx++] = round2_(blendSpend);
  row[idx++] = round2_(pend);
  row[idx++] = round2_(paid);
  row[idx++] = round2_(blendRev);
  row[idx++] = blendSpend ? round2_(pend / blendSpend) : '';         // ROAS Payment Pending
  row[idx++] = blendSpend ? round2_(paid / blendSpend) : '';         // ROAS Paid
  row[idx++] = blendSpend ? round2_(blendRev / blendSpend) : '';     // ROAS Blended
  row[idx++] = blendRev ? round4_(blendSpend / blendRev) : '';       // Spend ÷ Revenue (fraction → % format)
  return row;
}
function accSpend_(acc, sp) {
  acc.total += sp.total || 0;
  ROLLUP_COLS.forEach(function (def) { acc.cols[def.p] = (acc.cols[def.p] || 0) + ((sp.cols && sp.cols[def.p]) || 0); });
}
function buildRollup_() {
  var gs = readSpendGrouped_(), gr = readShopifyGrouped_(), ss = getSpreadsheet_();
  var sh = ss.getSheetByName(TAB.ROLLUP) || ss.insertSheet(TAB.ROLLUP);
  clearSheet_(sh);

  var spCols = ROLLUP_COLS;
  var spStart = 4, spBlend = 3 + spCols.length + 1;               // platforms then Blended
  var revStart = spBlend + 1, revPaid = revStart + 1, revBlend = revStart + 2;
  var roasPend = revBlend + 1, roasPaid = roasPend + 1, roasBlend = roasPaid + 1, srPct = roasBlend + 1, NC = srPct;

  // header row 1 (group bands)
  sh.getRange(1, spStart, 1, spCols.length + 1).merge().setValue('Spent (USD)');
  sh.getRange(1, revStart, 1, 3).merge().setValue('Revenue (USD)');
  sh.getRange(1, roasPend, 1, 4).merge().setValue('ROAS');   // Payment Pending | Paid | Blended | Revenue<>Spends%
  sh.getRange(1, 1, 1, NC).setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(13).setVerticalAlignment('middle').setHorizontalAlignment('center');
  sh.setRowHeight(1, 30);
  // header row 2 (sub-columns)
  var h2 = ['Country', 'Month', 'Week'].concat(spCols.map(function (d) { return d.h; })).concat(['Blended', 'Payment Pending', 'Paid', 'Blended', 'Payment Pending', 'Paid', 'Blended', 'Revenue <> Spends (%)']);
  sh.getRange(2, 1, 1, NC).setValues([h2]).setBackground(SUBHEAD_BG).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
  [spBlend, revBlend, roasBlend, srPct].forEach(function (col) { sh.getRange(2, col).setBackground(YELLOW); });
  sh.setRowHeight(2, 34); sh.setFrozenRows(2); sh.setFrozenColumns(3);

  var countries = {};
  Object.keys(gs.countries).forEach(function (cc) { countries[cc] = 1; });
  Object.keys(gr.byWeek).forEach(function (cc) { countries[cc] = 1; });

  var data = [], yellowRows = [], countryRows = [];
  Object.keys(countries).sort().forEach(function (cc) {
    var monthsObj = {};
    Object.keys(gs.byWeek[cc] || {}).forEach(function (mk) { monthsObj[mk] = 1; });
    Object.keys(gr.byWeek[cc] || {}).forEach(function (mk) { monthsObj[mk] = 1; });
    var firstOfCountry = true;
    Object.keys(monthsObj).sort().forEach(function (mk) {
      var p = mk.split('-'), y = +p[0], m = +p[1] - 1, monthName = MONTHS[m];
      var wkObj = {};
      Object.keys((gs.byWeek[cc] && gs.byWeek[cc][mk]) || {}).forEach(function (w) { wkObj[w] = 1; });
      Object.keys((gr.byWeek[cc] && gr.byWeek[cc][mk]) || {}).forEach(function (w) { wkObj[w] = 1; });
      var weeks = Object.keys(wkObj).map(Number).sort(function (a, b) { return a - b; });
      var lastDay = Math.max((gs.maxDay[cc] && gs.maxDay[cc][mk]) || 0, (gr.maxDay[cc] && gr.maxDay[cc][mk]) || 0) || daysInMonth_(y, m);
      var mTot = { cols: {}, total: 0, paid: 0, pend: 0, blend: 0 };
      weeks.forEach(function (wk, wi) {
        var sp = (gs.byWeek[cc] && gs.byWeek[cc][mk] && gs.byWeek[cc][mk][wk]) || { cols: {}, total: 0 };
        var rv = (gr.byWeek[cc] && gr.byWeek[cc][mk] && gr.byWeek[cc][mk][wk]) || { paid: 0, pend: 0 };
        var country = (firstOfCountry && wi === 0) ? cc : '';
        data.push(rollupRowArray_(country, (wi === 0) ? monthName : '', weekLabelFor_(y, m, wk, lastDay), sp, rv, NC));   // week label capped at last day with data
        if (country) countryRows.push(data.length - 1);
        accSpend_(mTot, sp); mTot.paid += rv.paid; mTot.pend += rv.pend; mTot.blend += (rv.blend || 0);
        firstOfCountry = false;
      });
      data.push(rollupRowArray_('', monthName + ' Total', '1-' + lastDay, mTot, { paid: mTot.paid, pend: mTot.pend, blend: mTot.blend }, NC));   // label shows the REAL covered span (1 → last day with data), so it matches Shopify when you set the same range
      yellowRows.push(data.length - 1);
      data.push([]);   // spacer row
    });
  });

  if (data.length) {
    // pad every row to NC so setValues doesn't throw
    for (var i = 0; i < data.length; i++) { while (data[i].length < NC) data[i].push(''); }
    var base = 3;
    sh.getRange(base, 1, data.length, NC).setValues(data);
    sh.getRange(base, spStart, data.length, (spCols.length + 1) + 3).setNumberFormat('#,##0');   // spend + revenue
    sh.getRange(base, roasPend, data.length, 3).setNumberFormat('#,##0.00');                     // ROAS (Payment Pending / Paid / Blended)
    sh.getRange(base, srPct, data.length, 1).setNumberFormat('0%');                              // Spend/Rev %
    [spBlend, revBlend, roasBlend, srPct].forEach(function (col) { sh.getRange(base, col, data.length, 1).setBackground(YELLOW_TINT); });
    yellowRows.forEach(function (idx) { sh.getRange(base + idx, 1, 1, NC).setBackground(YELLOW).setFontWeight('bold'); });
    countryRows.forEach(function (idx) { sh.getRange(base + idx, 1).setFontWeight('bold').setFontSize(12); });
  }
  sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 90); sh.setColumnWidth(3, 100);
  for (var w = spStart; w <= NC; w++) sh.setColumnWidth(w, 92);
  centerAll_(sh);
  Logger.log('Weekly Rollup: ' + data.length + ' row(s).');
}

/* ---------- "Optimisation" tab — manual log, created once, never overwritten ---------- */
function buildOptimisationSkeleton_() {
  var ss = getSpreadsheet_();
  if (ss.getSheetByName(TAB.OPT)) return;   // never touch a manually-maintained tab
  var sh = ss.insertSheet(TAB.OPT);
  sh.getRange(1, 1, 1, OPT_HEADERS.length).merge().setValue(TAB.OPT)
    .setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(14).setHorizontalAlignment('center');
  sh.getRange(2, 1, 1, OPT_HEADERS.length).setValues([OPT_HEADERS]).setBackground(SUBHEAD_BG).setFontWeight('bold');
  sh.setFrozenRows(2);
  var statusCol = OPT_HEADERS.indexOf('Status') + 1, L = colLetter_(statusCol), rng = sh.getRange(L + '3:' + L);
  rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Inactive'], true).build());
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Active').setBackground('#B7E1CD').setRanges([rng]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Inactive').setBackground('#F4C7C3').setRanges([rng]).build()
  ]);
  Logger.log('Optimisation tab created (manual log).');
}

/* ========================= SHEET FORMATTING ============================= */
var HEADER_BG = '#1B2D55', HEADER_FG = '#FFFFFF';
var PLATFORM_BG    = { Google: '#E3ECFD', Meta: '#EDE7F6', Bing: '#E6F4EA', LinkedIn: '#DCE7F0', TikTok: '#F6DCE7', Direct: '#F1F3F4' };
var PLATFORM_CHART = { Google: '#4285F4', Meta: '#7E57C2', Bing: '#34A853', LinkedIn: '#0A66C2', TikTok: '#EE1D52', Direct: '#9AA0A6' };
var COUNTRY_BG = {
  USA:'#D6E4F7', US:'#D6E4F7', CA:'#FADBD8', UK:'#E8D9FB', GB:'#E8D9FB',
  AU:'#D6EEDC', IN:'#FDE3CC', DE:'#CFEDEA', FR:'#E3F0D4', NZ:'#FCE9C9', IE:'#D9DEF5', SG:'#F8D9E6', AE:'#E4D7CF', UAE:'#E4D7CF'
};
var COUNTRY_BG_PALETTE = ['#D6E4F7','#FADBD8','#E8D9FB','#D6EEDC','#FDE3CC','#CFEDEA','#E3F0D4','#FCE9C9','#D9DEF5','#F8D9E6','#E4D7CF'];
function countryBg_(code) {
  code = String(code || '').toUpperCase();
  if (COUNTRY_BG[code]) return COUNTRY_BG[code];
  var h = 0; for (var i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return COUNTRY_BG_PALETTE[h % COUNTRY_BG_PALETTE.length];
}

function formatAll_() {
  try { formatMaster_(); }  catch (e) { Logger.log('formatMaster: ' + e); }
  try { formatSpend_(); }   catch (e) { Logger.log('formatSpend: ' + e); }
  try { formatShopify_(); } catch (e) { Logger.log('formatShopify: ' + e); }
}

function formatMaster_() {
  var sh = getSpreadsheet_().getSheetByName(TAB.MASTER);
  if (!sh || sh.getLastRow() < 1) return;
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var col = indexMap_(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
  sh.getRange(1, 1, 1, lastCol).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold').setFontSize(10).setWrap(true);
  sh.setRowHeight(1, 34); sh.setFrozenRows(1); sh.setFrozenColumns(3);
  var n = lastRow - 1;
  if (n >= 1) {
    sh.getRange(2, 1, n, lastCol).setBackground(null);
    setColFormat_(sh, col, 'Spend', n, '#,##0.00');
    setColFormat_(sh, col, 'Impressions', n, '#,##0');
    setColFormat_(sh, col, 'Clicks', n, '#,##0');
    setColFormat_(sh, col, 'CTR', n, '0.00%');
    setColFormat_(sh, col, 'CPC', n, '#,##0.00');
    setColFormat_(sh, col, 'Conversions', n, '#,##0');
    setColFormat_(sh, col, 'Revenue', n, '#,##0.00');
    setColFormat_(sh, col, 'CPA', n, '#,##0.00');
    setColFormat_(sh, col, 'ROAS', n, '#,##0.00"x"');
    setColFormat_(sh, col, 'AOV', n, '#,##0.00');
    sh.getBandings().forEach(function (b) { b.remove(); });
    applyBanding_(sh, 2, 1, n, lastCol);
  }
  sh.setConditionalFormatRules(cfCountryRules_(sh, col['Country']).concat(cfMapRules_(sh, col['Platform'], PLATFORM_BG)));
  centerAll_(sh);
}

function formatSpend_() {
  var sh = getSpreadsheet_().getSheetByName(TAB.SPEND);
  if (!sh || sh.getLastRow() < 1) return;
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var col = indexMap_(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
  sh.getRange(1, 1, 1, lastCol).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sh.setFrozenRows(1);
  var n = lastRow - 1;
  if (n >= 1) {
    sh.getRange(2, 1, n, lastCol).setBackground(null);
    setColFormat_(sh, col, 'Spend', n, '#,##0.00');
    setColFormat_(sh, col, 'Impressions', n, '#,##0');
    setColFormat_(sh, col, 'Clicks', n, '#,##0');
    setColFormat_(sh, col, 'Updated At', n, 'yyyy-mm-dd hh:mm');
    sh.getBandings().forEach(function (b) { b.remove(); });
    applyBanding_(sh, 2, 1, n, lastCol);
  }
  sh.setConditionalFormatRules(cfCountryRules_(sh, col['Country']).concat(cfMapRules_(sh, col['Platform'], PLATFORM_BG)));
  centerAll_(sh);
}

function formatShopify_() {
  var sh = getSpreadsheet_().getSheetByName(TAB.SHOPIFY);
  if (!sh || sh.getLastRow() < 1) return;
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var col = indexMap_(sh.getRange(1, 1, 1, lastCol).getValues()[0]);
  sh.getRange(1, 1, 1, lastCol).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sh.setFrozenRows(1);
  var n = lastRow - 1;
  if (n >= 1) {
    sh.getRange(2, 1, n, lastCol).setBackground(null);
    setColFormat_(sh, col, 'Orders', n, '#,##0');
    setColFormat_(sh, col, 'Paid Orders', n, '#,##0');
    setColFormat_(sh, col, 'Pending Orders', n, '#,##0');
    setColFormat_(sh, col, 'Paid Revenue', n, '#,##0.00');
    setColFormat_(sh, col, 'Pending Revenue', n, '#,##0.00');
    setColFormat_(sh, col, 'Revenue', n, '#,##0.00');
    setColFormat_(sh, col, 'New Customers', n, '#,##0');
    setColFormat_(sh, col, 'Repeat Customers', n, '#,##0');
    setColFormat_(sh, col, 'Personal Emails', n, '#,##0');
    setColFormat_(sh, col, 'Business Emails', n, '#,##0');
    setColFormat_(sh, col, 'Updated At', n, 'yyyy-mm-dd hh:mm');
    sh.getBandings().forEach(function (b) { b.remove(); });
    applyBanding_(sh, 2, 1, n, lastCol);
  }
  sh.setConditionalFormatRules(cfCountryRules_(sh, col['Country']));
  centerAll_(sh);
}

/* --- formatting + chart helpers (shared conventions) --- */
function setColFormat_(sh, col, name, n, fmt) { if (col[name] != null && n > 0) sh.getRange(2, col[name] + 1, n, 1).setNumberFormat(fmt); }
function applyBanding_(sh, startRow, startCol, n, nCols) {
  if (n < 1) return;
  try { sh.getRange(startRow, startCol, n, nCols).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false); } catch (e) {}
}
// Center-align + vertically middle every used cell of a tab — one clean, consistent look everywhere.
function centerAll_(sh) {
  try { var lr = sh.getLastRow(), lc = sh.getLastColumn(); if (lr > 0 && lc > 0) sh.getRange(1, 1, lr, lc).setHorizontalAlignment('center').setVerticalAlignment('middle'); } catch (e) {}
}
function colLetter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m - 1) / 26); } return s; }
function storeCodesFor_(sh, ci) {
  var codes = CONFIG.STORES.map(function (s) { return String(s.code || '').toUpperCase(); }).filter(Boolean);
  if (ci != null && sh.getLastRow() > 1) {
    sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) { var v = String(r[0] || '').toUpperCase(); if (v) codes.push(v); });
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

/* ==================== SHOPIFY AUTH (client-credentials) ================= */
var _tokenCache = {};
function getAccessToken_(st) {
  if (_tokenCache[st.code]) return _tokenCache[st.code];
  if (st.token) return (_tokenCache[st.code] = st.token);   // legacy static token
  var resp = UrlFetchApp.fetch('https://' + st.domain + '/admin/oauth/access_token', {
    method: 'post',
    payload: { grant_type: 'client_credentials', client_id: st.clientId, client_secret: st.clientSecret },
    muteHttpExceptions: true
  });
  var txt = resp.getContentText(), body = {};
  try { body = JSON.parse(txt); } catch (e) {}
  if (!body.access_token) {
    var hint = /shop-404|Store unavailable/i.test(txt) ? ' → store not found: check the .myshopify.com domain'
             : /invalid_client|Unauthorized|401/i.test(txt) ? ' → bad clientId/clientSecret, or app not installed'
             : '';
    Logger.log(st.code + ' token error (HTTP ' + resp.getResponseCode() + ')' + hint + ': ' + txt.slice(0, 200));
    return null;
  }
  return (_tokenCache[st.code] = body.access_token);
}
function shopifyGraphQL_(st, query, variables) {
  var token = getAccessToken_(st);
  if (!token) return null;
  var resp = UrlFetchApp.fetch('https://' + st.domain + '/admin/api/' + CONFIG.API_VERSION + '/graphql.json', {
    method: 'post', contentType: 'application/json',
    headers: { 'X-Shopify-Access-Token': token },
    payload: JSON.stringify({ query: query, variables: variables || {} }),
    muteHttpExceptions: true
  });
  try { return JSON.parse(resp.getContentText()); }
  catch (e) { Logger.log(st.code + ' non-JSON: ' + resp.getContentText().slice(0, 300)); return null; }
}
// Diagnostic: confirm each store's token grant + scopes (needs read_orders).
function showTokenScopes() {
  CONFIG.STORES.forEach(function (st) {
    if (st.token) { Logger.log(st.code + ': legacy static token'); return; }
    var resp = UrlFetchApp.fetch('https://' + st.domain + '/admin/oauth/access_token', {
      method: 'post', payload: { grant_type: 'client_credentials', client_id: st.clientId, client_secret: st.clientSecret }, muteHttpExceptions: true
    });
    var b = {}; try { b = JSON.parse(resp.getContentText()); } catch (e) {}
    if (b.access_token) Logger.log(st.code + ' scopes: ' + (b.scope || '(none)'));
    else Logger.log(st.code + ' token error: ' + resp.getContentText().slice(0, 200));
  });
}

// GROUND-TRUTH DIAGNOSTIC — asks Shopify directly (no report layers) how much a store
// SOLD vs REFUNDED in the lookback window, and lists every refund by date. Run from the
// editor: pick debugCARefunds (or debugShopify with a code) → Run → read the Execution log.
// Tells us if the CA$9,940 "Sales reversals" are actually in Shopify's order.refunds data.
function debugCARefunds() { debugShopify('CA'); }
function debugShopify(code) {
  code = code || 'CA';
  var st = null; CONFIG.STORES.forEach(function (s) { if (s.code === code) st = s; });
  if (!st || (st.clientId && st.clientId.indexOf('PASTE') === 0)) { Logger.log('Store ' + code + ' not configured.'); return; }
  var daysBack = CONFIG.LOOKBACK_DAYS;
  var sinceDate = addDays_(new Date(), -daysBack), sinceMs = sinceDate.getTime();
  var sinceISO = Utilities.formatDate(sinceDate, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var tz = shopTz_(st);
  var q = 'query($cursor:String,$q:String){orders(first:50, after:$cursor, query:$q, sortKey:UPDATED_AT){' +
          'pageInfo{hasNextPage endCursor} edges{node{name createdAt cancelledAt test displayFinancialStatus ' +
          'totalPriceSet{shopMoney{amount}} currentTotalPriceSet{shopMoney{amount}} ' +
          'refunds{createdAt totalRefundedSet{shopMoney{amount}}}}}}}';
  var cursor = null, guard = 0;
  var sumTotal = 0, sumCurrent = 0, sumRefund = 0, orders = 0, adj = [];
  while (guard++ < 200) {
    var res = shopifyGraphQL_(st, q, { cursor: cursor, q: 'updated_at:>=' + sinceISO });
    var conn = res && res.data && res.data.orders;
    if (!conn) { Logger.log(code + ' API error: ' + JSON.stringify(res).slice(0, 300)); break; }
    conn.edges.forEach(function (e) {
      var n = e.node; if (n.test) return;
      var dt = asDate_(n.createdAt); if (!dt) return;
      var tp = (n.totalPriceSet && n.totalPriceSet.shopMoney) ? (Number(n.totalPriceSet.shopMoney.amount) || 0) : 0;
      var ct = (n.currentTotalPriceSet && n.currentTotalPriceSet.shopMoney) ? (Number(n.currentTotalPriceSet.shopMoney.amount) || 0) : 0;
      var rf = 0; (n.refunds || []).forEach(function (r) { var rm = r.totalRefundedSet && r.totalRefundedSet.shopMoney; rf += rm ? (Number(rm.amount) || 0) : 0; });
      if (dt.getTime() >= sinceMs) { sumTotal += tp; sumCurrent += ct; sumRefund += rf; orders++; }
      if (Math.abs(tp - ct) > 0.005 || n.cancelledAt) {
        adj.push([(dt ? Utilities.formatDate(dt, tz, 'yyyy-MM-dd') : '?'),
                  (n.cancelledAt ? Utilities.formatDate(asDate_(n.cancelledAt), tz, 'yyyy-MM-dd') : '-'),
                  (n.name || ''), (n.displayFinancialStatus || ''),
                  (Math.round(tp * 100) / 100), (Math.round(ct * 100) / 100), (Math.round((tp - ct) * 100) / 100), (Math.round(rf * 100) / 100)]);
      }
    });
    if (conn.pageInfo && conn.pageInfo.hasNextPage) { cursor = conn.pageInfo.endCursor; Utilities.sleep(300); } else break;
  }
  Logger.log('=== ' + code + ' GROUND TRUTH — orders CREATED in last ' + daysBack + ' days (store tz ' + tz + ') ===');
  Logger.log('Orders: ' + orders);
  Logger.log('Sum totalPrice   (BEFORE reversals)      = ' + (Math.round(sumTotal * 100) / 100));
  Logger.log('Sum currentTotal (AFTER all reversals)   = ' + (Math.round(sumCurrent * 100) / 100));
  Logger.log('Reversals = total − current              = ' + (Math.round((sumTotal - sumCurrent) * 100) / 100) + '   ← this should ≈ Shopify Discounts-are-separate… the refunds+returns+cancels');
  Logger.log('Of which REFUNDS (order.refunds)         = ' + (Math.round(sumRefund * 100) / 100) + '   ← if far smaller, the rest are cancellations/returns');
  Logger.log('--- adjusted / cancelled orders  [created · cancelled · order · status · total · current · delta · refunded] ---');
  adj.sort(function (a, b) { return a[0] < b[0] ? 1 : (a[0] > b[0] ? -1 : 0); });
  adj.slice(0, 50).forEach(function (r) { Logger.log(r.join('  ·  ')); });
  if (adj.length > 50) Logger.log('...(' + (adj.length - 50) + ' more adjusted orders)');
}

// SHOPIFYQL TEST — runs Shopify's OWN analytics engine (the source behind the Analytics dashboard)
// and logs the raw response. Run this AFTER the app has read_reports + Protected Customer Data
// (Level 2). If it returns rows, the sheet can be made to match the dashboard EXACTLY; paste me
// the log and I'll wire it in. Editor → pick debugShopifyQL → Run → read the Execution log.
function debugShopifyQL(code) {
  code = code || 'CA';
  var st = null; CONFIG.STORES.forEach(function (s) { if (s.code === code) st = s; });
  if (!st || (st.clientId && st.clientId.indexOf('PASTE') === 0)) { Logger.log('Store ' + code + ' not configured.'); return; }
  function unwrap_(t) { while (t && !t.name && t.ofType) t = t.ofType; return t && t.name; }

  // (1) INTROSPECT: what type does shopifyqlQuery return, and what fields does it expose?
  var r1 = shopifyGraphQL_(st, '{__schema{queryType{fields{name type{name kind ofType{name kind ofType{name kind}}}}}}}', {});
  var fs = (r1 && r1.data && r1.data.__schema && r1.data.__schema.queryType && r1.data.__schema.queryType.fields) || [];
  var f = null; fs.forEach(function (x) { if (x.name === 'shopifyqlQuery') f = x; });
  if (!f) { Logger.log(code + ' shopifyqlQuery not found on QueryRoot (introspection off?). r1=' + JSON.stringify(r1).slice(0, 400)); }
  var rt = f ? unwrap_(f.type) : null;
  Logger.log('=== ' + code + ' shopifyqlQuery return type: ' + rt + ' ===');
  if (rt) {
    var r2 = shopifyGraphQL_(st, 'query($n:String!){__type(name:$n){name kind fields{name type{name kind ofType{name kind ofType{name kind}}}} possibleTypes{name}}}', { n: rt });
    var T = r2 && r2.data && r2.data.__type;
    Logger.log('return-type fields: ' + JSON.stringify(T, null, 2).slice(0, 2400));
    var tdName = null;
    if (T && T.fields) T.fields.forEach(function (fl) { if (!tdName && /table|data/i.test(fl.name)) tdName = unwrap_(fl.type); });
    if (tdName) {
      var r3 = shopifyGraphQL_(st, 'query($n:String!){__type(name:$n){name fields{name type{name kind ofType{name kind}}}}}', { n: tdName });
      Logger.log('data-type (' + tdName + ') fields: ' + JSON.stringify(r3 && r3.data && r3.data.__type, null, 2).slice(0, 1600));
    }
  }

  // (2) TRY the flat data query (what the real pull uses).
  var ql = 'FROM sales SHOW total_sales GROUP BY day SINCE -14d UNTIL today';
  var r4 = shopifyGraphQL_(st, 'query($q:String!){shopifyqlQuery(query:$q){__typename parseErrors tableData{rows columns{name dataType displayName}}}}', { q: ql });
  Logger.log('--- flat data attempt ---');
  Logger.log(JSON.stringify(r4, null, 2).slice(0, 2500));
}

// CUSTOMER-FIELD ACCESS TEST — confirms the app can read order email + customer (needs read_customers).
// Editor → pick debugCustomers → Run → read the log. If you see a scope/ACCESS error, add read_customers
// to the app; if emails show but numberOfOrders is blank, the customer object isn't authorized yet.
function debugCustomers(code) {
  code = code || 'CA';
  var st = null; CONFIG.STORES.forEach(function (s) { if (s.code === code) st = s; });
  if (!st || (st.clientId && st.clientId.indexOf('PASTE') === 0)) { Logger.log('Store ' + code + ' not configured.'); return; }
  var sinceISO = Utilities.formatDate(addDays_(new Date(), -14), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  var q = 'query($q:String!){orders(first:50, query:$q, sortKey:CREATED_AT){edges{node{name createdAt email customer{id numberOfOrders}}}}}';
  var res = shopifyGraphQL_(st, q, { q: 'created_at:>=' + sinceISO });
  Logger.log('=== ' + code + ' customer-field test (last 14 days · first 50 orders) — how "Repeat" is found ===');
  if (res && res.errors) Logger.log('⚠️ ERROR (likely missing read_customers scope on the app): ' + JSON.stringify(res.errors).slice(0, 300));
  var conn = res && res.data && res.data.orders;
  if (!conn) { Logger.log('No orders connection. raw=' + JSON.stringify(res).slice(0, 300)); return; }
  var tot = 0, repeat = 0, noCust = 0, hasNum = 0;
  conn.edges.forEach(function (e) {
    var n = e.node; tot++;
    var num = (n.customer && n.customer.numberOfOrders != null) ? Number(n.customer.numberOfOrders) : null;
    if (!n.customer || !n.customer.id) noCust++;
    if (num != null) hasNum++;
    if (num != null && num > 1) repeat++;   // Repeat customer = numberOfOrders > 1 (has ordered before)
  });
  conn.edges.slice(0, 15).forEach(function (e) {
    var n = e.node;
    Logger.log((n.name || '') + '  email=' + (n.email || '(none)') + '  numberOfOrders=' + ((n.customer && n.customer.numberOfOrders) != null ? n.customer.numberOfOrders : '(null / no customer)'));
  });
  Logger.log('SUMMARY: ' + tot + ' orders · numberOfOrders present on ' + hasNum + ' · REPEAT (numberOfOrders>1) = ' + repeat + ' · no customer object = ' + noCust);
  Logger.log('READ: "Repeat" = a customer whose lifetime order count > 1. If numberOfOrders is mostly (null / no customer), these are guest checkouts and the app cannot see prior orders → Repeat shows 0. If real 2/3/4… values appear, the count works. Shopify\'s dashboard "Returning customer rate" is period-based and can differ from a single DAY.');
}

/* VERIFY New/Returning against Shopify Analytics ▸ "New vs returning customers". Run
   debugQLCustomers('USA') and compare the TOTAL to Shopify for the same date range — it
   should match Shopify's own split (this is the source the reports now use). */
function debugQLCustomers(code) {
  code = code || 'USA';
  var st = null; CONFIG.STORES.forEach(function (s) { if (s.code === code) st = s; });
  if (!st) { Logger.log('Store ' + code + ' not configured.'); return; }
  var m = shopifyQLCustomers_(st, CONFIG.LOOKBACK_DAYS);
  if (!m) { Logger.log(code + ': ShopifyQL new/returning returned null (add read_reports + Save/Release the app version).'); return; }
  var tn = 0, tr = 0, keys = Object.keys(m).sort();
  Logger.log('=== ' + code + ' New/Returning by day (ShopifyQL, last ' + CONFIG.LOOKBACK_DAYS + 'd) ===');
  keys.forEach(function (dk) { tn += m[dk].newC; tr += m[dk].retC; Logger.log(dk + '   new=' + m[dk].newC + '   returning=' + m[dk].retC); });
  var crr = (tn + tr) ? Math.round(tr / (tn + tr) * 100) : 0;
  Logger.log('TOTAL over ' + keys.length + ' day(s):  New=' + tn + '   Returning=' + tr + '   CRR=' + crr + '%');
  Logger.log('NOTE: this sums DAILY counts. "New" matches Shopify\'s period total (a customer is new only on their first-order day); summed "Returning" can be slightly higher than Shopify\'s month figure because a customer who reorders on several days is counted on each of those days. For an exact-to-the-cent period figure, read Shopify\'s own "New vs returning customers" for that range.');
}

/* Verify New/Returning + CRR for EVERY configured store in one run. Menu → "Verify New/Returning
   (all countries)", then View › Logs. A country that logs "null" still needs read_reports released
   on its app; a country with real New/Returning is feeding the CRR correctly. */
function debugQLCustomersAll() {
  Logger.log('=== New / Returning / CRR — ALL COUNTRIES (ShopifyQL, last ' + CONFIG.LOOKBACK_DAYS + 'd) ===');
  var gTot = 0, gNew = 0, gRet = 0;
  CONFIG.STORES.forEach(function (st) {
    if (!st.domain || st.domain.indexOf('PASTE') === 0) return;
    var m = null; try { m = shopifyQLCustomers_(st, CONFIG.LOOKBACK_DAYS); } catch (e) { Logger.log(st.code + ': error ' + e); return; }
    if (!m) { Logger.log('  ' + pad9_(st.code) + '  null  — add read_reports + Save/Release the app version for this store'); return; }
    var tn = 0, tr = 0; Object.keys(m).forEach(function (dk) { tn += m[dk].newC; tr += m[dk].retC; });
    var crr = (tn + tr) ? Math.round(tr / (tn + tr) * 100) : 0;
    gNew += tn; gRet += tr; gTot++;
    Logger.log('  ' + pad9_(st.code) + '  New=' + tn + '   Returning=' + tr + '   CRR=' + crr + '%');
  });
  var gcrr = (gNew + gRet) ? Math.round(gRet / (gNew + gRet) * 100) : 0;
  Logger.log('  ---------------------------------------------');
  Logger.log('  ' + pad9_('ALL') + '  New=' + gNew + '   Returning=' + gRet + '   CRR=' + gcrr + '%   (' + gTot + ' store(s) feeding)');
  function pad9_(s) { s = String(s); while (s.length < 5) s += ' '; return s; }
}
function menuVerifyCustomers() { debugQLCustomersAll(); }

/* ============================== HELPERS ================================= */
function getSpreadsheet_() { return SpreadsheetApp.openById(CONFIG.SHEET_ID); }

function getTab_(name, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet && TAB_RENAMES[name]) {                       // migrate a previously-named tab IN PLACE (keeps all its data)
    var old = ss.getSheetByName(TAB_RENAMES[name]);
    if (old) { try { old.setName(name); sheet = old; Logger.log('Renamed tab "' + TAB_RENAMES[name] + '" → "' + name + '" (data preserved).'); } catch (e) {} }
  }
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers && headers.length) {
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    } else {
      // Migrate: append any NEW header missing from an existing tab, keeping
      // existing columns where they are so old data stays aligned.
      var cur = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(String);
      var missing = headers.filter(function (h) { return cur.indexOf(h) === -1; });
      if (missing.length) sheet.getRange(1, cur.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    }
  }
  return sheet;
}

// Append a row positioned to the sheet's ACTUAL header names, so column order/drift
// never misaligns. Strings starting with = + - @ are prefixed with ' so Sheets keeps
// them literal (a "+64…" phone would otherwise become a formula error).
function appendByHeader_(sheet, v, fallbackHeaders) {
  var lastCol = sheet.getLastColumn();
  var hdr = (lastCol > 0) ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : (fallbackHeaders || []);
  if (!hdr.length) hdr = fallbackHeaders || [];
  var row = hdr.map(function (h) { var k = String(h).trim(); return safeCell_((v[k] !== undefined) ? v[k] : ''); });
  sheet.appendRow(row);
}
function safeCell_(val) { if (typeof val === 'string' && /^[=+\-@]/.test(val)) return "'" + val; return val; }

function indexMap_(headerRow) { var m = {}; headerRow.forEach(function (h, i) { m[h] = i; }); return m; }

// Source string (bds-unified) → canonical platform.
function platformOf_(source) {
  var s = String(source || '').toLowerCase();
  if (s.indexOf('google') !== -1) return 'Google';
  if (s.indexOf('bing') !== -1 || s.indexOf('microsoft') !== -1) return 'Bing';
  if (s.indexOf('linkedin') !== -1) return 'LinkedIn';
  if (s.indexOf('tiktok') !== -1) return 'TikTok';
  if (s.indexOf('meta') !== -1 || s.indexOf('facebook') !== -1 || s.indexOf('instagram') !== -1) return 'Meta';
  return 'Direct';
}
// Free-text platform label → canonical platform.
function canonPlatform_(v) {
  var s = String(v || '').trim().toLowerCase();
  if (!s) return 'Other';
  if (s.indexOf('google') !== -1 || s === 'adwords' || s === 'gads') return 'Google';
  if (s.indexOf('meta') !== -1 || s.indexOf('facebook') !== -1 || s === 'fb' || s.indexOf('instagram') !== -1 || s === 'ig') return 'Meta';
  if (s.indexOf('bing') !== -1 || s.indexOf('microsoft') !== -1 || s === 'msft') return 'Bing';
  if (s.indexOf('linkedin') !== -1 || s.indexOf('abm') !== -1) return 'LinkedIn';   // ABM budget runs on LinkedIn → one bucket
  if (s.indexOf('tiktok') !== -1 || s === 'tt') return 'TikTok';
  if (s.indexOf('direct') !== -1 || s.indexOf('organic') !== -1) return 'Direct';
  return String(v).charAt(0).toUpperCase() + String(v).slice(1);
}

function dayKey_(d) { return Utilities.formatDate(d, sheetTz_(), 'yyyy-MM-dd'); }   // bucket by the SPREADSHEET's tz so it ALWAYS matches how date cells read back → no day-drift, no duplicate daily rows
function addDays_(d, n) { return new Date(d.getTime() + n * 86400000); }
function ymUTC_(y, m, d) { return new Date(Date.UTC(y, m, d, 12, 0, 0)); }   // UTC-noon avoids DST flips in day formatting
// The SPREADSHEET's own time zone. A date-only cell (e.g. "2026-07-21") is stored by
// Sheets as midnight in THIS zone, so to read it back to the same calendar day we must
// format it in THIS zone — never CONFIG.TIMEZONE. Formatting in a different zone shifts
// every date by a day when the sheet's zone ≠ CONFIG.TIMEZONE (the spend-date-shift bug).
var _sheetTz = null;
function sheetTz_() {
  if (_sheetTz) return _sheetTz;
  try { _sheetTz = getSpreadsheet_().getSpreadsheetTimeZone() || CONFIG.TIMEZONE; } catch (e) { _sheetTz = CONFIG.TIMEZONE; }
  return _sheetTz;
}
// A STORE's own configured time zone (IANA) — Shopify's "Total sales" report buckets each
// order by THIS zone, so we must too, or late-night orders land on the wrong day/week.
// Uses CONFIG.STORES[].tz if set, else reads shop.ianaTimezone once (cached per run).
var _shopTz = {};
function shopTz_(st) {
  if (_shopTz[st.code]) return _shopTz[st.code];
  if (st.tz) return (_shopTz[st.code] = st.tz);
  try {
    var r = shopifyGraphQL_(st, 'query{shop{ianaTimezone}}', {});
    var tz = r && r.data && r.data.shop && r.data.shop.ianaTimezone;
    if (tz) { Logger.log(st.code + ' store timezone: ' + tz); return (_shopTz[st.code] = tz); }
  } catch (e) {}
  return (_shopTz[st.code] = sheetTz_());   // fallback: spreadsheet tz
}
function normDayKey_(v) {
  if (v === '' || v == null) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, sheetTz_(), 'yyyy-MM-dd');
  var s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var d = new Date(s); return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, sheetTz_(), 'yyyy-MM-dd');
}
function asDate_(v) {
  if (!v) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v;
  var d = new Date(v); return isNaN(d.getTime()) ? '' : d;
}
function num_(v) { if (v === '' || v == null) return 0; var n = Number(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
function round2_(n) { n = Number(n); return isNaN(n) ? '' : Math.round(n * 100) / 100; }
function round4_(n) { n = Number(n); return isNaN(n) ? '' : Math.round(n * 10000) / 10000; }

function jsonOut_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
