-- Add processing mode and admin notification email to grants table
ALTER TABLE public.grants 
ADD COLUMN processing_mode text NOT NULL DEFAULT 'automated',
ADD COLUMN admin_notification_email text;

-- Add manual status tracking to applications table
ALTER TABLE public.applications 
ADD COLUMN manual_status text,
ADD COLUMN manual_submitted_at timestamp with time zone;

-- Add manual report fields to reports table
ALTER TABLE public.reports 
ADD COLUMN is_manual boolean NOT NULL DEFAULT false,
ADD COLUMN manual_report_html text;

-- Add index for admin to query pending manual submissions efficiently
CREATE INDEX idx_applications_manual_status ON public.applications(manual_status) WHERE manual_status IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.grants.processing_mode IS 'automated or manual - determines if reports are AI-generated or admin-prepared';
COMMENT ON COLUMN public.grants.admin_notification_email IS 'Email address to notify when users submit manual processing requests';
COMMENT ON COLUMN public.applications.manual_status IS 'pending_review, in_progress, or completed - only set for manual grant types';
COMMENT ON COLUMN public.applications.manual_submitted_at IS 'Timestamp when user submitted for manual review';
COMMENT ON COLUMN public.reports.is_manual IS 'True if this report was manually created by an admin';
COMMENT ON COLUMN public.reports.manual_report_html IS 'Admin-authored HTML content for manual reports';