-- Add halt_reason column to track why a pipeline was stopped
ALTER TABLE public.report_runs 
ADD COLUMN halt_reason TEXT;