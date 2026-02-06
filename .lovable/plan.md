
# Fix Prompt Quality Issues and Regeneration Flow

## Summary

Two issues were identified:

1. **Regeneration Error** - The `regenerate-step-prompt` edge function was not deployed
2. **Low Quality Scores** - Generated prompts score 40-60/100 because they're missing quality markers

## Issue 1: Regeneration (RESOLVED)

The edge function has been deployed. You can now use the "Regenerate with AI" button for any step.

---

## Issue 2: Low Prompt Quality from Pipeline Generation

### Root Cause

The `process-grant-guidelines` edge function generates prompts that:
- Are only 1,000-1,200 characters (minimum should be 1,500)
- Missing "unknown handling" language that scores 10 points
- Missing "placeholder prohibition" rules that score 10 points
- Missing explicit `STEP N` headers that score 15 points

### Current State of Generated Prompts

| Step | Name | Length | Has Hard Rules | Has Schema | Quality |
|------|------|--------|----------------|------------|---------|
| 4 | build_source_pack | 1,201 | Yes | Yes | ~45 |
| 5 | calculate_economic_impact | 1,230 | Yes | Yes | ~50 |
| 6 | calculate_market_sizing | 1,164 | Yes | Yes | ~45 |

### Solution: Enhance Pipeline Generator Prompts

Update the prompt generation logic in `process-grant-guidelines` to include all quality markers:

1. Add `STEP N — [Purpose]` headers
2. Add unknown handling protocol section
3. Add placeholder prohibition rules
4. Expand prompts to 1,500+ characters

---

## Files to Modify

**File: `supabase/functions/process-grant-guidelines/index.ts`**

### Changes Required

1. **Enhance the AI prompt template** that generates step prompts (around line 850-950)
   - Add mandatory quality sections to the system prompt
   - Include the QUALITY_TEMPLATE and REFERENCE_EXAMPLE patterns from the regenerate function

2. **Update step prompt generation** to enforce:
   - Minimum 1,500 character length
   - `STEP N` context headers
   - Unknown handling protocol
   - Placeholder prohibition rules

### Sample Enhanced Prompt Structure

Each generated prompt should include:

```text
STEP N — [Purpose]. 
INPUTS: {{summary}}, {{stepN-1}}, etc.

You are [role description].

HARD RULES:
1. Do NOT invent facts or numbers
2. NEVER use placeholder tokens like [Company] or {value}
3. If data unavailable, provide conservative proxy estimate
4. Prefer Australian authoritative sources
5. [Additional domain-specific rules]

UNKNOWN HANDLING:
- If data unavailable, use descriptive text like "Not publicly disclosed"
- Include "unknowns" array listing what couldn't be found
- Provide proxy estimates with methodology shown

OUTPUT JSON SCHEMA:
{
  [Detailed schema with types and examples]
}
```

---

## Immediate Workaround

While the fix is pending, you can:
1. Use the **"Regenerate with AI"** button on each step (now working after deployment)
2. The regeneration uses the quality template to enhance each prompt to 1,500+ characters

---

## Testing After Fix

1. Reset the grant version status to `pipeline_generation_status = 'none'`
2. Re-trigger "Generate Pipeline"
3. Verify all AI prompt steps score 70+ on quality
4. Confirm prompts are 1,500+ characters with all quality markers
