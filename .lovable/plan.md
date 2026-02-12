

## Clean Up Magic Link Email: Hide Raw Supabase URL

### Problem
The fallback text link in the magic link email displays the full raw Supabase verification URL (e.g., `https://sdrawnxfhiyyiiswqvni.supabase.co/auth/v1/verify?token=...&redirect_to=...`), which looks unprofessional and confusing.

### Solution
Update the email template in `supabase/functions/send-magic-link/index.ts` to replace the raw URL display with a clean, branded label like "Sign in to Grant Genius" while keeping the `href` pointing to the actual magic link. This way the link still works, but users see a friendly label instead of a long technical URL.

### Changes

**`supabase/functions/send-magic-link/index.ts`** (line 128-131)

Replace the fallback paragraph that currently reads:
> "This link expires in 24 hours. If the button doesn't work, copy and paste this URL into your browser: [raw URL]"

With:
> "This link expires in 24 hours. If the button above doesn't work, [click here to sign in](link)."

This removes the visible raw URL entirely while keeping the functional link accessible as a fallback.

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/send-magic-link/index.ts` | Replace raw URL text with a clean "click here to sign in" fallback link |

