-- Create docx-templates storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('docx-templates', 'docx-templates', false);

-- RLS policies for docx-templates bucket
CREATE POLICY "Admins can upload docx templates"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'docx-templates' AND is_admin(auth.uid()));

CREATE POLICY "Admins can update docx templates"
ON storage.objects FOR UPDATE
USING (bucket_id = 'docx-templates' AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete docx templates"
ON storage.objects FOR DELETE
USING (bucket_id = 'docx-templates' AND is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read docx templates"
ON storage.objects FOR SELECT
USING (bucket_id = 'docx-templates' AND auth.uid() IS NOT NULL);

-- Create docx_templates table
CREATE TABLE public.docx_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  template_path TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  placeholder_schema_json JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.docx_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for docx_templates
CREATE POLICY "Admins can manage docx templates"
ON public.docx_templates FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view docx templates"
ON public.docx_templates FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Add updated_at trigger
CREATE TRIGGER update_docx_templates_updated_at
BEFORE UPDATE ON public.docx_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();