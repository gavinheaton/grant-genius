
# Fix Step 0 Timeout: Switch to Faster Model

## Problem Identified

The report generation is stuck because Step 0 (Build Source Pack) is timing out:

1. **Model Issue**: Step 0 uses `google/gemini-3-pro-preview` (configured in database)
2. **Platform Limit**: Supabase Edge Functions have ~60 second wall-clock limit
3. **Silent Death**: When the platform kills the function at 60s, the AI call dies with no error log
4. **Current behavior**: Function boots → starts Step 0 at 03:45:23 → killed at 03:46:01 (38s of AI wait time)

The Gemini-3-Pro-Preview model is too slow for the 60-second edge function limit.

---

## Solution

Update the Step 0 model override in the database from the heavy `gemini-3-pro-preview` to the faster `gemini-3-flash-preview`.

### Database Change

```sql
UPDATE prompt_bundle_steps 
SET model_override = 'google/gemini-3-flash-preview'
WHERE bundle_id = '90e0e5bd-f625-47c9-83a0-08821153c895'
  AND step_number = 0;
```

**Rationale**:
- `gemini-3-flash-preview` is significantly faster while maintaining quality
- Already used successfully for Steps 4-13 in the same pipeline
- Step 0 (source curation) doesn't require the absolute heaviest reasoning model

---

## Additional Robustness (Optional)

Consider also updating Step 3 (market_segments) which also uses `gemini-3-pro-preview`:

```sql
UPDATE prompt_bundle_steps 
SET model_override = 'google/gemini-3-flash-preview'
WHERE bundle_id = '90e0e5bd-f625-47c9-83a0-08821153c895'
  AND step_number IN (0, 3);
```

---

## Testing After Fix

1. Mark the current stuck run as failed
2. Generate a new report
3. Verify Step 0 completes within ~30-40 seconds
4. Confirm checkpoint saves and Step 1 resumes

---

## Why This Fixes the Issue

| Before | After |
|--------|-------|
| Model: gemini-3-pro-preview (slowest) | Model: gemini-3-flash-preview (faster) |
| Response time: 40-60+ seconds | Response time: 15-35 seconds |
| Edge function killed before completion | Completes within 60s limit |
| No checkpoint saved | Checkpoint saves, Step 1 resumes |
