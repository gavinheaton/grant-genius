
# Create Editable REPORT_READY Email Template

## Overview
Enhance the email templates system to allow admins to edit the full email content (subject and HTML body) directly from the admin panel at `/admin/emails`, rather than relying solely on Brevo template IDs or hardcoded fallbacks.

## Current State

| Component | Current Behavior |
|-----------|-----------------|
| `email_templates` table | Only stores `template_key`, `brevo_template_id`, `description` |
| Admin UI (`/admin/emails`) | Simple mapping form - template key to Brevo ID |
| `send-report-email` function | Has hardcoded HTML fallback when no Brevo template configured |

## Proposed Changes

### 1. Database Migration
Add new columns to the `email_templates` table:

```sql
ALTER TABLE email_templates
ADD COLUMN subject TEXT,
ADD COLUMN html_content TEXT,
ADD COLUMN sender_name TEXT DEFAULT 'Grant Genius',
ADD COLUMN sender_email TEXT DEFAULT 'grantgenius@disruptorsco.com',
ADD COLUMN variables_schema JSONB;
```

**Also seed the REPORT_READY template** with the existing hardcoded content from the edge function.

### 2. Update Admin UI (`EmailTemplates.tsx`)
Enhance the template editor to include:
- **Subject line** field with variable placeholders (e.g., `{{user_name}}`, `{{grant_name}}`)
- **HTML content** editor (textarea or rich text) 
- **Sender name/email** fields
- **Variable documentation** showing available placeholders
- **Preview mode** to see rendered template
- Keep Brevo template ID as an optional override

### 3. Update Edge Function (`send-report-email`)
Modify the function to:
1. First check if `email_templates` has custom `html_content` for REPORT_READY
2. If custom content exists, use it with variable substitution
3. If Brevo template ID exists, use Brevo's templating
4. Fall back to hardcoded template only if neither is configured

### 4. Available Variables for REPORT_READY
Document these placeholders for the admin:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{user_name}}` | Recipient's name | "John Smith" |
| `{{grant_name}}` | Name of the grant | "AEA Ignite" |
| `{{report_link}}` | URL to view the report | Full URL |

---

## Technical Details

### Database Schema Update

```sql
-- Add content columns to email_templates
ALTER TABLE public.email_templates
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS html_content TEXT,
ADD COLUMN IF NOT EXISTS sender_name TEXT DEFAULT 'Grant Genius',
ADD COLUMN IF NOT EXISTS sender_email TEXT DEFAULT 'grantgenius@disruptorsco.com',
ADD COLUMN IF NOT EXISTS variables_schema JSONB;

-- Seed the REPORT_READY template with existing hardcoded content
INSERT INTO public.email_templates (
  template_key,
  brevo_template_id,
  description,
  subject,
  sender_name,
  sender_email,
  html_content,
  variables_schema
) VALUES (
  'REPORT_READY',
  0,
  'Sent when a researcher report has finished generating',
  'Your Grant Genius Report is Ready!',
  'Grant Genius',
  'grantgenius@disruptorsco.com',
  '<existing HTML content>',
  '{"user_name": "Recipient name", "grant_name": "Grant name", "report_link": "Link to report"}'
)
ON CONFLICT (template_key) DO UPDATE SET
  subject = EXCLUDED.subject,
  html_content = EXCLUDED.html_content,
  sender_name = EXCLUDED.sender_name,
  sender_email = EXCLUDED.sender_email,
  variables_schema = EXCLUDED.variables_schema
WHERE email_templates.html_content IS NULL;
```

### Enhanced Admin UI Features
- Full-width HTML editor for email body
- Live preview panel showing rendered output
- Variable insertion buttons/chips
- Save and test functionality

### Edge Function Priority Logic

```text
1. Check for custom html_content in email_templates
   └─ Yes → Use stored template with variable substitution
   └─ No → Continue

2. Check for brevo_template_id in email_templates
   └─ Yes → Use Brevo API with templateId
   └─ No → Continue

3. Use hardcoded fallback (legacy support)
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/...` | Create | Add columns and seed data |
| `src/pages/admin/EmailTemplates.tsx` | Modify | Enhanced editor with subject, HTML content, preview |
| `supabase/functions/send-report-email/index.ts` | Modify | Support custom template content |
| `src/integrations/supabase/types.ts` | Auto-update | Reflect new columns |

