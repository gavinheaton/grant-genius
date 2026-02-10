

## Fix: Include Firecrawl Config in AI Pipeline Validation

### Problem

The AI pipeline validator is giving inaccurate results because it only sees `prompt_template` for each step. For **Firecrawl search/scrape steps**, the actual query content lives in `step_config_json.query_template` -- not in `prompt_template`. So the AI sees a generic or empty prompt and incorrectly reports that the step doesn't reference upstream data.

In your case, Step 4 (`search_market_data`) has a detailed query template in `step_config_json` that explicitly references `{{analyze_market_segments}}`, but the AI never sees it.

### Solution

Send `step_config_json` alongside `prompt_template` so the AI has the full picture for every step type.

### Changes

**1. `src/pages/admin/PromptBundleEdit.tsx`**

- Add `step_config_json` and `step_type` to the payload sent to the edge function:

```text
steps: bundle.steps.map(s => ({
  step_number: s.step_number,
  step_name: s.step_name,
  step_description: s.step_description,
  prompt_template: s.prompt_template,
  step_type: s.step_type,            // NEW
  step_config_json: s.step_config_json, // NEW
}))
```

**2. `supabase/functions/validate-pipeline/index.ts`**

- Accept `step_type` and `step_config_json` in the incoming payload
- For `firecrawl_search` steps, extract `query_template` from `step_config_json` and include it in the analysis data sent to Gemini
- For `firecrawl_scrape` steps, include `url_variable` and formats info
- Update the system prompt to explain that some steps are web search/scrape steps and their query template is the primary content to evaluate (not `prompt_template`)
- Update the variables extraction to also scan `query_template` for `{{variable}}` references

### Technical Detail

The `stepsForAnalysis` object sent to Gemini will be enhanced:

```text
{
  step_number: 4,
  step_name: "search_market_data",
  step_type: "firecrawl_search",        // NEW
  step_description: "Search for market sizing...",
  prompt_excerpt: "",                     // may be empty for search steps
  query_template: "Find TAM, SAM...",    // NEW -- from step_config_json
  variables_used: ["analyze_market_segments"], // NOW correctly extracted
}
```

| File | Change |
|------|--------|
| `src/pages/admin/PromptBundleEdit.tsx` | Add `step_type` and `step_config_json` to the edge function payload |
| `supabase/functions/validate-pipeline/index.ts` | Extract and include Firecrawl config in AI analysis; update system prompt to explain step types |
