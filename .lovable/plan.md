

# Fix Step 11 Stuck Processing

## Problem Summary

When Step 11 (final assembly) runs, three issues can cause the UI to appear "stuck":

1. **Missing Step Name**: The `RESEARCH_STEPS` array has only 10 entries - Step 11 shows "Initializing..." instead of "Assembling final report"
2. **No Auto-Resume for Step 11**: The auto-resume logic only handles steps 1-10, so Step 11 pending states don't auto-resume
3. **Long Processing Time**: Step 11 takes 60-75 seconds (vs ~10-20s for other steps), which may feel like it's stuck

## Solution

### 1. Add Step 11 to Progress Display

**File:** `src/components/workspace/GenerationProgress.tsx`

Add "Assembling final report" as the 11th step in the array:

```typescript
const RESEARCH_STEPS = [
  "Extracting research context from article",
  "Searching for competing research",
  "Identifying market segments",
  "Finding existing competitors",
  "Calculating Total Addressable Market",
  "Calculating Serviceable Addressable Market",
  "Calculating Serviceable Obtainable Market",
  "Analyzing Australian economic impact",
  "Building competitor comparison",
  "Finding Australian partner businesses",
  "Assembling final report",  // NEW: Step 11
];
```

### 2. Include Step 11 in Auto-Resume Logic

**File:** `src/hooks/useReportGeneration.ts`

Extend the auto-resume condition to include Step 11 pending states (which the backend's Step 11 recovery handles):

```typescript
// BEFORE (line 309):
if (activeRun.current_step >= 1 && activeRun.current_step <= 10) {

// AFTER:
if (activeRun.current_step >= 1 && activeRun.current_step <= 11) {
```

### 3. Add Special UI Messaging for Step 11

Show users that Step 11 takes longer than other steps so they don't think it's stuck:

| Current | After |
|---------|-------|
| "Step 11/11: Assembling final report" | "Step 11/11: Assembling final report (this step takes longer)" |

## Implementation Details

### Changes to GenerationProgress.tsx

1. Add Step 11 name to `RESEARCH_STEPS` array
2. Add special handling for Step 11 messaging to indicate longer duration

### Changes to useReportGeneration.ts

1. Extend auto-resume range from `<= 10` to `<= 11`
2. Ensure Step 11 recovery (already in backend) is triggered by frontend

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/workspace/GenerationProgress.tsx` | Add Step 11 name, improve Step 11 messaging |
| `src/hooks/useReportGeneration.ts` | Extend auto-resume range to include Step 11 |

## Expected Outcome

After these changes:
- Step 11 will show "Assembling final report" instead of "Initializing..."
- Users will see a note that Step 11 takes longer (sets expectations)
- If Step 11 gets stuck in pending, the frontend will auto-resume it
- Backend's existing Step 11 recovery logic will handle the re-run

## Testing

1. Start a new report generation
2. Verify Step 11 shows "Assembling final report" 
3. Check that progress reaches 100% when Step 11 completes
4. Verify the report is downloadable after completion

