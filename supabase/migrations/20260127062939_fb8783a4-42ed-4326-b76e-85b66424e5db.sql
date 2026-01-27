-- Add RLS policy for admins to view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_admin(auth.uid()));

-- Create audit logging trigger function
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (entity_type, entity_id, action, user_id, old_value_json, new_value_json)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),
    CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for grants table
CREATE TRIGGER audit_grants
  AFTER INSERT OR UPDATE OR DELETE ON public.grants
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Create triggers for grant_versions table
CREATE TRIGGER audit_grant_versions
  AFTER INSERT OR UPDATE OR DELETE ON public.grant_versions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Create triggers for email_templates table
CREATE TRIGGER audit_email_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();