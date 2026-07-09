
-- 1. api_settings: restrict to admins
DROP POLICY IF EXISTS "Anyone can read api settings" ON public.api_settings;
CREATE POLICY "Admins can read api settings"
ON public.api_settings FOR SELECT
USING (public.is_admin(auth.uid()));

-- 2. profiles: drop the OR-permissive block-anon policy
DROP POLICY IF EXISTS "Block anonymous access to profiles" ON public.profiles;

-- 3. user_roles: drop the OR-permissive block-anon policy, add own-row read
DROP POLICY IF EXISTS "Block anonymous access to user_roles" ON public.user_roles;
CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- 4. grant_review_workflows & steps: remove authenticated-read policies
DROP POLICY IF EXISTS "Authenticated users can view workflow steps" ON public.grant_review_workflow_steps;
DROP POLICY IF EXISTS "Authenticated users can view review workflows" ON public.grant_review_workflows;
-- Allow assigned reviewers to read their steps
CREATE POLICY "Reviewers can view their assigned workflow steps"
ON public.grant_review_workflow_steps FOR SELECT
USING (reviewer_user_id = auth.uid());

-- 5. report_reviews: allow report owners + assigned reviewers to read
CREATE POLICY "Users can view reviews for their own reports"
ON public.report_reviews FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_reviews.report_id
      AND r.user_id = auth.uid()
  )
);
CREATE POLICY "Assigned reviewer can view their review"
ON public.report_reviews FOR SELECT
USING (auth.uid() = reviewer_user_id);

-- 6. report_run_steps: add explicit INSERT/UPDATE policies scoped to owner
CREATE POLICY "Users can insert own report run steps"
ON public.report_run_steps FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.report_runs rr
    JOIN public.applications a ON a.id = rr.application_id
    WHERE rr.id = report_run_steps.report_run_id
      AND a.user_id = auth.uid()
  )
);
CREATE POLICY "Users can update own report run steps"
ON public.report_run_steps FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.report_runs rr
    JOIN public.applications a ON a.id = rr.application_id
    WHERE rr.id = report_run_steps.report_run_id
      AND a.user_id = auth.uid()
  )
);

-- 7. Storage: reports bucket - require user owns folder
DROP POLICY IF EXISTS "System can upload report files" ON storage.objects;
DROP POLICY IF EXISTS "System can update report files" ON storage.objects;
CREATE POLICY "Users can upload own report files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'reports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
CREATE POLICY "Users can update own report files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'reports'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 8. Storage: drop broad SELECT policies on public buckets (files remain accessible via public URLs)
DROP POLICY IF EXISTS "Anyone can view pdf assets" ON storage.objects;
DROP POLICY IF EXISTS "Homepage assets are publicly accessible" ON storage.objects;

-- 9. Revoke execute on internal SECURITY DEFINER functions from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.decrement_entitlement(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.swap_step_numbers(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reorder_step_numbers(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_report_trend_7_days() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- Keep has_role / is_admin executable — used inside RLS policies

-- 10. Read-only SQL helper for admin assistant
CREATE OR REPLACE FUNCTION public.execute_readonly_query(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  upper_q text := upper(btrim(query_text));
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF upper_q !~ '^SELECT\s|^WITH\s' THEN
    RAISE EXCEPTION 'Only SELECT/WITH queries are allowed';
  END IF;
  IF upper_q ~ '(\s|;|/\*|--)(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|CALL|EXECUTE)\s' THEN
    RAISE EXCEPTION 'Query contains forbidden keywords';
  END IF;

  -- Enforce read-only for the duration of this transaction
  SET LOCAL transaction_read_only = on;
  SET LOCAL statement_timeout = '10s';

  EXECUTE format('SELECT COALESCE(to_jsonb(array_agg(row_to_json(t))), ''[]''::jsonb) FROM (%s) t', query_text)
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.execute_readonly_query(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_readonly_query(text) TO authenticated;

-- 11. Realtime: scope channel subscriptions by auth.uid()
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can access own realtime channels" ON realtime.messages;
CREATE POLICY "Authenticated users can access own realtime channels"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  -- Users may only subscribe to a channel named after their own user id,
  -- or to admin-scoped channels if they are admins.
  (realtime.topic() = ('user:' || auth.uid()::text))
  OR public.is_admin(auth.uid())
);
