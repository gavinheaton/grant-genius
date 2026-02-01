

# Plan: Migrate Prompt Improvements to Correct AEA Ignite Steps

## Problem Summary

Your prompt improvements were added to the wrong steps due to the 0-indexed numbering mismatch:

| Improvement | Currently In | Should Be In |
|-------------|--------------|--------------|
| Competitor URL validation rules | Step 2 (market_need_quantification) | Step 4 (competitor_and_alternative_benchmarking) |
| SAM calculation with AU proxy | Step 7 (partner_stakeholder_mapping) | Step 3 (tam_sam_som_analysis) |
| SOM Y3/Y5 growth calculations | Step 8 (technical_feasibility_benchmarking) | Step 3 (tam_sam_som_analysis) |

---

## Changes Required

### Step 2: market_need_quantification - CLEAN UP

Remove the competitor URL rules that don't belong here.

**Current prompt (with misplaced content):**
```text
Identify the primary problem this technology ({{researchSummary}}) solves...

URL REQUIREMENT (STRICT):     <-- REMOVE THIS SECTION
- Every competitor MUST have...
...
FALLBACK SEARCH:
- If a specific press release...
```

**Updated prompt (cleaned):**
```text
Identify the primary problem this technology ({{researchSummary}}) solves. Research and cite statistics regarding the scale of this problem in Australia and globally (e.g., cost of inefficiency, prevalence of a disease, or carbon emissions). Define the 'Market Need' supported by data points from 2022-2024.
```

---

### Step 3: tam_sam_som_analysis - ADD SAM/SOM FIXES

Add both the SAM proxy calculation and SOM growth assumption rules.

**Current prompt:**
```text
Calculate the TAM (Total Addressable Market), SAM (Serviceable Addressable Market), and SOM (Serviceable Obtainable Market) for the technology described in {{researchSummary}}. Use data from {{step0}} and external market databases. Focus on the Australian market growth projections (CAGR) and the global export potential. Provide citable revenue or volume figures.
```

**Updated prompt:**
```text
Calculate the TAM (Total Addressable Market), SAM (Serviceable Addressable Market), and SOM (Serviceable Obtainable Market) for the technology described in {{researchSummary}}. Use data from {{step0}} and external market databases. Focus on the Australian market growth projections (CAGR) and the global export potential. Provide citable revenue or volume figures.

SAM CALCULATION RULE (MANDATORY):
If TAM is numeric but no direct Australian serviceable pool is found, you MUST still produce a numeric SAM estimate:

1. Australia represents approximately 1.5-2% of global healthcare markets (cite OECD or AIHW)
2. Apply this as a conservative filter: SAM_low = TAM * 0.01, SAM_high = TAM * 0.02
3. Mark confidence as "Low" and add validation_needed entry
4. This is ALWAYS better than "Unknown" for grant assessors

EXAMPLE:
If global TAM = 111.98 billion USD:
  - sam_low = 111980000000 * 0.01 = 1119800000 (approx $1.1B)
  - sam_high = 111980000000 * 0.02 = 2239600000 (approx $2.2B)
  - key_assumptions: "Australia ~1.5-2% of global healthcare market (OECD Health Statistics)"
  - confidence: Low

SOM CALCULATION RULE (MANDATORY):
For each segment where SAM is numeric:

Year 1 (Conservative Entry):
  - som_y1_low = sam_low * 0.001 (0.1%)
  - som_y1_high = sam_high * 0.005 (0.5%)

Year 3 (Early Growth - MUST CALCULATE):
  - som_y3_low = som_y1_low * 3 (conservative 3x growth)
  - som_y3_high = som_y1_high * 5 (optimistic 5x growth)
  - Add assumption: "Assumed 3-5x growth from Y1 based on typical biotech adoption curves"

Year 5 (Established - MUST CALCULATE):
  - som_y5_low = som_y1_low * 8 (conservative 8x from Y1)
  - som_y5_high = som_y1_high * 15 (optimistic 15x from Y1)
  - Add assumption: "Assumed 8-15x growth from Y1 based on successful biotech commercialisation precedents"

DO NOT output "Unknown" for SAM or SOM if TAM is numeric. Conservative assumptions with Low confidence are always preferable to Unknown for grant assessors.

"Unknown" is ONLY acceptable if TAM itself cannot be determined.
```

---

### Step 4: competitor_and_alternative_benchmarking - ADD URL FIXES

Add the competitor URL validation rules.

**Current prompt:**
```text
Identify the top 5 global and domestic competitors or alternative technologies. Compare their current capabilities, TRL levels (if public), and market share against the proposed project ({{researchSummary}}). Highlight the unique value proposition (UVP) of the project based on gaps in existing competitor or alternative solutions.
```

**Updated prompt:**
```text
Identify the top 5 global and domestic competitors or alternative technologies. Compare their current capabilities, TRL levels (if public), and market share against the proposed project ({{researchSummary}}). Highlight the unique value proposition (UVP) of the project based on gaps in existing competitor or alternative solutions.

URL REQUIREMENT (STRICT):
- Every competitor MUST have a real, accessible URL (lab page, publication, press release, or news article).
- If you cannot find a validated URL for a competitor, DO NOT include that competitor.
- Never output "Unknown (no validated source found)" for URLs - instead exclude that entry.
- For Australian institutions (CSIRO, WEHI, universities), their official websites always have lab pages - use those.

FALLBACK SEARCH:
- If a specific press release isn't found, use the institution's research page URL
- Format: https://[institution].edu.au/research/[lab-or-group-name]
```

---

### Step 7: partner_stakeholder_mapping - CLEAN UP

Remove the SAM calculation rules that don't belong here.

**Current prompt (with misplaced content):**
```text
Identify 5-10 key industry bodies...

MANDATORY CALCULATION RULE (NON-NEGOTIABLE):     <-- REMOVE THIS SECTION
If TAM is numeric but no direct Australian...
```

**Updated prompt (cleaned):**
```text
Identify 5-10 key industry bodies, potential commercial partners, or end-user groups in Australia that would be critical for the commercialisation of {{researchSummary}}. Provide evidence of their historical involvement in similar research translations or their expressed interest in this technology area.
```

---

### Step 8: technical_feasibility_benchmarking - CLEAN UP

Remove the SOM calculation rules that don't belong here.

**Current prompt (with misplaced content):**
```text
Summarize common technical milestones...

CALCULATION RULE (REVISED):     <-- REMOVE THIS SECTION
For each segment where SAM is numeric...
```

**Updated prompt (cleaned):**
```text
Summarize common technical milestones, typical costs, and timeframes for reaching TRL 5 from TRL 3 in the sector of {{researchSummary}}. Research known benchmarks for 'proof-of-concept' validation in this industry to support the feasibility of a 12-month timeline and $500k budget.
```

---

## Implementation Summary

| Step | Action | Description |
|------|--------|-------------|
| 2 | Remove | Delete competitor URL rules (don't belong here) |
| 3 | Add | Insert SAM proxy + SOM growth calculation rules |
| 4 | Add | Insert competitor URL validation rules |
| 7 | Remove | Delete SAM calculation rules (don't belong here) |
| 8 | Remove | Delete SOM calculation rules (don't belong here) |

---

## Technical Implementation

Database updates to `prompt_bundle_steps` table for bundle `0393efea-a3c2-48f1-8087-278e7da3fbc4`:

1. UPDATE step 2 - restore original prompt
2. UPDATE step 3 - add combined SAM/SOM rules
3. UPDATE step 4 - add competitor URL rules
4. UPDATE step 7 - restore original prompt
5. UPDATE step 8 - restore original prompt

---

## Testing

After implementation:
1. Run a new report for AEA Ignite 2026
2. Verify Step 3 outputs numeric SAM/SOM values (not "Unknown")
3. Verify Step 4 outputs competitors with real URLs (no "Unknown" entries)
4. Verify Steps 7 and 8 focus on their intended purposes (partners and feasibility)

