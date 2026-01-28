

# Fix Email Sender Address

## Problem

The "Report Ready" notification emails are being sent from `noreply@grant-genius.com`, which is likely not a verified sending domain in Brevo. This causes emails to fail delivery or land in spam.

## Solution

Update the sender email address to the verified domain: `grantgenius@disruptorsco.com`

## Change Required

**File:** `supabase/functions/send-report-email/index.ts`

**Line 130** - Update sender configuration:

| Current | New |
|---------|-----|
| `email: "noreply@grant-genius.com"` | `email: "grantgenius@disruptorsco.com"` |

The sender name "Grant Genius" will remain unchanged as it's descriptive and user-friendly.

## Code Change

```typescript
// Line 130
// BEFORE:
sender: { name: "Grant Genius", email: "noreply@grant-genius.com" },

// AFTER:
sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
```

## Verification

After deployment:
1. Trigger a report generation with "Email me when complete" enabled
2. Confirm the email arrives from `grantgenius@disruptorsco.com`
3. Check that it doesn't land in spam

