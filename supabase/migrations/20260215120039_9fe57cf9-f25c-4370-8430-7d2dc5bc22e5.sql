
-- Create homepage_sections table for dynamic landing page builder
CREATE TABLE public.homepage_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  heading TEXT,
  subheading TEXT,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public landing page)
CREATE POLICY "Anyone can read homepage sections"
ON public.homepage_sections
FOR SELECT
USING (true);

-- Admins can insert
CREATE POLICY "Admins can insert homepage sections"
ON public.homepage_sections
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Admins can update
CREATE POLICY "Admins can update homepage sections"
ON public.homepage_sections
FOR UPDATE
USING (is_admin(auth.uid()));

-- Admins can delete
CREATE POLICY "Admins can delete homepage sections"
ON public.homepage_sections
FOR DELETE
USING (is_admin(auth.uid()));

-- Create index for ordering
CREATE INDEX idx_homepage_sections_sort_order ON public.homepage_sections (sort_order);

-- Create trigger for updated_at
CREATE TRIGGER update_homepage_sections_updated_at
BEFORE UPDATE ON public.homepage_sections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
