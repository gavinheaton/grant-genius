

# Fix AI Analysis Panel UX - Status Mismatch

## Problem

The UI shows a confusing state when processing guidelines:
- Badge shows "pending" 
- Message says "Processing should start automatically"
- A "Start Processing" button is visible

This happens because the code checks for status `"processing"` but the database uses `"analyzing"`.

## Root Cause

When we fixed the database constraint, we changed the edge function to use `"analyzing"` (valid DB value) instead of `"processing"` (invalid). However, the UI components still check for `"processing"`.

**Database constraint allows:** `pending`, `analyzing`, `completed`, `failed`
**UI currently checks for:** `processing` (doesn't match)

## Solution

Update both UI components to check for `"analyzing"` instead of `"processing"`:

### File 1: `src/components/admin/AIAnalysisPanel.tsx`

**Line 56** - Change the processing detection:
```typescript
// BEFORE
const isProcessing = analysisStatus === "processing" || pipelineStatus === "generating";

// AFTER
const isProcessing = analysisStatus === "analyzing" || pipelineStatus === "generating";
```

**Line 62** - Add "analyzing" to the status icon mapping:
```typescript
const statusIcon = {
  pending: <AlertCircle className="h-4 w-4 text-muted-foreground" />,
  analyzing: <Loader2 className="h-4 w-4 text-primary animate-spin" />,  // ADD THIS
  processing: <Loader2 className="h-4 w-4 text-primary animate-spin" />,  // Keep for backwards compat
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
};
```

### File 2: `src/components/admin/ProcessingProgress.tsx`

**Line 40** - Change the extraction step detection:
```typescript
// BEFORE
if (aiStatus === "processing") {

// AFTER  
if (aiStatus === "analyzing") {
```

## Expected Behavior After Fix

| Status | What User Sees |
|--------|----------------|
| `pending` | "Upload guidelines PDF to get started" |
| `analyzing` | Progress bar with spinner: "Extract rubric and inputs" active |
| `generating` | Progress bar: "Generate research pipeline" active |
| `completed` + `draft` | Green success card with pipeline link |
| `failed` | Red error card with "Retry" button |

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `src/components/admin/AIAnalysisPanel.tsx` | 56, 60-65 | Check for `"analyzing"` status |
| `src/components/admin/ProcessingProgress.tsx` | 40 | Check for `"analyzing"` status |

