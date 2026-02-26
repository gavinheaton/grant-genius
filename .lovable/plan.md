
## Fix: Outlook Pre-Fetching Consuming Magic Links

### Problem
Outlook's "Safe Links" feature automatically pre-fetches URLs in emails to scan for threats. This consumes the one-time magic link token before the user actually clicks it, resulting in "Email link is invalid or has expired" errors.

### Solution: Switch to OTP Code Authentication

Instead of sending a clickable link (which Outlook consumes), send a **6-digit verification code** that the user types into the sign-in page. Codes are immune to pre-fetching because there is no URL to scan.

The user experience changes from:
1. Enter email -> check inbox -> click link -> signed in

To:
1. Enter email -> check inbox -> copy 6-digit code -> type code on sign-in page -> signed in

### Changes

**1. `supabase/functions/send-magic-link/index.ts`**
- Switch from `generateLink({ type: "magiclink" })` to `generateLink({ type: "magiclink" })` but extract the OTP token from the response (`linkData.properties.hashed_token`) -- actually, use Supabase's built-in email OTP: call `supabase.auth.signInWithOtp()` server-side is not available via admin API
- Better approach: keep `generateLink` but extract the **OTP code** from `linkData.properties.email_otp` (Supabase returns both the link and a 6-digit OTP when generating magic links)
- Update the Brevo email template to show the **6-digit code** prominently instead of (or in addition to) the clickable link
- Keep the clickable link as a fallback for non-Outlook users

**2. `src/pages/Auth.tsx`**
- After the "check your inbox" success screen, add an **OTP input field** (6 digits) where the user can type the code
- On submission, call `supabase.auth.verifyOtp({ email, token, type: 'magiclink' })` to complete sign-in
- Keep a "Use magic link instead" note for users who prefer clicking

### Updated User Flow

```
Enter email
    |
    v
"Check your inbox" screen
    |
    v
[  _ _ _ _ _ _  ]   <-- 6-digit OTP input
[   Verify Code  ]
    |
    v
Signed in -> /dashboard
```

### Technical Details

| File | Change |
|---|---|
| `supabase/functions/send-magic-link/index.ts` | Extract OTP from `linkData.properties.email_otp`; update Brevo email to show code prominently + keep link as fallback |
| `src/pages/Auth.tsx` | Add OTP input after email submission; call `verifyOtp()` on submit; keep existing magic link flow as fallback |

### Email Template Update
The email will change from just a "Sign In" button to:

```
Your sign-in code: 123456
Enter this code on the sign-in page.

Or click the button below:
[Sign In to Grant Genius]
```

This gives users two ways to authenticate -- the code (Outlook-safe) and the link (convenient for other email clients).
