-- Add phase column to report_runs for pipeline coordination
ALTER TABLE report_runs 
ADD COLUMN phase TEXT DEFAULT 'research' 
CHECK (phase IN ('research', 'assembly', 'complete'));

-- Add is_assembly_step to prompt_bundle_steps to mark assembly steps
ALTER TABLE prompt_bundle_steps 
ADD COLUMN is_assembly_step BOOLEAN DEFAULT false;

-- Mark existing assembly steps in all bundles
UPDATE prompt_bundle_steps 
SET is_assembly_step = true 
WHERE step_name IN (
  'assemble_sections_html', 
  'build_tables_sources_html', 
  'finalize_report_html'
);