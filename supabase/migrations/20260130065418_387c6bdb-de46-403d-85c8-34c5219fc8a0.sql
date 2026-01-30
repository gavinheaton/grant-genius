-- Add guardrail columns to prompt_bundle_steps
ALTER TABLE public.prompt_bundle_steps
ADD COLUMN is_heavy boolean DEFAULT false,
ADD COLUMN max_expected_seconds integer;

-- Set default heavy steps based on known timeout-prone steps
UPDATE public.prompt_bundle_steps
SET is_heavy = true
WHERE step_number IN (0, 6, 7, 8, 12, 13);

-- Add documentation comments
COMMENT ON COLUMN public.prompt_bundle_steps.is_heavy IS 'Marks step as too heavy for edge execution (>45s typical)';
COMMENT ON COLUMN public.prompt_bundle_steps.max_expected_seconds IS 'Expected max runtime in seconds for monitoring/alerts';