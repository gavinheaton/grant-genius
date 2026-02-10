
-- Create homepage_settings table (single-row config pattern)
CREATE TABLE public.homepage_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_image_url text,
  hero_badge_text text DEFAULT 'For Australian University Researchers',
  hero_headline text DEFAULT 'Win More Commercialisation Grants with AI-Assisted Applications',
  hero_subheadline text DEFAULT 'Transform your research into compelling grant applications. Our AI-powered assistant helps you structure, write, and refine your commercialisation proposals with evidence-based recommendations.',
  hero_cta_primary_text text DEFAULT 'Start Your Application',
  hero_cta_primary_link text DEFAULT '/auth',
  hero_cta_secondary_text text DEFAULT 'View Pricing',
  hero_cta_secondary_link text DEFAULT '#pricing',
  hero_trust_items jsonb DEFAULT '[{"icon":"FileCheck","label":"Evidence-Based Sections"},{"icon":"Shield","label":"University-Grade Security"},{"icon":"Sparkles","label":"AI-Powered Insights"}]'::jsonb,
  features_heading text DEFAULT 'Everything You Need to Win Grants',
  features_subheading text DEFAULT 'From initial research summary to final submission-ready documents, our platform guides you through every step.',
  features_items jsonb DEFAULT '[{"icon":"FileText","title":"Smart Application Builder","description":"Guided workflow with grant-specific inputs tailored to Australian commercialisation programs."},{"icon":"Zap","title":"AI-Powered Sections","description":"Generate compelling narrative sections with proper structure, citations, and evidence linking."},{"icon":"Database","title":"Evidence Library","description":"Organize your research papers, patents, and supporting documents with automatic citation tracking."},{"icon":"CheckCircle","title":"Compliance Checks","description":"Automated validation against grant requirements and rubric criteria before submission."},{"icon":"Download","title":"Export Ready","description":"Generate professionally formatted PDF and DOCX reports ready for submission."},{"icon":"Lock","title":"Secure & Private","description":"Your research data is encrypted and never shared. University-grade security standards."}]'::jsonb,
  pricing_heading text DEFAULT 'Simple, Transparent Pricing',
  pricing_subheading text DEFAULT 'Pay only for what you need. No subscriptions, no hidden fees.',
  pricing_plans jsonb DEFAULT '[{"type":"single","name":"Single Report","basePrice":"$45","gstNote":"+ GST ($49.50 inc. GST)","description":"Perfect for a single grant application","features":["1 Complete Application Report","All Grant-Specific Sections","Evidence Library Access","PDF & DOCX Export","Compliance Validation"],"cta":"Purchase Report","highlighted":false},{"type":"bundle","name":"Report 10-Pack","basePrice":"$400","gstNote":"+ GST ($440 inc. GST)","description":"Best value for multiple applications","features":["10 Report Credits","All Grant-Specific Sections","Evidence Library Access","PDF & DOCX Export","Compliance Validation","Save $50 vs individual"],"cta":"Purchase 10-Pack","highlighted":true}]'::jsonb,
  pricing_footer_note text DEFAULT 'All prices in AUD. GST applies to Australian customers. Have a coupon? Enter it at checkout.',
  footer_brand_description text DEFAULT 'Empowering researchers to win commercialisation grants with AI-assisted applications.',
  footer_columns jsonb DEFAULT '[]'::jsonb,
  footer_copyright text DEFAULT '© {year} Grant Genius · Powered by Disruptors Co',
  footer_support_email text DEFAULT 'support@grantgenius.com.au',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Enable RLS
ALTER TABLE public.homepage_settings ENABLE ROW LEVEL SECURITY;

-- Public read access (landing page)
CREATE POLICY "Anyone can read homepage settings"
ON public.homepage_settings
FOR SELECT
USING (true);

-- Admin-only write access
CREATE POLICY "Admins can update homepage settings"
ON public.homepage_settings
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert homepage settings"
ON public.homepage_settings
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Seed with one default row
INSERT INTO public.homepage_settings (id) VALUES (gen_random_uuid());

-- Create storage bucket for homepage assets
INSERT INTO storage.buckets (id, name, public) VALUES ('homepage-assets', 'homepage-assets', true);

-- Public read for homepage assets
CREATE POLICY "Homepage assets are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'homepage-assets');

-- Admin upload for homepage assets
CREATE POLICY "Admins can upload homepage assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'homepage-assets' AND public.is_admin(auth.uid()));

-- Admin update for homepage assets
CREATE POLICY "Admins can update homepage assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'homepage-assets' AND public.is_admin(auth.uid()));

-- Admin delete for homepage assets
CREATE POLICY "Admins can delete homepage assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'homepage-assets' AND public.is_admin(auth.uid()));
