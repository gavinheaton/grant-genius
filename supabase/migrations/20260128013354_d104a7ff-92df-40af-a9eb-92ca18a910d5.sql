-- Remove the step_number check constraint to allow step 11
ALTER TABLE prompt_bundle_steps DROP CONSTRAINT IF EXISTS prompt_bundle_steps_step_number_check;

-- Add a new constraint that allows steps 1-11
ALTER TABLE prompt_bundle_steps ADD CONSTRAINT prompt_bundle_steps_step_number_check CHECK (step_number >= 1 AND step_number <= 11);

-- Add Step 11 (Assemble Final Report) to all existing prompt bundles
INSERT INTO prompt_bundle_steps (bundle_id, step_number, step_name, step_description, prompt_template, model_override)
SELECT 
  id AS bundle_id,
  11 AS step_number,
  'assemble_report' AS step_name,
  'Assemble Final Grant Report' AS step_description,
  'You are assembling a final grant report for Australian government assessors.

Grant: {{grantName}} ({{grantVersionLabel}})

## STEP OUTPUTS (raw JSON from research pipeline)

Step 1 - Research Context: {{step1}}
Step 2 - Competitor Research: {{step2}}
Step 3 - Market Segments: {{step3}}
Step 4 - Existing Competitors: {{step4}}
Step 5 - TAM: {{step5}}
Step 6 - SAM: {{step6}}
Step 7 - SOM: {{step7}}
Step 8 - Economic Impact: {{step8}}
Step 9 - Competitor Table: {{step9}}
Step 10 - Partner Businesses: {{step10}}

## TASK

Parse and merge these outputs into ONE coherent report for Australian government grant assessors.

RULES:
- Use ONLY validated facts from step outputs
- Every numeric claim must have a citation marker [S#]
- If an output contains an assumption, label it (High/Med/Low confidence)
- Remove internal process phrasing ("in Step X", "your instructions")
- Eliminate placeholders - add missing items to Data Gaps section

## MANDATORY REPORT STRUCTURE

1. Executive Summary (8-12 bullets, each with [S#] citation)
2. Research Context and Innovation
3. Unmet Need and Australian Relevance
4. Commercialisation Pathways (3 Segments: product, customer, value prop, AU angle, GTM hypothesis)
5. Competitive Landscape and Differentiation (2-5 comparators per segment with evidence)
6. Market Sizing (TAM/SAM/SOM consolidated table + Assumptions table)
7. Indicative Economic Impact to Australia (2+ quantified pathways)
8. Potential Australian Partners (ANZSIC mapping + candidates table)
9. Key Risks and Mitigations
10. Data Gaps and Validation Needs
11. References (MLA, deduplicated by URL, with Accessed date)

## OUTPUT FORMAT

Return ONLY valid JSON with this schema:
{
  "title": string,
  "report_markdown": string,
  "tables": [{"title": string, "markdown": string, "section": string}],
  "all_sources": [{"id": "S1", "mla": string, "url": string}],
  "data_gaps": [{"gap": string, "why_missing": string, "needed_source": string}]
}

STYLE: Formal, concise, assessor-ready. Australia-first framing. Explicit about assumptions and confidence.' AS prompt_template,
  'google/gemini-3-pro-preview' AS model_override
FROM prompt_bundles
WHERE NOT EXISTS (
  SELECT 1 FROM prompt_bundle_steps 
  WHERE prompt_bundle_steps.bundle_id = prompt_bundles.id 
  AND prompt_bundle_steps.step_number = 11
);