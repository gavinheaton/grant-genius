-- User roles enum
CREATE TYPE public.app_role AS ENUM ('researcher', 'admin', 'super_admin');

-- Application status enum
CREATE TYPE public.application_status AS ENUM ('draft', 'in_progress', 'ready', 'failed');

-- Report run step status enum
CREATE TYPE public.step_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- Order status enum
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- User profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'researcher',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Grants table
CREATE TABLE public.grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Grant versions table
CREATE TABLE public.grant_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  guidelines_json JSONB DEFAULT '{}',
  rubric_json JSONB DEFAULT '{}',
  required_inputs_json JSONB DEFAULT '[]',
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grant_id, version_number)
);

-- Applications table
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grant_version_id UUID NOT NULL REFERENCES public.grant_versions(id),
  title TEXT,
  status application_status NOT NULL DEFAULT 'draft',
  inputs_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evidence items table
CREATE TABLE public.evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT,
  file_path TEXT,
  citation_text TEXT,
  metadata_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Report templates table
CREATE TABLE public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Report template versions table
CREATE TABLE public.report_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_template_id UUID NOT NULL REFERENCES public.report_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  sections_json JSONB DEFAULT '[]',
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_template_id, version_number)
);

-- Report runs table (for step-based pipeline)
CREATE TABLE public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  report_template_version_id UUID NOT NULL REFERENCES public.report_template_versions(id),
  status step_status NOT NULL DEFAULT 'pending',
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 10,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Report run steps table
CREATE TABLE public.report_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id UUID NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  status step_status NOT NULL DEFAULT 'pending',
  outputs_json JSONB DEFAULT '{}',
  citations_json JSONB DEFAULT '[]',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_run_id, step_number)
);

-- Reports table (immutable snapshots)
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_run_id UUID NOT NULL REFERENCES public.report_runs(id),
  grant_version_id UUID NOT NULL REFERENCES public.grant_versions(id),
  report_template_version_id UUID NOT NULL REFERENCES public.report_template_versions(id),
  inputs_snapshot_json JSONB NOT NULL DEFAULT '{}',
  citations_json JSONB NOT NULL DEFAULT '[]',
  content_json JSONB NOT NULL DEFAULT '{}',
  pdf_path TEXT,
  docx_path TEXT,
  version_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products table (for Stripe)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  product_key TEXT UNIQUE NOT NULL,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  price_cents INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  status order_status NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);

-- Entitlements table
CREATE TABLE public.entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id),
  entitlement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  used_quantity INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entitlement consumptions table
CREATE TABLE public.entitlement_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id UUID NOT NULL REFERENCES public.entitlements(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id),
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email templates table (for Brevo)
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT UNIQUE NOT NULL,
  brevo_template_id INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email outbox table
CREATE TABLE public.email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  variables_json JSONB DEFAULT '{}',
  brevo_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Email events table (webhook events from Brevo)
CREATE TABLE public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_outbox_id UUID REFERENCES public.email_outbox(id) ON DELETE SET NULL,
  brevo_message_id TEXT,
  event_type TEXT NOT NULL,
  event_data_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_value_json JSONB,
  new_value_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App events table (analytics)
CREATE TABLE public.app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_data_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is admin or super admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'super_admin')
  )
$$;

-- RLS Policies

-- Profiles: Users can view and update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User roles: Only readable by admins (users cannot see their own roles directly)
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Super admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));

-- Grants: Public read for active grants, admin write
CREATE POLICY "Anyone can view active grants" ON public.grants
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage grants" ON public.grants
  FOR ALL USING (public.is_admin(auth.uid()));

-- Grant versions: Public read for published, admin write
CREATE POLICY "Anyone can view published grant versions" ON public.grant_versions
  FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all grant versions" ON public.grant_versions
  FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage grant versions" ON public.grant_versions
  FOR ALL USING (public.is_admin(auth.uid()));

-- Applications: Users can only access their own
CREATE POLICY "Users can view own applications" ON public.applications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own applications" ON public.applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own applications" ON public.applications
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own applications" ON public.applications
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all applications" ON public.applications
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Evidence items: Users can only access their own
CREATE POLICY "Users can view own evidence" ON public.evidence_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own evidence" ON public.evidence_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own evidence" ON public.evidence_items
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own evidence" ON public.evidence_items
  FOR DELETE USING (auth.uid() = user_id);

-- Report templates: Public read, admin write
CREATE POLICY "Anyone can view active report templates" ON public.report_templates
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage report templates" ON public.report_templates
  FOR ALL USING (public.is_admin(auth.uid()));

-- Report template versions: Public read for published, admin write
CREATE POLICY "Anyone can view published template versions" ON public.report_template_versions
  FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can manage template versions" ON public.report_template_versions
  FOR ALL USING (public.is_admin(auth.uid()));

-- Report runs: Users can view runs for their applications
CREATE POLICY "Users can view own report runs" ON public.report_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = report_runs.application_id
      AND applications.user_id = auth.uid()
    )
  );
CREATE POLICY "System can insert report runs" ON public.report_runs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applications
      WHERE applications.id = report_runs.application_id
      AND applications.user_id = auth.uid()
    )
  );

-- Report run steps: Users can view steps for their runs
CREATE POLICY "Users can view own run steps" ON public.report_run_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.report_runs rr
      JOIN public.applications a ON a.id = rr.application_id
      WHERE rr.id = report_run_steps.report_run_id
      AND a.user_id = auth.uid()
    )
  );

-- Reports: Users can only access their own
CREATE POLICY "Users can view own reports" ON public.reports
  FOR SELECT USING (auth.uid() = user_id);

-- Products: Public read
CREATE POLICY "Anyone can view active products" ON public.products
  FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage products" ON public.products
  FOR ALL USING (public.is_admin(auth.uid()));

-- Orders: Users can only access their own
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all orders" ON public.orders
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Entitlements: Users can only access their own
CREATE POLICY "Users can view own entitlements" ON public.entitlements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all entitlements" ON public.entitlements
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Entitlement consumptions: Users can view their own
CREATE POLICY "Users can view own consumptions" ON public.entitlement_consumptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.entitlements
      WHERE entitlements.id = entitlement_consumptions.entitlement_id
      AND entitlements.user_id = auth.uid()
    )
  );

-- Email templates: Admin only
CREATE POLICY "Admins can manage email templates" ON public.email_templates
  FOR ALL USING (public.is_admin(auth.uid()));

-- Email outbox: Users can view their own emails
CREATE POLICY "Users can view own emails" ON public.email_outbox
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all emails" ON public.email_outbox
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Email events: Admin only
CREATE POLICY "Admins can view email events" ON public.email_events
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Audit logs: Admin only
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_admin(auth.uid()));

-- App events: Users can insert their own, admins can view all
CREATE POLICY "Users can insert own events" ON public.app_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all events" ON public.app_events
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Trigger function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_grants_updated_at
  BEFORE UPDATE ON public.grants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_evidence_items_updated_at
  BEFORE UPDATE ON public.evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Default role is researcher
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'researcher');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert initial data: default product
INSERT INTO public.products (name, product_key, price_cents, is_active)
VALUES ('Single Report', 'REPORT_ONE_OFF', 14900, true);

-- Insert initial grants
INSERT INTO public.grants (name, description, is_active) VALUES
  ('ARC Linkage Grant', 'Industry-research collaboration funding for Australian universities', true),
  ('NHMRC Ideas Grant', 'Health and medical research commercialisation funding', true),
  ('Commercialisation Australia', 'Early-stage commercialisation support for research innovations', true),
  ('CSIRO Innovation Fund', 'Deep tech and science commercialisation funding', true);

-- Create grant versions for each grant
INSERT INTO public.grant_versions (grant_id, version_number, is_published, published_at, required_inputs_json)
SELECT 
  id,
  1,
  true,
  now(),
  '[
    {"key": "technicalDescription", "label": "Research Technical Description", "type": "textarea", "required": true},
    {"key": "publicArticleUrl", "label": "Public Article URL", "type": "url", "required": true},
    {"key": "summary", "label": "100-Word Summary", "type": "textarea", "required": true, "maxWords": 100},
    {"key": "trl", "label": "Technology Readiness Level (TRL)", "type": "text", "required": false},
    {"key": "ipStatus", "label": "IP Status", "type": "text", "required": false}
  ]'::jsonb
FROM public.grants;

-- Create default report template
INSERT INTO public.report_templates (name, description, is_active)
VALUES ('Standard Commercialisation Report', 'Default template for commercialisation grant applications', true);

-- Create report template version
INSERT INTO public.report_template_versions (report_template_id, version_number, is_published, published_at, sections_json)
SELECT 
  id,
  1,
  true,
  now(),
  '[
    {"order": 1, "name": "Executive Summary", "key": "executive_summary"},
    {"order": 2, "name": "Technology Overview", "key": "technology_overview"},
    {"order": 3, "name": "Market Analysis", "key": "market_analysis"},
    {"order": 4, "name": "Commercialisation Strategy", "key": "commercialisation_strategy"},
    {"order": 5, "name": "Competitive Landscape", "key": "competitive_landscape"},
    {"order": 6, "name": "IP Strategy", "key": "ip_strategy"},
    {"order": 7, "name": "Team & Capabilities", "key": "team_capabilities"},
    {"order": 8, "name": "Financial Projections", "key": "financial_projections"},
    {"order": 9, "name": "Risk Assessment", "key": "risk_assessment"},
    {"order": 10, "name": "Implementation Timeline", "key": "implementation_timeline"}
  ]'::jsonb
FROM public.report_templates
WHERE name = 'Standard Commercialisation Report';