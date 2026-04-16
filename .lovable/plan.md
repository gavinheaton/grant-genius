

## Fix: OTP Input Supports Only 6 Digits, But 8-Digit Codes Are Being Sent

### Problem
The Supabase Auth API is now generating 8-digit OTP codes, but the Auth page's OTP input component (`InputOTP`) is configured for 6 digits (`maxLength={6}`, 6 `InputOTPSlot` components). Users cannot enter the full code.

### Fix

**File: `src/pages/Auth.tsx`**
- Change `maxLength={6}` to `maxLength={8}` on the `InputOTP` component
- Add 2 more `InputOTPSlot` components (index 6 and 7)
- Update the validation check from `otpCode.length !== 6` to `otpCode.length !== 8` (appears twice: in `handleVerifyOtp` and in the button's `disabled` prop)
- Update the UI copy from "6-digit code" to "8-digit code" (appears in card description and the check-inbox message)

**File: `supabase/functions/send-magic-link/index.ts`**
- Update the email template's OTP display styling: reduce `letter-spacing` from `8px` to `4px` and `font-size` from `36px` to `32px` so the 8-digit code fits cleanly in the email

No database or RLS changes needed.

