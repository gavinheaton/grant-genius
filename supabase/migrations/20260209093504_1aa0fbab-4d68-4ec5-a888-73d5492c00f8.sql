-- Create CMS pages table for static content management
CREATE TABLE public.cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content_html TEXT DEFAULT '',
  is_published BOOLEAN DEFAULT false,
  show_in_menu BOOLEAN DEFAULT false,
  show_in_footer BOOLEAN DEFAULT false,
  menu_order INTEGER DEFAULT 0,
  requires_auth BOOLEAN DEFAULT false,
  meta_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create index on slug for fast lookups
CREATE INDEX idx_cms_pages_slug ON public.cms_pages(slug);

-- Create index for menu queries
CREATE INDEX idx_cms_pages_menu ON public.cms_pages(is_published, show_in_menu, menu_order);

-- Enable RLS
ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;

-- Public can read published pages that don't require auth
CREATE POLICY "Anyone can view public published pages"
ON public.cms_pages
FOR SELECT
USING (is_published = true AND requires_auth = false);

-- Authenticated users can read published pages that require auth
CREATE POLICY "Authenticated users can view auth-required pages"
ON public.cms_pages
FOR SELECT
TO authenticated
USING (is_published = true AND requires_auth = true);

-- Admins can view all pages (including drafts)
CREATE POLICY "Admins can view all pages"
ON public.cms_pages
FOR SELECT
USING (is_admin(auth.uid()));

-- Admins can insert pages
CREATE POLICY "Admins can create pages"
ON public.cms_pages
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Admins can update pages
CREATE POLICY "Admins can update pages"
ON public.cms_pages
FOR UPDATE
USING (is_admin(auth.uid()));

-- Admins can delete pages
CREATE POLICY "Admins can delete pages"
ON public.cms_pages
FOR DELETE
USING (is_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_cms_pages_updated_at
BEFORE UPDATE ON public.cms_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();