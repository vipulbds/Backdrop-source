/* ════════════════════════════════════════════════════════════════════
   BACKDROPSOURCE — UNIFIED ORDER PIXEL  (Shopify Custom Pixel)
   ────────────────────────────────────────────────────────────────────
   ONE pixel for every country store. Paste into:
     Shopify admin → Settings → Customer events → Add custom pixel
     → name it "BackdropSource Tracking" → paste → Save → Connect.

   Per store, change ONLY the COUNTRY line below. Every ID is in STORES.

   WHAT IT DOES
     product_added_to_cart → Add-to-Cart  → "<CC> Order" tab (Stage=Add to Cart)
     checkout_completed     → Purchase     → "<CC> Order" tab (Stage=Purchase)
   plus fires Google Ads / Bing UET / Meta purchase conversions where IDs are set.

   SANDBOX-SAFE: the order handlers register FIRST and the sheet beacon uses
   fetch(), so orders always log even if an ad library fails to load in the
   Customer-events sandbox. All optional tag loading is wrapped in try/catch.
   ════════════════════════════════════════════════════════════════════ */
/* eslint-env browser, serviceworker */
/* global analytics, init, UET, fbq, gtag, uetq */

/* ───────────── CONFIG ───────────── */
// <-- CHANGE PER STORE. One of:
//     'USA' | 'UK' | 'CA' | 'AU' | 'NZ' | 'IN' | 'UAE' | 'FR' | 'ES' | 'DE'
var COUNTRY = 'DE';

var STORES = {
  USA: { googleAds:'AW-1067044694', purchaseLabel:'', bingUet:'17530323',  metaPixel:'526963334386617'  },
  CA:  { googleAds:'AW-540697356',  purchaseLabel:'', bingUet:'211048580', metaPixel:'1442594404095565' },
  UK:  { googleAds:'AW-1064201461', purchaseLabel:'', bingUet:'134631681', metaPixel:'283092842660472'  },
  // AU connects Google/Meta/Bing via Shopify SALES CHANNELS, which fire their own
  // conversions — leave these blank to avoid double-counting. The pixel still logs
  // every order to the sheet with full attribution. Add an id later ONLY if you
  // remove that channel and want the pixel to fire that platform instead.
  AU:  { googleAds:'', purchaseLabel:'', bingUet:'', metaPixel:'' },
  // NZ — same as AU: platforms connected via Shopify SALES CHANNELS fire their own
  // conversions, so leave blank to avoid double-counting. Pixel still logs orders.
  NZ:  { googleAds:'', purchaseLabel:'', bingUet:'', metaPixel:'' },
  // UAE — same as AU/NZ: sales channels fire conversions; leave blank. Pixel logs orders.
  UAE: { googleAds:'', purchaseLabel:'', bingUet:'', metaPixel:'' },
  // IN / FR / ES / DE — no ad-platform ids supplied yet. Blank is the SAFE default:
  // the pixel still logs every order + full attribution to the sheet, and fires
  // nothing, so a sales channel already running conversions can't be double-counted.
  // Fill an id in only when you know that platform is NOT connected as a channel.
  IN:  { googleAds:'', purchaseLabel:'', bingUet:'', metaPixel:'' },
  FR:  { googleAds:'', purchaseLabel:'', bingUet:'', metaPixel:'' },
  ES:  { googleAds:'', purchaseLabel:'', bingUet:'', metaPixel:'' },
  DE:  { googleAds:'', purchaseLabel:'', bingUet:'', metaPixel:'' }
};

var APPS_URL = 'https://script.google.com/macros/s/AKfycbyyEmzVdzB9HdO-HAEJBAWP9llMiSk-Mw29V0vmgfOOIJsK2TGh5Qqi3dQrsQUy6PCxpA/exec';

/* CROSS-BORDER + ABANDONED-CHECKOUT endpoint — a SEPARATE sheet and script
   (cross-border-apps-script.gs) so the main workbook above is never touched.
   Paste its /exec URL here. Until you do, the checkout-funnel beacons are
   simply skipped and everything else keeps working exactly as before. */
var XB_URL = 'https://script.google.com/macros/s/AKfycbzfYsNt3gUepHea1xgyQh8Ek1GWoJ5G3hO_Ce_8dZmP4RrKigqup87Kebv9czcmvIr4/exec';
var USE_XB = XB_URL.indexOf('PASTE_') !== 0;

var CFG = STORES[COUNTRY] || {};
var GOOGLE_ADS_ID         = CFG.googleAds     || '';
var GOOGLE_PURCHASE_LABEL = CFG.purchaseLabel || '';   // "AW-…/…" enables Google purchase firing
var BING_UET_ID           = CFG.bingUet       || '';
var META_PIXEL_ID         = CFG.metaPixel     || '';
var LOG_ADD_TO_CART = true;

var USE_GOOGLE = !!GOOGLE_ADS_ID && GOOGLE_PURCHASE_LABEL.indexOf('/') !== -1;
var USE_BING   = !!BING_UET_ID;
var USE_META   = !!META_PIXEL_ID;

/* ───────────── sandbox-safe globals ───────────── */
var W = (typeof window !== 'undefined') ? window : (typeof self !== 'undefined' ? self : {});
var D = (typeof document !== 'undefined') ? document : null;
function safe(fn){ try { return fn(); } catch (e) { try { console.warn('[BDS Pixel] non-fatal:', e); } catch (e2) {} } }
function appendEl(el){ try { (D.head || D.documentElement || D.body).appendChild(el); return true; } catch (e) { return false; } }
function loadScript(src){ if (!D) return; var s = D.createElement('script'); s.async = true; s.src = src; appendEl(s); }

/* ───────────── beacon (works in the sandbox — this is the important part) ── */
function beaconTo(endpoint, payload){
  var qs = Object.keys(payload).map(function(k){ var v = payload[k]==null?'':payload[k]; return encodeURIComponent(k)+'='+encodeURIComponent(v); }).join('&');
  var url = endpoint + '?' + qs;
  try { if (W.fetch) { W.fetch(url, { method:'GET', mode:'no-cors', keepalive:true }); return; } } catch (e) {}
  try { W.navigator && W.navigator.sendBeacon && W.navigator.sendBeacon(endpoint, JSON.stringify(payload)); } catch (e2) {}
}
function beacon(payload){ beaconTo(APPS_URL, payload); }
function attrMap(arr){ var m={}; (arr||[]).forEach(function(a){ if (a && a.key!=null) m[a.key]=a.value; }); return m; }
// Reads what bds-tracking.liquid mirrored onto the cart. The cross-border block
// (origin/journey/ad_country) is what tells the sheet "browsed UK, ordered on CA"
// and which country's ad account owns the click-id.
function attribution(m){ m=m||{}; return {
  gclid:m.bs_gclid||'', gbraid:m.bs_gbraid||'', wbraid:m.bs_wbraid||'',
  fbclid:m.bs_fbclid||'', msclkid:m.bs_msclkid||'', li_fat_id:m.bs_li_fat_id||'',
  utm_source:m.bs_utm_source||'', utm_medium:m.bs_utm_medium||'', utm_campaign:m.bs_utm_campaign||'',
  origin_country:m.bs_origin_country||'', journey:m.bs_journey||'',
  cross_border:m.bs_cross_border||'', ad_country:m.bs_ad_country||'',
  visitor_id:m.bs_visitor_id||''
}; }
function cartAttrs(){ try { if (typeof init!=='undefined' && init.data && init.data.cart && init.data.cart.attributes) return init.data.cart.attributes; } catch(e){} return []; }
function pageUrl(ev){ try { return (ev && ev.context && ev.context.document && ev.context.document.location && ev.context.document.location.href) || ''; } catch(e){ return ''; } }

/* ═══════════ 1) REGISTER ORDER HANDLERS FIRST (must never be blocked) ═══════════ */
analytics.subscribe('product_added_to_cart', function(event){
  var line = (event && event.data && event.data.cartLine) || {};
  var merch = line.merchandise || {};
  var price = (line.cost && line.cost.totalAmount) || merch.price || {};
  var amt = price && price.amount;
  var value = (amt != null && amt !== '' && !isNaN(Number(amt))) ? String(amt) : '';   // never send "NaN"
  var currency = price.currencyCode || '';
  var product = (merch.product && merch.product.title) || merch.title || '';
  var attr = attribution(attrMap(cartAttrs()));

  safe(function(){ if (USE_META && W.fbq) W.fbq('track','AddToCart',{ content_name:product, value:Number(value)||0, currency:currency }); });
  safe(function(){ if (USE_BING && W.uetq) W.uetq.push('event','add_to_cart',{ revenue_value:Number(value)||0, currency:currency }); });
  if (LOG_ADD_TO_CART) {
    beacon(Object.assign({ type:'add_to_cart', country:COUNTRY, timestamp:new Date().toISOString(),
      page_url:pageUrl(event),
      product:product, quantity:line.quantity||1, value:value, currency:currency }, attr));
  }
});

analytics.subscribe('checkout_completed', function(event){
  var checkout = (event && event.data && event.data.checkout) || {};
  var order = checkout.order || {};
  var orderId = order.id || checkout.token || '';
  var money = checkout.totalPrice || checkout.subtotalPrice || {};
  var mamt = money && money.amount;
  var value = (mamt != null && mamt !== '' && !isNaN(Number(mamt))) ? String(mamt) : '';   // never send "NaN"
  var currency = money.currencyCode || checkout.currencyCode || '';

  // Products + total quantity from the line items.
  var li = checkout.lineItems || [];
  var product = li.map(function(x){
    var v = x && x.variant;
    return (x && x.title) || (v && v.product && v.product.title) || (v && v.title) || '';
  }).filter(Boolean).join(', ');
  var qty = li.reduce(function(a, x){ return a + ((x && x.quantity) || 0); }, 0) || '';

  // Customer name / phone / email from checkout + billing/shipping address.
  var addr = checkout.billingAddress || checkout.shippingAddress || {};
  var cust = order.customer || {};
  var email = checkout.email || cust.email || '';
  var phone = checkout.phone || addr.phone || '';
  var name = ((addr.firstName || '') + ' ' + (addr.lastName || '')).trim();
  if (!name) name = ((cust.firstName || '') + ' ' + (cust.lastName || '')).trim();

  var attr = attribution(attrMap(checkout.attributes));

  safe(function(){ if (USE_GOOGLE && W.gtag) W.gtag('event','conversion',{ send_to:GOOGLE_PURCHASE_LABEL, value:Number(value)||0, currency:currency, transaction_id:String(orderId) }); });
  safe(function(){ if (USE_META && W.fbq) W.fbq('track','Purchase',{ value:Number(value)||0, currency:currency }); });
  safe(function(){ if (USE_BING && W.uetq) W.uetq.push('event','purchase',{ revenue_value:Number(value)||0, currency:currency }); });

  beacon(Object.assign({ type:'order', country:COUNTRY, timestamp:new Date().toISOString(),
    page_url:pageUrl(event),
    order_id:orderId, order_number:order.name || checkout.orderNumber || String(orderId),
    product:product, quantity:qty,
    order_value:value, currency:currency,
    email:email, name:name, phone:phone }, attr));

  // …and close out this checkout in the cross-border sheet (Outcome = Purchased,
  // or Recovered if it had already been marked Abandoned).
  safe(function(){ xbCheckout('Completed', event); });

  try { console.log('[BDS Pixel] purchase', COUNTRY, orderId, value, currency); } catch(e){}
});

/* ═════════ CHECKOUT FUNNEL → CROSS-BORDER SHEET (abandonment) ═════════
   Shopify emits no "abandoned" event — the ABSENCE of checkout_completed is
   the signal. So we log every step of the checkout keyed on the checkout
   token; the cross-border script marks any checkout that never completed
   within CONFIG.ABANDON_AFTER_MIN as Abandoned, and flips it to Recovered if
   it completes later. Stage tells you exactly where they dropped.
   All of this goes to the SEPARATE sheet — the main workbook is untouched. */
var XB_STAGES = {
  'checkout_started':                 'Checkout Started',
  'checkout_contact_info_submitted':  'Contact Info',
  'checkout_address_info_submitted':  'Address',
  'checkout_shipping_info_submitted': 'Shipping',
  'payment_info_submitted':           'Payment Info'
};

function xbCheckout(stage, event){
  if (!USE_XB) return;
  var checkout = (event && event.data && event.data.checkout) || {};
  var token = String(checkout.token || '');
  if (!token) return;                                    // nothing to key the row on

  var order = checkout.order || {};
  var money = checkout.totalPrice || checkout.subtotalPrice || {};
  var amt = money && money.amount;
  var value = (amt != null && amt !== '' && !isNaN(Number(amt))) ? String(amt) : '';   // never send "NaN"

  var li = checkout.lineItems || [];
  var product = li.map(function(x){
    var v = x && x.variant;
    return (x && x.title) || (v && v.product && v.product.title) || (v && v.title) || '';
  }).filter(Boolean).join(', ');
  var qty = li.reduce(function(a, x){ return a + ((x && x.quantity) || 0); }, 0) || '';

  var addr = checkout.billingAddress || checkout.shippingAddress || {};
  var cust = order.customer || {};
  var email = checkout.email || cust.email || '';
  var phone = checkout.phone || addr.phone || '';
  var name = ((addr.firstName || '') + ' ' + (addr.lastName || '')).trim();
  if (!name) name = ((cust.firstName || '') + ' ' + (cust.lastName || '')).trim();

  beaconTo(XB_URL, Object.assign({
    country:COUNTRY, stage:stage, checkout_token:token,
    timestamp:new Date().toISOString(), page_url:pageUrl(event),
    order_id:order.id || '', order_number:order.name || checkout.orderNumber || '',
    product:product, quantity:qty, value:value,
    currency:money.currencyCode || checkout.currencyCode || '',
    email:email, name:name, phone:phone
  }, attribution(attrMap(checkout.attributes))));
}

// Registered inside safe() so an event name this store's checkout doesn't emit
// can never break the pixel.
Object.keys(XB_STAGES).forEach(function(ev){
  safe(function(){
    analytics.subscribe(ev, function(event){ safe(function(){ xbCheckout(XB_STAGES[ev], event); }); });
  });
});

try { console.log('[BDS Pixel] ready', COUNTRY, USE_XB ? '(+cross-border)' : '(cross-border URL not set)'); } catch(e){}

/* ═══════════ 2) LOAD AD LIBRARIES (best-effort, cannot break the above) ═══════════ */
// Google Ads gtag
safe(function(){
  if (!USE_GOOGLE || !D) return;
  W.dataLayer = W.dataLayer || [];
  W.gtag = function(){ W.dataLayer.push(arguments); };
  loadScript('https://www.googletagmanager.com/gtag/js?id=' + GOOGLE_ADS_ID);
  W.gtag('js', new Date());
  W.gtag('config', GOOGLE_ADS_ID, { allow_enhanced_conversions:true });
});
// Microsoft / Bing UET  (append to <head>/<html> — no reliance on an existing <script>)
safe(function(){
  if (!USE_BING || !D) return;
  W.uetq = W.uetq || [];
  var n = D.createElement('script'); n.src = 'https://bat.bing.com/bat.js'; n.async = 1;
  n.onload = n.onreadystatechange = function(){ var s=this.readyState; if (!s || s==='loaded' || s==='complete') { try { var o={ti:BING_UET_ID,enableAutoSpaTracking:true}; o.q=W.uetq; W.uetq=new W.UET(o); W.uetq.push('pageLoad'); } catch(e){} n.onload=n.onreadystatechange=null; } };
  appendEl(n);
});
// Meta / Facebook
safe(function(){
  if (!USE_META || !D) return;
  if (!W.fbq) { var n=W.fbq=function(){ n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments); }; if(!W._fbq)W._fbq=n; n.push=n; n.loaded=!0; n.version='2.0'; n.queue=[]; }
  var t = D.createElement('script'); t.async=!0; t.src='https://connect.facebook.net/en_US/fbevents.js'; appendEl(t);
  W.fbq('init', META_PIXEL_ID);
});
