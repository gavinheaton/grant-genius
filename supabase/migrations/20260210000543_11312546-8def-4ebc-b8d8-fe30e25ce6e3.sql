
-- Atomic swap of two step numbers (avoids unique constraint violation)
CREATE OR REPLACE FUNCTION public.swap_step_numbers(step_id_a UUID, step_id_b UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  num_a INTEGER;
  num_b INTEGER;
BEGIN
  SELECT step_number INTO num_a FROM prompt_bundle_steps WHERE id = step_id_a;
  SELECT step_number INTO num_b FROM prompt_bundle_steps WHERE id = step_id_b;
  
  UPDATE prompt_bundle_steps SET step_number = -1 WHERE id = step_id_a;
  UPDATE prompt_bundle_steps SET step_number = num_a WHERE id = step_id_b;
  UPDATE prompt_bundle_steps SET step_number = num_b WHERE id = step_id_a;
END;
$$;

-- Bulk reorder: accepts JSON array of [{id, step_number}]
CREATE OR REPLACE FUNCTION public.reorder_step_numbers(step_updates JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item JSONB;
  i INTEGER := 0;
BEGIN
  -- Pass 1: set all to negative offsets to avoid conflicts
  FOR item IN SELECT * FROM jsonb_array_elements(step_updates)
  LOOP
    i := i - 1;
    UPDATE prompt_bundle_steps SET step_number = i WHERE id = (item->>'id')::UUID;
  END LOOP;
  
  -- Pass 2: set to final values
  FOR item IN SELECT * FROM jsonb_array_elements(step_updates)
  LOOP
    UPDATE prompt_bundle_steps SET step_number = (item->>'step_number')::INTEGER WHERE id = (item->>'id')::UUID;
  END LOOP;
END;
$$;
