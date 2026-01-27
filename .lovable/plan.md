

# Enable Coupon Codes in Stripe Checkout

## Current State

The `create-checkout` edge function creates a Stripe Checkout session but doesn't enable the promotion code input field. Users can't apply coupon codes during checkout.

## Solution

Add `allow_promotion_codes: true` to the checkout session configuration. This will show a "Add promotion code" field on the Stripe Checkout page where users can enter any coupon codes you've created in your Stripe Dashboard.

---

## Changes Required

### File: `supabase/functions/create-checkout/index.ts`

**Current (lines 60-77):**
```typescript
const session = await stripe.checkout.sessions.create({
  customer: customerId,
  customer_email: customerId ? undefined : user.email,
  line_items: [
    {
      price: priceId,
      quantity: 1,
    },
  ],
  mode: "payment",
  success_url: successUrl || `${origin}/dashboard?payment=success`,
  cancel_url: cancelUrl || `${origin}/dashboard?payment=cancelled`,
  metadata: {
    user_id: user.id,
    product_key: "REPORT_ONE_OFF",
  },
});
```

**Updated:**
```typescript
const session = await stripe.checkout.sessions.create({
  customer: customerId,
  customer_email: customerId ? undefined : user.email,
  line_items: [
    {
      price: priceId,
      quantity: 1,
    },
  ],
  mode: "payment",
  allow_promotion_codes: true,  // <-- Add this line
  success_url: successUrl || `${origin}/dashboard?payment=success`,
  cancel_url: cancelUrl || `${origin}/dashboard?payment=cancelled`,
  metadata: {
    user_id: user.id,
    product_key: "REPORT_ONE_OFF",
  },
});
```

---

## What This Enables

Once deployed, the Stripe Checkout page will show an "Add promotion code" link that users can click to enter any coupon codes you've created in your Stripe Dashboard.

The coupon codes you've already set up in Stripe will work automatically - no additional configuration needed on the Stripe side.

---

## Summary

| File | Change |
|------|--------|
| `supabase/functions/create-checkout/index.ts` | Add `allow_promotion_codes: true` to checkout session |

This is a one-line addition. After deployment, users will see the promotion code field during checkout.

