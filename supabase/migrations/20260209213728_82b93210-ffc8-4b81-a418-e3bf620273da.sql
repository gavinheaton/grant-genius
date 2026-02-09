
-- Table: grant_review_workflows (one per grant)
CREATE TABLE public.grant_review_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  step_count integer NOT NULL DEFAULT 1 CHECK (step_count >= 1 AND step_count <= 3),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (grant_id)
);

ALTER TABLE public.grant_review_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage review workflows"
  ON public.grant_review_workflows FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view review workflows"
  ON public.grant_review_workflows FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER update_grant_review_workflows_updated_at
  BEFORE UPDATE ON public.grant_review_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table: grant_review_workflow_steps
CREATE TABLE public.grant_review_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.grant_review_workflows(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number >= 1 AND step_number <= 3),
  reviewer_user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_number)
);

ALTER TABLE public.grant_review_workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflow steps"
  ON public.grant_review_workflow_steps FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view workflow steps"
  ON public.grant_review_workflow_steps FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Table: report_reviews
CREATE TABLE public.report_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  workflow_step_id uuid NOT NULL REFERENCES public.grant_review_workflow_steps(id),
  reviewer_user_id uuid NOT NULL,
  step_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'approved')),
  edited_html text,
  notes text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.report_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all reviews"
  ON public.report_reviews FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Assigned reviewer can update their review"
  ON public.report_reviews FOR UPDATE
  USING (auth.uid() = reviewer_user_id);

CREATE POLICY "Admins can insert reviews"
  ON public.report_reviews FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Add columns to reports
ALTER TABLE public.reports
  ADD COLUMN review_status text,
  ADD COLUMN current_review_step integer;

-- Insert REVIEW_REQUESTED email template
INSERT INTO public.email_templates (template_key, brevo_template_id, subject, description, html_content, variables_schema)
VALUES (
  'REVIEW_REQUESTED',
  0,
  'Report Review Required - {{grant_name}}',
  'Sent to reviewers when a report needs their review',
  '<h2>Review Requested</h2><p>Hi {{reviewer_name}},</p><p>A report for <strong>{{grant_name}}</strong> ({{application_title}}) is ready for your review (Step {{step_number}} of {{total_steps}}).</p><p><a href="{{review_link}}">Click here to review the report</a></p>',
  '[{"name":"reviewer_name","required":true},{"name":"grant_name","required":true},{"name":"application_title","required":true},{"name":"review_link","required":true},{"name":"step_number","required":true},{"name":"total_steps","required":true}]'
);
