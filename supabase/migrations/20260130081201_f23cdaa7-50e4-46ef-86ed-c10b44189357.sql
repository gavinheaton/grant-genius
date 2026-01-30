-- Enable Realtime for report_runs table (report_run_steps already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_runs;