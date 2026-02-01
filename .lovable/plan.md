

# Fix: Prevent Duplicate Pipeline Generation

## Problem Identified

Two pipelines were generated within 1 second of each other because the `process-grant-guidelines` edge function was called twice:

| Bundle | Created At | Steps |
|--------|-----------|-------|
| AEA_Ignite_2026_Evidence_Builder | 10:12:46 | 11 |
| AEA_Ignite_2026_Evidence_Gathering_Pipeline | 10:12:47 | 11 |

The grant version is linked to the second one, leaving the first as an orphan.

## Root Causes

1. **No processing lock** in the uploader component
2. **No idempotency check** in the edge function - it doesn't verify if processing is already in progress
3. Parent component state updates may have triggered duplicate calls

## Solution

### 1. Add Idempotency Check to Edge Function

Modify `process-grant-guidelines/index.ts` to check the current status before processing:

```text
Before starting:
1. Check if ai_analysis_status is already "processing"
2. Check if pipeline_generation_status is already "generating" 
3. If either is true, return early with "Already processing" message
4. Use atomic update with WHERE clause to claim the processing slot
```

### 2. Add Processing Lock to Uploader

Modify `GuidelinesUploader.tsx`:

```text
1. Add isProcessing state to track if triggerProcessing is running
2. Guard triggerProcessing with early return if already processing
3. Disable the upload zone during processing
```

### 3. Clean Up Orphaned Bundle (One-time)

Delete the orphaned pipeline that isn't linked to any grant version.

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-grant-guidelines/index.ts` | Add idempotency check before processing |
| `src/components/admin/GuidelinesUploader.tsx` | Add `isProcessing` state and guard |

## Technical Details

### Edge Function Idempotency Pattern

```javascript
// Atomic claim - only proceeds if status is 'pending'
const { data: claimed, error } = await supabaseAdmin
  .from("grant_versions")
  .update({ ai_analysis_status: "processing" })
  .eq("id", grant_version_id)
  .eq("ai_analysis_status", "pending")  // Only if not already started
  .select("id")
  .single();

if (!claimed) {
  return Response.json({ 
    message: "Already processing or completed",
    skipped: true 
  });
}
```

### Uploader Guard Pattern

```javascript
const [isProcessing, setIsProcessing] = useState(false);

const triggerProcessing = async (rawText: string) => {
  if (isProcessing) return; // Guard against duplicate calls
  setIsProcessing(true);
  try {
    // ... existing code
  } finally {
    setIsProcessing(false);
  }
};
```

## Cleanup Query

To remove the orphaned bundle:

```sql
DELETE FROM prompt_bundle_steps 
WHERE bundle_id = '3dc4fce1-ae58-40a6-8456-68c68860e546';

DELETE FROM prompt_bundles 
WHERE id = '3dc4fce1-ae58-40a6-8456-68c68860e546';
```

## Success Criteria

1. Uploading guidelines only creates one pipeline
2. Rapid duplicate calls are safely ignored
3. Edge function logs show "Already processing" for duplicate attempts
4. No orphaned bundles created

