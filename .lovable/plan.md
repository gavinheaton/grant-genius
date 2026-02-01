

# Fix: Corrupted Prompt in Active Bundle

## Problem Identified

The **finalize_report** step (step 14) in the active bundle has a **corrupted prompt template**:

| Bundle | Step 14 Prompt |
|--------|---------------|
| Active Bundle - 1 Feb | `step_name: finalize_report\nmodel: none\nprompt: empty string\nexpects: JSON object schema` |
| Revised Bundle | `You are finalizing a grant report for Australian government assessors...` (correct) |

The AI received this malformed "schema definition" as its prompt and simply echoed it back wrapped in ` ```json `. The code fence stripping is working correctly - the actual **prompt content is wrong**.

## Root Cause

The finalize_report prompt in the active bundle was overwritten with a schema stub instead of actual instructions. This likely happened during a UI edit or copy operation.

## Solution

### Step 1: Restore the Correct Prompt (Database Fix)

Copy the correct finalize_report prompt from the "Revised Bundle" to the "Active Bundle - 1 Feb":

```text
UPDATE prompt_bundle_steps
SET prompt_template = (
  SELECT prompt_template 
  FROM prompt_bundle_steps 
  WHERE id = '35b91045-8774-4faf-afe8-dd02b0d59eea'
)
WHERE id = 'f595c2f5-218f-4962-a33b-eb8b0a1ec4a3';
```

### Step 2: Add Prompt Validation (Preventive)

Add validation in the PromptStepEditor component to prevent saving invalid prompts:

- Minimum length check (prompts should be at least 50 characters)
- Check for suspicious patterns like "prompt: empty string"
- Warning when prompt doesn't contain expected template variables

## Technical Details

### Current Corrupted Record

| Field | Value |
|-------|-------|
| Step ID | `f595c2f5-218f-4962-a33b-eb8b0a1ec4a3` |
| Bundle ID | `c520cdf2-1809-441c-8038-bf20daa437ea` |
| Bundle Name | Active Bundle - 1 Feb |
| Step Number | 14 |
| Step Name | finalize_report |

### Correct Source Record

| Field | Value |
|-------|-------|
| Step ID | `35b91045-8774-4faf-afe8-dd02b0d59eea` |
| Bundle ID | `90e0e5bd-f625-47c9-83a0-08821153c895` |
| Bundle Name | Revised Bundle |

### Files to Modify (for validation)

| File | Changes |
|------|---------|
| `src/components/admin/PromptStepEditor.tsx` | Add minimum length validation and suspicious pattern detection |

## Success Criteria

1. Step 14 prompt in active bundle matches the Revised Bundle version
2. New reports generate correct HTML output
3. UI prevents saving prompts shorter than 50 characters
4. UI warns on suspicious patterns like "prompt: empty" or "model: none"

