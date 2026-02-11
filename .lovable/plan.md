

## Add Stripe Customers to Brevo "Customers" List (ID: 2)

### Overview

After a successful Stripe purchase, the user's email will be added to the Brevo "Customers" list (ID: 2). This happens server-side in the existing `stripe-webhook` edge function, right after entitlement creation succeeds.

### Implementation

#### Update `supabase/functions/stripe-webhook/index.ts`

After the entitlement is created (or confirmed existing) for a `checkout.session.completed` event, add a fire-and-forget call to the Brevo Contacts API:

```typescript
// Add customer to Brevo "Customers" list
const brevoApiKey = Deno.env.get("BREVO_API_KEY");
const customerEmail = session.customer_email || user?.email;
if (brevoApiKey && customerEmail) {
  try {
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: customerEmail,
        listIds: [2],
        updateEnabled: true,
      }),
    });
    logStep("Added customer to Brevo list 2", { email: customerEmail });
  } catch (err) {
    logStep("Brevo list add failed (non-blocking)", { error: String(err) });
  }
}
```

Key details:
- Uses the existing `BREVO_API_KEY` secret (already configured)
- `updateEnabled: true` ensures existing contacts are updated rather than erroring
- Non-blocking: errors are logged but never fail the webhook response
- The email is sourced from `session.customer_email` (set by Stripe Checkout) with a fallback to the authenticated user's email looked up via `user_id` metadata
- No new files, edge functions, or database changes required

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/stripe-webhook/index.ts` | Add Brevo API call after entitlement processing |

