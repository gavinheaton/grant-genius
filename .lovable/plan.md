
# Fix: Pipeline Generator Creating Invalid Prompts with Template Variables in Output Schemas

## Root Cause Analysis

The error `JSON Guard failed after 3 attempts: Contains unsubstituted template variable: {{ipStatus}}` occurs because:

1. **The AI-generated pipeline includes template variables inside OUTPUT SCHEMA definitions**

   The Step 2 prompt for the failing run contains:
   ```json
   "ip_strategy_validation": "string (Does the user's {{ipStatus}} align with sector norms...)"
   ```

2. **The AI model copies the template variable literally into its response**

   When the model generates JSON output, it sees `{{ipStatus}}` in the schema description and may include it verbatim in the response.

3. **The external Cloud Run worker's JSON Guard rejects the response**

   The worker validates that AI responses don't contain unsubstituted template variables (like `{{ipStatus}}`), treating them as errors.

This is NOT a variable substitution bug - it's a **prompt generation quality issue**. The pipeline generator AI is incorrectly putting template placeholders inside output schema definitions where they will be echoed back.

---

## Solution: Add Variable Sanitization in Pipeline Generator

### Part 1: Sanitize OUTPUT SCHEMA Sections

After the pipeline AI generates prompts, scan and clean any template variables from OUTPUT SCHEMA sections before saving:

```text
Location: supabase/functions/process-grant-guidelines/index.ts
```

Add a post-processing function that:
1. Finds OUTPUT SCHEMA / JSON SCHEMA sections in each prompt
2. Removes or replaces `{{variableName}}` patterns with descriptive text
3. Keeps variables in the INPUTS section (where they belong)

### Part 2: Add Validation Rule to Pipeline Generator Prompt

Update the pipeline generation prompt to explicitly forbid template variables in output schemas:

```text
CRITICAL: 
- Template variables like {{variable}} are ONLY for the INPUTS section
- NEVER use {{variable}} syntax in OUTPUT SCHEMA field descriptions
- Use descriptive text instead: "the user's IP status" NOT "{{ipStatus}}"
```

### Part 3: Add Quality Check for Output Schema Variables

Extend the existing quality scoring to flag prompts containing template variables in their output schemas.

---

## Implementation Details

### File: `supabase/functions/process-grant-guidelines/index.ts`

#### 1. Add sanitization function (after quality scoring):

```typescript
// Sanitize template variables from OUTPUT SCHEMA sections
function sanitizeOutputSchemas(prompt: string): string {
  // Find OUTPUT SCHEMA or JSON SCHEMA sections
  const schemaMatch = prompt.match(/(OUTPUT.*?SCHEMA|JSON.*?SCHEMA)[:\s]*(\{[\s\S]*?\n\})/gi);
  
  if (!schemaMatch) return prompt;
  
  let sanitized = prompt;
  for (const match of schemaMatch) {
    // Replace {{variable}} with descriptive text in schema sections only
    const cleaned = match.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      // Convert camelCase to readable: ipStatus -> "the IP status value"
      const readable = varName
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .trim();
      return `the ${readable} value`;
    });
    sanitized = sanitized.replace(match, cleaned);
  }
  
  return sanitized;
}
```

#### 2. Apply sanitization after enhancement (around line 607):

```typescript
// After quality enhancement loop
console.log("Step 4.5: Sanitizing output schemas...");
for (const step of pipelineData.steps) {
  step.prompt_template = sanitizeOutputSchemas(step.prompt_template);
}
```

#### 3. Update pipeline generation prompt (around line 394):

Add this rule to the CRITICAL section:
```text
- Template variables {{...}} are ONLY for referencing data in the INPUTS or HARD RULES sections
- NEVER include {{variable}} inside OUTPUT SCHEMA field descriptions - use readable text instead
  BAD:  "ip_strategy_validation": "Does {{ipStatus}} align..."
  GOOD: "ip_strategy_validation": "Does the provided IP status align..."
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-grant-guidelines/index.ts` | Add `sanitizeOutputSchemas()` function, apply after enhancement, update pipeline prompt |

---

## Expected Outcome

After implementation:
1. AI-generated pipelines will not contain `{{variable}}` patterns in OUTPUT SCHEMA sections
2. The JSON Guard will no longer reject responses for containing template variables
3. Existing prompts in the database should also be sanitized (can add a one-time migration or manual edit)

---

## Immediate Workaround

For the failing pipeline (`81e751cb-98a6-44a8-afca-99a4c838fc9d`), a Super Admin can manually edit Step 2's prompt to replace:
- `{{ipStatus}}` in the schema → "the IP status value"
- `{{trl}}` in the schema → "the TRL value"

This allows the current run to retry successfully while the permanent fix is deployed.
