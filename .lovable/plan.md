

# Update Pricing: $45 + GST Single Report + $400 + GST Ten-Pack Bundle

## Overview

Change the single report price from $99 to $45 + GST ($49.50 inc. GST), and add a 10-report bundle at $400 + GST ($440 inc. GST). Prices displayed as base price with GST noted separately.

## Stripe Products and Prices

Stripe charges the GST-inclusive amount (what the customer actually pays):

| Product | Base Price | GST (10%) | Stripe Charge | Per-Report |
|---------|-----------|-----------|---------------|------------|
| Single Report | $45.00 | $4.50 | $49.50 AUD | $49.50 |
| Report 10-Pack | $400.00 | $40.00 | $440.00 AUD | $44.00 |

Create via Stripe tools:
- New price on existing product `prod_TroVyrVbcfvfrk`: **4950 cents AUD**
- New product "Report 10-Pack" with price: **44000 cents AUD**

## Database Updates (`products` table)

- Update `REPORT_ONE_OFF`: `price_cents` to 4950, new `stripe_price_id`
- Insert `REPORT_BUNDLE_10`: `price_cents` 44000, new `stripe_price_id`, name "Report 10-Pack"

## Frontend Price Display

### Landing Page (`Pricing.tsx`)

**Card 1: Single Report**
- Headline: **$45**
- Subtext: "+ GST ($49.50 inc. GST)"
- Features: 1 Complete Report, all sections, exports, etc.

**Card 2: Report 10-Pack (highlighted as "Best Value")**
- Headline: **$400**
- Subtext: "+ GST ($440 inc. GST)"
- Features: 10 Report Credits, save $50 vs individual, etc.

### Purchase Modal (`PurchaseModal.tsx`)

- Show both options as selectable cards
- Each shows "$45 + GST" / "$400 + GST" with inc. GST amount
- Bundle card shows "Save $50" badge

### `usePurchase.ts`

- Define both new Stripe price IDs as constants
- Accept optional `priceId` parameter
- Default to single report price

## Backend Updates

### `stripe-webhook/index.ts`

Dynamic entitlement quantity based on product_key:
- `REPORT_ONE_OFF` -> quantity: 1
- `REPORT_BUNDLE_10` -> quantity: 10

Entitlement type remains `REPORT_ONE_OFF` for both (same type of credit).

### `grant-credit/index.ts`

Add `REPORT_BUNDLE_10` to valid entitlement types list.

## Files to Modify

| File | Changes |
|------|---------|
| Stripe (via tool) | Create new price ($49.50) + new product/price ($440) |
| Database (`products`) | Update single report, insert bundle |
| `supabase/functions/stripe-webhook/index.ts` | Dynamic quantity based on product_key |
| `supabase/functions/grant-credit/index.ts` | Add REPORT_BUNDLE_10 to valid types |
| `src/hooks/usePurchase.ts` | Support multiple price IDs |
| `src/components/landing/Pricing.tsx` | New plans with "$X + GST" display |
| `src/components/PurchaseModal.tsx` | Both purchase options with GST display |

## How the Bundle Works

1. User clicks "Purchase 10-Pack" -> Stripe charges $440 AUD
2. Webhook fires with `product_key: "REPORT_BUNDLE_10"`
3. Webhook creates entitlement with `quantity: 10, used_quantity: 0`
4. Existing `useEntitlements` hook sums available credits -- 10 credits appear immediately
5. Each report generation consumes 1 credit as normal

