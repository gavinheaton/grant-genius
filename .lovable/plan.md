

# Fix: Report Not Viewable + Progress Not Reaching 100%

## Problem Summary

Your most recent report completed successfully but:
1. **Progress shows ~93%** instead of 100%
2. **Report cannot be viewed or exported** - clicking View/PDF/DOCX fails

## Root Causes

### Why Progress Isn't 100%
The progress bar calculates `completedSteps / totalSteps`. Since step 3 (`search_policy_funding`) failed mid-run, only 13 of 14 steps are marked "completed" - even though the run itself finished successfully.

### Why Report Can't Be Viewed
The external worker saves reports with **step names as keys** (like `finalize_report_html`, `assemble_sections_html`), but the frontend's `extractReportHtml` function only looks for:
- `content.assembledReport.report_html` - not present
- `content.sections[]` array - not present

It doesn't handle the step-based structure. Additionally, the `finalize_report_html` value is stored as a JSON **string**, not a parsed object.

---

## Solution

### 1. Fix `extractReportHtml` to Handle Step-Based Format

**File:** `src/lib/htmlReportUtils.ts`

Add a new case in `extractReportHtml` to detect the step-based structure:

```text
Case 4: Step-based format (from Cloud Run worker)
  - Check for keys like 'finalize_report_html' or 'assemble_sections_html'
  - Parse the JSON string to extract 'report_html'
  - Fall back to 'assemble_sections_html' if finalize is missing
```

Changes:
- Add detection for top-level keys matching step names (e.g., `finalize_report_html`)
- Parse the JSON string value to extract `report_html`, `tables`, `all_sources`
- Handle both string and object formats for the step output

### 2. Fix Progress Calculation for Completed Runs

**File:** `src/components/workspace/GenerationProgress.tsx`

Change the progress calculation to show 100% when the run status is "completed":

```typescript
// Current (broken):
const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

// Fixed:
const progressPercent = status === "completed" 
  ? 100 
  : (totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0);
```

### 3. Fix `completedSteps` Calculation in Hook

**File:** `src/hooks/useReportGeneration.ts`

Currently, `completedSteps` likely only counts steps with `status === "completed"`. Since failed steps still represent progress, the calculation should include them:

```typescript
// Count both completed AND failed steps for progress display
const completedSteps = steps.filter(s => 
  s.status === "completed" || s.status === "failed"
).length;
```

---

## Technical Details

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/htmlReportUtils.ts` | Add Case 4 in `extractReportHtml` for step-based format |
| `src/components/workspace/GenerationProgress.tsx` | Force 100% when status is "completed" |
| `src/hooks/useReportGeneration.ts` | Include failed steps in `completedSteps` count |

### New Extraction Logic (htmlReportUtils.ts)

```typescript
// Case 4: Step-based format (finalize_report_html, assemble_sections_html as top keys)
const stepKeys = ['finalize_report_html', 'assemble_sections_html', 'build_tables_sources_html'];
for (const key of stepKeys) {
  if (content[key]) {
    let stepData = content[key];
    
    // Parse if it's a JSON string
    if (typeof stepData === 'string') {
      try {
        stepData = JSON.parse(stepData);
      } catch {
        continue;
      }
    }
    
    if (stepData.report_html) {
      return {
        html: stepData.report_html,
        tables: stepData.tables,
        sources: stepData.all_sources,
        dataGaps: stepData.data_gaps,
        isLegacy: false,
      };
    }
  }
}
```

---

## Expected Outcome

After these fixes:
- Completed runs will show 100% progress
- Reports saved in step-based format will be viewable
- PDF and DOCX exports will work correctly
- Failed non-critical steps won't block the progress display

