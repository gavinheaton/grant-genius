

# Fix Stripe Webhook Signature Verification

## Problem Identified

The webhook logs show the exact error:

```
SubtleCryptoProvider cannot be used in a synchronous context.
Use `await constructEventAsync(...)` instead of `constructEvent(...)`
```

The Stripe SDK in Deno environments doesn't support the synchronous `constructEvent()` method. It requires the async version `constructEventAsync()` instead. This is causing all webhook events to fail, which means:

1. No orders are being created in the database
2. No entitlements are being granted
3. Users see "No credits" even after successful payment

## Solution

Change the signature verification from `constructEvent()` to `await constructEventAsync()`.

---

## Technical Changes

### File: `supabase/functions/stripe-webhook/index.ts`

**Current (line 39):**
```typescript
event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
```

**Updated:**
```typescript
event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
```

---

## After Fix

Once deployed, the webhook will:
1. Successfully verify Stripe signatures
2. Create order records in the `orders` table
3. Create entitlement records in the `entitlements` table
4. The Dashboard will show the correct credit count

---

## Testing the Fix

After deployment, you may need to:
1. Go to your Stripe Dashboard → Developers → Webhooks
2. Find the recent failed webhook events
3. Click "Resend" on the `checkout.session.completed` event for your test purchase

This will re-trigger the webhook with your existing payment, and the entitlement should be created.

