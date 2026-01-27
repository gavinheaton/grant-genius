-- Create pdf_templates table for admin-configurable PDF settings
CREATE TABLE public.pdf_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default',
  is_default boolean NOT NULL DEFAULT false,
  page_format text NOT NULL DEFAULT 'A4',
  margins_json jsonb NOT NULL DEFAULT '{"top": 20, "right": 20, "bottom": 20, "left": 20}'::jsonb,
  logo_path text,
  header_text text DEFAULT '',
  footer_text text DEFAULT 'Page {page} of {pages}',
  disclaimer_text text DEFAULT '',
  primary_color text NOT NULL DEFAULT '#1e3a5f',
  secondary_color text NOT NULL DEFAULT '#d97706',
  font_family text NOT NULL DEFAULT 'Inter',
  heading_sizes_json jsonb NOT NULL DEFAULT '{"h1": 28, "h2": 22, "h3": 18, "body": 12}'::jsonb,
  include_cover_page boolean NOT NULL DEFAULT true,
  include_toc boolean NOT NULL DEFAULT true,
  section_page_breaks boolean NOT NULL DEFAULT false,
  watermark_text text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pdf_templates ENABLE ROW LEVEL SECURITY;

-- Only admins can manage PDF templates
CREATE POLICY "Admins can manage pdf templates"
  ON public.pdf_templates
  FOR ALL
  USING (is_admin(auth.uid()));

-- Anyone authenticated can view templates (needed for PDF generation)
CREATE POLICY "Authenticated users can view pdf templates"
  ON public.pdf_templates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_pdf_templates_updated_at
  BEFORE UPDATE ON public.pdf_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create audit trigger for pdf_templates
CREATE TRIGGER audit_pdf_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.pdf_templates
  FOR EACH ROW
  EXECUTE FUNCTION log_audit();

-- Insert default template
INSERT INTO public.pdf_templates (name, is_default)
VALUES ('Default Template', true);

-- Create storage bucket for PDF assets (logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdf-assets', 'pdf-assets', true);

-- Create storage bucket for generated reports (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false);

-- RLS policies for pdf-assets bucket (public read, admin write)
CREATE POLICY "Anyone can view pdf assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pdf-assets');

CREATE POLICY "Admins can upload pdf assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pdf-assets' AND is_admin(auth.uid()));

CREATE POLICY "Admins can update pdf assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'pdf-assets' AND is_admin(auth.uid()));

CREATE POLICY "Admins can delete pdf assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'pdf-assets' AND is_admin(auth.uid()));

-- RLS policies for reports bucket (users can only access their own reports)
CREATE POLICY "Users can view own report files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reports' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "System can upload report files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'reports');

CREATE POLICY "System can update report files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'reports');