
# Speed Up Processing Notification for Grant Upload

## Problem Analysis

When a new grant PDF is uploaded, there's a noticeable delay before the processing progress indicator appears. The user sees:

1. "Uploading guidelines..." spinner (correct)
2. Brief moment showing "Guidelines PDF" uploaded card with **no processing indicator**
3. Eventually the processing progress bar appears

### Root Causes Identified

**1. Sequential Operations Delay**
In `GuidelinesUploader.tsx`, the flow is:
```typescript
// Lines 148-153
setUploadedFile(filePath);
onUploadComplete(filePath, rawText);
setIsUploading(false);
await triggerProcessing(rawText);  // Processing starts AFTER upload UI updates
```

**2. Auth Session Fetch Before Callback**
In `triggerProcessing`, the `onProcessingStart` callback is only called **after** fetching the auth session:
```typescript
// Lines 60-62
const { data: { session } } = await supabase.auth.getSession();  // Takes time
if (!session) throw new Error("Not authenticated");
// THEN calls onProcessingStart...
```

**3. Status Value Mismatch**
- `GrantEdit.tsx` line 587: `onProcessingStart` sets `aiAnalysisStatus = "processing"`
- `AIAnalysisPanel.tsx` line 56: `isProcessing = analysisStatus === "analyzing"`
- The panel looks for `"analyzing"` but the callback sets `"processing"` - they don't match!

**4. ProcessingProgress Not Showing Upload State**
The `ProcessingProgress` component supports `isUploading` prop but it's never passed from `AIAnalysisPanel`.

## Solution

### Part 1: Fix Status Value Mismatch
Update `GrantEdit.tsx` to set `"analyzing"` instead of `"processing"`:
```typescript
onProcessingStart={() => {
  setAiAnalysisStatus("analyzing");  // Was "processing"
  queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
}}
```

### Part 2: Show Processing Indicator Immediately
Call `onProcessingStart()` at the START of `triggerProcessing`, before the auth fetch:
```typescript
const triggerProcessing = async (rawText: string) => {
  if (isProcessing) return;
  setIsProcessing(true);
  
  onProcessingStart?.();  // Call immediately - don't wait for auth
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    // ... rest of processing
  }
}
```

### Part 3: Pass Upload State to AIAnalysisPanel
Add `isUploading` prop to `AIAnalysisPanel` so it can show the progress during upload phase too:

In `GrantEdit.tsx`:
- Add `isUploading` state that tracks when `GuidelinesUploader` is uploading
- Pass it to `AIAnalysisPanel`

In `AIAnalysisPanel.tsx`:
- Accept `isUploading` prop
- Show `ProcessingProgress` with `isUploading={true}` during upload

### Part 4: Add Uploading Callback to GuidelinesUploader
Add `onUploadStart` callback to notify parent when upload begins:
```typescript
interface GuidelinesUploaderProps {
  // ... existing props
  onUploadStart?: () => void;
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/admin/GuidelinesUploader.tsx` | Add `onUploadStart` prop, call `onProcessingStart` immediately in `triggerProcessing` |
| `src/pages/admin/GrantEdit.tsx` | Add `isUploading` state, fix `"processing"` to `"analyzing"`, pass states to components |
| `src/components/admin/AIAnalysisPanel.tsx` | Accept `isUploading` prop, show progress during upload |

## Implementation Details

### GuidelinesUploader.tsx

```typescript
interface GuidelinesUploaderProps {
  grantId: string;
  versionId: string;
  versionNumber: number;
  currentPath?: string | null;
  onUploadComplete: (path: string, rawText: string) => void;
  onUploadStart?: () => void;      // NEW
  onProcessingStart?: () => void;
}

// In triggerProcessing, move callback to top:
const triggerProcessing = async (rawText: string) => {
  if (isProcessing) return;
  setIsProcessing(true);
  onProcessingStart?.();  // MOVED: Call immediately
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    // ... rest unchanged
  }
}

// In handleFileUpload, call onUploadStart:
const handleFileUpload = async (file: File) => {
  // ... validation
  setIsUploading(true);
  onUploadStart?.();  // NEW: Notify parent immediately
  
  // ... rest unchanged
}
```

### GrantEdit.tsx

```typescript
const [isUploading, setIsUploading] = useState(false);

// In the GuidelinesUploader component:
<GuidelinesUploader
  grantId={id}
  versionId={selectedVersionId}
  versionNumber={selectedVersion?.version_number || 1}
  currentPath={guidelinesPath}
  onUploadStart={() => {
    setIsUploading(true);
  }}
  onUploadComplete={(path, rawText) => {
    setIsUploading(false);
    setGuidelinesPath(path);
    setGuidelinesRawText(rawText);
    setAiAnalysisStatus("pending");
    setPipelineStatus("none");
  }}
  onProcessingStart={() => {
    setAiAnalysisStatus("analyzing");  // FIXED: Was "processing"
    queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
  }}
/>

// In AIAnalysisPanel:
<AIAnalysisPanel
  versionId={selectedVersionId}
  guidelinesText={guidelinesRawText}
  analysisStatus={aiAnalysisStatus}
  pipelineStatus={pipelineStatus}
  promptBundleId={promptBundleId}
  suggestions={aiSuggestions}
  onRetry={handleRetryProcessing}
  isRetrying={isRetrying}
  isUploading={isUploading}  // NEW
/>
```

### AIAnalysisPanel.tsx

```typescript
interface AIAnalysisPanelProps {
  // ... existing props
  isUploading?: boolean;  // NEW
}

export function AIAnalysisPanel({
  // ... existing props
  isUploading = false,
}: AIAnalysisPanelProps) {
  const isProcessing = analysisStatus === "analyzing" || pipelineStatus === "generating";

  // Show processing progress during upload OR processing
  if (isProcessing || isUploading) {
    return (
      <div className="space-y-6">
        <ProcessingProgress 
          aiStatus={analysisStatus} 
          pipelineStatus={pipelineStatus}
          isUploading={isUploading}  // NEW: Pass through
        />
      </div>
    );
  }
  // ... rest unchanged
}
```

## Expected Behavior After Fix

1. User drops PDF → **Immediately** shows "Processing Guidelines" card with Step 1 active
2. Upload completes → Step 1 shows checkmark, Step 2 becomes active  
3. Analysis completes → Step 2 shows checkmark, Step 3 becomes active
4. Pipeline generated → All steps complete
5. **No gap** between upload complete and processing start

## Visual Timeline Comparison

**Before:**
```
[Upload spinner] → [Uploaded card, no indicator] → [Wait...] → [Processing progress]
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                   This gap is the user-visible delay
```

**After:**
```
[Processing progress: Step 1 active] → [Step 2 active] → [Step 3 active] → [Complete]
No gaps - continuous feedback throughout
```
