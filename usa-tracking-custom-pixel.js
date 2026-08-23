/* ════════════════════════════════════════════════════════════════════
   BACKDROPSOURCE USA — FUNNEL + CONVERSION PIXEL (Shopify Custom Pixel)
   ────────────────────────────────────────────────────────────────────
   WHERE THIS GOES (NOT a theme .liquid file):
     Shopify admin → Settings → Customer events → Add custom pixel
     → name it "BackdropSource USA Tracking" → paste this whole file
     → Save → Connect.   (Same place as your Irexona affiliate pixel.)

   WHAT IT DOES
     On  product_added_to_cart  → Add-to-Cart event
     On  checkout_completed     → Purchase / Order event
     Each event is sent to up to FOUR destinations (see CONFIG):
        1) Your Google Sheet  (Orders tab + Cart Events tab, source-attributed)
        2) Google Ads         (Purchase conversion — needs a label, see below)
        3) Microsoft / Bing   (UET add_to_cart + purchase — uses ti 17530323)
        4) Meta / Facebook    (AddToCart + Purchase — needs a Meta Pixel id)

   ATTRIBUTION
     themeusa.liquid mirrors the visitor's source (bs_source / bs_gclid /
     bs_fbclid / bs_li_fat_id / bs_msclkid / bs_utm_*) onto the Shopify CART,
     so it arrives here as checkout.attributes. We read those and pass them
     back to the sheet, which classifies the Source (Google / Meta / LinkedIn
     / Bing / Direct-Organic) automatically.

   ──────────── ONE-TIME SETUP YOU STILL NEED ────────────
   • GOOGLE_PURCHASE_LABEL: in Google Ads → Goals → Conversions → New
     conversion action → Website → "Purchase" → after creating it, copy the
     send_to value "AW-1067044694/XXXXXXXX" and paste below. (Until you do,
     Google Ads purchase firing is skipped — everything else still works.)
   • META_PIXEL_ID: create a Meta Pixel in Events Manager and paste its id
     below. (No pixel is installed on the store yet. Until set, Meta is skipped.)
   • Anything left blank/placeholder is SAFELY SKIPPED — no errors.

   TESTING
     Place a test order. In DevTools → Network you should see requests to:
       script.google.com (your sheet),  googleadservices/google  (Ads),
       bat.bing.com (UET),  facebook.com/tr (Meta, if set).
     Then check the sheet's "Orders" + "Cart Events" tabs.
   ════════════════════════════════════════════════════════════════════ */

/* ───────────────────────────── CONFIG ───────────────────────────── */
var APPS_URL = 'https://script.google.com/macros/s/AKfycbyyEmzVdzB9HdO-HAEJBAWP9llMiSk-Mw29V0vmgfOOIJsK2TGh5Qqi3dQrsQUy6PCxpA/exec';

var GOOGLE_ADS_ID         = 'AW-1067044694';
var GOOGLE_PURCHASE_LABEL = 'AW-1067044694/PASTE_PURCHASE_LABEL';   // <-- create in Google Ads, then paste
var BING_UET_ID           = '17530323';                            // your existing UET tag
var META_PIXEL_ID         = 'PASTE_META_PIXEL_ID';                 // <-- create a Meta pixel, then paste

var LOG_ADD_TO_CART_TO_SHEET = true;   // set false if Add-to-Cart volume floods the sheet

/* Which destinations are actually live (auto-detected from the ids above). */
var USE_GOOGLE = GOOGLE_PURCHASE_LABEL.indexOf('PASTE_') === -1;
var USE_META   = META_PIXEL_ID.indexOf('PASTE_') === -1 && META_PIXEL_ID !== '';
var USE_BING   = !!BING_UET_ID;

/* ──────────────────── LOAD TAG LIBRARIES (in sandbox) ───────────────── */
function loadScript(src) {
  var s = document.createElement('script');
  s.async = true; s.src = src;
  document.head.appendChild(s);
}

// Google Ads gtag
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
if (USE_GOOGLE) {
  loadScript('https://www.googletagmanager.com/gtag/js?id=' + GOOGLE_ADS_ID);
  gtag('js', new Date());
  gtag('config', GOOGLE_ADS_ID, { allow_enhanced_conversions: true });
}

// Microsoft / Bing UET
if (USE_BING) {
  (function (w, d, t, r, u) {
    var f, n, i;
    w[u] = w[u] || [];
    f = function () {
      var o = { ti: BING_UET_ID, enableAutoSpaTracking: true };
      o.q = w[u]; w[u] = new UET(o); w[u].push('pageLoad');
    };
    n = d.createElement(t); n.src = r; n.async = 1;
    n.onload = n.onreadystatechange = function () {
      var s = this.readyState;
      if (!s || s === 'loaded' || s === 'complete') { f(); n.onload = n.onreadystatechange = null; }
    };
    i = d.getElementsByTagName(t)[0]; i.parentNode.insertBefore(n, i);
  })(window, document, 'script', '//bat.bing.com/bat.js', 'uetq');
}

// Meta / Facebook
if (USE_META) {
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', META_PIXEL_ID);
}

/* ───────────────────────────── HELPERS ───────────────────────────── */
// checkout.attributes is an array of {key, value}; build a {key:value} map.
function attrMap(arr) {
  var m = {};
  (arr || []).forEach(function (a) { if (a && a.key != null) m[a.key] = a.value; });
  return m;
}
// Pull the bs_* attribution out of an attributes map into a flat object the sheet understands.
function attribution(m) {
  m = m || {};
  return {
    gclid:       m.bs_gclid       || '',
    gbraid:      m.bs_gbraid      || '',
    wbraid:      m.bs_wbraid      || '',
    fbclid:      m.bs_fbclid      || '',
    msclkid:     m.bs_msclkid     || '',
    li_fat_id:   m.bs_li_fat_id   || '',
    utm_source:  m.bs_utm_source  || '',
    utm_medium:  m.bs_utm_medium  || '',
    utm_campaign:m.bs_utm_campaign|| ''
  };
}
function beacon(payload) {
  if (!APPS_URL || APPS_URL.indexOf('PASTE_') !== -1) return;
  var qs = Object.keys(payload).map(function (k) {
    var v = payload[k] == null ? '' : payload[k];
    return encodeURIComponent(k) + '=' + encodeURIComponent(v);
  }).join('&');
  try { fetch(APPS_URL + '?' + qs, { method: 'GET', mode: 'no-cors', keepalive: true }); }
  catch (e) { try { navigator.sendBeacon(APPS_URL, JSON.stringify(payload)); } catch (e2) {} }
}

/* ─────────────────────── ADD TO CART ─────────────────────── */
analytics.subscribe('product_added_to_cart', function (event) {
  var line = (event.data && event.data.cartLine) || {};
  var merch = line.merchandise || {};
  var price = (line.cost && line.cost.totalAmount) || merch.price || {};
  var value = (price.amount != null) ? String(price.amount) : '';
  var currency = price.currencyCode || 'USD';
  var productTitle = (merch.product && merch.product.title) || merch.title || '';
  // Attribution captured at pixel init (best-effort for the cart step).
  var attr = attribution(attrMap(init && init.data && init.data.cart && init.data.cart.attributes));

  // Meta
  if (USE_META) fbq('track', 'AddToCart', { content_name: productTitle, value: Number(value) || 0, currency: currency });
  // Bing UET
  if (USE_BING) window.uetq.push('event', 'add_to_cart', { ecomm_prodid: merch.id || '', revenue_value: Number(value) || 0, currency: currency });
  // Sheet (funnel)
  if (LOG_ADD_TO_CART_TO_SHEET) {
    beacon(Object.assign({
      type: 'add_to_cart',
      timestamp: new Date().toISOString(),
      page_url: (event.context && event.context.document && event.context.document.location && event.context.document.location.href) || '',
      product: productTitle,
      quantity: line.quantity || 1,
      value: value,
      currency: currency
    }, attr));
  }
});

/* ─────────────────────── PURCHASE / ORDER ─────────────────────── */
analytics.subscribe('checkout_completed', function (event) {
  var checkout = (event.data && event.data.checkout) || {};
  var orderId = (checkout.order && checkout.order.id) || checkout.token || '';
  var money = checkout.totalPrice || checkout.subtotalPrice || {};
  var value = (money.amount != null) ? String(money.amount) : '';
  var currency = (money.currencyCode) || (checkout.currencyCode) || 'USD';
  var email = (checkout.email) || (checkout.order && checkout.order.customer && checkout.order.customer.email) || '';
  var attr = attribution(attrMap(checkout.attributes));

  // Google Ads purchase conversion
  if (USE_GOOGLE) {
    gtag('event', 'conversion', {
      send_to: GOOGLE_PURCHASE_LABEL,
      value: Number(value) || 0,
      currency: currency,
      transaction_id: String(orderId)
    });
  }
  // Meta Purchase
  if (USE_META) fbq('track', 'Purchase', { value: Number(value) || 0, currency: currency });
  // Bing UET purchase (revenue)
  if (USE_BING) window.uetq.push('event', 'purchase', { revenue_value: Number(value) || 0, currency: currency });

  // Sheet — Orders tab (saveOrder_ de-dupes on order_id + classifies Source)
  beacon(Object.assign({
    type: 'order',
    timestamp: new Date().toISOString(),
    order_id: orderId,
    order_number: (checkout.order && checkout.order.id) || '',
    order_value: value,
    currency: currency,
    email: email
  }, attr));

  console.log('[BDS USA Pixel] purchase fired', { orderId: orderId, value: value, currency: currency });
});
