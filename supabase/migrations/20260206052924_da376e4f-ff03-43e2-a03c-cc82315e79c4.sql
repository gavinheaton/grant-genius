-- Add step_type column to support different execution modes
-- 'ai_prompt' (default): Standard AI inference step
-- 'firecrawl_search': Web search using Firecrawl API
-- 'firecrawl_scrape': URL scraping using Firecrawl API

ALTER TABLE public.prompt_bundle_steps 
ADD COLUMN IF NOT EXISTS step_type TEXT DEFAULT 'ai_prompt';

-- Add check constraint for valid step types
ALTER TABLE public.prompt_bundle_steps
ADD CONSTRAINT prompt_bundle_steps_step_type_check 
CHECK (step_type IN ('ai_prompt', 'firecrawl_search', 'firecrawl_scrape'));

-- Add step_config_json for step-specific configuration
-- For firecrawl_search: { query_template, limit, scrape_results, site_filters }
-- For firecrawl_scrape: { url_variable, formats }
ALTER TABLE public.prompt_bundle_steps 
ADD COLUMN IF NOT EXISTS step_config_json JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.prompt_bundle_steps.step_type IS 'Execution mode: ai_prompt (LLM), firecrawl_search (web search), firecrawl_scrape (URL scrape)';
COMMENT ON COLUMN public.prompt_bundle_steps.step_config_json IS 'Step-specific config. Search: {query_template, limit}. Scrape: {url_variable, formats}';