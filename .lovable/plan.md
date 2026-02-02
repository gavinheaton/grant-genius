

# Improve AI-Generated Prompt Quality

## Problem Summary

AI-generated pipeline prompts are producing too many "Unknown" values because they lack quality enforcement patterns. Comparison:

| Metric | Active Bundle (Manual) | AI-Generated (AEA Ignite) |
|--------|------------------------|---------------------------|
| Step 0 length | 3,053 chars | 374 chars |
| Has HARD RULES | Yes | No |
| Has OUTPUT SCHEMA | Yes | No |
| Has UNKNOWN TRACKING | Yes | No |
| Has URL validation | Yes | No |
| Has placeholder prohibition | Yes | No |

## Solution: Three Quick Wins

### 1. Improve the Pipeline Generator with Quality Template

Update `process-grant-guidelines` to inject a **quality template** into the AI prompt, forcing it to generate prompts with required patterns.

**Changes to the pipeline generation prompt:**

```text
MANDATORY PROMPT STRUCTURE (every research step MUST include):

1. CONTEXT HEADER - State the step purpose and inputs clearly
   Example: "STEP N - [Purpose]. INPUTS: {{summary}}, {{step0}}"

2. HARD RULES SECTION - 5+ explicit constraints
   - "Do NOT invent facts or numbers"
   - "Only include sources you can validate"
   - "If specific data unavailable, use proxy calculations"
   - "NEVER use placeholder tokens like [Company] or {value}"

3. OUTPUT SCHEMA - Exact JSON structure with field descriptions
   - Must define every field with type and constraints
   - Include example values

4. URL VALIDATION RULES (for steps requiring sources)
   - "Every source must have a valid URL or explicit 'URL not available'"
   - "Prefer .gov.au, .edu.au, published reports"
   - "If URL cannot be verified, mark confidence as 'low'"

5. UNKNOWN HANDLING PROTOCOL
   - "If data unavailable, provide proxy estimate with calculation shown"
   - "Include 'unknowns' array listing what couldn't be found"
   - "Use descriptive fallbacks like 'Not disclosed' instead of 'Unknown'"

MINIMUM PROMPT LENGTH: 1,500 characters per research step
```

### 2. Add a Quality Validation Step (Post-Generation)

After the AI generates the pipeline, validate each prompt against quality criteria before saving. If prompts fail, either:
- Auto-enhance them with a second AI call
- Flag them for admin review

**Quality scoring criteria:**
- `hasContextHeader`: Contains "STEP" and step description
- `hasHardRules`: Contains "HARD RULES" or "CRITICAL RULES"  
- `hasOutputSchema`: Contains "OUTPUT" and "JSON" or "SCHEMA"
- `hasUrlRules`: Contains "URL" and "valid" or "validate"
- `hasUnknownHandling`: Contains "unknown" and handling instructions
- `hasPlaceholderProhibition`: Contains prohibition of `[` or `{` tokens
- `minimumLength`: At least 1,000 characters

**Validation thresholds:**
- Score < 40: Auto-enhance with second AI call
- Score 40-70: Save but flag for admin review
- Score > 70: Save as-is

### 3. Inject Reference Pattern Examples

Include a concrete example from the active bundle in the generation prompt so the AI learns the expected structure:

```text
REFERENCE EXAMPLE (follow this structure):

STEP 0 — Build Source Pack (Australia-first, domain-agnostic)

You are a grant-commercialisation analyst...

HARD RULES:
- Do NOT invent facts or numbers.
- Only include sources you can validate as real and relevant.
- Prefer Australian authoritative sources first when applicable.
- If you cannot find a source type, record it as an Unknown...

SOURCE PACK REQUIREMENTS:
Return 12–25 sources total (max 25).
Include, where relevant:
A) Australia-first authoritative sources...
B) Sector/standards/peak bodies...

FOR EACH SOURCE:
Provide a structured object with:
- source_id (S0-1, S0-2, …)
- title
- publisher
...

OUTPUT:
Return ONLY valid JSON with this exact schema:
{
  "sources": [...],
  "unknowns": [...]
}
```

---

## Implementation Plan

### Phase 1: Update Pipeline Generator Prompt

**File:** `supabase/functions/process-grant-guidelines/index.ts`

**Changes:**

1. Add a `QUALITY_TEMPLATE` constant with the mandatory structure requirements

2. Add a `REFERENCE_EXAMPLE` constant with the active bundle's Step 0 as a pattern example

3. Update the `pipelinePrompt` (around line 274) to include:
   - The mandatory prompt structure requirements
   - The reference example
   - Minimum length enforcement instruction

4. Add a `validatePromptQuality()` function that scores each generated prompt

5. Add an auto-enhancement loop: if a prompt scores < 40, call AI again with specific improvement instructions

### Phase 2: Add Quality Scoring to Admin UI

**New file:** `src/hooks/usePromptQuality.ts`

A hook that provides:
- `calculateQualityScore(prompt: string): QualityScore`
- Quality breakdown by criteria
- Recommendations for improvement

**Modified file:** `src/pages/admin/PromptBundleEdit.tsx`

Add quality indicators:
- Color-coded badge on each step (green/yellow/red)
- Expandable quality breakdown panel
- "Auto-enhance" button for low-scoring prompts

---

## Technical Details

### Quality Scoring Function

```typescript
interface QualityScore {
  total: number;  // 0-100
  breakdown: {
    contextHeader: number;      // 15 pts
    hardRules: number;          // 20 pts
    outputSchema: number;       // 20 pts
    urlValidation: number;      // 15 pts
    unknownHandling: number;    // 15 pts
    placeholderProhibition: number; // 10 pts
    adequateLength: number;     // 5 pts
  };
  recommendations: string[];
}

function calculateQualityScore(prompt: string): QualityScore {
  const checks = {
    contextHeader: /STEP\s*\d|INPUTS?:/i.test(prompt) ? 15 : 0,
    hardRules: /HARD RULES|CRITICAL RULES|REQUIREMENTS/i.test(prompt) ? 20 : 0,
    outputSchema: /OUTPUT.*JSON|JSON.*SCHEMA/is.test(prompt) ? 20 : 0,
    urlValidation: /URL.*valid|valid.*URL/i.test(prompt) ? 15 : 0,
    unknownHandling: /unknown.*handling|if.*not.*found|unknowns.*array/i.test(prompt) ? 15 : 0,
    placeholderProhibition: /\[.*\].*forbidden|placeholder.*prohibit|NEVER.*\[/i.test(prompt) ? 10 : 0,
    adequateLength: prompt.length >= 1000 ? 5 : (prompt.length / 1000) * 5,
  };
  
  return {
    total: Object.values(checks).reduce((a, b) => a + b, 0),
    breakdown: checks,
    recommendations: generateRecommendations(checks),
  };
}
```

### Auto-Enhancement Prompt

When a generated prompt scores < 40, use this enhancement prompt:

```text
The following prompt needs quality improvement. Enhance it to include:
1. A HARD RULES section with explicit constraints
2. An OUTPUT JSON SCHEMA with exact field definitions
3. URL validation requirements
4. Unknown handling protocol with fallback instructions
5. Placeholder prohibition (no [brackets] or {braces} in output)

Original prompt:
[original]

Return the enhanced prompt maintaining the same research purpose but with proper structure.
Minimum length: 1,500 characters.
```

---

## Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `supabase/functions/process-grant-guidelines/index.ts` | Modify | Add quality template, reference example, validation function, auto-enhancement loop |
| `src/hooks/usePromptQuality.ts` | Create | Quality scoring hook for admin UI |
| `src/pages/admin/PromptBundleEdit.tsx` | Modify | Add quality score badges and enhancement button |
| `src/components/admin/PromptQualityBadge.tsx` | Create | Visual quality indicator component |

---

## Expected Outcomes

After implementation:
- AI-generated prompts will be 1,500+ characters (vs 300-400 currently)
- Every prompt will have structured output schemas
- Unknown rates should drop from 85% to under 20%
- Admin can see quality scores at a glance and enhance weak prompts

