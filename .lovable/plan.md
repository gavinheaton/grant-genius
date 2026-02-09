

# AEA Single Prompt - Redesigned Pipeline

## Analysis of Your ChatGPT Prompt

Your prompt has **11 distinct research steps** plus final assembly. To make this work with Grant Genius, we need to:

1. **Split data gathering** (Firecrawl searches) from **analysis** (AI prompts)
2. **Chain outputs** using `{{stepN}}` syntax
3. **Name the final step** `finalize_report_html` with output key `report_html`

---

## Proposed 10-Step Pipeline Architecture

### Phase 1: Data Gathering (Firecrawl Search Steps)

| Step | Name | Type | Purpose |
|------|------|------|---------|
| 0 | `search_scholarly_competitors` | firecrawl_search | Google Scholar for competitive research projects |
| 1 | `search_market_companies` | firecrawl_search | Find companies with similar products, market sizes |
| 2 | `search_market_data` | firecrawl_search | TAM data from Euromonitor, market research sources |
| 3 | `search_australian_partners` | firecrawl_search | Australian businesses by ANZSIC codes |

### Phase 2: Analysis (AI Prompt Steps)

| Step | Name | Type | Purpose |
|------|------|------|---------|
| 4 | `analyze_market_segments` | ai_prompt | Translate research into 3+ product/service segments |
| 5 | `calculate_tam_sam_som` | ai_prompt | Calculate TAM → SAM → SOM with sources |
| 6 | `build_competitor_analysis` | ai_prompt | Feature/UX/price comparison table |
| 7 | `calculate_economic_impact` | ai_prompt | Australian economic impact from SOM |
| 8 | `identify_partners` | ai_prompt | Match ANZSIC codes to Australian partners |

### Phase 3: Assembly

| Step | Name | Type | Purpose |
|------|------|------|---------|
| 9 | `finalize_report_html` | ai_prompt | Assemble full HTML report with APA citations |

---

## Step-by-Step Prompt Templates

### Step 0: `search_scholarly_competitors` (Firecrawl Search)
```
Query Template:
"{{summary}}" site:scholar.google.com OR site:researchgate.net competitive research similar methodology
```

### Step 1: `search_market_companies` (Firecrawl Search)
```
Query Template:
"{{summary}}" market size revenue company product service commercialization
```

### Step 2: `search_market_data` (Firecrawl Search)
```
Query Template:
"{{summary}}" TAM total addressable market size 2024 2025 site:statista.com OR site:euromonitor.com OR site:marketresearch.com
```

### Step 3: `search_australian_partners` (Firecrawl Search)
```
Query Template:
"{{summary}}" Australia industry partner manufacturer distributor ANZSIC
```

### Step 4: `analyze_market_segments` (AI Prompt)
```text
You are a commercialization analyst for an Australian university research project.

RESEARCH SUMMARY:
{{summary}}

SCHOLARLY RESEARCH FINDINGS:
{{step0}}

MARKET COMPANY DATA:
{{step1}}

TASK:
Analyze how this research can be translated into commercial products or services across at least 3 distinct market segments. At least one segment MUST be in Australia.

For each segment, provide:
1. Segment name and geographic focus
2. Target customer profile
3. Product/service description
4. Value proposition
5. Estimated market entry timeline

OUTPUT FORMAT:
Return valid JSON:
{
  "segments": [
    {
      "segment_name": "string",
      "geography": "string",
      "target_customers": "string",
      "product_description": "string",
      "value_proposition": "string",
      "entry_timeline": "string",
      "sources": ["url1", "url2"]
    }
  ],
  "sources": [
    {"source_id": "S1", "title": "string", "url": "string", "publisher": "string", "date": "string"}
  ]
}
```

### Step 5: `calculate_tam_sam_som` (AI Prompt)
```text
You are a market sizing analyst preparing a grant application for the AEA Ignite program.

RESEARCH SUMMARY:
{{summary}}

MARKET SEGMENTS IDENTIFIED:
{{step4}}

MARKET DATA FROM RESEARCH:
{{step2}}

TASK:
For each market segment, calculate:
1. **Total Addressable Market (TAM)**: The entire market demand
2. **Serviceable Addressable Market (SAM)**: The portion targetable with current capabilities
3. **Serviceable Obtainable Market (SOM)**: Realistic capture over 5 years

REQUIREMENTS:
- All figures must cite validated sources (Statista, Euromonitor, industry reports)
- Provide methodology for each calculation
- Include currency (AUD preferred for Australian segments)
- Flag any assumptions or data gaps

OUTPUT FORMAT:
Return valid JSON:
{
  "market_sizing": [
    {
      "segment": "string",
      "tam": {"value": "number", "currency": "AUD", "methodology": "string", "sources": ["S1"]},
      "sam": {"value": "number", "currency": "AUD", "methodology": "string", "sources": ["S2"]},
      "som": {"value": "number", "currency": "AUD", "methodology": "string", "sources": ["S3"]}
    }
  ],
  "sources": [
    {"source_id": "S1", "title": "string", "url": "string", "publisher": "string", "date": "string"}
  ],
  "data_gaps": ["string"]
}
```

### Step 6: `build_competitor_analysis` (AI Prompt)
```text
You are a competitive intelligence analyst.

RESEARCH SUMMARY:
{{summary}}

MARKET SEGMENTS AND PRODUCTS:
{{step4}}

COMPANY DATA:
{{step1}}

TASK:
Build a comprehensive competitor comparison table for each market segment.

For each competitor, analyze:
1. Company name and location
2. Product/service offering
3. Key features (list 5-8)
4. User experience rating (based on reviews if available)
5. Pricing model and range
6. Market share (if known)

OUTPUT FORMAT:
Return valid JSON:
{
  "competitor_tables": [
    {
      "segment": "string",
      "competitors": [
        {
          "company": "string",
          "location": "string",
          "product": "string",
          "features": ["string"],
          "ux_rating": "string",
          "pricing": "string",
          "market_share": "string",
          "source_url": "string"
        }
      ]
    }
  ],
  "sources": [...]
}
```

### Step 7: `calculate_economic_impact` (AI Prompt)
```text
You are an economic analyst preparing an AEA Ignite grant application.

SERVICEABLE OBTAINABLE MARKET DATA:
{{step5}}

TASK:
Calculate the likely economic impact to the Australian economy from commercializing this research.

Consider:
1. Direct revenue generation (from SOM)
2. Job creation potential
3. Export potential
4. Tax revenue implications
5. Multiplier effects on related industries
6. Comparison to similar commercialization outcomes

OUTPUT FORMAT:
Return valid JSON:
{
  "economic_impact": {
    "direct_revenue_5yr": {"value": "number", "currency": "AUD"},
    "jobs_created": {"value": "number", "methodology": "string"},
    "export_potential": {"value": "number", "currency": "AUD"},
    "tax_revenue": {"value": "number", "currency": "AUD"},
    "multiplier_effect": "string",
    "comparison_cases": ["string"]
  },
  "sources": [...],
  "assumptions": ["string"]
}
```

### Step 8: `identify_partners` (AI Prompt)
```text
You are a business development analyst identifying commercialization partners.

RESEARCH SUMMARY:
{{summary}}

MARKET SEGMENTS:
{{step4}}

AUSTRALIAN PARTNER SEARCH RESULTS:
{{step3}}

TASK:
Based on ANZSIC industry codes (https://www.dcceew.gov.au/sites/default/files/documents/anzsic-code-hierarchy.pdf), identify:

1. Relevant ANZSIC codes for each market segment
2. Australian businesses operating in those classifications
3. Partnership potential (manufacturing, distribution, licensing)

OUTPUT FORMAT:
Return valid JSON:
{
  "partner_analysis": [
    {
      "segment": "string",
      "anzsic_codes": [{"code": "string", "description": "string"}],
      "potential_partners": [
        {
          "company": "string",
          "location": "string",
          "anzsic_code": "string",
          "partnership_type": "string",
          "rationale": "string",
          "source_url": "string"
        }
      ]
    }
  ],
  "sources": [...]
}
```

### Step 9: `finalize_report_html` (AI Prompt) - CRITICAL FINAL STEP
```text
You are assembling the final commercialization report for an AEA Ignite grant application.

RESEARCH SUMMARY:
{{summary}}

MARKET SEGMENTS:
{{step4}}

TAM/SAM/SOM ANALYSIS:
{{step5}}

COMPETITOR ANALYSIS:
{{step6}}

ECONOMIC IMPACT:
{{step7}}

PARTNER ANALYSIS:
{{step8}}

TASK:
Create a comprehensive HTML report that includes:

1. **Executive Summary** - Key findings and recommendations
2. **Market Opportunity** - Segments, TAM/SAM/SOM with tables
3. **Competitive Landscape** - Comparison tables
4. **Economic Impact** - Australian economy benefits
5. **Potential Partners** - Australian industry partnerships
6. **Data Gaps & Considerations** - What needs further research
7. **References** - Full APA format reference list

FORMATTING REQUIREMENTS:
- Use semantic HTML (h1, h2, h3, p, table, ul, ol)
- Tables: 1px black border, smaller font size for cell text
- All citations hyperlinked to source URLs
- No horizontal rules between sections
- Bold only for headings, table headers, and bullet point labels
- Include Table of Contents at the beginning

OUTPUT FORMAT:
Return valid JSON:
{
  "report_html": "<article>...</article>",
  "tables": [...],
  "all_sources": [...],
  "data_gaps": [...]
}

CRITICAL: The report_html key must contain the complete HTML document.
```

---

## Key Differences from Your ChatGPT Prompt

| Aspect | ChatGPT Prompt | Grant Genius Pipeline |
|--------|---------------|----------------------|
| Web searches | ChatGPT does its own browsing | Firecrawl steps gather data first |
| Data flow | Implicit memory | Explicit `{{stepN}}` references |
| Output format | Plain HTML | JSON with `report_html` key |
| Final step name | N/A | Must be `finalize_report_html` |
| Source tracking | Inline citations | Structured `sources` arrays |

---

## Database Setup Required

After you create the grant version and prompt bundle:

```sql
-- Ensure the grant version uses this bundle
UPDATE grant_versions 
SET 
  prompt_bundle_id = '<new_bundle_id>',
  pipeline_generation_status = 'published'
WHERE id = '<grant_version_id>';
```

---

## Model Recommendations

| Step | Model | Reason |
|------|-------|--------|
| 0-3 | N/A (Firecrawl) | Web search steps |
| 4-8 | gemini-3-flash-preview | Fast analysis steps |
| 9 | gemini-3-pro-preview | Heavy assembly, needs 32K output tokens |

---

## Next Steps

1. **Create the grant** in Admin Console
2. **Create the prompt bundle** with these 10 steps
3. **Set step types**: Steps 0-3 as `firecrawl_search`, Steps 4-9 as `ai_prompt`
4. **Configure Firecrawl queries** in step_config_json for steps 0-3
5. **Publish the grant version** so the worker uses this bundle
6. **Test with a sample application**

