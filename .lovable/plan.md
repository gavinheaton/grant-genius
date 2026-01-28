
# Step 11: Assemble Final Grant Report (AEA Ignite-ready)

## Overview
Add a new final pipeline step (Step 11) that takes all JSON outputs from Steps 1-10 and assembles them into a single, assessor-ready grant report following the exact AEA Ignite structure with proper citations, tables, and data gap tracking.

## Current State Analysis

The pipeline currently:
- Runs 10 steps via `generate-report` (Step 1) and `resume-report-run` (Steps 2-10)
- Step 10 (Partner Businesses) triggers `createFinalReport()` which saves raw step outputs to `content_json`
- No post-processing step exists to format outputs into a coherent narrative
- Each step stores unstructured text in checkpoint data (e.g., `researchContext`, `tam`, `som`)

## Changes Required

### 1. Database Schema Update

Update the `total_steps` constant from 10 to 11 in both edge functions and add Step 11 to the seed data.

**Migration**: Add Step 11 to existing prompt bundles:
- Insert new `prompt_bundle_steps` record for step_number = 11
- Set step_name = "assemble_report"
- Set step_description = "Assemble Final Grant Report"
- Include the detailed prompt template from user requirements

### 2. Edge Function Changes

**File: `supabase/functions/generate-report/index.ts`**
- Update `RESEARCH_STEPS` array to include Step 11
- Change `total_steps: RESEARCH_STEPS.length` (now 11)

**File: `supabase/functions/resume-report-run/index.ts`**
- Update `RESEARCH_STEPS` array to include Step 11
- Add `case 11:` block for the final assembly step
- Move `createFinalReport()` call from Step 10 to Step 11
- Step 10 now checkpoints instead of completing
- Step 11 parses all step outputs, calls AI with assembly prompt, then calls `createFinalReport()`
- Update checkpoint validation to allow steps 1-10 (was 1-9)

### 3. Variable Interpolation Updates

Add new variables for Step 11 interpolation:
- `{{step1}}` through `{{step10}}` - Raw JSON string outputs from each step
- `{{partnerBusinesses}}` - Output from Step 10 (was the final step)
- `{{reportTemplateName}}` - Optional template name if available

**Update `getBaseVariables()` function** to include:
```text
step1: JSON.stringify(reportContent.researchContext || {}),
step2: JSON.stringify(reportContent.competitorResearch || {}),
...
step10: JSON.stringify(reportContent.partnerBusinesses || {}),
```

### 4. Admin UI Updates

**File: `src/pages/admin/PromptBundleEdit.tsx`**
- Add `{{partnerBusinesses}}` to Step Outputs category
- Add new "Assembly Variables" category with `{{step1}}` through `{{step10}}`
- Note that Step 11 has access to all previous outputs

### 5. Frontend Hook Update

**File: `src/hooks/useReportGeneration.ts`**
- Update checkpoint detection from steps 1-9 to steps 1-10
- Step 11 completes the report (no checkpoint)

## Technical Implementation Details

### Step 11 Prompt Template (for seed data)

The prompt will be stored in the database with the exact format specified by the user:

```text
You are assembling a final grant report for Australian government assessors.

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

STYLE: Formal, concise, assessor-ready. Australia-first framing. Explicit about assumptions and confidence.
```

### Step 11 Processing Logic

```text
case 11:
  // Step 11: Assemble Final Report
  await executeStep(supabase, reportRunId, 11, async () => {
    // Build step output variables
    const stepVariables = {
      step1: JSON.stringify(reportContent.researchContext || ""),
      step2: JSON.stringify(reportContent.competitorResearch || ""),
      step3: JSON.stringify(reportContent.marketSegments || ""),
      step4: JSON.stringify(reportContent.existingCompetitors || ""),
      step5: JSON.stringify(reportContent.tam || ""),
      step6: JSON.stringify(reportContent.sam || ""),
      step7: JSON.stringify(reportContent.som || ""),
      step8: JSON.stringify(reportContent.economicImpact || ""),
      step9: JSON.stringify(reportContent.competitorTable || ""),
      step10: JSON.stringify(reportContent.partnerBusinesses || ""),
    };

    // Get Step 11 prompt from bundle or use default
    const assemblyPrompt = getStepPrompt(11, DEFAULT_STEP_11_PROMPT);
    
    // Use the most capable model for final assembly
    const result = await callAIWithRetry(assemblyPrompt, 11, systemPrompt, getStepModel(11));
    
    // Parse the JSON response
    let parsedReport;
    try {
      parsedReport = JSON.parse(result);
    } catch {
      // If JSON parsing fails, store raw output
      parsedReport = { report_markdown: result, tables: [], all_sources: [], data_gaps: [] };
    }
    
    reportContent.assembledReport = parsedReport;
    return { assembledReport: parsedReport };
  });

  // FINAL STEP: Create the report and mark as complete
  await createFinalReport(
    supabase,
    reportRunId,
    applicationId,
    grantVersionId,
    templateVersionId,
    userId,
    inputs,
    reportContent,
    citations,
    emailOnComplete
  );
  
  console.log(`11-PHASE: Report run ${reportRunId} completed successfully`);
  return;
```

### Model Selection for Step 11

Step 11 requires the most capable model since it:
- Processes large amounts of data from all previous steps
- Must produce perfectly structured JSON output
- Handles complex formatting and citation tracking

Recommended: `google/gemini-3-pro-preview` (or allow override via admin UI)

Update `getModelForStep()`:
```text
function getModelForStep(stepNumber: number): string {
  if (stepNumber <= 3) return "google/gemini-2.5-flash-lite";
  if (stepNumber <= 7) return "google/gemini-3-flash-preview";
  if (stepNumber === 11) return "google/gemini-3-pro-preview"; // Most capable for assembly
  return "google/gemini-2.5-flash-lite";
}
```

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| Database Migration | CREATE | Add Step 11 to existing prompt bundles |
| `supabase/functions/generate-report/index.ts` | MODIFY | Add Step 11 to RESEARCH_STEPS array |
| `supabase/functions/resume-report-run/index.ts` | MODIFY | Add case 11 logic, move completion to Step 11, update checkpoint range |
| `src/hooks/useReportGeneration.ts` | MODIFY | Update checkpoint detection range from 1-9 to 1-10 |
| `src/pages/admin/PromptBundleEdit.tsx` | MODIFY | Add new variables for Step 11 ({{step1}}-{{step10}}, {{partnerBusinesses}}) |

## Testing Considerations

1. **Backward Compatibility**: Existing in-progress reports at Step 10 will complete normally (they'll use old logic)
2. **New Reports**: Will run through all 11 steps
3. **JSON Parsing**: Step 11 includes fallback for non-JSON AI responses
4. **Timeout Risk**: Step 11 processes more data - use 60s timeout and most capable model

## Security Notes

- No new RLS policies needed
- Step 11 prompt is editable via existing Super Admin controls
- Audit logging already captures prompt changes
