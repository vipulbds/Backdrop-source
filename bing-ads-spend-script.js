/**
 * ============================================================================
 *  BACKDROPSOURCE — MICROSOFT / BING ADS → BUDGET TRACKER  (Scripts)
 * ============================================================================
 *  Pushes DAILY spend / impressions / clicks from ONE Microsoft Advertising
 *  account into the Ad Budget Tracker's "Spent Input" tab, via its web app.
 *
 *  Microsoft Advertising Scripts are a LIMITED subset of Google Ads Scripts. In
 *  this account they may NOT support Utilities.formatDate, entity .getStatsFor(),
 *  or AdsApp.report(). This version uses the most basic pattern that exists — a
 *  date-ranged selector + .getStats() per campaign — and builds dates with plain
 *  JS. If a given day can't be read it logs ONE message and keeps going, then
 *  posts whatever days it COULD read (so one bad day never zeroes the whole feed).
 *
 *  WHY SPEND CAN SHOW $0 IN THE TRACKER: it only shows what a script pushed. If Bing
 *  is $0 for a country, this script isn't installed/scheduled in that account, or its
 *  schedule was disabled. Install + schedule it there (below).
 *
 *  INSTALL / SCHEDULE (so it runs AUTOMATICALLY — no manual runs):
 *    Microsoft Advertising > Tools > Scripts > Create a script > paste > set the
 *    vars below > Run (authorize) > check Logs for "sent N/… day(s)" > Schedule Daily.
 *    If EVERY day logs a stats-read failure, this account's Scripts build has no usable
 *    stats API → switch Bing to manual entry or Windsor.ai (tell the developer).
 * ============================================================================
 */

var WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbz6uM49s-aLbb3s_Mhg7GB9eUCa1ZCd0kk09KCAEmwCzD47W_k_U83EP_wbyGJvp4UJ/exec';   // ✅ verified Ad Budget Tracker web app (browser → "version":"bds-budget v1")
var TOKEN      = 'bds-6b60c0c88900b42519c19d5f194bccadeb4e93278aeefad5';   // ⚠️ MUST equal CONFIG.SHARED_TOKEN
var COUNTRY    = 'CA';                                // this account's country code — CA here; 'UK' in the UK account's copy
var CURRENCY   = 'CAD';                               // this account's currency — CA = CAD, UK = GBP
var LOOKBACK_DAYS = 60;                               // re-post the last N days each run (covers ~2 months + late revisions)

function main() {
  // Log an error but DO NOT rethrow — an unhandled throw from a scheduled run can make the platform
  // auto-disable the schedule after a few failures (that silently STOPS a script that was working).
  try { run_(); }
  catch (e) { Logger.log('ERROR: ' + e + (e && e.stack ? '\n' + e.stack : '')); }
}

function run_() {
  var rows = [], nowMs = new Date().getTime(), failLogged = false, pmaxFailLogged = false, pmaxSeen = false;

  for (var back = LOOKBACK_DAYS - 1; back >= 0; back--) {
    var d = new Date(nowMs - back * 86400000);
    var ymd = '' + d.getFullYear() + pad_(d.getMonth() + 1) + pad_(d.getDate());   // 20260720
    var iso = d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate());   // 2026-07-20

    try {
      var acc = { spend: 0, impr: 0, clicks: 0 };
      sumSel_(AdsApp.campaigns().forDateRange(ymd, ymd).get(), acc);   // Search + Audience campaigns
      // ⚠️ Performance Max campaigns are a SEPARATE selector — AdsApp.campaigns() does NOT include them.
      // Without this their spend is silently DROPPED (that was the missing ~half of Bing's monthly total:
      // Search+Audience matched but PerformanceMax did not). Guarded so an account whose limited Scripts
      // build lacks performanceMaxCampaigns() still posts the Search+Audience total instead of erroring.
      try {
        if (typeof AdsApp.performanceMaxCampaigns === 'function') {
          sumSel_(AdsApp.performanceMaxCampaigns().forDateRange(ymd, ymd).get(), acc);
          pmaxSeen = true;
        }
      } catch (ePmax) {
        if (!pmaxFailLogged) { Logger.log('Performance Max read FAILED (' + iso + '): ' + ePmax + ' — PMax spend will be MISSING; this account\'s Scripts build may not support performanceMaxCampaigns(). Add PMax spend manually or via Windsor.ai.'); pmaxFailLogged = true; }
      }
      rows.push({ date: iso, country: COUNTRY, platform: 'Bing',
        spend: acc.spend, impressions: acc.impr, clicks: acc.clicks, currency: CURRENCY, ingest: 'bing-ads-script' });
    } catch (e) {
      if (!failLogged) {   // log ONCE, then keep trying the other days instead of 60 identical errors
        Logger.log('Stats read failed for ' + iso + ': ' + e +
          '  — if EVERY day fails, this Microsoft Scripts build has no usable stats API; switch Bing to manual/Windsor.ai.');
        failLogged = true;
      }
    }
  }

  if (!rows.length) { Logger.log('Bing: no days could be read — nothing posted for ' + COUNTRY + '.'); return; }
  if (!pmaxSeen) Logger.log('NOTE: no Performance Max spend was captured (either this account has none, or performanceMaxCampaigns() is unsupported here). If Microsoft Ads shows a "Performance Max campaigns total", it is NOT in this feed — add it manually/Windsor.ai and tell the developer.');
  // ONE request for the whole window → no per-day timeouts. The tracker upserts each day.
  var ok = post_({ type: 'spendBatch', rows: rows });
  Logger.log('Bing Ads → tracker: ' + COUNTRY + ' ' +
    (ok ? 'SENT ' + rows.length + '/' + LOOKBACK_DAYS + ' day(s).' : '✗ FAILED to send — see the errors above (usually a wrong WEBAPP_URL). Nothing was written.'));
}

function pad_(n) { return n < 10 ? '0' + n : '' + n; }

// Accumulate cost/impressions/clicks from a campaign selector into acc (shared by the Search+Audience
// selector and the Performance Max selector, so both campaign types are summed into one day total).
function sumSel_(sel, acc) {
  while (sel.hasNext()) {
    var st = sel.next().getStats();
    acc.spend += st.getCost(); acc.impr += st.getImpressions(); acc.clicks += st.getClicks();
  }
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
      Logger.log('⚠ NOT saved' + (tries < 3 ? ' — retrying…' : ' — giving up. The response above says why.'));
    } catch (e) {
      Logger.log('post attempt ' + tries + ' failed: ' + e + (tries < 3 ? ' — retrying…' : ' — giving up this run.'));
    }
  }
  return false;
}
