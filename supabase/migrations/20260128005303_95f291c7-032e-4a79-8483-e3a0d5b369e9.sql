-- Create prompt_bundles table
CREATE TABLE public.prompt_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  system_prompt TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create prompt_bundle_steps table
CREATE TABLE public.prompt_bundle_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.prompt_bundles(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number >= 1 AND step_number <= 10),
  step_name TEXT NOT NULL,
  step_description TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  model_override TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(bundle_id, step_number)
);

-- Enable RLS
ALTER TABLE public.prompt_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_bundle_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prompt_bundles
CREATE POLICY "Admins can view all prompt bundles"
  ON public.prompt_bundles FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Super admins can insert prompt bundles"
  ON public.prompt_bundles FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update prompt bundles"
  ON public.prompt_bundles FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete prompt bundles"
  ON public.prompt_bundles FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS Policies for prompt_bundle_steps
CREATE POLICY "Admins can view all prompt bundle steps"
  ON public.prompt_bundle_steps FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Super admins can insert prompt bundle steps"
  ON public.prompt_bundle_steps FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update prompt bundle steps"
  ON public.prompt_bundle_steps FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete prompt bundle steps"
  ON public.prompt_bundle_steps FOR DELETE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Trigger for updated_at on prompt_bundles
CREATE TRIGGER update_prompt_bundles_updated_at
  BEFORE UPDATE ON public.prompt_bundles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on prompt_bundle_steps
CREATE TRIGGER update_prompt_bundle_steps_updated_at
  BEFORE UPDATE ON public.prompt_bundle_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Audit logging triggers
CREATE TRIGGER audit_prompt_bundles
  AFTER INSERT OR UPDATE OR DELETE ON public.prompt_bundles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit();

CREATE TRIGGER audit_prompt_bundle_steps
  AFTER INSERT OR UPDATE OR DELETE ON public.prompt_bundle_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit();

-- Insert default bundle with current hardcoded prompts
INSERT INTO public.prompt_bundles (id, name, description, is_active, system_prompt)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Bundle',
  'The original 10-step research commercialization pipeline prompts.',
  true,
  'You are a research commercialization expert helping prepare grant applications. Provide detailed, well-researched responses. Always cite sources where possible. If data cannot be validated, clearly indicate this.'
);

-- Insert all 10 step prompts
INSERT INTO public.prompt_bundle_steps (bundle_id, step_number, step_name, step_description, prompt_template, model_override) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  1,
  'extract_context',
  'Extracting research context from article',
  'You are analyzing research for commercialization potential.

Research Summary: {{summary}}
Article URL: {{publicArticleUrl}}
{{#articleContent}}Article Content:
{{articleContent}}{{/articleContent}}
{{#trl}}Technology Readiness Level: {{trl}}{{/trl}}
{{#ipStatus}}IP Status: {{ipStatus}}{{/ipStatus}}

Extract and summarize:
1. The core research innovation
2. Key technologies or methods involved
3. Potential applications
4. Current stage of development

Provide a structured analysis.',
  'google/gemini-2.5-flash-lite'
),
(
  '00000000-0000-0000-0000-000000000001',
  2,
  'competitor_research',
  'Searching for competing research',
  'Based on this research:
{{summary}}

Search for and identify competing or similar research projects from other researchers worldwide. Include:
1. Names of competing research groups/universities
2. Brief description of their work
3. Key differences from our research
4. Publication dates and status

Format as a structured list. If you cannot find specific examples, indicate this clearly with "No validated sources found" for that area.',
  'google/gemini-2.5-flash-lite'
),
(
  '00000000-0000-0000-0000-000000000001',
  3,
  'market_segments',
  'Identifying market segments',
  'Based on this research innovation:
{{summary}}

Identify at least 3 different market segments where this research could be commercialized as a product or service. At least one must be in Australia.

For each segment provide:
1. Segment name
2. Target customers
3. Product/service concept
4. Geographic focus (include at least one Australian market)
5. Estimated market size category (small/medium/large)

Be specific and practical.',
  'google/gemini-2.5-flash-lite'
),
(
  '00000000-0000-0000-0000-000000000001',
  4,
  'find_competitors',
  'Finding existing competitors',
  'Based on the market segments identified for this research:
{{summary}}

Market Segments:
{{marketSegments}}

Find companies that may already have products or services in these markets. For each competitor:
1. Company name
2. Product/service name
3. Estimated market share or revenue if available
4. Geographic presence
5. How they compare to the proposed research

Note: If specific market data cannot be validated, mark as "Data not available - requires further research".',
  'google/gemini-3-flash-preview'
),
(
  '00000000-0000-0000-0000-000000000001',
  5,
  'calculate_tam',
  'Calculating Total Addressable Market',
  'Calculate the Total Addressable Market (TAM) for the research commercialization:

Research: {{summary}}
Market Segments: {{marketSegments}}

Using data from validated sources (OECD, World Bank, ABS, industry reports), estimate TAM for each market segment:
1. Market size in USD/AUD
2. Data source and year
3. Growth rate if available
4. Key assumptions

IMPORTANT: Only use numbers from validated sources. If you cannot find validated data, clearly state "Validated data not available - estimate based on [methodology]".',
  'google/gemini-3-flash-preview'
),
(
  '00000000-0000-0000-0000-000000000001',
  6,
  'calculate_sam',
  'Calculating Serviceable Addressable Market',
  'Based on the TAM analysis:
{{tam}}

Calculate the Serviceable Addressable Market (SAM) - the portion of TAM that can realistically be served:
1. Geographic limitations
2. Customer segment focus
3. Distribution capabilities
4. Regulatory constraints

Provide SAM for each market segment with clear methodology.',
  'google/gemini-3-flash-preview'
),
(
  '00000000-0000-0000-0000-000000000001',
  7,
  'calculate_som',
  'Calculating Serviceable Obtainable Market',
  'Based on the SAM analysis:
{{sam}}

Calculate a realistic Serviceable Obtainable Market (SOM) - what can actually be captured:
1. First year targets
2. 3-year projections
3. 5-year projections
4. Market penetration assumptions
5. Competitive dynamics

Be conservative and realistic in estimates.',
  'google/gemini-3-flash-preview'
),
(
  '00000000-0000-0000-0000-000000000001',
  8,
  'economic_impact',
  'Analyzing Australian economic impact',
  'Based on the SOM projections:
{{som}}

Calculate the likely economic impact to the Australian economy from commercializing this research:
1. Direct revenue in Australia
2. Job creation potential
3. Export opportunities
4. IP licensing revenue
5. Tax contribution estimates
6. Industry development benefits
7. Knowledge economy contribution

Provide 5-year projections where possible.',
  'google/gemini-2.5-flash-lite'
),
(
  '00000000-0000-0000-0000-000000000001',
  9,
  'competitor_table',
  'Building competitor comparison',
  'Create a competitor comparison table based on:

Our Products: {{marketSegments}}
Existing Competitors: {{existingCompetitors}}

Build a markdown table comparing:
| Feature | Our Solution | Competitor 1 | Competitor 2 | Competitor 3 |
|---------|--------------|--------------|--------------|--------------|
| Feature Set | | | | |
| User Experience | | | | |
| Price Point | | | | |
| Technology | | | | |
| Market Focus | | | | |

Fill in with specific comparisons.',
  'google/gemini-2.5-flash-lite'
),
(
  '00000000-0000-0000-0000-000000000001',
  10,
  'partner_businesses',
  'Finding Australian partner businesses',
  'Based on the ANZSIC Industry Codes, identify Australian businesses that could partner for commercialization:

Research: {{summary}}
Market Segments: {{marketSegments}}

1. Identify relevant ANZSIC codes
2. For each code, list 3-5 Australian businesses operating in that classification
3. Include company name, location, size, and potential partnership type
4. Focus on businesses that could:
   - Provide distribution
   - Offer co-development
   - License the technology
   - Invest in the venture

Use the ANZSIC hierarchy for classification.',
  'google/gemini-2.5-flash-lite'
);