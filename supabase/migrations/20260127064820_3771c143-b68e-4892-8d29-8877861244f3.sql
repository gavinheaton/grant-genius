-- Add columns to grant_versions for guidelines analysis
ALTER TABLE public.grant_versions
ADD COLUMN IF NOT EXISTS guidelines_source_path TEXT,
ADD COLUMN IF NOT EXISTS guidelines_raw_text TEXT,
ADD COLUMN IF NOT EXISTS ai_analysis_status TEXT DEFAULT 'pending' CHECK (ai_analysis_status IN ('pending', 'analyzing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS ai_suggestions_json JSONB DEFAULT '{}'::jsonb;

-- Create storage bucket for grant guidelines PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('grant-guidelines', 'grant-guidelines', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Only admins can manage files in grant-guidelines bucket
CREATE POLICY "Admins can upload grant guidelines"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'grant-guidelines' 
  AND public.is_admin(auth.uid())
);

CREATE POLICY "Admins can view grant guidelines"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'grant-guidelines' 
  AND public.is_admin(auth.uid())
);

CREATE POLICY "Admins can update grant guidelines"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'grant-guidelines' 
  AND public.is_admin(auth.uid())
);

CREATE POLICY "Admins can delete grant guidelines"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'grant-guidelines' 
  AND public.is_admin(auth.uid())
);