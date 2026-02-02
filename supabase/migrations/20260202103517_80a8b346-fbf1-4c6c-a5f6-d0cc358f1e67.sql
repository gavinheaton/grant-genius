-- 1. Fix foreign key constraints to allow deletion (SET NULL preserves billing audit)
ALTER TABLE public.entitlement_consumptions 
  DROP CONSTRAINT IF EXISTS entitlement_consumptions_report_id_fkey;
  
ALTER TABLE public.entitlement_consumptions
  ADD CONSTRAINT entitlement_consumptions_report_id_fkey 
    FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE SET NULL;

ALTER TABLE public.entitlement_consumptions 
  DROP CONSTRAINT IF EXISTS entitlement_consumptions_report_run_id_fkey;

ALTER TABLE public.entitlement_consumptions
  ADD CONSTRAINT entitlement_consumptions_report_run_id_fkey 
    FOREIGN KEY (report_run_id) REFERENCES public.report_runs(id) ON DELETE SET NULL;

-- 2. Add RLS policy for users to delete their own reports
CREATE POLICY "Users can delete own reports"
  ON public.reports
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Add RLS policy for users to delete their own report runs (via application ownership)
CREATE POLICY "Users can delete own report runs"
  ON public.report_runs
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM applications
    WHERE applications.id = report_runs.application_id
    AND applications.user_id = auth.uid()
  ));