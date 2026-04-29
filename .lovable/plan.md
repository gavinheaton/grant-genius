## Fix: OTP code verification fails with 403 `otp_expired` even seconds after generation

### Root cause

`src/pages/Auth.tsx` calls:
```ts
supabase.auth.verifyOtp({ email, token: otpCode, type: "magiclink" })
```

But Supabase has two distinct verify paths:

- `type: "magiclink"` — verifies the **long hashed token** present in the magic link URL (`?token=<long_hash>&type=magiclink`). This is what the link click flow uses.
- `type: "email"` — verifies the **short OTP code** (`email_otp`) the user types into the input.

The 8-digit code returned by `admin.generateLink({ type: "magiclink" })` in `properties.email_otp` is an **email OTP**, not a magiclink token hash. When we ask Supabase to verify it as a magiclink, it can't find a matching token row and returns the generic `otp_expired` / `token has expired or is invalid` 403 — even though the code is brand new.

This is why:
- Joanne and the test user both hit "expired" errors within seconds of receiving the code
- The magic **link** (clicking the button in the email) was working — that path uses the URL hash flow, not `verifyOtp`
- Only the typed-code flow is broken

### Fix (single line change)

**File: `src/pages/Auth.tsx`** (line ~100)

Change:
```ts
const { error } = await supabase.auth.verifyOtp({
  email: email.trim(),
  token: otpCode,
  type: "magiclink",
});
```

To:
```ts
const { error } = await supabase.auth.verifyOtp({
  email: email.trim(),
  token: otpCode,
  type: "email",
});
```

### Why this is safe

- `admin.generateLink({ type: "magiclink" })` generates **both** a magic link token and an email OTP in a single call. The two are independent verification paths against the same login attempt.
- `type: "email"` is the documented verify type for OTP codes typed into a form. It will succeed for the freshly generated 8-digit code.
- The link-click flow (handled by `onAuthStateChange` after Supabase consumes the URL hash) is unaffected.

### No other changes needed

- No DB / RLS changes
- No edge function changes (`send-magic-link` already returns the correct OTP via `email_otp`)
- 8-digit input UI from the previous fix is correct — the issue is only the verify type
- The Dialog `aria-describedby` warning is unrelated cosmetic noise from a shadcn primitive and can be ignored

### Validation after implementation

1. Sign out, request a new code at `/auth`
2. Type the 8-digit code from the email
3. Confirm sign-in succeeds and redirects to `/dashboard` (no 403)
4. Separately, click the magic link button in the email — confirm that path still works
