
# Fix Pipeline Generator Assembly Steps & Add Variable Validation

## Overview

Two related issues need to be addressed:

1. **Assembly Steps Fail**: The `finalize_report_html` step expects to extract `sections_html` from a prior step, but the AI receives the full JSON object via `{{stepN}}` and doesn't understand how to parse it
2. **No Variable Validation**: The quality checker doesn't verify that variable references like `{{step7}}` or `{{sections_html}}` are actually valid

## Root Cause Analysis

When the pipeline generator creates the final assembly step:

```
// Current template says:
"Take the sections_html from step ${maxAIStep + 1}"

// But the injected variable looks like:
{{step7}} = {"sections_html": "<h2>...</h2>", "data_gaps": [...]}
```

The AI gets confused because:
- It's told to "take sections_html" but receives a JSON object
- There's no explicit instruction on how to parse the JSON
- The output schema requires `report_html` but isn't told how to build it

## Solution

### Part 1: Fix Pipeline Generator Assembly Templates

Update `supabase/functions/process-grant-guidelines/index.ts` to improve the `finalize_report_html` template with:

1. **Explicit JSON parsing instructions** - Tell the AI the exact structure it will receive
2. **Clear field extraction** - Show how to access nested properties
3. **Step-by-step merge instructions** - Explicitly describe combining sections + tables + sources

**Updated Template (lines 708-738):**

```typescript
{
  step_name: "finalize_report_html",
  step_description: "Merge sections, tables, and sources into final report_html output",
  model_tier: "lite",
  prompt_template: `STEP ${maxAIStep + 3} — Finalize Report (HTML)

You are merging the research narrative with data tables to produce the final report.

INPUT DATA FORMAT:
You will receive two JSON objects from previous steps:

Step ${maxAIStep + 1} data ({{step${maxAIStep + 1}}}):
- "sections_html": string - The complete narrative HTML document
- "data_gaps": array - List of data gaps identified

Step ${maxAIStep + 2} data ({{step${maxAIStep + 2}}}):
- "tables": object with keys "competitors", "market_sizing", "partners" - HTML tables
- "all_sources": array - All citations

YOUR TASK:
1. PARSE the JSON objects to extract the values
2. Get the "sections_html" value from Step ${maxAIStep + 1} - this is your base HTML
3. Find these table anchors in the HTML and replace with tables from Step ${maxAIStep + 2}:
   - Replace "<!-- TABLE:competitors -->" with tables.competitors
   - Replace "<!-- TABLE:market_sizing -->" with tables.market_sizing
   - Replace "<!-- TABLE:partners -->" with tables.partners
4. Append a References section at the end:
   <h2>References</h2>
   <div class="sources"><ul>...formatted citations...</ul></div>
5. Combine data_gaps from both steps

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - NO code fences (\`\`\`json or \`\`\`)
2. First character must be { and last must be }
3. The "report_html" field MUST contain the complete merged HTML document
4. Do NOT return the raw JSON objects - extract and combine the content

OUTPUT JSON SCHEMA:
{
  "title": "Grant Report: [Project Title]",
  "report_html": "<h2>Executive Summary</h2>...[full merged HTML with tables inserted]...<h2>References</h2>...",
  "all_sources": [{"id": "S0-1", "mla_citation": "...", "url": "..."}],
  "data_gaps": ["gap1", "gap2"],
  "tables": {"competitors": "...", "market_sizing": "...", "partners": "..."}
}`
}
```

### Part 2: Add Variable Validation to Quality Checker

Update `src/hooks/usePromptQuality.ts` to add a new scoring criterion that validates variable references.

**Approved Variables (from shortcode specification):**
- User Inputs: `{{summary}}`, `{{publicArticleUrl}}`, `{{articleContent}}`, `{{trl}}`, `{{ipStatus}}`
- Grant Context: `{{grantName}}`, `{{grantVersionLabel}}`, `{{grantGuidelines}}`, `{{grantRubric}}`, `{{grantSummary}}`
- Step 0 Source Pack: `{{sources}}`, `{{unknowns}}`
- Step Outputs: `{{step0}}`, `{{step1}}`, ..., `{{step99}}`

**New Quality Check:**

```typescript
export interface QualityScore {
  total: number;
  breakdown: {
    // ... existing fields ...
    validVariables: number;     // 10 pts - All {{variables}} are valid shortcodes
  };
  invalidVariables: string[];   // List any invalid variables found
  recommendations: string[];
  level: 'good' | 'warning' | 'poor';
}

// Approved variable patterns
const VALID_VARIABLE_PATTERNS = [
  // User inputs
  /^summary$/,
  /^publicArticleUrl$/,
  /^articleContent$/,
  /^trl$/,
  /^ipStatus$/,
  // Grant context
  /^grantName$/,
  /^grantVersionLabel$/,
  /^grantGuidelines$/,
  /^grantRubric$/,
  /^grantSummary$/,
  // Source pack
  /^sources$/,
  /^unknowns$/,
  // Step outputs (step0 through step99)
  /^step\d{1,2}$/,
];

function validateVariables(prompt: string): { score: number; invalid: string[] } {
  const variableMatches = prompt.match(/\{\{(\w+)\}\}/g) || [];
  const variables = variableMatches.map(v => v.replace(/\{\{|\}\}/g, ''));
  
  const invalid = variables.filter(v => 
    !VALID_VARIABLE_PATTERNS.some(pattern => pattern.test(v))
  );
  
  // Score: 10 points if all valid, 5 if some invalid, 0 if many invalid
  const invalidRatio = variables.length > 0 ? invalid.length / variables.length : 0;
  const score = invalidRatio === 0 ? 10 : invalidRatio < 0.5 ? 5 : 0;
  
  return { score, invalid: [...new Set(invalid)] };
}
```

**Updated Recommendations:**

```typescript
function generateRecommendations(breakdown: QualityScore['breakdown'], invalidVars: string[]): string[] {
  const recommendations: string[] = [];
  
  // ... existing recommendations ...
  
  if (invalidVars.length > 0) {
    recommendations.push(
      `Invalid variables found: ${invalidVars.join(', ')}. Use only approved shortcodes: {{summary}}, {{step0}}, {{grantName}}, etc.`
    );
  }
  
  return recommendations;
}
```

### Part 3: Keep Worker Logs Open Longer

Update `src/components/workspace/GenerationProgress.tsx` and `src/components/workspace/ReportLogViewer.tsx`:

1. Show logs for ANY run that has an activeRunId (not just running/failed)
2. Add a "user dismissed" state so logs stay open until explicitly closed
3. Increase log viewer height from 200px to 300px

**GenerationProgress.tsx change (line 358):**
```typescript
// Before: only show for active/error states
{(status === "running" || status === "pending" || status === "failed" || status === "stalled") && (
  <ReportLogViewer reportRunId={activeRunId} />
)}

// After: show whenever there's an active run ID
{activeRunId && (
  <ReportLogViewer reportRunId={activeRunId} />
)}
```

**ReportLogViewer.tsx changes:**
- Add `userDismissed` state to track if user closed the panel
- Reset `userDismissed` when `reportRunId` changes
- Increase ScrollArea height to 300px

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-grant-guidelines/index.ts` | Update `finalize_report_html` template (lines 708-738) with explicit JSON parsing instructions |
| `src/hooks/usePromptQuality.ts` | Add `validVariables` scoring criterion and `invalidVariables` array |
| `src/components/admin/PromptQualityBadge.tsx` | Display invalid variables in the breakdown panel |
| `src/components/workspace/GenerationProgress.tsx` | Show log viewer for any activeRunId |
| `src/components/workspace/ReportLogViewer.tsx` | Add userDismissed state, increase height to 300px |

## Expected Outcomes

1. **Pipeline Generator**: The finalize step will correctly extract `sections_html` from the JSON and produce a valid `report_html` field
2. **Quality Checker**: Invalid variable references like `{{report_html}}` will be flagged with a recommendation showing approved shortcodes
3. **Log Viewer**: Logs remain visible after run completion until the user dismisses them

## Testing

After implementation:
1. Create a new grant version and upload guidelines
2. Let the pipeline generator create the bundle
3. Check that the finalize step prompt includes clear JSON parsing instructions
4. Verify quality badges show valid variable scores
5. Run a report and confirm logs stay visible after completion
