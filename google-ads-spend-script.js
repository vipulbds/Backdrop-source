/**
 * ============================================================================
 *  BACKDROPSOURCE — GOOGLE ADS → BUDGET TRACKER  (Google Ads Script)
 * ============================================================================
 *  Pushes DAILY spend / impressions / clicks into the Ad Budget Tracker's
 *  "Spent Input" tab, via its web app. No Google Ads dev token / OAuth needed —
 *  this runs INSIDE Google Ads and uses UrlFetchApp to POST out.
 *
 *  ONE COPY PER ACCOUNT: paste this into EACH country's Google Ads account and
 *  set COUNTRY (the currency is auto-detected). That's the only line you change.
 *
 *  WHY SPEND CAN SHOW $0 IN THE TRACKER: the tracker only shows what a script pushed.
 *  If a country is $0, its script isn't installed/scheduled in that account (or the
 *  schedule was disabled after an error).
 *
 *  INSTALL / SCHEDULE (so it runs AUTOMATICALLY — no manual runs):
 *    1. Google Ads > Tools > Bulk actions > Scripts > (+) New script > paste this.
 *    2. Set COUNTRY (WEBAPP_URL + TOKEN are already filled — keep them the same in every copy).
 *    3. Authorize > Run once > read the Logs: you want "sent N day(s) … {ok:true}".
 *    4. Schedule: Frequency = Daily, ~05:00 (before the tracker's afternoon pull).
 *
 *  It re-posts the trailing LOOKBACK_DAYS each run and the tracker UPSERTS on
 *  Date+Country+Platform, so re-runs correct late data instead of duplicating.
 *
 *  (If you ever move all accounts under ONE Google Ads MANAGER/MCC account, ask me
 *   for the manager-mode version — one script that feeds every country in a single run.)
 * ============================================================================
 */

var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbz6uM49s-aLbb3s_Mhg7GB9eUCa1ZCd0kk09KCAEmwCzD47W_k_U83EP_wbyGJvp4UJ/exec';   // ✅ verified Ad Budget Tracker web app (browser → "version":"bds-budget v1"). Keep identical in every copy.
var TOKEN      = 'bds-6b60c0c88900b42519c19d5f194bccadeb4e93278aeefad5';   // ⚠️ MUST equal CONFIG.SHARED_TOKEN in the tracker (same in every copy)
var COUNTRY    = 'CA';        // ← the ONLY line to change per account: USA / UK / CA / AU / NZ / UAE  (currency is auto-detected)
var LOOKBACK_DAYS = 60;       // re-post the last N days each run — covers ~2 months + late Google cost revisions.

function main() {
  // Log the error but DO NOT rethrow. An unhandled throw from a SCHEDULED Google Ads run makes
  // Google auto-disable the schedule after a few failures — that is what silently STOPS a working
  // script. Logging keeps the failure visible without killing the daily schedule.
  try { runSingle_(COUNTRY); }
  catch (e) { Logger.log('ERROR: ' + e + (e && e.stack ? '\n' + e.stack : '')); }
}

// Pull this account's daily cost and POST it as a single batch tagged with COUNTRY.
function runSingle_(country) {
  var acct = AdsApp.currentAccount();
  var tz = acct.getTimeZone();
  var currency = acct.getCurrencyCode();               // auto — no need to set per account
  var name = ''; try { name = acct.getName(); } catch (e) {}
  var end = new Date(), start = new Date(end.getTime() - (LOOKBACK_DAYS - 1) * 86400000);
  var startIso = Utilities.formatDate(start, tz, 'yyyy-MM-dd');
  var endIso   = Utilities.formatDate(end, tz, 'yyyy-MM-dd');

  // ONE report for the whole window — segments.date gives one row per day (all campaigns combined).
  var it = AdsApp.report(
    'SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks ' +
    'FROM customer WHERE segments.date BETWEEN "' + startIso + '" AND "' + endIso + '"'
  ).rows();

  var byDay = {};
  while (it.hasNext()) {
    var r = it.next(), d = r['segments.date'];
    var o = byDay[d] || (byDay[d] = { spend: 0, impr: 0, clicks: 0 });
    o.spend  += Number(r['metrics.cost_micros'] || 0) / 1000000;   // micros → currency units
    o.impr   += Number(r['metrics.impressions'] || 0);
    o.clicks += Number(r['metrics.clicks'] || 0);
  }

  var rows = [];
  Object.keys(byDay).forEach(function (d) {
    var o = byDay[d];
    rows.push({ date: d, country: country, platform: 'Google',
      spend: o.spend, impressions: o.impr, clicks: o.clicks, currency: currency, ingest: 'google-ads-script' });
  });

  if (!rows.length) {
    Logger.log('⚠ ' + country + ' (' + name + '): report returned 0 rows for ' + startIso + '..' + endIso +
               ' — the account has no cost in this window, or reporting is delayed. Nothing posted.');
    return;
  }
  var ok = post_({ type: 'spendBatch', rows: rows });
  Logger.log('Google Ads → tracker: ' + country + ' (' + name + ', ' + currency + ') ' +
    (ok ? 'SENT ' + rows.length + ' day(s).' : '✗ FAILED to send — see the errors above (usually a wrong WEBAPP_URL). Nothing was written.'));
}

function post_(payload) {
  if (!WEBAPP_URL || WEBAPP_URL.indexOf('PASTE_') === 0 || WEBAPP_URL.indexOf('http') !== 0) {
    Logger.log('✗ WEBAPP_URL is not set — paste the Ad Budget Tracker /exec URL (browser test must say "version":"bds-budget v1").');
    return false;
  }
  var url = WEBAPP_URL + (WEBAPP_URL.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(TOKEN);
  var tries = 0;
  while (tries++ < 3) {   // retry a slow/cold web-app response instead of aborting the run
    try {
      var res = UrlFetchApp.fetch(url, {
        method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true, followRedirects: true
      });
      var code = res.getResponseCode(), txt = res.getContentText();
      Logger.log('batch (' + (payload.rows ? payload.rows.length : 1) + ' rows) → HTTP ' + code + ' ' + txt.slice(0, 200));
      // A GENUINE save returns {"ok":true,"updated":..,"inserted":..,"total":..}. Anything else is a failure.
      var saved = (code >= 200 && code < 300) && txt.indexOf('"ok":true') !== -1 &&
                  (txt.indexOf('total') !== -1 || txt.indexOf('inserted') !== -1 || txt.indexOf('updated') !== -1);
      if (saved) return true;
      if (txt.indexOf('bad token') !== -1) { Logger.log('✗ BAD TOKEN — set this script\'s TOKEN equal to the tracker\'s CONFIG.SHARED_TOKEN, then redeploy the tracker (New version).'); return false; }
      if (txt.indexOf('bds-unified') !== -1) { Logger.log('✗ WRONG project (bds-unified). Use the Ad Budget Tracker /exec ("version":"bds-budget v1").'); return false; }
      Logger.log('⚠ NOT saved' + (tries < 3 ? ' — retrying…' : ' — giving up. The response above says why (bad token / wrong sheet / etc.).'));
    } catch (e) {
      Logger.log('post attempt ' + tries + ' failed: ' + e + (tries < 3 ? ' — retrying…' : ' — giving up this run.'));
    }
  }
  return false;
}
