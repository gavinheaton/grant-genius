

# Hybrid Architecture: Data Gathering + Analysis + Synthesis Pipeline

## Problem Statement

The current `one_prompt` pipeline for AMT Bio asks the AI to "search Google Scholar" and "find market data", but LLMs cannot actually access the web. This causes hallucinations where the AI fabricates sources, URLs, and data points.

## Solution: 3-Phase Hybrid Architecture

Split every pipeline into formally distinct phases where real data collection happens before AI analysis.

```text
PHASE 1: DATA GATHERING (Firecrawl)
├── Step 0: Scrape user's article URL
├── Step 1: Web search for market data (Firecrawl /search)
├── Step 2: Web search for competitors (Firecrawl /search)
└── Step 3: Web search for industry reports (Firecrawl /search)

PHASE 2: ANALYSIS (Gemini/GPT)
├── Step 4: Synthesize market sizing from gathered data
├── Step 5: Analyze competitive landscape
├── Step 6: Economic impact estimation
└── Step 7: Stakeholder mapping

PHASE 3: SYNTHESIS (Gemini)
├── Step 8: Assemble sections as HTML
├── Step 9: Build tables and sources
└── Step 10: Finalize report_html
```

## Technical Implementation

### 1. New Step Type: "firecrawl_search"

Add a new step execution mode that calls Firecrawl's `/v1/search` API instead of the AI.

**Database Changes:**
Add a column to `prompt_bundle_steps`:
```sql
ALTER TABLE prompt_bundle_steps 
ADD COLUMN step_type TEXT DEFAULT 'ai_prompt'
CHECK (step_type IN ('ai_prompt', 'firecrawl_search', 'firecrawl_scrape'));
```

**New Step Configuration for Search Steps:**
```json
{
  "step_type": "firecrawl_search",
  "search_query_template": "{{grantName}} market size Australia 2024",
  "limit": 10,
  "scrape_results": true
}
```

### 2. Worker-Proxy Enhancement

Update `worker-proxy/index.ts` to expose a new action for the external worker:

```typescript
// New action: execute_firecrawl_search
case "execute_firecrawl_search":
  return await handleFirecrawlSearch(supabase, params);

async function handleFirecrawlSearch(supabase, params) {
  const { query, limit, scrapeOptions } = params;
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  
  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: limit || 10,
      scrapeOptions: scrapeOptions || { formats: ["markdown"] }
    }),
  });
  
  const data = await response.json();
  return jsonResponse({ 
    success: true, 
    results: data.data,
    sources: data.data?.map((r, i) => ({
      source_id: `SEARCH-${i+1}`,
      url: r.url,
      title: r.title,
      content: r.markdown?.slice(0, 5000),
      confidence: "high" // Real search result
    }))
  });
}
```

### 3. Pipeline Generator Update

Modify `process-grant-guidelines/index.ts` to generate hybrid pipelines:

**Updated Pipeline Structure:**
```javascript
// Standard hybrid pipeline template
const HYBRID_PIPELINE_TEMPLATE = [
  // PHASE 1: Data Gathering (Firecrawl)
  {
    step_number: 0,
    step_name: "scrape_article",
    step_type: "firecrawl_scrape",
    config: { url_variable: "publicArticleUrl" }
  },
  {
    step_number: 1,
    step_name: "search_market_data",
    step_type: "firecrawl_search",
    config: {
      query_template: "{{research_domain}} market size Australia 2024 site:abs.gov.au OR site:ibisworld.com",
      limit: 8
    }
  },
  {
    step_number: 2,
    step_name: "search_competitors",
    step_type: "firecrawl_search",
    config: {
      query_template: "{{research_domain}} companies startups Australia competitors",
      limit: 8
    }
  },
  {
    step_number: 3,
    step_name: "search_policy_funding",
    step_type: "firecrawl_search",
    config: {
      query_template: "{{research_domain}} government funding policy Australia site:gov.au",
      limit: 5
    }
  },
  
  // PHASE 2: Analysis (AI)
  {
    step_number: 4,
    step_name: "synthesize_market_sizing",
    step_type: "ai_prompt",
    prompt_template: `You are analyzing REAL search results to estimate market size...
    
INPUT DATA (from web search - these are REAL sources):
{{step1}}

YOUR TASK:
- Extract numeric data points from the search results
- Calculate TAM/SAM/SOM using ONLY data found in sources
- If data not found, state "Data not available in searched sources"
- NEVER invent numbers

OUTPUT JSON SCHEMA:
{
  "tam": { "value": "...", "source_id": "SEARCH-1" },
  "sam": { "value": "...", "calculation": "..." },
  "som": { "value": "...", "methodology": "..." },
  "data_gaps": ["..."]
}`
  },
  // ... more AI analysis steps
  
  // PHASE 3: Assembly (existing logic)
  // ... assemble_sections_html, build_tables_sources_html, finalize_report_html
];
```

### 4. External Worker Requirements

The external Cloud Run worker needs to be updated to:

1. **Detect step type** from the bundle configuration
2. **For `firecrawl_search` steps:**
   - Call `worker-proxy` with `action: "execute_firecrawl_search"`
   - Store results as step output
   - No AI call needed
3. **For `ai_prompt` steps:**
   - Interpolate prior step outputs (including search results)
   - Call AI as usual

**Worker Pseudocode:**
```javascript
for (const step of bundle.steps) {
  if (step.step_type === 'firecrawl_search') {
    const query = interpolate(step.config.query_template, context);
    const results = await workerProxy('execute_firecrawl_search', { query });
    await workerProxy('update_step', { outputs_json: results });
  } else if (step.step_type === 'ai_prompt') {
    // Existing AI execution logic
    const prompt = interpolate(step.prompt_template, context);
    const aiResult = await callGemini(prompt);
    await workerProxy('update_step', { outputs_json: aiResult });
  }
}
```

### 5. AMT Bio Migration

For the immediate single-prompt pipeline (AMT Bio), update the prompt to:
1. Remove all "search" instructions
2. Use ONLY the scraped article content
3. Mark all external claims as "REQUIRES VALIDATION"

**Immediate Fix (before full hybrid implementation):**
```sql
UPDATE prompt_bundle_steps 
SET prompt_template = '...[updated prompt without search instructions]...'
WHERE bundle_id = '6abbcd3f-3cf0-41ef-869b-2138abfbc788';
```

## Implementation Phases

### Phase A: Immediate Fix (1-2 hours) — PENDING
1. Update AMT Bio `one_prompt` to remove search instructions
2. Add explicit "Data sources: User-provided article only" disclaimer
3. Mark all market data as "ESTIMATE - REQUIRES VALIDATION"

### Phase B: Worker-Proxy Search Action (2-3 hours) — ✅ COMPLETE
1. ✅ Add `execute_firecrawl_search` action to worker-proxy
2. ✅ Add `execute_firecrawl_scrape` action (for article scraping)
3. ✅ Deploy and test via edge function

### Phase C: Database Schema Update (30 min) — ✅ COMPLETE
1. ✅ Add `step_type` column to `prompt_bundle_steps`
2. ✅ Add `step_config_json` column for search/scrape configuration

### Phase D: Pipeline Generator Update (2-3 hours) — ✅ COMPLETE
1. ✅ Modify `process-grant-guidelines` to generate hybrid pipelines
2. ✅ Add Firecrawl data-gathering steps (Steps 0-3) before AI analysis steps
3. ✅ Update step numbering and references (AI steps now start at Step 4)
4. ✅ Add StepTypeEditor UI component for configuring Firecrawl steps

### Phase E: External Worker Update (External - 2-3 hours) — PENDING
1. Add step type detection logic
2. Implement Firecrawl step execution via worker-proxy
3. Test full hybrid pipeline

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/worker-proxy/index.ts` | Add `execute_firecrawl_search` and `execute_firecrawl_scrape` actions |
| `supabase/functions/process-grant-guidelines/index.ts` | Generate hybrid pipelines with search steps |
| Database: `prompt_bundle_steps` | Add `step_type` and `step_config_json` columns |
| External: Cloud Run Worker | Add step type detection and Firecrawl execution |

## Firecrawl Usage Strategy

**Search Queries per Report:**
- Market data: 1 search (8-10 results)
- Competitors: 1 search (8-10 results)
- Policy/funding: 1 search (5 results)
- Industry reports: 1 search (5 results)

**Estimated Credits:** ~4 searches + 1 scrape per report

**Search Query Patterns:**
```
Market: "{domain} market size Australia 2024 site:abs.gov.au OR site:ibisworld.com"
Competitors: "{domain} companies startups Australia"
Policy: "{domain} government funding Australia site:gov.au"
Academic: "{domain} research Australia site:scholar.google.com OR site:pubmed.gov"
```

## Benefits

1. **No Hallucinations:** AI only analyzes real search results
2. **Verifiable Sources:** Every claim linked to actual URLs
3. **Consistent Quality:** Same search patterns for every report
4. **Audit Trail:** Search queries and results stored per step
5. **Scalable:** Works for any grant type

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Firecrawl rate limits | Implement retry with backoff; cache common searches |
| Search returns irrelevant results | Refine query templates; add domain restrictions |
| Increased pipeline duration | Parallel search execution where possible |
| Cost increase | Monitor usage; add search result caching |

