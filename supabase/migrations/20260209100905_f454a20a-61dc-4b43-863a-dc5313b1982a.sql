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
  'Your Grant Genius Report is Ready! 🎉',
  'Grant Genius',
  'grantgenius@disruptorsco.com',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #4F46E5; margin-bottom: 10px;">🎓 Grant Genius</h1>
  </div>
  
  <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
    <h2 style="color: white; margin: 0 0 10px 0;">Your Report is Ready!</h2>
    <p style="color: rgba(255,255,255,0.9); margin: 0;">Hi {{user_name}},</p>
  </div>
  
  <p>Great news! Your commercialisation research report for <strong>{{grant_name}}</strong> has been generated and is ready for download.</p>
  
  <p>The report includes:</p>
  <ul style="padding-left: 20px;">
    <li>Competitor analysis and research landscape</li>
    <li>Market segmentation and sizing (TAM/SAM/SOM)</li>
    <li>Australian economic impact assessment</li>
    <li>Potential partner businesses</li>
    <li>And more...</li>
  </ul>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{report_link}}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
      View Your Report
    </a>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    If the button above doesn''t work, copy and paste this link into your browser:<br>
    <a href="{{report_link}}" style="color: #4F46E5;">{{report_link}}</a>
  </p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="color: #999; font-size: 12px; text-align: center;">
    This email was sent by Grant Genius because you requested to be notified when your report was ready.
  </p>
</body>
</html>',
  '{"user_name": "Recipient name (e.g. John Smith)", "grant_name": "Name of the grant (e.g. AEA Ignite)", "report_link": "Full URL to view the report"}'::jsonb
)
ON CONFLICT (template_key) DO UPDATE SET
  subject = COALESCE(email_templates.subject, EXCLUDED.subject),
  html_content = COALESCE(email_templates.html_content, EXCLUDED.html_content),
  sender_name = COALESCE(email_templates.sender_name, EXCLUDED.sender_name),
  sender_email = COALESCE(email_templates.sender_email, EXCLUDED.sender_email),
  variables_schema = COALESCE(email_templates.variables_schema, EXCLUDED.variables_schema);