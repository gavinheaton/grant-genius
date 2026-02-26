
-- 1. Create api_settings (single-row config)
CREATE TABLE public.api_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT true,
  default_grant_id uuid REFERENCES public.grants(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.api_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api settings" ON public.api_settings
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Anyone can read api settings" ON public.api_settings
  FOR SELECT USING (true);

-- Insert default row
INSERT INTO public.api_settings (is_enabled) VALUES (true);

-- 2. Create api_usage_logs
CREATE TABLE public.api_usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text,
  endpoint text NOT NULL,
  report_run_id uuid REFERENCES public.report_runs(id),
  source text NOT NULL DEFAULT 'api',
  response_status integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view api usage logs" ON public.api_usage_logs
  FOR SELECT USING (is_admin(auth.uid()));

-- 3. Add webhook_url to report_runs
ALTER TABLE public.report_runs ADD COLUMN IF NOT EXISTS webhook_url text;

-- 4. Add api_source to applications
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS api_source text;
