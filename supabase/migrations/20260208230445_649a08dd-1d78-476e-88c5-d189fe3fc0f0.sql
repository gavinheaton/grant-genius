-- Add entitlement_consumption_id column to applications table
-- This tracks which credit was consumed for manual report submissions
ALTER TABLE public.applications
ADD COLUMN entitlement_consumption_id uuid REFERENCES public.entitlement_consumptions(id);

-- Add index for faster lookups
CREATE INDEX idx_applications_entitlement_consumption_id 
ON public.applications(entitlement_consumption_id) 
WHERE entitlement_consumption_id IS NOT NULL;