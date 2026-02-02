

# Fix Pipeline Generator Status Value Bug

## Problem

The `process-grant-guidelines` edge function is failing because it's trying to set an invalid value for `ai_analysis_status`.

**Database constraint allows:**
- `pending`
- `analyzing`
- `completed`
- `failed`

**Code is trying to set:** `processing` (line 104)

This causes the error:
> "new row for relation 'grant_versions' violates check constraint 'grant_versions_ai_analysis_status_check'"

## Root Cause

In the recent changes to add the atomic claim/idempotency check, the status was changed from the valid value `analyzing` to an invalid value `processing`.

## Solution

Change line 104 from `"processing"` to `"analyzing"` to match the database constraint.

## File to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-grant-guidelines/index.ts` | Line 104: Change `"processing"` to `"analyzing"` |

## Code Change

```typescript
// Line 103-106 - BEFORE
const { data: claimed, error: claimError } = await supabaseAdmin
  .from("grant_versions")
  .update({ 
    ai_analysis_status: "processing",  // INVALID
    pipeline_generation_status: "none"
  })

// Line 103-106 - AFTER
const { data: claimed, error: claimError } = await supabaseAdmin
  .from("grant_versions")
  .update({ 
    ai_analysis_status: "analyzing",  // VALID
    pipeline_generation_status: "none"
  })
```

## Expected Outcome

After this fix, the pipeline generator will:
1. Successfully claim the grant version for processing
2. Proceed with AI extraction and pipeline generation
3. Complete without database constraint violations

