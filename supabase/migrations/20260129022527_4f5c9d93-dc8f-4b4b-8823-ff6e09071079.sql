-- STEP 4.5: Market Sizing Source Pack Migration
-- This adds a new step between "Find Competitors" (step 4) and "Calculate TAM" (currently step 5)
-- Steps 5-11 become 6-12, new step 5 is Market Sizing Source Pack
-- Total steps: 12 → 13 (0-12)

-- Step 1: Drop the existing check constraint
ALTER TABLE prompt_bundle_steps 
  DROP CONSTRAINT IF EXISTS prompt_bundle_steps_step_number_check;

-- Step 2: Add updated constraint (0-12)
ALTER TABLE prompt_bundle_steps 
  ADD CONSTRAINT prompt_bundle_steps_step_number_check 
  CHECK (step_number >= 0 AND step_number <= 12);

-- Step 3: Renumber existing steps in DESCENDING order to avoid conflicts
-- 11 → 12 (assemble_report)
UPDATE prompt_bundle_steps 
SET step_number = 12,
    step_name = 'assemble_report',
    step_description = 'Assembling final grant report'
WHERE step_number = 11;

-- 10 → 11 (partner_businesses)
UPDATE prompt_bundle_steps 
SET step_number = 11
WHERE step_number = 10;

-- 9 → 10 (competitor_table)
UPDATE prompt_bundle_steps 
SET step_number = 10
WHERE step_number = 9;

-- 8 → 9 (economic_impact)
UPDATE prompt_bundle_steps 
SET step_number = 9
WHERE step_number = 8;

-- 7 → 8 (calculate_som)
UPDATE prompt_bundle_steps 
SET step_number = 8
WHERE step_number = 7;

-- 6 → 7 (calculate_sam)
UPDATE prompt_bundle_steps 
SET step_number = 7
WHERE step_number = 6;

-- 5 → 6 (calculate_tam)
UPDATE prompt_bundle_steps 
SET step_number = 6
WHERE step_number = 5;

-- Step 4: Insert new Step 5 (Market Sizing Source Pack) for all bundles
INSERT INTO prompt_bundle_steps (bundle_id, step_number, step_name, step_description, prompt_template, model_override)
SELECT 
  id,
  5,
  'market_sizing_source_pack',
  'Building market sizing source pack',
  E'## TASK: Market Sizing Source Pack

Build a validated "source pack" of externally-defined market categories and (where available) market size numbers per segment, so the TAM calculation step can use real data without hallucinating.

## INPUTS

Research Summary:
{{summary}}

Market Segments (from Step 3):
{{marketSegments}}

## OUTPUT FORMAT

Return ONLY valid JSON matching this schema exactly (no extra keys, no markdown outside JSON):

{
  "by_segment": [
    {
      "segment": string,
      "candidate_categories": [
        {
          "category_name": string,
          "scope_definition": string,
          "market_value": string,
          "year": string,
          "currency": string,
          "geo": string,
          "source": {
            "title": string,
            "publisher": string,
            "date": string,
            "url": string,
            "accessed_date": string,
            "snippet": string
          }
        }
      ],
      "unknowns": [
        {
          "gap": string,
          "why_missing": string,
          "needed_source": string
        }
      ]
    }
  ]
}

## TASK DETAILS

For EACH segment in the market segments input:

1) Identify 2–4 externally-defined market categories that closely match the segment''s product/service concept.
   Examples of acceptable category types:
   - Indication-specific drug market (e.g., "ovarian cancer drugs market")
   - Modality-specific market (e.g., "antibody-drug conjugates market") ONLY if it maps clearly to the segment
   - Diagnostic category market (e.g., "oncology companion diagnostics market")
   - Manufacturing/service category market (e.g., "biologics CDMO / contract manufacturing market")

2) For each category, capture:
   - A plain-language scope definition (what''s included/excluded)
   - The most relevant market size number (value + year + currency) IF publicly available
   - GEO (Global / Australia / APAC / etc.)
   - A validating public source URL and a snippet (<=25 words) supporting either the market size OR the scope definition

3) If you cannot validate a market size number with a public source, set:
   market_value = "Unknown (no validated source found)"
   year = "Unknown (no validated source found)"
   currency = "Unknown (no validated source found)"
   ...but STILL include a source that validates the category definition/scope where possible.

4) If you cannot validate even the category definition with a public source, do NOT include the category. Add an entry to unknowns explaining what''s needed.

## HARD RULES (non-negotiable)

- Do not invent facts, numbers, companies, or market sizes.
- Every numeric claim MUST be supported by the snippet and URL.
- No placeholders. Use: "Unknown (no validated source found)" exactly.
- Prefer Australia-first sources where possible (ABS, AIHW, Cancer Australia, gov.au).
- For market sizing, reputable public market research summaries are allowed (clearly identify publisher).
- Do not use paywalled-only sources unless a free public summary page contains the number and scope.

## QUALITY BAR

- Candidate categories must be "close match", not generic "oncology market" unless the segment is truly broad AND no closer category exists.
- Choose categories that a grant assessor would recognize as legitimate external market definitions.

## ACCESS DATE

Use today''s date in Australia/Sydney timezone in ISO format YYYY-MM-DD for accessed_date.',
  'google/gemini-3-flash-preview'
FROM prompt_bundles;