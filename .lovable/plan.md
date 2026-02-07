
# Grant Bundle Architect: Assessor-Grade Upgrade

## Summary

This plan delivers a major upgrade to the Grant Bundle Architect to produce assessor-grade, evidence-backed grant research outputs for ANY grant type. The upgrade addresses two critical problems:

1. **Content Quality**: Generated reports contain placeholders (`[Insert…]`, `{TBD}`, `Hypothetical Competitor`), emit `Unknown (no validated source)` in core sections, and lack assessor-focused insight
2. **Citation Hygiene**: Bracketed internal source IDs (`[S0-1]`, `[ARTICLE-1]`) leak into final report output

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STAGE 3: PIPELINE GENERATION PROMPT                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  NEW UNIVERSAL STEPS:                                                        │
│  ┌───────────────────┐  ┌───────────────────┐  ┌────────────────────────┐   │
│  │ rubric_traceability│  │ assessor_insight  │  │ comparables_market     │   │
│  │ _matrix           │  │ _layer            │  │ _signals               │   │
│  └───────────────────┘  └───────────────────┘  └────────────────────────┘   │
│                                                                              │
│  ENHANCED EXISTING STEPS:                                                    │
│  ┌───────────────────┐  ┌───────────────────┐  ┌────────────────────────┐   │
│  │ market_sizing     │  │ competitor_analysis│ │ commercialisation_logic│   │
│  │ (proxy protocol)  │  │ (no hypotheticals)│  │ (TRL + additionality)  │   │
│  └───────────────────┘  └───────────────────┘  └────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│  QUALITY ENFORCEMENT:                                                        │
│  • Forbidden patterns regex: {TBD}, [Insert, Hypothetical, [PROJECT NAME]   │
│  • Mandatory proxy protocol for unavailable data                             │
│  • Auto-enhancement removes forbidden patterns                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ASSEMBLY LAYER (4 Steps)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Step N+1: assemble_sections_html    (narrative with internal markers)      │
│  Step N+2: build_tables_sources_html (tables + all_sources registry)        │
│  Step N+3: clean_citations_apa       (transform [S0-1] → (Author, Year))    │
│  Step N+4: finalize_report_html      (merge + validate NO markers remain)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part A: Stage 3 Pipeline Generation Prompt Enhancements

### A1. New Universal Step: `rubric_traceability_matrix`

Insert as Step 1 (after `build_source_pack`) to ensure every rubric criterion and required input is explicitly mapped to evidence outputs.

**Purpose**: Produce a traceability matrix showing rubric_section_key → criterion → evidence_outputs → gaps → mitigation

**Output Schema**:
```json
{
  "rubric_mapping": [
    {
      "rubric_section_key": "innovation",
      "criterion": "Technical novelty",
      "weight": 30,
      "evidence_outputs": ["step3.prior_art_analysis", "step5.competitor_landscape"],
      "gaps": ["No Australian patent search available"],
      "mitigation": ["Use IP Australia basic search", "Cite academic review articles"]
    }
  ],
  "required_inputs_mapping": [
    {
      "input_key": "budget_breakdown",
      "report_section": "Budget and Value for Money",
      "status": "provided|missing|partial",
      "applicant_request": "Provide itemized budget with justification"
    }
  ]
}
```

### A2. New Universal Step: `assessor_insight_layer`

Insert after rubric traceability to provide assessor-focused analysis for every rubric section.

**Purpose**: For each rubric section, generate assessor intent, typical failure modes, best-available evidence plan, and applicant action prompts.

**Output Schema**:
```json
{
  "assessor_insights": [
    {
      "rubric_section_key": "commercial_viability",
      "assessor_intent": "Assessors want to see realistic market opportunity with validated customer demand",
      "typical_failure_modes": [
        "Overstated TAM without methodology",
        "No evidence of customer validation",
        "Missing competitor differentiation"
      ],
      "evidence_plan": [
        {"type": "Market size report", "sources": ["IBISWorld", "Statista", "ABS"], "priority": "high"},
        {"type": "Customer validation", "sources": ["LOIs", "pilot agreements"], "priority": "critical"}
      ],
      "applicant_requests": [
        "Provide any LOIs or expressions of interest from potential customers",
        "Share any pilot study results or customer feedback"
      ]
    }
  ],
  "unknowns": []
}
```

### A3. Strict Proxy Protocol for TAM/SAM/SOM

Replace "Unknown (no validated source found)" with a mandatory proxy calculation protocol:

**New TAM/SAM/SOM Output Schema**:
```json
{
  "tam_global": {
    "value": 45000000000,
    "currency": "USD",
    "year": 2024,
    "method": "Top-down: Global oncology market × CAR-T segment share",
    "inputs": [
      {"description": "Global oncology market", "value": 180000000000, "source_id": "S0-3"},
      {"description": "CAR-T segment share", "value": 0.25, "source_id": "S0-4"}
    ],
    "sensitivity": {"low": 38000000000, "high": 52000000000},
    "confidence": "medium",
    "source_ids": ["S0-3", "S0-4"]
  },
  "tam_au": {
    "value": 900000000,
    "currency": "AUD",
    "year": 2024,
    "method": "TAM Global × AU population share (1.9%) × healthcare spending index (1.05)",
    "inputs": [
      {"description": "AU population share", "value": 0.019, "source_id": "S0-5"},
      {"description": "Healthcare spending index", "value": 1.05, "source_id": "S0-6"}
    ],
    "sensitivity": {"low": 720000000, "high": 1080000000},
    "confidence": "medium",
    "source_ids": ["S0-5", "S0-6"]
  }
}
```

**Hard Rules to Add**:
- NEVER output "Unknown" for TAM/SAM/SOM without attempting proxy calculation
- If direct data unavailable: (a) state "Direct data not publicly available", (b) provide 1-3 conservative proxy methods, (c) cite proxy inputs, (d) label confidence + sensitivity

### A4. Hard Ban on Placeholders and Hypotheticals

Add forbidden patterns list and enforcement:

**Forbidden Patterns** (regex):
```javascript
const FORBIDDEN_PATTERNS = [
  /\{TBD\}/gi,
  /\[Insert[^\]]*\]/gi,
  /Hypothetical/gi,
  /\[PROJECT\s*NAME\]/gi,
  /\[COMPANY\]/gi,
  /\{value\}/gi,
  /Source\s*1\b/gi,
  /Source\s*2\b/gi,
  /\[Your\s+/gi,
  /\{\s*\}/g
];
```

**Required Replacement Protocol**:
- If entity cannot be identified: output "Not publicly disclosed" or "No named entity identified in available sources"
- Add to `unknowns[]` with "next-best source" guidance
- Never invent hypothetical companies or products

### A5. New Universal Step: `comparables_market_signals`

Add after competitor analysis to ensure every pipeline identifies real-world comparables and market validation signals.

**Purpose**: Identify at least 5 named comparables OR document why not, plus 2+ market signals with source_ids.

**Output Schema**:
```json
{
  "comparables": [
    {
      "name": "Gilead Sciences (Yescarta)",
      "type": "Direct competitor",
      "relevance": "FDA-approved CAR-T therapy for similar indications",
      "url": "https://www.gilead.com/science-and-medicine/cell-therapy",
      "source_id": "S0-7",
      "confidence": "high"
    }
  ],
  "search_strategy_if_limited": "Searched PubMed, ClinicalTrials.gov, and Crunchbase for CAR-T immunotherapy companies",
  "market_signals": [
    {
      "signal_type": "investment_round",
      "description": "Sector received $2.1B in VC funding Q1-Q3 2024",
      "value": 2100000000,
      "currency": "USD",
      "source_id": "S0-8",
      "confidence": "high"
    },
    {
      "signal_type": "regulatory_approval",
      "description": "TGA approved Kymriah for additional indication March 2024",
      "source_id": "S0-9",
      "confidence": "high"
    }
  ],
  "unknowns": []
}
```

### A6. New Universal Step: `commercialisation_logic`

Add to provide structured commercialisation pathway analysis.

**Purpose**: TRL pathway, milestones, dependencies, additionality template, Australia benefit logic.

**Output Schema**:
```json
{
  "trl_pathway": [
    {"from_trl": 4, "to_trl": 5, "milestone": "Prototype validation", "duration_months": 6},
    {"from_trl": 5, "to_trl": 6, "milestone": "Pilot manufacturing", "duration_months": 9}
  ],
  "milestones": [
    {
      "id": "M1",
      "title": "GMP manufacturing established",
      "dependencies": ["TGA manufacturing license", "Equipment procurement"],
      "go_no_go_criteria": ["Batch consistency >95%", "Cost per dose <$50k"]
    }
  ],
  "dependency_risks": [
    {
      "dependency": "TGA regulatory pathway clarity",
      "risk": "Pathway may require additional clinical data",
      "mitigation": "Pre-submission meeting scheduled Q2",
      "confidence": "medium"
    }
  ],
  "additionality_case": {
    "without_funding": "Project delayed 2-3 years; team may disperse; competitor advantage lost",
    "with_funding": "Accelerate to market within 18 months; retain key personnel; first-mover in AU",
    "funding_gap_justification": "Insufficient revenue to self-fund; VC requires clinical data first"
  },
  "australia_benefit_case": {
    "jobs": {"direct_ftes": 15, "indirect_ftes": 45, "methodology": "Industry multiplier 3x", "source_id": "S0-10"},
    "exports": {"potential_aud": 50000000, "markets": ["APAC", "EU"], "year": 2028, "source_id": null, "confidence": "low"},
    "sovereign_capability": "Establishes domestic cell therapy manufacturing capability",
    "regional_impact": "HQ in Western Sydney; supports Westmead health precinct"
  },
  "unknowns": []
}
```

---

## Part B: Quality Scoring and Auto-Enhancement Updates

### B1. Enhanced Quality Scoring Function

Update `calculateQualityScore` in the edge function to detect and penalize forbidden patterns:

```typescript
function calculateQualityScore(prompt: string): { total: number; level: string; forbiddenPatterns: string[] } {
  // ... existing scoring ...
  
  // NEW: Check for forbidden patterns in prompt AND expected outputs
  const forbiddenPatterns = detectForbiddenPatterns(prompt);
  const forbiddenPenalty = forbiddenPatterns.length * 5; // -5 points per pattern
  
  // NEW: Check for proxy protocol language
  const hasProxyProtocol = /proxy.*estimate|proxy.*calculation|if.*unavailable.*calculate/i.test(prompt);
  const proxyBonus = hasProxyProtocol ? 10 : 0;
  
  const total = Math.max(0, baseTotal - forbiddenPenalty + proxyBonus);
  return { total, level: getLevel(total), forbiddenPatterns };
}

function detectForbiddenPatterns(text: string): string[] {
  const patterns = [
    { regex: /\{TBD\}/gi, name: "{TBD}" },
    { regex: /\[Insert[^\]]*\]/gi, name: "[Insert...]" },
    { regex: /Hypothetical/gi, name: "Hypothetical" },
    { regex: /\[PROJECT\s*NAME\]/gi, name: "[PROJECT NAME]" },
    { regex: /\[COMPANY\]/gi, name: "[COMPANY]" },
    { regex: /Source\s*[12]\b/gi, name: "Source 1/2" }
  ];
  return patterns.filter(p => p.regex.test(text)).map(p => p.name);
}
```

### B2. Auto-Enhancement Prompt Update

Update the auto-enhancement prompt to explicitly remove forbidden patterns:

**Add to enhancement instructions**:
```
FORBIDDEN OUTPUT PATTERNS (must NEVER appear in step outputs):
- {TBD} or any {bracketed_placeholder}
- [Insert ...], [Your Company], [PROJECT NAME]
- "Hypothetical" + any entity name
- "Source 1", "Source 2" (use actual source names)
- "Unknown (no validated source found)" without proxy attempt

REPLACEMENT PROTOCOL:
- If entity unknown: "Not publicly disclosed" or "No named entity identified"
- If number unknown: Provide proxy estimate with method shown
- If source unavailable: Add to unknowns[] with "next-best source" guidance
```

---

## Part C: Assembly/Finalization Citation Cleanup

### C1. Enhanced `clean_citations_apa` Step (Already Exists - Strengthen)

Update the existing `clean_citations_apa` step prompt to be more explicit about the transformation:

**Key Enhancements**:
1. Build citation registry from all_sources: `source_id → { author, year, title, url }`
2. Replace ALL patterns: `/\[(S\d+-[A-Z]?\d+|ARTICLE-\d+|SEARCH-\d+|SOURCE-\d+)\]/g`
3. Transform to hyperlinked APA: `<a href="URL">(Author, Year)</a>`
4. If unresolvable: remove completely, add to unknowns
5. Final lint pass: fail if `/\[[A-Z]+[-]?\d+/` remains

### C2. Enhanced `finalize_report_html` Validation

Add explicit validation in the finalize step:

**Validation Checklist**:
```
VALIDATION (CRITICAL - must pass before output):
The final report_html MUST NOT contain:
- [S0-1], [S1-2], [S0-A1] or any [S followed by numbers/letters
- [ARTICLE-1], [SEARCH-2] or any [ARTICLE-* or [SEARCH-*
- [TBD], [{TBD}], {TBD}, or any bracketed placeholder
- <sup>[...]</sup> with internal IDs
- "Source 1", "Source 2" placeholder citations
- "Hypothetical" + any noun

If ANY of these patterns remain after merging, you MUST:
1. Remove them completely (leave no trace)
2. Add to data_gaps: "Removed unresolved marker: [pattern]"
```

### C3. Client-Side Fallback Enhancement

The existing `stripBracketedSourceIds` function already handles cleanup. Ensure it catches all patterns:

```typescript
// Additional patterns to add
cleaned = cleaned.replace(/Source\s*[12]\b/gi, ""); // Source 1, Source 2
cleaned = cleaned.replace(/\{TBD\}/gi, "");         // {TBD} without brackets
cleaned = cleaned.replace(/Hypothetical\s+\w+/gi, ""); // Hypothetical Company
```

---

## Technical Implementation Details

### File 1: `supabase/functions/process-grant-guidelines/index.ts`

**Changes**:

1. **Lines ~1552-1714** (Pipeline Generation Prompt): Completely rewrite to include:
   - New universal steps specification
   - Enhanced proxy protocol for TAM/SAM/SOM
   - Forbidden patterns list
   - Assessor insight layer requirements
   - Comparables + market signals step
   - Commercialisation logic step

2. **Lines ~1846-1894** (Auto-Enhancement): Update enhancement prompt to:
   - Detect and remove forbidden patterns
   - Enforce proxy protocol
   - Validate no hypotheticals

3. **Lines ~210-228** (Quality Scoring): Add forbidden pattern detection and penalty

4. **Lines ~1000-1238** (Assembly Steps): Strengthen clean_citations_apa and finalize_report_html validation

### File 2: `src/hooks/usePromptQuality.ts`

**Changes**:

1. Add `detectForbiddenPatterns` function
2. Update `calculateQualityScore` to include forbidden pattern penalty
3. Add `forbiddenPatterns` to `QualityScore` interface

### File 3: `src/lib/htmlReportUtils.ts`

**Changes**:

1. Enhance `stripBracketedSourceIds` to catch additional patterns
2. Add validation function to check for remaining markers

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `supabase/functions/process-grant-guidelines/index.ts` | Major update | Pipeline prompt, quality scoring, assembly steps |
| `src/hooks/usePromptQuality.ts` | Update | Forbidden pattern detection |
| `src/lib/htmlReportUtils.ts` | Update | Enhanced cleanup patterns |

---

## Testing Strategy

1. **Upload New Grant Guidelines**
   - Verify pipeline includes new universal steps
   - Check rubric_traceability_matrix and assessor_insight_layer exist

2. **Generate Test Report**
   - Verify NO `{TBD}`, `[Insert...]`, `Hypothetical` in output
   - Verify TAM/SAM/SOM have proxy calculations (not "Unknown")
   - Verify NO `[S0-1]` style markers in final HTML

3. **Quality Score Validation**
   - Confirm prompts with forbidden patterns score lower
   - Confirm auto-enhancement removes forbidden patterns

4. **Legacy Report Viewing**
   - Confirm client-side fallback strips any remaining markers
