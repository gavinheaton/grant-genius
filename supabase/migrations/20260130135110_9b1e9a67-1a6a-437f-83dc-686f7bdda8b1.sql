-- Create report_logs table for worker status messages
CREATE TABLE public.report_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id UUID NOT NULL REFERENCES public.report_runs(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_report_logs_run_id ON public.report_logs(report_run_id);
CREATE INDEX idx_report_logs_timestamp ON public.report_logs(timestamp);

-- Enable RLS
ALTER TABLE public.report_logs ENABLE ROW LEVEL SECURITY;

-- Users can view logs for their own report runs
CREATE POLICY "Users can view own report logs"
  ON public.report_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM report_runs rr
      JOIN applications a ON a.id = rr.application_id
      WHERE rr.id = report_logs.report_run_id
      AND a.user_id = auth.uid()
    )
  );

-- Admins can view all logs
CREATE POLICY "Admins can view all report logs"
  ON public.report_logs
  FOR SELECT
  USING (is_admin(auth.uid()));

-- Enable realtime for live log updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_logs;