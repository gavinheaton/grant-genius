-- Allow admins to view all report runs from the frontend
CREATE POLICY "Admins can view all report runs"
ON public.report_runs
FOR SELECT
USING (is_admin(auth.uid()));

-- Allow admins to view all report run steps
CREATE POLICY "Admins can view all run steps"
ON public.report_run_steps
FOR SELECT
USING (is_admin(auth.uid()));