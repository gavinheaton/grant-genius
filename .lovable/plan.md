
# Fix: Make Recovery Function Handle Single-Prompt Pipelines

## Problem Summary

The current recovery function is hardcoded for the standard multi-step pipeline (10+ steps with dedicated assembly steps). When a simpler "single-prompt" pipeline (like AMT Bio) fails, recovery fails because:

1. **No `assemble_sections_html` step exists** - The report HTML is generated directly in Step 0
2. **Output field is named `report`** not `report_html` - Step 0 outputs `{ "report": "..." }` instead of `{ "report_html": "..." }`
3. **The finalize step has wrong variable references** - It tries to use `{{step1}}`, `{{step2}}` which don't exist in a 2-step pipeline

## Solution: Multi-Strategy Recovery

Update the recovery function to detect the pipeline architecture and use the appropriate extraction strategy.

### Strategy Detection Logic

```text
1. First, try the STANDARD multi-step pattern:
   - Look for "assemble_sections_html" step with "sections_html"
   - Look for "build_tables_sources_html" step with "tables"
   - Merge them (current logic)

2. If standard pattern fails, try SINGLE-PROMPT pattern:
   - Scan all completed steps for a field containing HTML content
   - Look for: "report", "report_html", "html", "content"
   - Use the first one found that has substantial HTML (>500 chars, contains <h tags)

3. If both fail, return descriptive error with available step data
```

---

## Implementation Details

### File: `supabase/functions/recover-finalize-report/index.ts`

#### 1. Add strategy detection functions

```typescript
// Detect if a value looks like report HTML
function isReportHtml(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Must be substantial HTML with heading tags
  return value.length > 500 && (
    value.includes("<h1") || 
    value.includes("<h2") || 
    value.includes("<section") ||
    value.includes("<article")
  );
}

// Try to extract report HTML from step outputs
function extractReportFromStep(outputs: Record<string, unknown>): string | null {
  // Priority order of field names to check
  const fieldPriority = ["report_html", "report", "html", "content", "sections_html"];
  
  for (const field of fieldPriority) {
    if (outputs[field] && isReportHtml(outputs[field])) {
      return outputs[field] as string;
    }
  }
  
  // Also check nested structures (e.g., { assembledReport: { report_html: ... } })
  if (outputs.assembledReport && typeof outputs.assembledReport === "object") {
    const nested = outputs.assembledReport as Record<string, unknown>;
    for (const field of fieldPriority) {
      if (nested[field] && isReportHtml(nested[field])) {
        return nested[field] as string;
      }
    }
  }
  
  return null;
}

// Extract tables from step outputs (flexible field names)
function extractTablesFromStep(outputs: Record<string, unknown>): Record<string, string> {
  if (outputs.tables && typeof outputs.tables === "object") {
    return outputs.tables as Record<string, string>;
  }
  return {};
}

// Extract sources from step outputs (flexible field names)
function extractSourcesFromStep(outputs: Record<string, unknown>): Array<{title?: string; url?: string}> {
  const fieldNames = ["all_sources", "sources", "references", "citations"];
  for (const field of fieldNames) {
    if (Array.isArray(outputs[field])) {
      return outputs[field];
    }
  }
  return [];
}
```

#### 2. Refactor main recovery logic

```typescript
// Inside serve handler, after loading steps...

console.log(`[RECOVER] Found ${steps?.length || 0} steps`);

// Log all available step data for debugging
for (const step of steps || []) {
  const outputKeys = step.outputs_json ? Object.keys(step.outputs_json) : [];
  console.log(`[RECOVER] Step ${step.step_number} (${step.step_name}): status=${step.status}, outputs=[${outputKeys.join(", ")}]`);
}

// ============ STRATEGY 1: Standard Multi-Step Pipeline ============
const assembleSectionsStep = steps?.find(
  (s: any) => s.step_name === "assemble_sections_html" && s.status === "completed"
);
const buildTablesStep = steps?.find(
  (s: any) => s.step_name === "build_tables_sources_html" && s.status === "completed"
);

let reportHtml: string | null = null;
let tables: Record<string, string> = {};
let allSources: Array<{title?: string; url?: string; source?: string}> = [];
let dataGaps: string[] = [];
let recoveryStrategy = "unknown";

if (assembleSectionsStep?.outputs_json?.sections_html && buildTablesStep?.outputs_json) {
  // Standard multi-step recovery
  console.log("[RECOVER] Using STANDARD multi-step recovery strategy");
  recoveryStrategy = "multi-step";
  
  reportHtml = assembleSectionsStep.outputs_json.sections_html as string;
  tables = (buildTablesStep.outputs_json.tables || {}) as Record<string, string>;
  allSources = (buildTablesStep.outputs_json.all_sources || []);
  dataGaps = (buildTablesStep.outputs_json.data_gaps || []) as string[];
  
  // Merge tables into report...
  // (existing anchor replacement logic)
}

// ============ STRATEGY 2: Single-Prompt Pipeline ============
if (!reportHtml) {
  console.log("[RECOVER] Standard strategy failed, trying SINGLE-PROMPT strategy");
  
  // Scan completed steps for report content
  const completedSteps = (steps || [])
    .filter((s: any) => s.status === "completed" && s.outputs_json)
    .sort((a: any, b: any) => b.step_number - a.step_number); // Latest first
  
  for (const step of completedSteps) {
    const extracted = extractReportFromStep(step.outputs_json);
    if (extracted) {
      console.log(`[RECOVER] Found report HTML in step ${step.step_number} (${step.step_name})`);
      recoveryStrategy = "single-prompt";
      reportHtml = extracted;
      
      // Also try to extract tables and sources from same or other steps
      if (Object.keys(tables).length === 0) {
        tables = extractTablesFromStep(step.outputs_json);
      }
      if (allSources.length === 0) {
        allSources = extractSourcesFromStep(step.outputs_json);
      }
      break;
    }
  }
  
  // If still no report found, try extracting from any step's nested fields
  if (!reportHtml) {
    for (const step of completedSteps) {
      const outputs = step.outputs_json || {};
      for (const [key, value] of Object.entries(outputs)) {
        if (isReportHtml(value)) {
          console.log(`[RECOVER] Found report HTML in step ${step.step_number}.${key}`);
          recoveryStrategy = "single-prompt-nested";
          reportHtml = value as string;
          break;
        }
      }
      if (reportHtml) break;
    }
  }
}

// ============ STRATEGY 3: Cannot Recover ============
if (!reportHtml) {
  const availableData = (steps || [])
    .filter((s: any) => s.status === "completed")
    .map((s: any) => ({
      step: s.step_number,
      name: s.step_name,
      outputFields: s.outputs_json ? Object.keys(s.outputs_json) : [],
    }));
  
  console.error("[RECOVER] No recovery strategy succeeded. Available:", JSON.stringify(availableData));
  
  return errorResponse(
    `Cannot recover: no report HTML found in any completed step. ` +
    `Available steps: ${availableData.map(s => `${s.name}(${s.outputFields.join(",")})`).join(", ")}. ` +
    `Manual intervention required.`,
    400
  );
}

console.log(`[RECOVER] Using ${recoveryStrategy} strategy, report_html length: ${reportHtml.length}`);

// Continue with existing logic to build content_json and save report...
```

#### 3. Update the finalize step status update

Also handle the case where there's no `finalize_report_html` step:

```typescript
// After saving the report...

// Update finalize step if it exists
const finalizeStep = steps?.find(
  (s: any) => s.step_name === "finalize_report_html"
);

if (finalizeStep) {
  await supabase
    .from("report_run_steps")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      outputs_json: {
        report_html: reportHtml,
        recovered: true,
        recovery_strategy: recoveryStrategy,
        recovery_timestamp: new Date().toISOString(),
      },
      error_message: null,
    })
    .eq("report_run_id", reportRunId)
    .eq("step_name", "finalize_report_html");
} else {
  // For pipelines without finalize step, mark the last step as recovered
  const lastStep = steps?.[steps.length - 1];
  if (lastStep && lastStep.status === "failed") {
    await supabase
      .from("report_run_steps")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        outputs_json: {
          ...lastStep.outputs_json,
          recovered: true,
          recovery_strategy: recoveryStrategy,
        },
        error_message: null,
      })
      .eq("report_run_id", reportRunId)
      .eq("step_number", lastStep.step_number);
  }
}
```

---

### File: `src/hooks/useReportGeneration.ts`

#### Update `isRecoverableFinalizeError` to be more flexible

```typescript
// Detect any final step failure that can potentially be recovered
function isRecoverableFinalizeError(step: ReportRunStep | undefined): boolean {
  if (!step) return false;
  
  // Standard finalize step failure
  if (
    step.step_name === "finalize_report_html" &&
    step.status === "failed" &&
    (step.error_message?.includes("No step output found with 'report_html'") ||
     step.error_message?.includes("Finalize FAILED"))
  ) {
    return true;
  }
  
  // Any final step that failed with missing variable errors
  // (single-prompt pipelines may fail at step 1 with variable issues)
  if (
    step.status === "failed" &&
    step.error_message?.includes("missingVars")
  ) {
    return true;
  }
  
  return false;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/recover-finalize-report/index.ts` | Add multi-strategy recovery logic with flexible field extraction |
| `src/hooks/useReportGeneration.ts` | Update `isRecoverableFinalizeError` to detect more failure patterns |

---

## Expected Outcome

After implementation:
1. Recovery button shows for single-prompt pipeline failures (not just `finalize_report_html` failures)
2. Recovery function scans all completed steps for HTML content
3. Works with any field name (`report`, `report_html`, `content`, etc.)
4. Provides clear error message listing available data if no strategy works
5. Logs the recovery strategy used for debugging

---

## Testing Plan

1. Run recovery on the failed AMT Bio report (run ID: `769af99e-8b5a-436a-b6d4-6714a8a9f614`)
2. Verify Step 0's `report` field (14KB HTML) is extracted and saved
3. Test DOCX export on the recovered report
4. Test a standard multi-step pipeline to ensure backward compatibility
