
# Fix Prompt Quality Issues and Regeneration Flow

## Summary

Two issues were identified:

1. **Regeneration Error** - The `regenerate-step-prompt` edge function was not deployed ✅ RESOLVED
2. **Low Quality Scores** - Generated prompts score 40-60/100 because they're missing quality markers ✅ FIXED

## Issue 1: Regeneration (RESOLVED)

The edge function has been deployed. You can now use the "Regenerate with AI" button for any step.

---

## Issue 2: Low Prompt Quality from Pipeline Generation (FIXED)

### Root Cause

The `process-grant-guidelines` edge function was generating prompts that:
- Were only 1,000-1,200 characters (minimum should be 1,500)
- Missing "unknown handling" language that scores 10 points
- Missing "placeholder prohibition" rules that score 10 points
- Missing explicit `STEP N` headers that score 15 points

### Solution Applied

Updated the `process-grant-guidelines` edge function with:

1. **Added quality templates** (`PROMPT_QUALITY_TEMPLATE` and `PROMPT_REFERENCE_EXAMPLE`) matching the regenerate function
2. **Enhanced pipeline generation prompt** to explicitly require all quality markers
3. **Lowered enhancement threshold** - now enhances any prompt that isn't 'good' (score < 70) OR is under 1,500 chars
4. **Updated enhancement prompt** to use the same templates and reference examples

### Changes Made

**File: `supabase/functions/process-grant-guidelines/index.ts`**

- Lines 205-300: Added `PROMPT_QUALITY_TEMPLATE` and `PROMPT_REFERENCE_EXAMPLE` constants
- Lines 1016-1080: Updated `pipelinePrompt` to include quality template and explicit requirements
- Lines 1163-1220: Updated auto-enhancement logic to:
  - Enhance all prompts scoring < 70 OR under 1,500 chars
  - Use the quality templates in enhancement prompt
  - Better error handling for enhancement responses

---

## Testing After Fix

1. Reset the grant version status: `pipeline_generation_status = 'none'`
2. Re-trigger "Generate Pipeline"
3. Verify all AI prompt steps score 70+ on quality
4. Confirm prompts are 1,500+ characters with all quality markers
