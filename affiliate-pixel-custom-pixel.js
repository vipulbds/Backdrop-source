/* ════════════════════════════════════════════════════════════════════
   IREXONA AFFILIATE CONVERSION PIXEL — Shopify Custom Pixel
   For: Canada store · Shopify Plus
   ────────────────────────────────────────────────────────────────────
   WHERE THIS GOES (NOT a theme .liquid file):
     Shopify admin → Settings → Customer events → Add custom pixel
     → name it "Irexona Pixel" → paste this whole file → Save → Connect

   HOW IT WORKS:
     Fires once when a customer completes checkout. It rebuilds irexona's
     conversion iframe and fills in the REAL Shopify order id + total:
        https://conv.irexona.com/tracking/conversion/220968
              ?event_type=default_event
              &order_id=<real order id>
              &order_value=<real order total>

   ATTRIBUTION:
     irexona matches the sale to the affiliate using ITS OWN cookie (set
     when the customer clicked the affiliate link through irexona.com).
     So we fire on EVERY order — irexona credits only the referred ones.
     No click_id is passed because irexona's pixel doesn't use one.

   TESTING:
     Keep AFFILIATE_BASE pointed at irexona (below). Place a test order and
     confirm in DevTools → Network that a request to conv.irexona.com goes
     out with status 200 and your real order_id / order_value attached.
   ════════════════════════════════════════════════════════════════════ */

// irexona conversion endpoint (offer/campaign id 220968 baked in by them)
const AFFILIATE_BASE = "https://conv.irexona.com/tracking/conversion/220968";

analytics.subscribe("checkout_completed", (event) => {
  const checkout = event.data.checkout;

  // DEBUG: print the whole checkout object so we can see the exact field names.
  // (Open DevTools → Console, expand this, then we can remove it once confirmed.)
  console.log("[Irexona Pixel] checkout object:", checkout);

  const orderId = (checkout.order && checkout.order.id) || checkout.token || "";

  // Read the total defensively — try totalPrice, then subtotalPrice, and
  // handle a literal 0 (which must not be treated as "missing").
  const money = checkout.totalPrice || checkout.subtotalPrice || {};
  const orderValue = (money.amount != null) ? String(money.amount) : "";

  // Rebuild irexona's iframe URL with the real order data.
  const params = new URLSearchParams({
    event_type: "default_event",
    order_id: orderId,
    order_value: orderValue,
  });
  const trackUrl = AFFILIATE_BASE + "?" + params.toString();

  // Fire the conversion via irexona's hidden 1x1 iframe.
  const iframe = document.createElement("iframe");
  iframe.src = trackUrl;
  iframe.width = "1";
  iframe.height = "1";
  iframe.scrolling = "no";
  iframe.style.display = "none";
  iframe.setAttribute("frameborder", "0");
  document.body.appendChild(iframe);

  console.log("[Irexona Pixel] conversion fired →", trackUrl);
});
