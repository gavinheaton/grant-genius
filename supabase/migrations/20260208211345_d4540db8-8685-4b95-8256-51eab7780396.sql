-- Add max_output_tokens column to prompt_bundle_steps table
ALTER TABLE prompt_bundle_steps 
ADD COLUMN max_output_tokens integer DEFAULT NULL;

COMMENT ON COLUMN prompt_bundle_steps.max_output_tokens IS 
  'Maximum output tokens for AI response. NULL uses model default (~8K). Recommended: 20K for research, 24K for market sizing, 32K for assembly.';