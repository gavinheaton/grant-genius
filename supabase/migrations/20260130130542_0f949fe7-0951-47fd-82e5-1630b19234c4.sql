-- Add execution engine configuration columns to grant_versions
ALTER TABLE public.grant_versions 
ADD COLUMN IF NOT EXISTS execution_engine_default TEXT DEFAULT 'cloud_run',
ADD COLUMN IF NOT EXISTS edge_allowed BOOLEAN DEFAULT true;

-- Add execution engine tracking columns to report_runs
ALTER TABLE public.report_runs
ADD COLUMN IF NOT EXISTS execution_engine TEXT DEFAULT 'cloud_run',
ADD COLUMN IF NOT EXISTS execution_engine_reason TEXT;