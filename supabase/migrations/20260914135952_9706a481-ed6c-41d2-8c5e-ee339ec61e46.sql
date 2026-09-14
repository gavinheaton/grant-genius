-- Remove direct user write access to AI-generated run data
DROP POLICY IF EXISTS "Users can insert own report run steps" ON public.report_run_steps;
DROP POLICY IF EXISTS "Users can update own report run steps" ON public.report_run_steps;
DROP POLICY IF EXISTS "System can insert report runs" ON public.report_runs;
DROP POLICY IF EXISTS "Users can update own report runs" ON public.report_runs;

REVOKE INSERT, UPDATE ON public.report_run_steps FROM authenticated, anon;
REVOKE INSERT, UPDATE ON public.report_runs FROM authenticated, anon;
GRANT ALL ON public.report_run_steps TO service_role;
GRANT ALL ON public.report_runs TO service_role;

-- Narrow, owner-only retry action replacing the previous broad UPDATE policy
CREATE OR REPLACE FUNCTION public.request_report_run_retry(_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  run_status step_status;
BEGIN
  SELECT a.user_id, rr.status
  INTO owner_id, run_status
  FROM public.report_runs rr
  JOIN public.applications a ON a.id = rr.application_id
  WHERE rr.id = _run_id;

  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'Report run not found';
  END IF;

  IF owner_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this report run';
  END IF;

  UPDATE public.report_runs
  SET status = 'pending'
  WHERE id = _run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_report_run_retry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_report_run_retry(uuid) TO authenticated, service_role;