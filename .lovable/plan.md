
# Plan: Fix Report HTML Field Name + Citation Quality Improvements

## Overview
This plan addresses the "No step output found with 'sections_html' or 'report_html' field" error by ensuring the final assembly step outputs the canonical `report_html` key. Additionally, we'll strengthen citation binding and evidence requirements across the pipeline.

## Problem Summary
- The external Replit worker and `recover-finalize-report` function search for `report_html`, `sections_html`, `report`, `html`, or `content` fields
- A step outputting `part_one_report_html` is not recognized
- Citation and evidence quality needs improvement for assessor-grade output

---

## Part 1: Fix Output Field Name (Step 9)

### Change 1.1: Update finalize_report_html Prompt
**File:** Database update to `prompt_bundle_steps` table

**Current output schema:**
```json
{
  "report_html": "<article>...</article>",
  "tables": [],
  "all_sources": [],
  "data_gaps": []
}
```

**Action:** Verify Step 9 (`finalize_report_html`) in bundle `8cfdf953-0d7f-48aa-981c-a29c7d863944` outputs `report_html`. If testing a different bundle where Step 7 outputs `part_one_report_html`, update that step's output schema to include:
```json
{
  "report_html": "<article>Full HTML report</article>",
  "part_one_report_html": "<same as above if needed>",
  ...
}
```

---

## Part 2: Citation Quality Improvements

### Change 2.1: Strengthen TAM/SAM/SOM Citations (Step 5)
**Update prompt to enforce:**
- Every numeric value must have a source citation OR explicit proxy formula
- If using a proxy: cite both the proxy source AND the derivation methodology
- Include sensitivity range (low/base/high) for each SOM figure

**Add to Step 5 prompt:**
```text
CITATION REQUIREMENTS:
- Every TAM/SAM/SOM figure MUST include:
  a) A direct source citation (Statista, Euromonitor, industry report with URL), OR
  b) A proxy formula showing: [Base Value] × [Multiplier] = [Result], with both inputs cited
- Include sensitivity range: low (-30%), base, high (+30%) for each SOM figure
- If no validated source exists, output: "Unknown (no validated source found)" and add to data_gaps
```

### Change 2.2: Strengthen Competitor Validation (Step 6)
**Update prompt to require:**
- Each competitor row must cite official source (company website, ASIC/SEC filing, Crunchbase, LinkedIn)
- No "best guess" pricing - either cite source or mark as "Unknown"

**Add to Step 6 prompt:**
```text
EVIDENCE REQUIREMENTS:
- Each competitor entry MUST include a source_url pointing to:
  Official company website, SEC/ASIC filing, Crunchbase profile, or reputable industry publication
- If pricing is not publicly available: use "Unknown (no public data)" rather than estimates
- If UX rating unavailable: use "Not rated" rather than estimates
```

### Change 2.3: Strengthen Partner Evidence (Step 8)
**Update prompt to require:**
- One evidence line per partner showing capability + relevance
- Source URL for each partner (company website, ANZSIC registry, industry directory)

**Add to Step 8 prompt:**
```text
EVIDENCE REQUIREMENTS:
- Each potential partner MUST include:
  1. source_url: Link to company website or official registry
  2. evidence_line: One sentence citing their capability + relevance (e.g., "Operates 5 manufacturing facilities in NSW with ISO 13485 certification (source)")
- If no evidence available, do not include the partner in the list
```

---

## Part 3: Reference Resolution Improvements

### Change 3.1: Update Final Assembly Prompt (Step 9)
**Add validation instruction to prevent [undefined] citations:**

```text
REFERENCE VALIDATION:
- Every in-text citation [1], [2] etc. MUST map to a numbered reference in the References section
- Every reference MUST include a URL (where available)
- Do NOT output [undefined], [TBD], [S0-1], or any internal markers
- If a source lacks a URL, note: "(no URL available)"
- Deduplicate references: merge identical sources under one number
```

---

## Implementation Sequence

1. **Database Update 1:** Update Step 5 (`calculate_tam_sam_som`) prompt with citation requirements
2. **Database Update 2:** Update Step 6 (`build_competitor_analysis`) prompt with evidence requirements  
3. **Database Update 3:** Update Step 8 (`identify_partners`) prompt with evidence requirements
4. **Database Update 4:** Update Step 9 (`finalize_report_html`) prompt with reference validation + ensure `report_html` output key is present

---

## Technical Details

### SQL Updates Required

**Step 5 (TAM/SAM/SOM):**
```sql
UPDATE prompt_bundle_steps
SET prompt_template = '...updated prompt with citation requirements...'
WHERE bundle_id = '8cfdf953-0d7f-48aa-981c-a29c7d863944'
  AND step_number = 5;
```

**Step 6 (Competitors):**
```sql
UPDATE prompt_bundle_steps
SET prompt_template = '...updated prompt with evidence requirements...'
WHERE bundle_id = '8cfdf953-0d7f-48aa-981c-a29c7d863944'
  AND step_number = 6;
```

**Step 8 (Partners):**
```sql
UPDATE prompt_bundle_steps
SET prompt_template = '...updated prompt with evidence requirements...'
WHERE bundle_id = '8cfdf953-0d7f-48aa-981c-a29c7d863944'
  AND step_number = 8;
```

**Step 9 (Assembly):**
```sql
UPDATE prompt_bundle_steps
SET prompt_template = '...updated prompt with reference validation...'
WHERE bundle_id = '8cfdf953-0d7f-48aa-981c-a29c7d863944'
  AND step_number = 9;
```

---

## Risk Mitigation
- All changes are prompt-level updates (no code changes)
- Existing pipeline structure remains intact
- Changes can be tested by running a single report before broader rollout
- If quality improvements cause longer AI response times, `max_output_tokens` and `timeout_seconds` are already configured appropriately

---

## Success Criteria
1. Reports complete without "No step output found" error
2. Every TAM/SAM/SOM figure has a citation or explicit proxy formula
3. Every competitor row has a source URL (no "best guess" entries)
4. Every partner has an evidence line with source
5. No [undefined] or unresolved citations in final output
