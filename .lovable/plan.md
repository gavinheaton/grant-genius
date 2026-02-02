
# Fix Pipeline Generation Progress Display and View Pipeline Button

## Issues Identified

### Issue 1: Progress Display Disappears Early
The pipeline generation progress indicator shows briefly then disappears, even though processing takes 30-60 seconds.

**Root Cause**: The polling condition checks for the wrong status value.

In `GrantEdit.tsx` line 141:
```typescript
const isProcessing = 
  selectedVer.ai_analysis_status === "processing" ||  // WRONG!
  selectedVer.pipeline_generation_status === "generating";
```

But the actual status set by the backend is `"analyzing"` (not `"processing"`).

Since polling never activates, the UI doesn't receive updates from the database, and when the local state gets refreshed, the progress indicator disappears.

### Issue 2: "View Pipeline" Button Links to Wrong Page
After generation completes, clicking "View Pipeline" navigates to `/admin/prompt-bundles/:id` (the standalone editor page) instead of staying on the current grant page and switching to the Pipeline tab.

**Root Cause**: In `AIAnalysisPanel.tsx` line 190:
```tsx
<Link to={`/admin/prompt-bundles/${promptBundleId}`}>
```

This should use in-page navigation (tab switching) rather than a route change.

---

## Solution

### Part 1: Fix Polling Status Check

Update the polling condition in `GrantEdit.tsx` to check for `"analyzing"` instead of `"processing"`:

```typescript
// Line 141
const isProcessing = 
  selectedVer.ai_analysis_status === "analyzing" ||  // FIXED
  selectedVer.pipeline_generation_status === "generating";
```

### Part 2: Add Tab Switching Callback

Pass a callback from `GrantEdit.tsx` to `AIAnalysisPanel` that switches to the Pipeline tab:

In `GrantEdit.tsx`:
- Add state for active tab: `const [activeTab, setActiveTab] = useState("details")`
- Pass `onViewPipeline` callback to `AIAnalysisPanel`

In `AIAnalysisPanel.tsx`:
- Accept new prop: `onViewPipeline?: () => void`
- Replace Link with Button that calls `onViewPipeline()` when clicked
- Remove `react-router-dom` Link for "View Pipeline"

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/admin/GrantEdit.tsx` | Fix polling condition ("processing" → "analyzing"), add tab state control, pass callback |
| `src/components/admin/AIAnalysisPanel.tsx` | Accept `onViewPipeline` prop, replace Link with Button |

---

## Technical Implementation

### GrantEdit.tsx Changes

```typescript
// 1. Add active tab state
const [activeTab, setActiveTab] = useState("details");

// 2. Fix polling condition (line 141)
const isProcessing = 
  selectedVer.ai_analysis_status === "analyzing" ||  // Was "processing"
  selectedVer.pipeline_generation_status === "generating";

// 3. Update Tabs component to use controlled state
<Tabs value={activeTab} onValueChange={setActiveTab}>

// 4. Pass callback to AIAnalysisPanel
<AIAnalysisPanel
  ...existing props...
  onViewPipeline={() => setActiveTab("pipeline")}
/>
```

### AIAnalysisPanel.tsx Changes

```typescript
// 1. Add prop to interface
interface AIAnalysisPanelProps {
  ...existing props...
  onViewPipeline?: () => void;
}

// 2. Accept in component
export function AIAnalysisPanel({
  ...existing props...
  onViewPipeline,
}: AIAnalysisPanelProps) {

// 3. Replace Link with Button (lines 188-194)
{promptBundleId && onViewPipeline && (
  <Button variant="outline" onClick={onViewPipeline}>
    <ExternalLink className="h-4 w-4 mr-2" />
    View Pipeline
  </Button>
)}
```

---

## Expected Behavior After Fix

### Progress Display
1. User uploads PDF → Progress shows "Step 1: Upload" active
2. Upload completes → "Step 2: Extract rubric" becomes active
3. **UI continues polling every 3 seconds** (fixed!)
4. Extraction completes → "Step 3: Generate pipeline" active
5. Pipeline generated → All steps complete
6. Progress remains visible throughout the entire 30-60 second process

### View Pipeline Button
1. After processing completes, user sees "View Pipeline" button
2. Clicking it **stays on the same page** and switches to the Pipeline tab
3. The inline pipeline editor is immediately visible with all generated steps
