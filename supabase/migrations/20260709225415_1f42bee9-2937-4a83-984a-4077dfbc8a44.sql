ALTER TABLE public.api_settings 
  ADD COLUMN IF NOT EXISTS login_notifications_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_notifications_recipient TEXT NOT NULL DEFAULT 'grantgenius@disruptorsco.com';