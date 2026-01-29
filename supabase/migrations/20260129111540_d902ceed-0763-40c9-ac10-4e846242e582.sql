-- Add timeout_seconds column to prompt_bundle_steps table
ALTER TABLE prompt_bundle_steps 
ADD COLUMN timeout_seconds integer DEFAULT NULL;