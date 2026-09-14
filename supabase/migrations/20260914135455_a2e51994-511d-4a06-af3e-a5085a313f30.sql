-- 1. Column-level restriction on grant_versions sensitive fields
REVOKE SELECT, INSERT, UPDATE ON public.grant_versions FROM authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.grant_versions FROM anon;

GRANT SELECT (
  id, grant_id, version_number, guidelines_json, rubric_json, required_inputs_json,
  is_published, published_at, created_at, guidelines_source_path, ai_analysis_status,
  execution_engine_default, edge_allowed, prompt_bundle_id, pipeline_generation_status
) ON public.grant_versions TO authenticated;

GRANT INSERT (
  id, grant_id, version_number, guidelines_json, rubric_json, required_inputs_json,
  is_published, published_at, created_at, guidelines_source_path, ai_analysis_status,
  execution_engine_default, edge_allowed, prompt_bundle_id, pipeline_generation_status
) ON public.grant_versions TO authenticated;

GRANT UPDATE (
  grant_id, version_number, guidelines_json, rubric_json, required_inputs_json,
  is_published, published_at, guidelines_source_path, ai_analysis_status,
  execution_engine_default, edge_allowed, prompt_bundle_id, pipeline_generation_status
) ON public.grant_versions TO authenticated;

GRANT ALL ON public.grant_versions TO service_role;

-- 2. Admin-only accessors for the sensitive columns
CREATE OR REPLACE FUNCTION public.admin_get_grant_version_sensitive(_version_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'claude_prompt_template', gv.claude_prompt_template,
    'guidelines_raw_text', gv.guidelines_raw_text,
    'ai_suggestions_json', gv.ai_suggestions_json
  )
  INTO result
  FROM public.grant_versions gv
  WHERE gv.id = _version_id;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_claude_prompt_template(_version_id uuid, _template text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.grant_versions
  SET claude_prompt_template = _template
  WHERE id = _version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_grant_version_guidelines(
  _version_id uuid,
  _raw_text text,
  _ai_suggestions jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.grant_versions
  SET guidelines_raw_text = _raw_text,
      ai_suggestions_json = COALESCE(_ai_suggestions, ai_suggestions_json)
  WHERE id = _version_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_grant_version_sensitive(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_claude_prompt_template(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_grant_version_guidelines(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_grant_version_sensitive(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_claude_prompt_template(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_grant_version_guidelines(uuid, text, jsonb) TO authenticated, service_role;

-- 3. Add admin checks to admin-only SECURITY DEFINER helpers
CREATE OR REPLACE FUNCTION public.get_report_trend_7_days()
RETURNS TABLE(date date, started integer, completed integer, failed integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    DATE(rr.created_at) AS date,
    COUNT(*)::INTEGER AS started,
    SUM(CASE WHEN rr.status = 'completed' THEN 1 ELSE 0 END)::INTEGER AS completed,
    SUM(CASE WHEN rr.status = 'failed' THEN 1 ELSE 0 END)::INTEGER AS failed
  FROM public.report_runs rr
  WHERE rr.created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE(rr.created_at)
  ORDER BY 1 DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_step_numbers(step_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  i INTEGER := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(step_updates)
  LOOP
    i := i - 1;
    UPDATE prompt_bundle_steps SET step_number = i WHERE id = (item->>'id')::UUID;
  END LOOP;

  FOR item IN SELECT * FROM jsonb_array_elements(step_updates)
  LOOP
    UPDATE prompt_bundle_steps SET step_number = (item->>'step_number')::INTEGER WHERE id = (item->>'id')::UUID;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.swap_step_numbers(step_id_a uuid, step_id_b uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  num_a INTEGER;
  num_b INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT step_number INTO num_a FROM prompt_bundle_steps WHERE id = step_id_a;
  SELECT step_number INTO num_b FROM prompt_bundle_steps WHERE id = step_id_b;

  UPDATE prompt_bundle_steps SET step_number = -1 WHERE id = step_id_a;
  UPDATE prompt_bundle_steps SET step_number = num_a WHERE id = step_id_b;
  UPDATE prompt_bundle_steps SET step_number = num_b WHERE id = step_id_a;
END;
$$;

-- 4. Revoke public/anon execute on internal SECURITY DEFINER helpers
REVOKE ALL ON FUNCTION public.decrement_entitlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_entitlement(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.execute_readonly_query(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_readonly_query(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_report_trend_7_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_report_trend_7_days() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reorder_step_numbers(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_step_numbers(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.swap_step_numbers(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_step_numbers(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_audit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;