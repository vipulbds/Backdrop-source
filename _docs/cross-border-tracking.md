# Cross-Border Journey + Abandoned Checkout Tracking

## 0. The ten stores

| CC | myshopify domain | assumed custom domain | currency | timezone |
|----|------------------|----------------------|----------|----------|
| USA | `bdsus` | backdropsource.com | USD | America/Chicago |
| UK | `backdropsourceuk` | backdropsource.co.uk | GBP | Europe/London |
| CA | `backdropsource-v1-0` | backdropsource.ca | CAD | America/Toronto |
| AU | `mousestored` | backdropsource.com.au | AUD | Australia/Sydney |
| NZ | `backdropsourcenz` | backdropsource.co.nz | NZD | Pacific/Auckland |
| IN | `backdropsource-india` | backdropsource.in ⚠️ | INR | Asia/Kolkata |
| UAE | `backdropsourceuae` | backdropsource.ae | AED | Asia/Dubai |
| FR | `backdropsourcefrance` | backdropsource.fr ⚠️ | EUR | Europe/Paris |
| ES | `backdropsource-spain` | backdropsource.es ⚠️ | EUR | Europe/Madrid |
| DE | `backdropsourcegermany` | backdropsource.de ⚠️ | EUR | Europe/Berlin |

⚠️ **Confirm the four new custom domains.** I used the obvious pattern. If one differs, fix it in
`CUSTOM_DOMAIN` in `bds-tracking.liquid` — a wrong entry only costs cross-border detection *from*
that store, nothing else breaks.

**Country detection now leads with `shop.permanent_domain`** (the myshopify name), because FR, ES
and DE all use EUR — currency can no longer tell three of the stores apart. The order is:
permanent_domain → custom domain → render param → currency (with **no EUR branch**, deliberately).

Config lives in five places, all now carrying the same ten stores:
`bds-tracking.liquid` (MYSHOP + CUSTOM_DOMAIN + the Liquid chain) · `bds-pixel.js` (STORES) ·
`usa-oct-apps-script.gs` (SHOPS + COUNTRY_CFG) · `cross-border-apps-script.gs` (STORE_HANDLE) ·
`draft-order-lifecycle-apps-script.gs` (CONFIG.STORES).

---


**Goal:** a customer browses the **UK** store, hops to the **CA** store, and either orders there
or abandons. You want *"started on UK → ordered/abandoned on CA"* in a sheet **and** on the
Shopify dashboard — without touching the existing bds-unified workbook.

---

## 1. Two systems, deliberately separate

| | Main system (unchanged) | Cross-border system (new) |
|---|---|---|
| Sheet | `15wnVR1TSrEnBuEg…` | **a brand-new sheet you create** |
| Script | `usa-oct-apps-script.gs` — back at **v18**, untouched | `cross-border-apps-script.gs` — **v1** |
| Tabs | `<CC> Lead`, `<CC> Order`, upload tabs | `Checkouts`, `Abandoned`, `Summary`, `Ad Account Routing` |
| Fed by | snippet leads + pixel add-to-cart/purchase | pixel checkout funnel only |

Nothing in the new system can reshape your existing tabs. The columns I had added to the main
script last round have been **reverted** — it is byte-for-byte back to its v18 behaviour.

## 2. Why cross-border needs work at all

Cookies are per-domain. `backdropsource.ca` **cannot** read anything `backdropsource.co.uk` wrote.
Third-party-cookie bridges are dead (Safari ITP, Chrome partitioning), so identity must travel
**in the URL**, with fallbacks:

| # | Layer | Catches |
|---|-------|---------|
| 1 | **Referrer sniff** — a sibling BDS domain in `document.referrer` is a hop | Geo-redirect popups, JS `window.location` jumps |
| 2 | **Link decoration** — sibling links get `?bds_from&bds_vid&bds_j&bds_a` | Country switcher, footer links. **Only layer that carries the original click-ID across.** |
| 3 | **Merge by checkout token** | Every checkout step lands on one row regardless of arrival order |

All of this lives in `bds-tracking.liquid` (v3) and ends up as **cart attributes**, which ride onto
the checkout and the order.

## 3. How abandonment is detected

**Shopify emits no "abandoned" event.** The absence of a completion *is* the signal. So the pixel
logs every checkout step, keyed on the checkout token:

```
checkout_started → contact_info → address → shipping → payment_info → checkout_completed
```

One row per checkout, merged in place. Then `resolveAbandoned()` (on the 15-min trigger) marks any
checkout with no completion after **60 minutes** (`CONFIG.ABANDON_AFTER_MIN`) as `Abandoned`.

Two things fall out of this for free:

- **Where they dropped.** `Stage Reached` = `Payment Info` means they abandoned *at payment* — a very
  different problem from abandoning at contact info.
- **Recovery measurement.** If an abandoned checkout later completes (e.g. via Shopify's recovery
  email), the outcome flips to **`Recovered`** rather than `Purchased`, so you can see what recovery
  is actually worth.

Outcomes: `In Progress` → `Abandoned` → `Recovered`, or `In Progress` → `Purchased`.

### The `Checkouts` tab
`Started At · Store · Origin · Journey · Cross-Border · Stage Reached · Outcome · Ended At ·
Minutes to Outcome · Order ID · Order Number · Value · Currency · Products · Quantity · Email ·
Name · Phone · Source · Ad Country · GCLID · MSCLKID · FBCLID · UTM Source · UTM Campaign ·
Visitor ID · Checkout Token · Page URL · Last Update`

### The other three tabs
- **`Abandoned`** — just the abandoned ones, newest first. Your recovery worklist.
- **`Summary`** — funnel with drop-off per stage, outcome counts, abandonment rate, revenue split
  (purchased vs recovered vs lost), and the cross-border route table.
- **`Ad Account Routing`** — cross-border purchases whose click-ID belongs to **another country's**
  ad account. A UK gclid that converts on CA gets written into CA's upload tab by the main script,
  and Google **rejects** a conversion uploaded to an account that doesn't own the click. This tab
  lists exactly those rows so you can move them to the right account's import.

## 4. On the Shopify dashboard

**Orders — certain.** Cart attributes appear on the order page under **Additional details**. On a
cross-border order the snippet writes three readable keys (and only then, so domestic orders stay clean):

```
Customer Journey    UK → CA
Started On          UK store
Ordered On          CA store
```

Plus a Flow (trigger *Order created*, condition `customAttributes` any `bs_cross_border = Yes`) that
adds a `cross-border` tag and a `Journey: UK → CA` tag — makes it filterable with `tag:cross-border`.

**Abandoned checkouts — verify on your first test.** The same attributes *are* stored on the
checkout object, but Shopify's abandoned-checkout admin page is much more minimal than the order
page and I can't promise it renders custom attributes. There is no token-free way to tag or
annotate an abandoned checkout — the `AbandonedCheckout` object has no tags field at all, even via
the API. So if it doesn't show, the `Abandoned` tab is the reliable view; the `Summary` tab has a
direct link to each store's abandoned-checkout list in admin for cross-referencing by email/time.

---

## 5. How to apply it — step by step

### Which file goes where

| File | Goes to | How many times |
|---|---|---|
| `cross-border-apps-script.gs` | **NEW** Apps Script project on a **NEW** Google Sheet | once |
| `usa-oct-apps-script.gs` | the **existing** bds-unified Apps Script project | once |
| `bds-tracking.liquid` | Shopify → theme code → `snippets/bds-tracking.liquid` | **× 10 stores** |
| `bds-pixel.js` | Shopify → Settings → Customer events → custom pixel | **× 10 stores** |
| `draft-order-lifecycle-apps-script.gs` | its own existing Apps Script project | once (only if you use draft tracking) |

**Do them in this order.** Step 1 produces the URL that step 3 needs.

---

### STEP 1 — New sheet + cross-border script *(do this first)*

1. Go to <https://sheets.new> → name it **BDS Cross-Border & Checkouts**.
2. Copy the sheet ID from the URL — it's the long string between `/d/` and `/edit`:
   `docs.google.com/spreadsheets/d/`**`1AbC...XyZ`**`/edit`
3. In that sheet: **Extensions → Apps Script**.
4. Delete the default `myFunction` code. Paste **all** of `cross-border-apps-script.gs`.
5. Near the top, replace the placeholder with your sheet ID:
   ```js
   SHEET_ID: 'PASTE_NEW_CROSS_BORDER_SHEET_ID_HERE',   ->   SHEET_ID: '1AbC...XyZ',
   ```
6. Save (💾).
7. **Deploy → New deployment**. Click the **gear icon ⚙ → Web app**. Then:
   - Execute as: **Me**
   - Who has access: **Anyone**  ← must be "Anyone", not "Anyone with Google account"
   - **Deploy** → **Authorize access** → pick your account → *Advanced* → *Go to (project)* → **Allow**
8. **Copy the Web app URL** (ends in `/exec`). You need it in step 3.
9. In the editor pick **`setup`** from the function dropdown → **Run**.
   Creates the tabs and the 15-minute `runMaintenance` trigger.

### STEP 2 — Existing bds-unified script (revert to v18)

1. Open the main sheet `15wnVR1TSrEnBuEg6QCLRUxJ3ptuTyOdlOriF28viAQ0` → **Extensions → Apps Script**.
2. Select all the old code and paste in the current `usa-oct-apps-script.gs`. Save.
3. **Deploy → Manage deployments → ✏️ pencil → Version: New version → Deploy.**
   The `/exec` URL does **not** change.
4. Open that `/exec` URL in a browser — it must say **`bds-unified v18`**.

> Only needed because I had briefly taken it to v19. If you never deployed v19, you can skip this —
> but paste it anyway so your local file and the live script match.

### STEP 3 — Pixel → all 10 stores

First edit the file **once**, then paste the same file into each store changing only `COUNTRY`.

In `bds-pixel.js`, line ~47:
```js
var XB_URL = 'PASTE_CROSS_BORDER_EXEC_URL_HERE';   ->   the /exec URL from step 1
```

Then **per store**: Shopify admin → **Settings → Customer events → Add custom pixel** →
name it `BackdropSource Tracking` → paste the whole file → set the country on line ~23 →
**Save** → **Connect**.

| Store | `var COUNTRY =` |
|---|---|
| backdropsource.com | `'USA'` |
| backdropsource.co.uk | `'UK'` |
| backdropsource.ca | `'CA'` |
| backdropsource.com.au | `'AU'` |
| backdropsource.co.nz | `'NZ'` |
| India store | `'IN'` |
| UAE store | `'UAE'` |
| France store | `'FR'` |
| Spain store | `'ES'` |
| Germany store | `'DE'` |

If a store **already has** a "BackdropSource Tracking" pixel, edit that one — don't add a second,
or every order logs twice. (CA also has an Irexona affiliate pixel — leave that alone.)

### STEP 4 — Snippet → all 10 stores

Per store: **Online Store → Themes → ⋯ → Edit code**.

1. **Snippets → Add a new snippet** → name it exactly **`bds-tracking`** → paste all of
   `bds-tracking.liquid` → Save.
   *(If `bds-tracking.liquid` already exists, just replace its contents.)*
2. Open **`layout/theme.liquid`**, and immediately before `</body>` add:
   ```liquid
   {% render 'bds-tracking' %}
   ```
   The `country:` parameter is **no longer needed** — the snippet now identifies the store from
   `shop.permanent_domain`. Existing `{% render 'bds-tracking', country: 'USA' %}` tags still work,
   leave them.
3. **This must be in `theme.liquid`**, not only in the custom ad layouts (`themeusa`, `catheme`,
   `uktheme`, `bdsthemeusa`…). Product, collection, cart and account pages use `theme.liquid` — if
   the snippet isn't there, those pages capture nothing. Including it in both is safe: the snippet
   has a duplicate-include guard.

### STEP 5 — Flow for order tags *(optional)*
See §4. Your existing "Order created" Flow needs no change.

### STEP 6 — Confirm the four new custom domains
Check the live domain of the IN / FR / ES / DE stores (Settings → Domains). If any is not
`backdropsource.in` / `.fr` / `.es` / `.de`, fix it in `CUSTOM_DOMAIN` in `bds-tracking.liquid`
and re-upload that snippet.

---

## 6. Test it

1. Incognito → `https://backdropsource.co.uk/?gclid=TEST_UK_1`.
2. Click through to the CA store. Console: `BSTracking.journey` → `"UK → CA"`.
3. Add to cart → start checkout, enter your email, then **close the tab**.
4. `Checkouts` tab: one row, `Origin` UK, `Journey` UK → CA, `Stage Reached` `Contact Info`,
   `Outcome` `In Progress`.
5. Wait for the trigger (or run `resolveAbandoned()` manually with `ABANDON_AFTER_MIN` set to 1) →
   `Outcome` becomes `Abandoned` and it appears on the `Abandoned` tab.
6. Reopen the checkout and complete it → the **same row** flips to `Recovered` with the order number.
7. Order page in admin → **Additional details** shows `Customer Journey / Started On / Ordered On`.

## 7. Honest limits

- **Safari (ITP)** caps JS-set cookies at ~7 days, so journey memory is 7 days there, not 90. Same
  constraint your existing gclid capture already lives with.
- **Abandoned-checkout admin display is unverified** — see §4.
- A checkout only appears here if the pixel fires. Draft orders and admin-created orders skip the
  storefront pixel entirely, so they never produce a checkout row (they still land in the main
  sheet via your existing Flow).
- `ABANDON_AFTER_MIN` is a judgement call. 60 minutes is safe; a slow buyer who takes 90 minutes
  gets marked Abandoned and then flips to `Recovered` on completion, which is accurate but noisy.
  Raise it to 120 if that bothers you.
- A hop is only recorded between stores that have the snippet installed.
