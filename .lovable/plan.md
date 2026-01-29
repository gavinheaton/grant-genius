
# Fix Admin Invitation Email

## Problem

When inviting a new admin, no email is sent because:
1. The `invite-admin` function generates a magic link but never sends it
2. No email template exists for admin invitations (`ADMIN_INVITE`)
3. The Brevo API is never called to deliver the email

## Current Flow (Broken)

```text
Super Admin clicks "Add Admin"
    ↓
invite-admin function runs
    ↓
User created in auth.users ✓
Profile created ✓
Role assigned ✓
Magic link generated ✓
    ↓
Email sent? ✗ NEVER HAPPENS
    ↓
New admin never receives login link
```

## Solution

1. **Add email template to database** for `ADMIN_INVITE`
2. **Update `invite-admin` function** to send the magic link via Brevo API

## Implementation

### Step 1: Add Email Template

Run SQL migration to add the template mapping:

```sql
INSERT INTO email_templates (template_key, brevo_template_id, description)
VALUES (
  'ADMIN_INVITE',
  0,  -- Placeholder - will use fallback HTML
  'Invitation email for new admin users with magic link'
);
```

### Step 2: Update invite-admin Function

Add Brevo email sending after generating the magic link:

```typescript
// After generating magic link (around line 178)

// Send invitation email via Brevo
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
if (!BREVO_API_KEY) {
  logStep("Warning: BREVO_API_KEY not configured, cannot send email");
} else {
  const magicLinkUrl = linkData?.properties?.action_link;
  
  const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
      to: [{ email: email, name: fullName || email }],
      subject: "You've been invited to Grant Genius Admin",
      htmlContent: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #4F46E5;">🎓 Grant Genius</h1>
  </div>
  
  <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
    <h2 style="color: white; margin: 0;">You're Invited!</h2>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">
      You've been invited to join Grant Genius as an ${role === 'super_admin' ? 'Super Admin' : 'Admin'}.
    </p>
  </div>
  
  <p>Hi${fullName ? ' ' + fullName : ''},</p>
  
  <p>Click the button below to set up your account and access the admin dashboard:</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${magicLinkUrl}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
      Accept Invitation
    </a>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    This link expires in 24 hours. If it doesn't work, copy and paste this URL:<br>
    <a href="${magicLinkUrl}" style="color: #4F46E5; word-break: break-all;">${magicLinkUrl}</a>
  </p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="color: #999; font-size: 12px; text-align: center;">
    This invitation was sent by a Grant Genius Super Admin.
  </p>
</body>
</html>
      `,
    }),
  });

  if (brevoResponse.ok) {
    logStep("Invitation email sent successfully");
    
    // Log to email_outbox for tracking
    await adminClient.from("email_outbox").insert({
      user_id: newUser.user.id,
      to_email: email,
      template_key: "ADMIN_INVITE",
      subject: "You've been invited to Grant Genius Admin",
      status: "sent",
      sent_at: new Date().toISOString(),
      variables_json: {
        role: role,
        full_name: fullName || null,
        invited_by: requesterId,
      },
    });
  } else {
    const errorText = await brevoResponse.text();
    logStep("Failed to send invitation email", { error: errorText });
  }
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/invite-admin/index.ts` | Add Brevo API call to send magic link email |
| Database migration | Add `ADMIN_INVITE` template row (optional, for tracking) |

## Email Content

- **Subject**: "You've been invited to Grant Genius Admin"
- **From**: Grant Genius <grantgenius@disruptorsco.com>
- **Contains**:
  - Welcome message with role (Admin/Super Admin)
  - Magic link button to accept invitation
  - Fallback plain text link
  - 24-hour expiry notice

## Expected Flow After Fix

```text
Super Admin clicks "Add Admin"
    ↓
invite-admin function runs
    ↓
User created in auth.users ✓
Magic link generated ✓
    ↓
Brevo API sends email with link ✓
Email logged to email_outbox ✓
    ↓
New admin receives email and clicks to log in
```
