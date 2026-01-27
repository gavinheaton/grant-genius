-- Add checkpoint columns to report_runs
ALTER TABLE report_runs 
ADD COLUMN IF NOT EXISTS checkpoint_data_json jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS checkpoint_citations_json jsonb DEFAULT '[]';

-- Add report_run_id to entitlement_consumptions for tracking which run consumed which credit
ALTER TABLE entitlement_consumptions
ADD COLUMN IF NOT EXISTS report_run_id uuid REFERENCES report_runs(id);

-- Create safe decrement function for credit refunds
CREATE OR REPLACE FUNCTION public.decrement_entitlement(ent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE entitlements 
  SET used_quantity = GREATEST(0, used_quantity - 1)
  WHERE id = ent_id;
END;
$$;