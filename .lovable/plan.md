

## Conversion Tracking: GTM + GA4 + Stripe

### 1. Replace inline GA4 with GTM container (`index.html`)

Remove the current gtag.js snippet and replace with the GTM container script using ID `GTM-WBB49KQQ`:

**Head** (just after `<title>`):
```html
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-WBB49KQQ');</script>
```

**Body** (right after `<body>`):
```html
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-WBB49KQQ"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
```

### 2. Create analytics helper (`src/lib/analytics.ts` -- new file)

A small utility to push events to the GTM dataLayer:

```ts
export function trackEvent(event: string, params?: Record<string, unknown>) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}
```

Plus a TypeScript declaration for `window.dataLayer`.

### 3. Fire `begin_checkout` event (`src/hooks/usePurchase.ts`)

After a checkout session URL is received (before opening it), push a `begin_checkout` event with currency, value, and item info.

### 4. Fire `purchase` event on success redirect (`src/pages/Dashboard.tsx`)

In the existing `useEffect` that handles `?payment=success`, also push a `purchase` event with the Stripe session ID as `transaction_id`.

### 5. Pass Stripe session ID in success URL (`supabase/functions/create-checkout/index.ts`)

Update the success URL to include `{CHECKOUT_SESSION_ID}` (Stripe auto-replaces this):

```
/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}
```

### GTM Dashboard Setup (manual, not code)

Once deployed, configure these tags in GTM at tagmanager.google.com:

- **GA4 Configuration tag** with Measurement ID `G-BY7T9G87NW`
- **GA4 Event tags** for `begin_checkout` and `purchase` events
- Any additional conversion pixels can be added later without code changes

### Files Changed

| File | Change |
|------|--------|
| `index.html` | Replace gtag.js with GTM container snippet |
| `src/lib/analytics.ts` | New -- trackEvent helper |
| `src/hooks/usePurchase.ts` | Fire begin_checkout event |
| `src/pages/Dashboard.tsx` | Fire purchase event on success |
| `supabase/functions/create-checkout/index.ts` | Add session_id to success URL |

