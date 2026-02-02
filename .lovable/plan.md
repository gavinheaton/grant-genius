
# Fix: Pipeline Generator Creating Invalid Prompts with Template Variables in Output Schemas

## Status: ✅ IMPLEMENTED

## Root Cause Analysis

The error `JSON Guard failed after 3 attempts: Contains unsubstituted template variable: {{ipStatus}}` occurs because:

1. **The AI-generated pipeline includes template variables inside OUTPUT SCHEMA definitions**

   The Step 2 prompt for the failing run contains:
   ```json
   "ip_strategy_validation": "string (Does the user's {{ipStatus}} align with sector norms...)"
   ```

2. **The AI model copies the template variable literally into its response**

3. **The external Cloud Run worker's JSON Guard rejects the response**

---

## Solution Implemented

### Part 1: Sanitize OUTPUT SCHEMA Sections ✅

Added `sanitizeOutputSchemas()` function in `supabase/functions/process-grant-guidelines/index.ts` that:
- Finds OUTPUT SCHEMA / JSON SCHEMA sections in each prompt
- Replaces `{{variableName}}` patterns with descriptive text (e.g., "the ip status value")
- Keeps variables in the INPUTS section (where they belong)

### Part 2: Updated Pipeline Generator Prompt ✅

Added explicit rules to the QUALITY_TEMPLATE forbidding template variables in output schemas:
```text
CRITICAL: NEVER use {{variable}} syntax inside OUTPUT SCHEMA field descriptions!
- BAD:  "ip_strategy_validation": "Does {{ipStatus}} align with sector norms..."
- GOOD: "ip_strategy_validation": "Does the provided IP status align with sector norms..."
```

### Part 3: Added Quality Scoring for Schema Variables ✅

Updated `src/hooks/usePromptQuality.ts`:
- Added `hasVariablesInOutputSchema()` check
- Added `hasVariablesInSchema` to `QualityScore` interface
- Penalizes prompts with template variables in OUTPUT SCHEMA
- Added specific recommendation to remove them

### Part 4: Updated UI Badge ✅

Updated `src/components/admin/PromptQualityBadge.tsx`:
- Shows critical warning when template variables detected in OUTPUT SCHEMA

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/process-grant-guidelines/index.ts` | Added `sanitizeOutputSchemas()`, updated QUALITY_TEMPLATE |
| `src/hooks/usePromptQuality.ts` | Added schema variable detection and scoring |
| `src/components/admin/PromptQualityBadge.tsx` | Added schema variable warning display |

---

## Expected Outcome

1. ✅ Future AI-generated pipelines will not contain `{{variable}}` patterns in OUTPUT SCHEMA sections
2. ✅ The JSON Guard will no longer reject responses for containing template variables
3. ✅ Quality badge shows warnings for existing prompts with this issue

---

## Immediate Workaround for Existing Pipelines

For the failing pipeline (`81e751cb-98a6-44a8-afca-99a4c838fc9d`), a Super Admin can manually edit Step 2's prompt to replace:
- `{{ipStatus}}` in the schema → "the IP status value"
- `{{trl}}` in the schema → "the TRL value"
