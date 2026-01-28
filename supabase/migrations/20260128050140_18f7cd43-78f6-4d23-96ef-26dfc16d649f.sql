-- Add new columns to pdf_templates for branding and cover layout
ALTER TABLE pdf_templates 
ADD COLUMN IF NOT EXISTS show_grant_genius_branding BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS powered_by_text TEXT DEFAULT 'Powered by Disruptors Co',
ADD COLUMN IF NOT EXISTS cover_layout_json JSONB DEFAULT '{
  "logo_position": "center",
  "title_text": "Commercialisation Research Report",
  "subtitle_template": "{grant_name}",
  "show_date": true,
  "show_version": true,
  "background_style": "solid"
}'::jsonb;

-- Create color_palettes table for saving custom palettes
CREATE TABLE IF NOT EXISTS public.color_palettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  is_preset BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on color_palettes
ALTER TABLE public.color_palettes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view palettes
CREATE POLICY "Authenticated users can view palettes"
ON public.color_palettes
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Admins can manage palettes
CREATE POLICY "Admins can manage palettes"
ON public.color_palettes
FOR ALL
USING (is_admin(auth.uid()));

-- Insert preset color palettes
INSERT INTO public.color_palettes (name, primary_color, secondary_color, is_preset) VALUES
  ('Professional Navy', '#1e3a5f', '#d97706', true),
  ('Modern Green', '#166534', '#0ea5e9', true),
  ('Academic Burgundy', '#7f1d1d', '#ca8a04', true),
  ('Corporate Blue', '#1e40af', '#4f46e5', true),
  ('Elegant Slate', '#0f172a', '#64748b', true),
  ('Tech Purple', '#4c1d95', '#8b5cf6', true)
ON CONFLICT DO NOTHING;