  /* ════════════════════════════════════════════════════════════════════
   BACKDROPSOURCE — GTM PURCHASE PIXEL  (Shopify Custom Pixel)
   ────────────────────────────────────────────────────────────────────
   WHERE THIS GOES (NOT a theme file, NOT checkout.liquid, NOT the theme's
   GTM container):
     Shopify admin → Settings → Customer events → Add custom pixel
     → name it "GTM Purchase" → paste this whole file → Save → Connect

   WHAT IT DOES
     1) Loads YOUR GTM container INSIDE the checkout sandbox.
     2) On a completed order, pushes a `purchase_complete` event to the
        dataLayer with the REAL order id / value / currency / items.
     Your GTM tag (Trigger = Custom Event "purchase_complete") then fires
     and reports to Google Ads / GA4, so it shows up through GTM.

   WHY IT MUST LOAD GTM ITSELF
     Shopify's Thank-You / checkout page is sandboxed. A GTM container
     installed in your THEME cannot run there. So we load GTM here, inside
     the pixel, and push to this sandbox's own dataLayer.

   ──────────── ONE-TIME SETUP ────────────
   • Replace GTM-XXXXXXX below with your real container id (GTM → top bar).
   • In GTM: create a Trigger → Custom Event → event name = purchase_complete
     → attach it to your Google Ads / GA4 purchase tag → Submit/Publish.
   • DOUBLE-COUNT WARNING: bds-pixel.js already fires a Google Ads/Meta/Bing
     purchase directly. If your GTM container ALSO has a purchase tag for the
     same platform, you'll count every sale twice. Fire each platform in
     ONE place only — either here (GTM) or in bds-pixel.js, not both.
   ════════════════════════════════════════════════════════════════════ */

var GTM_ID = 'GTM-XXXXXXX';   // <-- paste your real GTM container id

/* sandbox-safe globals (custom pixels can run in a worker or iframe) */
var W = (typeof window !== 'undefined') ? window : (typeof self !== 'undefined' ? self : {});
var D = (typeof document !== 'undefined') ? document : null;

/* 1) Load GTM inside the sandbox + start the dataLayer */
W.dataLayer = W.dataLayer || [];
(function (w, d, id) {
  if (!d) return;                     // no DOM (strict worker sandbox) → skip loader, push still queues
  w.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  var j = d.createElement('script');
  j.async = true;
  j.src = 'https://www.googletagmanager.com/gtm.js?id=' + id;
  (d.head || d.documentElement || d.body).appendChild(j);
})(W, D, GTM_ID);

/* 2) Push purchase_complete with dynamic Shopify order data */
analytics.subscribe('checkout_completed', function (event) {
  var checkout = (event && event.data && event.data.checkout) || {};
  var order    = checkout.order || {};
  var money    = checkout.totalPrice || checkout.subtotalPrice || {};

  W.dataLayer = W.dataLayer || [];
  W.dataLayer.push({
    event:          'purchase_complete',                                   // custom event name (GTM trigger)
    transaction_id: String(order.id || checkout.token || ''),             // real Shopify order id
    value:          Number(money.amount) || 0,                            // real order total
    currency:       money.currencyCode || checkout.currencyCode || 'USD', // real currency
    items: (checkout.lineItems || []).map(function (li) {
      var v = li.variant || {};
      return {
        id:       v.sku || (v.product && v.product.id) || v.id || '',
        name:     li.title || (v.product && v.product.title) || '',
        quantity: li.quantity || 1,
        price:    (li.finalLinePrice && li.finalLinePrice.amount) || (v.price && v.price.amount) || 0
      };
    })
  });

  try { console.log('[GTM Purchase] pushed purchase_complete', order.id || checkout.token); } catch (e) {}
});
