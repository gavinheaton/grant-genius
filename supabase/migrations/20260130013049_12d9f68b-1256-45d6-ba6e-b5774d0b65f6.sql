-- Drop the old step_number constraint (0-12) and add new one (0-14)
ALTER TABLE prompt_bundle_steps DROP CONSTRAINT prompt_bundle_steps_step_number_check;
ALTER TABLE prompt_bundle_steps ADD CONSTRAINT prompt_bundle_steps_step_number_check CHECK (step_number >= 0 AND step_number <= 14);

-- Update total_steps default from 13 to 15
ALTER TABLE report_runs ALTER COLUMN total_steps SET DEFAULT 15;

-- Insert Step 13: build_tables_sources
INSERT INTO prompt_bundle_steps (
  bundle_id,
  step_number,
  step_name,
  step_description,
  prompt_template,
  model_override,
  timeout_seconds
) VALUES (
  '90e0e5bd-f625-47c9-83a0-08821153c895',
  13,
  'build_tables_sources',
  'Build all tables and deduplicated source list',
  'You are building the tables and source list for a grant report.

## STEP OUTPUTS (JSON from research pipeline)

Step 0 - Source Pack: {{step0}}
Step 4 - Existing Competitors: {{step4}}
Step 5 - Market Sizing Source Pack: {{step5}}
Step 6 - TAM: {{step6}}
Step 7 - SAM: {{step7}}
Step 8 - SOM: {{step8}}
Step 9 - Economic Impact: {{step9}}
Step 10 - Competitor Table: {{step10}}
Step 11 - Partner Businesses: {{step11}}
Step 12 - Assembled Sections: {{step12}}

## TASK

Extract and consolidate ALL tables and sources from the step outputs.

For TABLES:
1. Market Sizing Table (TAM/SAM/SOM consolidated with sources)
2. Assumptions Table (all assumptions with confidence levels)
3. Competitor Comparison Table
4. Partner Businesses Table
5. Economic Impact Table
6. Any additional tables from step outputs

For SOURCES:
1. Collect ALL sources referenced in any step output
2. Deduplicate by URL
3. Format each in MLA style with Accessed date
4. Assign sequential IDs (S1, S2, etc.)

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "tables": [
    {"title": string, "markdown": string, "section": string}
  ],
  "all_sources": [
    {"id": "S1", "mla": string, "url": string}
  ]
}',
  'google/gemini-3-flash-preview',
  55
);

-- Insert Step 14: finalize_report
INSERT INTO prompt_bundle_steps (
  bundle_id,
  step_number,
  step_name,
  step_description,
  prompt_template,
  model_override,
  timeout_seconds
) VALUES (
  '90e0e5bd-f625-47c9-83a0-08821153c895',
  14,
  'finalize_report',
  'Merge sections, tables, and sources into final report JSON',
  'You are finalizing a grant report for Australian government assessors.

## INPUTS

Step 12 - Report Sections (Markdown):
{{step12}}

Step 13 - Tables and Sources:
{{step13}}

## TASK

Merge the report sections with the tables and sources into the final report structure.

1. Take report_markdown from Step 12
2. Integrate tables from Step 13 into appropriate sections
3. Add the all_sources list from Step 13
4. Collect all data_gaps mentioned across steps into data_gaps array
5. Validate that citation markers [S#] in the markdown match IDs in all_sources

## OUTPUT FORMAT

Return ONLY valid JSON matching this exact schema:
{
  "title": string,
  "report_markdown": string,
  "tables": [{"title": string, "markdown": string, "section": string}],
  "all_sources": [{"id": "S1", "mla": string, "url": string}],
  "data_gaps": [{"gap": string, "why_missing": string, "needed_source": string}]
}

CRITICAL: Ensure report_markdown is a complete, assessor-ready document.',
  'google/gemini-2.5-flash-lite',
  45
);