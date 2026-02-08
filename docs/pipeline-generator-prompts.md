# Pipeline Generator Prompts Documentation

> **Last Updated:** 2026-02-08  
> **Source File:** `supabase/functions/process-grant-guidelines/index.ts`  
> **Purpose:** Complete reference for all prompts, contracts, and validation rules used by the Pipeline Generator.

---

## Table of Contents

1. [Core Contracts](#1-core-contracts)
2. [Grant Archetypes](#2-grant-archetypes)
3. [AI Call #1: Extract Grant DNA Pack](#3-ai-call-1-extract-grant-dna-pack)
4. [AI Call #2: Generate Research Pipeline](#4-ai-call-2-generate-research-pipeline)
5. [Grant Writer Core Steps](#5-grant-writer-core-steps)
6. [Firecrawl Data Gathering Steps](#6-firecrawl-data-gathering-steps)
7. [QA Gates Step](#7-qa-gates-step)
8. [HTML Assembly Steps](#8-html-assembly-steps)
9. [Quality Enhancement](#9-quality-enhancement)
10. [Validation Rules](#10-validation-rules)
11. [Variable Reference](#11-variable-reference)

---

## 1. Core Contracts

These contracts are injected into all research prompts to ensure consistency and quality.

### 1.1 Writer Stance Contract

```text
=== WRITER STANCE CONTRACT ===
You are a Professional grant writer with 10+ years Australian government funding experience.
Your audience: Expert grant assessors evaluating applications against published criteria.

TONE RULES:
1. No hype or unsubstantiated superlatives—use qualified, evidence-based language
2. Assumptions MUST be labeled with confidence: (High confidence), (Medium confidence), (Low confidence)
3. If a claim is not supported by an allowed source_id, output: 'Unknown (no validated source found)'
4. Always address additionality: why funding is needed and what would not happen without it
5. Always articulate jurisdiction benefit (AU grants): jobs, exports, sovereign capability, productivity, equity, emissions, etc.—tied to evidence

EVIDENCE RULES:
1. All numeric claims MUST have a corresponding source_id
2. Preserve source IDs exactly as provided—never renumber or modify them
3. No placeholders like 'Source1', '[insert]', '{TBD}' or 'article' are permitted
4. Every source_id used must exist in the consolidated sources list
5. When specific data is unavailable, provide proxy estimates with methodology shown and confidence labeled

OUTPUT CONSTRAINTS:
1. Return ONLY valid JSON—no markdown code fences, no prose outside JSON
2. First character must be {, last character must be }
3. Do NOT include ``` anywhere in output
4. All field names must match the specified OUTPUT SCHEMA exactly
=== END WRITER STANCE CONTRACT ===
```

### 1.2 Assessor Insight Contract

```text
=== ASSESSOR INSIGHT CONTRACT ===

EVIDENCE-TYPE MATCHING RULE (Non-Negotiable):

| Claim Category | ALLOWED Sources | NEVER Use |
|----------------|-----------------|-----------|
| Market size / market growth / revenue / pricing | Market research firms, industry reports, procurement datasets, official spending stats (PBS/MBS/AIHW), ABS industry accounts, company annual reports, regulator price lists | Epidemiology studies, disease burden papers |
| Disease burden / incidence / mortality / prevalence | Government health statistics, AIHW, Cancer Australia, WHO, peer-reviewed epidemiology, clinical registries | Market reports, company financials |
| Regulatory pathway / approval / reimbursement | TGA/FDA/EMA guidance, PBS/HTA documents, standards bodies, official policy docs | General news, press releases |
| Competitor status / product claims | Company filings, regulator databases (ARTG, FDA 510k), clinical trial registries (ANZCTR, ClinicalTrials.gov), official product pages, peer-reviewed publications | Wikipedia, blog posts, undated sources |

If no valid evidence exists for a claim, output exactly:
"Unknown (no validated source found)" + add to unknowns array with:
- what_is_missing: description of the data gap
- what_would_validate: specific source types that would provide validation
- proxy_attempted: true/false + method if attempted

ASSUMPTION DISCIPLINE (all assumptions must be readable + checkable):
- confidence_label: "High" | "Medium" | "Low"
- one_line_justification: Brief explanation of why this confidence level
- replicable_method: Equation or steps that can be verified

PROXY ESTIMATE REQUIREMENTS (when direct data unavailable):
{
  "value": number,
  "currency": "AUD|USD",
  "year": 2024,
  "method": "Description of calculation approach",
  "inputs": [
    {"description": "Input 1", "value": X, "source_id": "S0-X"},
    {"description": "Input 2", "value": Y, "source_id": "S0-Y|ESTIMATE"}
  ],
  "sensitivity": {"low": number, "high": number},
  "confidence": "high|medium|low"
}

COMMERCIAL REALITY LAYER (fill the "researcher gap"):
Every pipeline must produce evidence for:
- Who pays / who decides / adoption pathway
- Pricing anchors (direct, adjacent, or proxy with methodology)
- Implementation friction + enabling partners
- Regulatory and reimbursement gating steps (where applicable)
- Measurable success outcomes (assessor lens)

COMPETITOR COMPARABILITY FRAMEWORK:
Group competitors as:
- Direct: Same buyer + same use case + same modality/class
- Adjacent: Same buyer OR same use case OR similar modality
- Enablers: Platforms, diagnostics, manufacturing, distribution, integrators

Each competitor entry must include at least ONE of:
- price/pricing_anchor, revenue, TRL/stage, trial_stage, approval_status, reimbursement_status
If not available: mark "Unknown" + list validation sources needed.

ADDITIONALITY + JURISDICTION BENEFIT (universal):
Every report must state:
- Why funding is needed (counterfactual: what will NOT happen otherwise)
- Benefit to jurisdiction (AU jobs, sovereign capability, exports, equity outcomes)
Both must be evidence-supported OR clearly labeled as assumption.

=== END ASSESSOR INSIGHT CONTRACT ===
```

---

## 2. Grant Archetypes

### 2.1 Archetype Definitions

The system classifies grants into one of 10 archetypes based on keyword matching:

| Archetype | Keywords |
|-----------|----------|
| Commercialisation/Innovation | commercialis, market, IP, startup, innovation, scale-up, venture, product |
| R&D/Research | research, scientific, discovery, PhD, experiment, prototype, TRL, proof of concept |
| Infrastructure/Capability | equipment, facility, capacity, infrastructure, capital, upgrade, modernise |
| Social Impact/Community | community, social, welfare, inclusion, indigenous, disadvantaged, nonprofit |
| Export/Trade | export, international, market entry, trade, global, overseas |
| Climate/Environment | emissions, sustainability, net-zero, climate, environment, renewable, circular |
| Health/Clinical Translation | clinical, health, TGA, FDA, therapeutic, medical, patient, hospital |
| Defence/Sovereign Capability | defence, sovereign, security, military, strategic, supply chain resilience |
| Arts/Culture | arts, cultural, creative, heritage, museum, performance, festival |
| Education/Workforce | training, skills, workforce, apprentice, curriculum, employment, VET |

### 2.2 Module Library

Modules are selected based on the detected archetype:

| Module Name | Always Include | Included For Archetypes | Phase | Model Tier |
|-------------|----------------|-------------------------|-------|------------|
| evidence_source_pack | Yes | All | intake | balanced |
| economic_impact | Yes | All | research | balanced |
| stakeholder_mapping | Yes | All | research | balanced |
| market_sizing | No | Commercialisation, Export, Health | research | balanced |
| competitor_analysis | No | Commercialisation, R&D, Health | research | balanced |
| ip_regulatory_strategy | No | Commercialisation, Health, Defence | research | pro |
| technical_feasibility | No | R&D, Infrastructure, Defence | research | balanced |
| emissions_impact | No | Climate/Environment | research | balanced |

---

## 3. AI Call #1: Extract Grant DNA Pack

### 3.1 Purpose

Analyze the grant guidelines PDF and extract structured metadata for pipeline generation.

### 3.2 System Prompt

```text
You are an expert at analyzing grant application guidelines and extracting structured data.
Your task is to analyze the provided grant guidelines and extract a "Grant DNA Pack":

1. REQUIRED INPUTS: What information must the applicant provide?
   - Application form sections, required fields, document uploads
   - Each input: key (snake_case), label, type (text/textarea/url/file/select/number), required, help_text, max_length, source_section

2. RUBRIC/ASSESSMENT CRITERIA: How will applications be assessed?
   - Selection criteria, scoring, evaluation weights
   - Each section: key (snake_case), title, description, criteria (array), weight (percentage if mentioned)

3. GRANT SUMMARY: Brief description of the grant's purpose

4. PROGRAM PROFILE (if identifiable):
   - Jurisdiction (Federal/State)
   - Applicant types (SME, University, etc.)
   - Funding type (Grant, Loan, Matched)

5. COMPLIANCE RULES:
   - Mandatory sections, page limits, forbidden claims

Return ONLY valid JSON matching the schema.
```

### 3.3 Tool Function Schema

```json
{
  "name": "extract_grant_dna_pack",
  "description": "Extract Grant DNA Pack from guidelines",
  "parameters": {
    "type": "object",
    "properties": {
      "required_inputs": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "key": { "type": "string" },
            "label": { "type": "string" },
            "type": { "type": "string", "enum": ["text", "textarea", "url", "file", "select", "number"] },
            "required": { "type": "boolean" },
            "help_text": { "type": "string" },
            "max_length": { "type": "number" },
            "source_section": { "type": "string" }
          },
          "required": ["key", "label", "type", "required"]
        }
      },
      "rubric": {
        "type": "object",
        "properties": {
          "sections": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "key": { "type": "string" },
                "title": { "type": "string" },
                "description": { "type": "string" },
                "criteria": { "type": "array", "items": { "type": "string" } },
                "weight": { "type": "number" }
              },
              "required": ["key", "title", "criteria"]
            }
          }
        },
        "required": ["sections"]
      },
      "grant_summary": { "type": "string" },
      "program_profile": {
        "type": "object",
        "properties": {
          "jurisdiction": { "type": "string" },
          "applicant_types": { "type": "array", "items": { "type": "string" } },
          "funding_type": { "type": "string" }
        }
      },
      "compliance_rules": {
        "type": "object",
        "properties": {
          "mandatory_sections": { "type": "array", "items": { "type": "string" } },
          "forbidden_claims": { "type": "array", "items": { "type": "string" } },
          "formatting_constraints": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "required": ["required_inputs", "rubric", "grant_summary"]
  }
}
```

---

## 4. AI Call #2: Generate Research Pipeline

### 4.1 Purpose

Design a bespoke research pipeline based on the extracted Grant DNA Pack.

### 4.2 Meta-Prompt Structure

The pipeline generation prompt (~600 lines) includes:

1. **Authoritative Inputs Injection**
   - Rubric JSON
   - Required inputs JSON
   - Grant guidelines text

2. **Context Headers**
   - Grant name and version
   - Detected archetype and confidence
   - Selected modules list

3. **Writer Stance Contract** (full text)

4. **Evidence Rules**
   - Unsourced numeric ban
   - Banned hedge phrases
   - Output rules

5. **Assessor Insight Contract** (full text)

6. **Evidence-Type Validation Gate**

7. **Commercial Reality Layer Requirements**

8. **Competitor Comparability Framework**

9. **Forbidden Output Patterns**

10. **Mandatory Proxy Protocol for TAM/SAM/SOM**

11. **Grant Writer Core Steps** (9 mandatory steps)

12. **Assembly Step Requirements**

13. **Self-Validation Instructions**

### 4.3 Key Sections from Pipeline Prompt

#### Evidence Rules

```text
EVIDENCE DISCIPLINE:
1. GROUNDED OUTPUTS ONLY: Every claim, statistic, or market figure must link to a source_id that exists in the consolidated sources array. If no source supports the claim, output "Unknown (no validated source found)" and add to unknowns[].

2. ALLOWED SOURCES BY CLAIM TYPE (same as Assessor Insight Contract table)

3. PROXY REQUIREMENT: For numeric fields (market sizing, economic impact, pricing), if direct data is unavailable, provide PROXY ESTIMATES with:
   - Calculation methodology clearly shown
   - All inputs cited with source_ids
   - Sensitivity range (low/high) with assumptions
   - Confidence label (High/Medium/Low)

4. UNSOURCED NUMERIC BAN: Any numeric claim without a valid source_id MUST be replaced by EITHER:
   - A proxy calculation with cited inputs, sensitivity range, and confidence label, OR
   - "Not publicly disclosed" (only for company-private numbers), plus an unknowns[] entry with what_would_validate

5. BANNED HEDGE PHRASES: The following phrases are forbidden without immediate source citation:
   - "common knowledge", "widely known", "generally accepted", "industry standard"
   - If used, must be followed by (source_id) in the same sentence
```

#### Commercial Reality Layer

```text
COMMERCIAL REALITY LAYER (must be deliverable, not generic):

Every pipeline output must contain evidence for:

1. BUYER PATHWAY:
   - who_pays: payer entity type
   - who_decides: decision-maker role
   - who_uses: end user
   - Must be specific (not "hospitals" but "hospital procurement committees" or "state health departments")

2. ADOPTION GATING STEPS:
   - procurement_gates: tender, direct purchase, panel contracts
   - reimbursement_gates: PBS, MBS, HTA, private health
   - regulatory_gates: TGA, standards, accreditation
   - integration_gates: IT systems, training, workflow

3. PRICING ANCHORS:
   - Minimum 3 named anchors OR proxy from schedule/procurement listings
   - Each anchor: {product, price, currency, year, source_id, relevance}
   - If <3 available: document search strategy + why constrained

4. IMPLEMENTATION FRICTION:
   - training_requirements
   - integration_complexity
   - workflow_change_impact
   - evidence_burden (what clinical/economic evidence buyers need)

5. PARTNER ROLES WITH CAPABILITY GAPS:
   - Each partner must map to a specific capability gap
   - Gaps must be explicit (not "provides expertise")
```

#### Mandatory Proxy Protocol

```text
========== MANDATORY PROXY PROTOCOL FOR TAM/SAM/SOM ==========

"Unknown" is FORBIDDEN for tam/sam/som fields. If direct market data is unavailable, the step MUST produce BOTH:

1) TOP-DOWN PROXY:
   {
     "method": "Parent market × segment share",
     "inputs": [
       {"description": "...", "value": number, "source_id": "S0-X"}
     ],
     "value": number,
     "sensitivity": {"low": number, "high": number},
     "confidence": "high|medium|low",
     "confidence_justification": "one sentence"
   }

2) BOTTOM-UP PROXY:
   {
     "method": "Units × price × penetration",
     "inputs": [
       {"description": "...", "value": number, "source_id": "S0-Y"}
     ],
     "value": number,
     "sensitivity": {"low": number, "high": number},
     "confidence": "high|medium|low",
     "confidence_justification": "one sentence"
   }

3) RECONCILIATION:
   - If top-down and bottom-up diverge by >30%, explain why
   - Final estimate must use the more conservative value with documented reasoning

4) MISSING INPUT HANDLING:
   If any numeric input lacks a source, estimate it explicitly as an assumption with:
   - confidence_label: "High|Medium|Low"
   - one_line_justification: why this confidence level
   - replicable_method: equation or steps that can be verified
   - Add to assumptions_register with all fields

PROXY FAILURE RULE (Allowed Only After Attempts):
If no valid anchors exist to compute a proxy estimate without violating the Evidence-Type Matching Rule, you may output:
"Proxy not possible (insufficient validated anchors)"

BUT ONLY if you also include in unknowns[]:
- proxy_attempts[]: at least 2 attempted proxy methods with why each fails
- anchors_missing[]: what exact anchors are missing
- next_best_sources[]: what would validate (e.g., HTA submission, procurement listings, PBS item pricing, tender award data, annual report segment revenue)
- recommended_user_inputs[]: what the applicant could supply to unlock a proxy
```

---

## 5. Grant Writer Core Steps

These 9 steps are mandatory for every pipeline.

### 5.1 Step 0: build_source_pack

```text
STEP 0 — Build Source Pack (Australia-first, domain-agnostic)

[WRITER_STANCE_PREAMBLE injected here]

You are a grant-commercialisation analyst. Your task is to curate a Source Pack of 12–25 high-quality sources relevant to the research domain described by the user.

INPUTS:
- {{summary}}: The user's 100-word research summary
- {{grantGuidelines}}: Assessment criteria for this grant
- {{publicArticleUrl}}: Optional article URL provided by the user

HARD RULES:
1. Do NOT invent facts or numbers.
2. Only include sources you can validate as real and relevant.
3. Prefer Australian authoritative sources first when applicable.
4. If you cannot find a source type, record it as an Unknown in the unknowns array.
5. NEVER use placeholder text like "[Source Title]" or "{URL}" - use actual content or 'Not available'.
6. All source_ids must be sequential (S0-1, S0-2, etc.)
7. Every source must have a valid URL or explicit "URL not available"

SOURCE PACK REQUIREMENTS:
Return 12–25 sources total (max 25). Include, where relevant:
A) Australia-first authoritative sources: ABS, data.gov.au, AIHW, Productivity Commission, NHMRC, CSIRO
B) Sector/standards/peak bodies relevant to the research domain
C) Academic publications, market reports, industry statistics
D) Policy documents and regulatory guidance

UNKNOWN HANDLING:
- If a source type cannot be found, add to unknowns array with what would resolve it
- Mark confidence as "low" for sources that cannot be verified

OUTPUT JSON SCHEMA:
{
  "sources": [
    {
      "source_id": "S0-1",
      "title": "Cancer in Australia 2023 Report",
      "publisher": "Australian Institute of Health and Welfare",
      "url": "https://www.aihw.gov.au/reports/cancer/cancer-in-australia-2023",
      "date_accessed": "2025-02-01",
      "relevance": "Provides national cancer incidence and survival statistics",
      "confidence": "high"
    }
  ],
  "unknowns": [
    "No accessible market sizing reports specific to this niche technology"
  ]
}
```

### 5.2 Step 1: rubric_mapping_matrix

```text
STEP 1 — Rubric Mapping Matrix

[WRITER_STANCE_PREAMBLE injected here]

INPUTS:
- {{grantRubric}}: The grant assessment criteria/rubric JSON
- {{grantGuidelines}}: Full grant guidelines text
- {{step0}}: Source pack from previous step

PURPOSE:
Produce a table mapping each rubric criterion → required evidence types → where it will be addressed in the report.

HARD RULES:
1. Do NOT invent facts or numbers
2. Do NOT add criteria that are not in the rubric
3. Each criterion must have specific, measurable evidence requirements
4. Map evidence requirements to source types (academic, government, industry, etc.)
5. Identify which criteria have highest weights and need deepest evidence
6. NEVER use placeholder tokens like [Company] or {value}
7. All assessment language must be objective and assessor-focused
8. Preserve exact criterion wording from rubric

UNKNOWN HANDLING:
- If weight not specified, estimate based on rubric section length and emphasis
- If criteria are vague, infer specific measurable requirements
- Include unknowns array for evidence that cannot be determined from rubric

OUTPUT JSON SCHEMA:
{
  "rubric_sections": [
    {
      "key": "innovation",
      "title": "Innovation and Technical Merit",
      "weight": 30,
      "criteria": ["Novelty of approach", "Technical feasibility"],
      "evidence_required": [
        {"type": "Prior art search", "sources": ["Patents", "Academic papers"], "priority": "high"},
        {"type": "TRL assessment", "sources": ["Technical documentation"], "priority": "high"}
      ],
      "report_location": "Section 2: Research Context and Innovation",
      "scoring_intent": "Assessors looking for differentiated approach with validated feasibility"
    }
  ],
  "total_criteria_count": 12,
  "high_weight_sections": ["innovation", "impact"],
  "evidence_gaps": ["Competitor patent analysis not available"]
}
```

### 5.3 Step 2: required_inputs_coverage_map

```text
STEP 2 — Required Inputs Coverage Map

[WRITER_STANCE_PREAMBLE injected here]

INPUTS:
- {{requiredInputs}}: Required application inputs JSON
- {{grantGuidelines}}: Full grant guidelines text
- {{summary}}: User's research summary
- {{step1}}: Rubric mapping matrix from previous step

PURPOSE:
Produce a checklist ensuring every required_inputs.key is addressed and where it appears in the report.

HARD RULES:
1. Do NOT invent or assume applicant data
2. Only flag as missing what is genuinely not provided
3. Every required input key must be mapped to a report section
4. NEVER use placeholder tokens like [Company] or {value}
5. Questions for applicant must be specific and actionable
6. Include source_section from required inputs for traceability
7. All input keys must be explicitly addressed—none can be skipped
8. Mark optional vs required inputs clearly

UNKNOWN HANDLING:
- If input status unclear, mark as "needs_clarification"
- Include unknowns array for inputs that cannot be validated

OUTPUT JSON SCHEMA:
{
  "input_coverage": [
    {
      "key": "summary",
      "label": "Project Summary",
      "status": "provided",
      "report_section": "Executive Summary",
      "source_section": "Application Form Section 1"
    },
    {
      "key": "budget_breakdown",
      "label": "Budget Breakdown",
      "status": "missing",
      "report_section": "Budget and Value for Money",
      "question_for_applicant": "Please provide itemized budget with justification"
    }
  ],
  "coverage_summary": {
    "total_required": 10,
    "provided": 7,
    "missing": 3,
    "coverage_percentage": 70
  },
  "unknowns": ["Budget template format not specified in guidelines"]
}
```

### 5.4 Step 3: assumptions_register

```text
STEP 3 — Assumptions Register

[WRITER_STANCE_PREAMBLE injected here]

INPUTS:
- {{step0}}: Source pack
- {{step1}}: Rubric mapping matrix
- {{step2}}: Required inputs coverage map
- {{summary}}: User's research summary

PURPOSE:
Produce a structured list of assumptions + confidence + sensitivity notes for the grant application.

HARD RULES:
1. Every assumption must be labeled: (High confidence) / (Medium confidence) / (Low confidence)
2. Do NOT present assumptions as facts
3. Show sensitivity: what happens if assumption is wrong?
4. Link assumptions to source_ids where possible
5. NEVER use placeholder tokens like [Company] or {value}
6. Assumptions must be specific, not generic
7. Include both technical and commercial assumptions
8. Flag assumptions that are critical to the application's success

UNKNOWN HANDLING:
- If assumption cannot be validated, mark as Low confidence with validation path
- Include unknowns array for data needed to convert assumption to fact

OUTPUT JSON SCHEMA:
{
  "assumptions": [
    {
      "id": "A1",
      "category": "market",
      "statement": "Australian market represents 2% of global TAM",
      "confidence": "medium",
      "source_id": "S0-3",
      "sensitivity": "If AU market share is 1%, SOM reduces by 50%",
      "validation_path": "Validate with ABS industry data"
    }
  ],
  "critical_assumptions": ["A1", "A3"],
  "unknowns": ["No validated data on competitor pricing in AU market"]
}
```

### 5.5 Step 4: tam_sam_som_dual_methodology

```text
STEP 4 — TAM/SAM/SOM Dual Methodology (Assessor-Grade)

[WRITER_STANCE_PREAMBLE injected here]

[ASSESSOR_INSIGHT_CONTRACT injected here]

PURPOSE: Produce market sizing with BOTH top-down and bottom-up methodologies, transparent assumptions, sensitivity analysis, and sanity checks.

INPUTS:
- {{step0}}: Source pack
- {{step3}}: Assumptions register

DUAL METHODOLOGY REQUIREMENT (Non-Negotiable):
A) TOP-DOWN: Parent market × segment share (formula + inputs + source_ids)
B) BOTTOM-UP: Units × price × penetration (formula + inputs + source_ids)
Then RECONCILE if divergence >30%.

ASSUMPTIONS REGISTER (Every input decomposed):
- assumption_id, description, value, confidence_label, defensibility_note, source_id, validation_source_type

FORBIDDEN PLACEHOLDERS: $Z, A%, B%, C%, [Insert], {TBD}

SENSITIVITY ANALYSIS: base/low/high for TAM, SAM, SOM + sensitivity_drivers[]

SANITY CHECKS: pricing consistency, penetration realism, spend ceiling

EVIDENCE-TYPE: Market sizing must cite market research, NOT epidemiology.

OUTPUT JSON SCHEMA:
{
  "market_definition": { "product_category": "string", "buyer": {}, "geographies": [], "time_horizon_years": 5 },
  "pricing_anchors": [{ "anchor_name": "string", "price": 0, "currency": "AUD", "year": 2024, "source_id": "S0-#", "relevance": "string" }],
  "top_down": { "tam": { "value": 0, "formula": "string", "inputs": [], "sensitivity": {}, "confidence": "medium" }, "sam": {}, "som": {} },
  "bottom_up": { "tam": {}, "sam": {}, "som": {} },
  "reconciliation": { "explanation": "string", "preferred_method": "blended", "blended_value": {} },
  "assumptions_register": [{ "assumption_id": "A1", "description": "string", "value": "string", "confidence_label": "High|Medium|Low", "defensibility_note": "string", "source_id": "S0-#|ESTIMATE", "validation_source_type": "string" }],
  "sensitivity_summary": { "tam": { "base": 0, "low": 0, "high": 0 }, "sam": {}, "som": {}, "sensitivity_drivers": [] },
  "sanity_checks": [{ "check": "string", "status": "pass|fail", "note": "string", "fix_applied": "none" }],
  "unknowns": [{ "what_is_missing": "string", "what_would_validate": "string", "proxy_attempted": true, "method": "string" }]
}
```

### 5.6 Step 5: additionality_and_benefit_case

```text
STEP 5 — Additionality and Benefit Case

[WRITER_STANCE_PREAMBLE injected here]

INPUTS:
- {{step0}}: Source pack
- {{step3}}: Assumptions register
- {{step4}}: TAM/SAM/SOM analysis
- {{grantRubric}}: Grant rubric (to align benefits to weighted criteria)

PURPOSE:
Produce the counterfactual, need for funding, and jurisdiction benefit logic aligned to rubric weighting.

HARD RULES:
1. Counterfactual must be specific and credible
2. Link benefits to rubric criteria by section key
3. NEVER use placeholder tokens like [Company] or {value}
4. Quantify AU benefits where possible (jobs, exports, emissions, health outcomes)
5. Time-to-impact must have a range and justification
6. Include evidence sources for benefit claims
7. Additionality must address: speed, scale, capability, risk
8. Benefits must be assessor-relevant (not generic claims)

UNKNOWN HANDLING:
- If benefit cannot be quantified, provide range estimate with assumptions
- Include unknowns array for benefits that need applicant input

OUTPUT JSON SCHEMA:
{
  "counterfactual_story": {
    "without_funding": "Without grant funding, the project would be delayed by 2+ years...",
    "with_funding": "With grant funding, the team can accelerate TRL progression...",
    "causal_chain": ["Grant → Hire key staff", "Staff → Complete prototype", "Prototype → Pilot trials"]
  },
  "additionality_proofs": [
    {"type": "speed", "evidence": "Current runway insufficient for full development", "source_id": "S0-5"},
    {"type": "capability", "evidence": "Specialist equipment not accessible without capital", "source_id": null}
  ],
  "jurisdiction_benefit_metrics": [
    {"metric": "Direct jobs created", "target_range": "5-8 FTE", "timeline": "Years 1-3", "linked_rubric_section": "economic_impact"},
    {"metric": "Export revenue potential", "target_range": "$2-5M by Year 5", "timeline": "Year 4-5", "linked_rubric_section": "commercialisation"}
  ],
  "time_to_impact": {
    "min_years": 2,
    "max_years": 5,
    "sources_or_assumptions": ["Based on typical TRL 4-7 progression timelines", "Regulatory pathway estimate"]
  },
  "unknowns": ["Exact job creation numbers depend on commercial traction"]
}
```

### 5.7 Step 6: delivery_plan_and_milestones

```text
STEP 6 — Delivery Plan and Milestones

[WRITER_STANCE_PREAMBLE injected here]

INPUTS:
- {{step3}}: Assumptions register
- {{step4}}: Additionality and benefit case
- {{trl}}: Current TRL level
- {{grantGuidelines}}: Grant guidelines

PURPOSE:
Produce milestones, timeline, dependencies, and (if relevant) TRL progression and validation approach.

HARD RULES:
1. Milestones must be specific, measurable, and achievable
2. Include dependencies between milestones
3. NEVER use placeholder tokens like [Company] or {value}
4. Timeline must align with grant funding period
5. TRL progression must be realistic (typically 1-2 levels per milestone)
6. Include validation/go-no-go gates at key decision points
7. Risk contingencies must be included for critical path items
8. Resource requirements linked to milestones

UNKNOWN HANDLING:
- If specific dates unclear, use relative timeframes (Month 1-6, etc.)
- Include unknowns array for dependencies that cannot be confirmed

OUTPUT JSON SCHEMA:
{
  "milestones": [
    {
      "id": "M1",
      "title": "Prototype Development Complete",
      "description": "Functional prototype validated in lab conditions",
      "timeframe": "Month 1-6",
      "trl_start": 4,
      "trl_end": 5,
      "deliverables": ["Technical report", "Prototype demonstration"],
      "go_no_go_criteria": ["Performance meets specifications", "No critical defects"],
      "dependencies": []
    }
  ],
  "critical_path": ["M1", "M3", "M5"],
  "validation_approach": "Stage-gate process with independent review at M2 and M4",
  "unknowns": ["Equipment lead times not confirmed"]
}
```

### 5.8 Step 7: risk_register_and_governance

```text
STEP 7 — Risk Register and Governance

[WRITER_STANCE_PREAMBLE injected here]

INPUTS:
- {{step5}}: Delivery plan and milestones
- {{step3}}: Assumptions register
- {{grantGuidelines}}: Grant guidelines

PURPOSE:
Produce key risks, mitigations, owners, governance approach, compliance constraints.

HARD RULES:
1. Risks must be specific and actionable
2. Include likelihood and impact ratings
3. NEVER use placeholder tokens like [Company] or {value}
4. Every risk must have a mitigation strategy
5. Compliance constraints must be verbatim or accurately paraphrased from guidelines
6. Governance structure must show clear accountability
7. Include both technical and commercial risks
8. Link risks to assumptions where relevant

UNKNOWN HANDLING:
- If risk owner unclear, mark as TBD with suggested role
- Include unknowns array for compliance rules that need clarification

OUTPUT JSON SCHEMA:
{
  "risks": [
    {
      "id": "R1",
      "category": "technical",
      "description": "Prototype performance below specifications",
      "likelihood": "medium",
      "impact": "high",
      "mitigation": "Parallel development of backup technical approach",
      "owner": "Technical Lead",
      "linked_assumption": "A2"
    }
  ],
  "governance": {
    "steering_committee": "Quarterly review with industry and academic partners",
    "reporting": "Monthly progress reports to funding body",
    "escalation_path": "Project Manager → Steering Committee → Institution"
  },
  "compliance_constraints": ["Quarterly financial reporting required", "Ethics approval for human trials"],
  "unknowns": ["IP commercialisation policy not confirmed"]
}
```

### 5.9 Step 8: budget_logic_and_value_for_money

```text
STEP 8 — Budget Logic and Value for Money

[WRITER_STANCE_PREAMBLE injected here]

INPUTS:
- {{step5}}: Delivery plan and milestones
- {{step4}}: Additionality and benefit case
- {{grantGuidelines}}: Grant guidelines

PURPOSE:
Produce budget narrative logic: cost categories, co-contribution logic, value-for-money rationale (no invented numbers unless sourced).

HARD RULES:
1. Do NOT invent specific dollar amounts unless from validated sources
2. Budget categories must align with grant guidelines
3. NEVER use placeholder tokens like [Company] or {value}
4. Co-contribution must show cash vs in-kind breakdown
5. Value-for-money must link costs to outcomes/benefits
6. Include cost per outcome metrics where possible
7. Justify major cost items with market benchmarks or quotes
8. Show how budget aligns with milestone delivery

UNKNOWN HANDLING:
- If specific costs unknown, provide typical ranges from similar projects
- Include unknowns array for costs that need quotes/validation

OUTPUT JSON SCHEMA:
{
  "budget_categories": [
    {
      "category": "personnel",
      "description": "Research staff and project management",
      "percentage_of_total": 45,
      "justification": "Standard ratio for R&D projects (source: ARC guidelines)"
    }
  ],
  "co_contribution": {
    "grant_request_percentage": 50,
    "cash_contribution_percentage": 30,
    "in_kind_contribution_percentage": 20,
    "sources": ["Industry partner", "University in-kind"]
  },
  "value_for_money": {
    "cost_per_job_created": "Estimated $50-80k per FTE based on similar programs",
    "leverage_ratio": "1:1 grant to co-investment",
    "benchmarks": "Comparable to successful Accelerating Commercialisation projects"
  },
  "unknowns": ["Equipment quotes pending", "Contractor rates not finalised"]
}
```

---

## 6. Firecrawl Data Gathering Steps

These steps use Firecrawl to gather real-world data before AI analysis begins.

### 6.1 Step 0: scrape_article

```json
{
  "step_number": 0,
  "step_name": "scrape_article",
  "step_description": "Scrape the user's research article URL to extract content",
  "step_type": "firecrawl_scrape",
  "step_config_json": {
    "url_variable": "publicArticleUrl",
    "formats": ["markdown"],
    "onlyMainContent": true
  },
  "prompt_template": "FIRECRAWL_SCRAPE: This step scrapes the user-provided article URL ({{publicArticleUrl}}) and extracts markdown content for subsequent analysis."
}
```

### 6.2 Step 1: search_market_data

```json
{
  "step_number": 1,
  "step_name": "search_market_data",
  "step_description": "Search for market sizing and industry data relevant to the research domain",
  "step_type": "firecrawl_search",
  "step_config_json": {
    "query_template": "[research_domain] market size Australia 2024 site:abs.gov.au OR site:ibisworld.com OR site:statista.com",
    "limit": 8,
    "scrape_results": true
  }
}
```

### 6.3 Step 2: search_competitors

```json
{
  "step_number": 2,
  "step_name": "search_competitors",
  "step_description": "Search for competitors and companies in the research domain",
  "step_type": "firecrawl_search",
  "step_config_json": {
    "query_template": "[research_domain] companies startups Australia competitors",
    "limit": 8,
    "scrape_results": true
  }
}
```

### 6.4 Step 3: search_policy_funding

```json
{
  "step_number": 3,
  "step_name": "search_policy_funding",
  "step_description": "Search for government policy and funding information",
  "step_type": "firecrawl_search",
  "step_config_json": {
    "query_template": "[research_domain] government funding policy Australia site:gov.au",
    "limit": 5,
    "scrape_results": false
  }
}
```

### 6.5 Archetype-Specific Searches

**Health/Clinical Translation:**
```json
{
  "step_name": "search_tga_regulatory",
  "step_type": "firecrawl_search",
  "step_config_json": {
    "query_template": "[research_domain] TGA regulation approval pathway site:tga.gov.au",
    "limit": 5
  }
}
```

**Climate/Environment:**
```json
{
  "step_name": "search_emissions_data",
  "step_type": "firecrawl_search",
  "step_config_json": {
    "query_template": "[research_domain] emissions carbon footprint Australia site:cleanenergyregulator.gov.au OR site:dcceew.gov.au",
    "limit": 5
  }
}
```

**Defence/Sovereign Capability:**
```json
{
  "step_name": "search_defence_policy",
  "step_type": "firecrawl_search",
  "step_config_json": {
    "query_template": "[research_domain] defence industry sovereign capability Australia site:defence.gov.au OR site:business.gov.au",
    "limit": 5
  }
}
```

---

## 7. QA Gates Step

### 7.1 Purpose

Perform three mandatory quality gates before final report assembly. This step validates but does NOT modify content.

### 7.2 Prompt Template

```text
STEP N — QA Gates Validation

[WRITER_STANCE_PREAMBLE injected here]

INPUTS (from previous steps):
- All prior step outputs: {{step0}}, {{step1}}, ..., {{stepN-1}}

PURPOSE:
Perform three mandatory quality gates before final report assembly. This step does NOT modify content—it validates and flags issues.

=== GATE 1: CITATION INTEGRITY ===
Check ALL source_ids referenced in prior steps:
□ Every source_id (e.g., S0-1, S0-2) exists in a sources array
□ No malformed source_ids (no "Source1", "[insert]", "{TBD}")
□ No orphan citations (referenced but never defined)
□ No duplicate source_ids with conflicting data
□ URLs are valid format or explicitly marked "URL not available"

=== GATE 2: CRITERIA COVERAGE ===
Check coverage against the grant's evaluation criteria:
[Dynamically injected criteria list]

For each criterion:
□ Is it explicitly addressed in the research outputs?
□ If not addressed, flag as a gap
□ If partially addressed, note what's missing

=== GATE 3: ASSESSOR READINESS ===
Evaluate from an assessor's perspective:
□ NARRATIVE SPINE: Is there a clear problem → solution → impact flow?
□ ADDITIONALITY: Is "why funding is needed" clearly stated?
□ JURISDICTION BENEFIT: Are Australian benefits (jobs, exports, sovereignty) quantified?
□ RISKS: Are key risks identified with mitigation strategies?
□ EVIDENCE QUALITY: Are claims supported by credible sources?
□ UNKNOWN HANDLING: Are unknowns explicitly marked (not hidden or invented)?

HARD RULES:
1. Do NOT fix issues—only identify and report them
2. Be specific: cite exact source_ids, step numbers, and field names
3. Mark issues as "blocking" (must fix) or "advisory" (should fix)
4. Calculate overall quality_score (0-100) based on percentage of checks passed

OUTPUT JSON SCHEMA:
{
  "citation_integrity": {
    "gate_name": "Citation Integrity",
    "passed": true,
    "issues": ["Missing source S0-5 referenced in step3.market_sizing"],
    "recommendations": ["Add source S0-5 to sources array or remove citation"]
  },
  "criteria_coverage": {
    "gate_name": "Criteria Coverage", 
    "passed": true,
    "issues": ["Criterion 'technical_feasibility' not addressed"],
    "recommendations": ["Add technical feasibility assessment based on TRL data"]
  },
  "assessor_readiness": {
    "gate_name": "Assessor Readiness",
    "passed": true,
    "issues": ["Additionality statement missing from economic impact"],
    "recommendations": ["Add explicit statement on what would NOT happen without funding"]
  },
  "overall_pass": true,
  "blocking_issues": ["List of issues that MUST be fixed before report can be finalized"],
  "quality_score": 85
}
```

---

## 8. HTML Assembly Steps

### 8.1 Step N+1: assemble_sections_html

```text
STEP N+1 — Assemble Sections as HTML

[WRITER_STANCE_PREAMBLE injected here]

INPUTS (from previous steps):
- All prior step outputs: {{step0}}, {{step1}}, ..., {{stepN}}
- Grant: {{grantName}} ({{grantVersionLabel}})

PURPOSE:
Transform the research findings from steps 0-N into a cohesive HTML narrative report.

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON with a single top-level object
2. Do NOT include code fences (no ``` anywhere in your response)
3. The first character of your response must be { and the last must be }
4. Include a "sections_html" field containing semantic HTML

REQUIRED SECTIONS:
1. Executive Summary - Key findings and recommendations
2. Research Context and Innovation - What the technology/research is
3. Unmet Need and Australian Relevance - Problem being solved
4. Commercialisation Pathways - Routes to market
5. Competitive Landscape - Key competitors and differentiation
6. Market Sizing (TAM/SAM/SOM) - Market opportunity with calculations
7. IP and Regulatory Pathway - Protection and compliance considerations
8. Economic Impact - Jobs, exports, GDP contribution estimates
9. Stakeholders and Partners - Key ecosystem players
10. Data Gaps and Validation Needs - What requires further investigation

HTML FORMATTING RULES:
- Use <h2> for main section headings
- Use <h3> for subsections
- Use <p> for paragraphs with proper spacing
- Use <ul><li> for bullet lists
- Use <strong> for emphasis
- Include citation markers as superscript: <sup>[S0-1]</sup>, <sup>[S3-2]</sup> etc.
- Insert table anchors: <!-- TABLE:competitors -->, <!-- TABLE:market_sizing -->, <!-- TABLE:partners -->
- Do NOT use markdown syntax inside HTML

OUTPUT JSON SCHEMA:
{
  "sections_html": "<h2>Executive Summary</h2><p>...</p><h2>Research Context</h2>...",
  "data_gaps": ["gap1", "gap2", ...]
}
```

### 8.2 Step N+2: build_tables_sources_html

```text
STEP N+2 — Build Tables and Sources (HTML)

[WRITER_STANCE_PREAMBLE injected here]

Using the research data from previous steps, compile:

1. COMPARISON TABLES - Create HTML tables for:
   - Competitor comparison (features, pricing, market position)
   - TAM/SAM/SOM summary with calculations
   - Partner capability matrix
   - Any other tabular data from research

2. SOURCE CONSOLIDATION - Compile ALL citations from all steps into a single deduplicated list

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON - no code fences, no markdown
2. First character must be {, last must be }
3. Tables must be valid HTML <table> elements

OUTPUT JSON SCHEMA:
{
  "tables": {
    "competitors": "<table class=\"data-table\">...</table>",
    "market_sizing": "<table class=\"data-table\">...</table>",
    "partners": "<table class=\"data-table\">...</table>"
  },
  "all_sources": [
    {"id": "S0-1", "mla_citation": "Author. Title. Publication, Date. URL.", "url": "https://..."},
    {"id": "S1-1", "mla_citation": "...", "url": "..."}
  ]
}
```

### 8.3 Step N+3: clean_citations_apa

```text
STEP N+3 — Clean Citations (Numeric Linked Citations)

[WRITER_STANCE_PREAMBLE injected here]

You are a citation formatting specialist. Transform all internal source ID markers 
into NUMERIC LINKED CITATIONS and produce a numbered References section.

CITATION STYLE: Numeric Linked Citations [1], [2], [3]
- First appearance in text defines the citation number
- [S0-1] on first use → [1], [S0-6] on second use → [2], etc.
- Each [n] MUST be an HTML anchor linking to its reference: <a href="#ref-n">[n]</a>
- References section uses matching IDs: <li id="ref-1">...</li>

INPUTS:
- {{stepN+1}}: sections_html containing internal citation markers
- {{stepN+2}}: tables and all_sources array

INTERNAL MARKER PATTERNS TO TRANSFORM:
- [S0-1], [S0-A1], [S1-2] (step-source format) → <a href="#ref-n">[n]</a>
- [ARTICLE-1], [SEARCH-2], [SOURCE-12] (type-number format) → <a href="#ref-n">[n]</a>
- <sup>[S0-1]</sup> (superscript-wrapped markers) → <a href="#ref-n"><sup>[n]</sup></a>

FORBIDDEN PATTERNS (must be REMOVED, never appear in output):
- [TBD], [{TBD}], [Insert...], {value}, [PROJECT NAME], [COMPANY]
- Source 1, Source 2 (text placeholders)
- Any unresolved bracket tokens

HARD RULES:
1. ZERO internal source IDs may remain in the cleaned HTML
2. Every [n] citation MUST be a hyperlink: <a href="#ref-n" class="citation-link">[n]</a>
3. Citation numbers are assigned by FIRST APPEARANCE ORDER (not source ID order)
4. Multiple adjacent markers become comma-separated: [1, 3] not [1][3]
5. If a marker cannot be resolved to a source, REMOVE IT COMPLETELY (no broken links)
6. Removed markers MUST be logged in unknowns array

OUTPUT JSON SCHEMA:
{
  "sections_html_cleaned": "FULL cleaned HTML with ONLY <a href='#ref-n'>[n]</a> citations",
  "tables_cleaned": {
    "competitors": "cleaned table HTML with numeric citations",
    "market_sizing": "cleaned table HTML",
    "partners": "cleaned table HTML"
  },
  "references_html": "<h2>References</h2><ol class='references-list'><li id='ref-1'>Author. (Year). <em>Title</em>. <a href='URL'>URL</a></li>...</ol>",
  "citation_mapping": {"S0-1": 1, "S0-6": 2, "ARTICLE-1": 3},
  "citations_audit": {
    "total_markers_found": 15,
    "markers_resolved": 12,
    "markers_removed": 3,
    "unique_sources_cited": 8
  },
  "unknowns": [
    { "marker": "[ARTICLE-99]", "location": "Section 3", "what_would_validate": "Source entry with id=ARTICLE-99" }
  ]
}
```

### 8.4 Step N+4: finalize_report_html

```text
STEP N+4 — Finalize Report (HTML)

[WRITER_STANCE_PREAMBLE injected here]

INPUTS:
- {{stepN+1}}: Data gaps and sections structure
- {{stepN+3}}: Cleaned sections_html, tables, references_html, citations_audit

PURPOSE:
Merge the cleaned sections, tables, and references into a single report_html document.

ASSEMBLY RULES:
1. Insert tables at their anchor points (<!-- TABLE:competitors --> etc.)
2. Add "Data Gaps and Validation Needs" section from step N+1 data_gaps
3. Append References section at the end
4. Ensure all HTML is valid and properly nested

INTERNAL ID CLEANUP (CRITICAL):
Before finalizing, scan the merged HTML for ANY remaining internal markers:
- [S0-1], [S1-2], [S0-A1] or any [S followed by alphanumerics
- [ARTICLE-1], [SEARCH-2] or any [ARTICLE-* / [SEARCH-*
- [TBD], [{TBD}], or any bracketed placeholder tokens
- <sup>[S0-1]</sup> or similar superscript-wrapped internal IDs

If ANY such markers remain:
- Replace with "" (empty string) and log in unknowns[]
- If removal leaves orphan parentheses or broken sentences, clean them up

VALIDATION (CRITICAL):
The final report_html must NOT contain any of these patterns:
- [S0-1], [S1-2], [S0-A1] or any [S followed by numbers/letters
- [ARTICLE-1], [ARTICLE-2] or any [ARTICLE-*
- [SEARCH-1], [SEARCH-2] or any [SEARCH-*
- [TBD], [{TBD}], or any bracketed placeholder tokens
- <sup>[S0-1]</sup> or similar superscript-wrapped internal IDs
- Source 1, Source 2 (numeric source placeholders)

OUTPUT JSON SCHEMA:
{
  "title": "Grant Report: [Project Title]",
  "report_html": "<h2>Executive Summary</h2>...[full merged HTML]...<h2>References</h2>...",
  "all_sources": [{"id": "S0-1", "apa_citation": "Author. (Year). Title. Publisher. URL", "url": "..."}],
  "citations_audit": { ...from Step N+3... },
  "data_gaps": ["gap1", "gap2"],
  "tables": {"competitors": "...", "market_sizing": "...", "partners": "..."}
}
```

---

## 9. Quality Enhancement

### 9.1 Auto-Enhancement Trigger

Prompts are flagged for enhancement if:
- Quality score < 75 (threshold for "good")
- Prompt length < 1,500 characters
- Contains forbidden patterns

### 9.2 Enhancement Prompt Template

```text
You are an expert at improving research prompts for grant applications.

[PROMPT_QUALITY_TEMPLATE injected here]

[PROMPT_REFERENCE_EXAMPLE injected here]

The following prompts need quality improvement. For each prompt, enhance it to include ALL of these:
1. A "STEP N — [Purpose]" header with INPUTS section
2. A "HARD RULES:" section with 5+ explicit constraints
3. A "FORBIDDEN PATTERNS:" section explicitly banning: {TBD}, [Insert...], [PROJECT NAME], Hypothetical [X], Source 1/2
4. A "PROXY PROTOCOL:" section for numeric fields (TAM/SAM/SOM, market sizes, economic impact):
   - If direct data unavailable, provide conservative proxy estimate
   - Show calculation method and inputs with source_ids
   - Include sensitivity range and confidence label
5. An "UNKNOWN HANDLING:" section (unknowns array + next_best_source guidance)
6. An "OUTPUT JSON SCHEMA:" with exact field definitions

CRITICAL REQUIREMENTS:
- Each enhanced prompt MUST be at least 1,500 characters (this is mandatory)
- Template variables {{...}} are ONLY for INPUTS or HARD RULES sections
- NEVER include {{variable}} inside OUTPUT SCHEMA field descriptions
- Follow the exact structure from the REFERENCE EXAMPLE

========== ENHANCED QUALITY SCORING ==========

1. EVIDENCE-TYPE COMPLIANCE SCORE:
   - Detect if market sizing references contain epidemiology paper citations (penalty: -15)
   - Detect if numeric claims lack source_ids (penalty: -5 per missing)
   - Detect if competitor entries lack measurable data points (penalty: -3 per entry)

2. ASSESSOR INSIGHT SCORE:
   Requires at least:
   - 1 decision-pathway artifact (buyer persona, procurement path, regulatory gate)
   - 1 sensitivity range for numeric estimates
   - 1 explicit unknown with "what_would_validate" guidance
   
3. GENERICNESS PENALTY:
   Detect these generic patterns and penalize:
   - "significant market opportunity" without numbers (-5)
   - "growing demand" without CAGR/source (-5)
   - "competitive advantage" without measurable differentiator (-5)
   - Adjective-only competitor descriptions (-3 per entry)

4. FORBIDDEN PATTERN CHECK:
   - {TBD}, [Insert...], [PROJECT NAME], Hypothetical [Entity] → -10 each
   - [S0-1], [ARTICLE-1] in final OUTPUT SCHEMA descriptions → -10 each
   - "Source 1", "Source 2" → -10 each
   - Evidence type mismatch (epi → market) → -15 each

Return JSON: {"enhancements": [{ "step_number": N, "enhanced_prompt": "..." }, ...]}
```

---

## 10. Validation Rules

### 10.1 Forbidden Patterns

The following patterns must NEVER appear in any step output:

| Pattern | Name |
|---------|------|
| `\{TBD\}` | {TBD} |
| `\[Insert[^\]]*\]` | [Insert...] |
| `Hypothetical\s+\w+` | Hypothetical [Entity] |
| `\[PROJECT\s*NAME\]` | [PROJECT NAME] |
| `\[COMPANY\]` | [COMPANY] |
| `\{value\}` | {value} |
| `Source\s*[12]\b` | Source 1/2 |
| `\[Your\s+` | [Your... |
| `\{\s*\}` | {} |
| `\[TBD\]` | [TBD] |
| `\$Z\b` | $Z placeholder |
| `\bA%\b` | A% placeholder |
| `\bB%\b` | B% placeholder |
| `\bC%\b` | C% placeholder |

### 10.2 Quality Scoring Rubric (100 points)

| Component | Points | Check |
|-----------|--------|-------|
| Context Header | 15 | Has `STEP \d` or `INPUTS:` |
| Hard Rules Section | 20 | Has `HARD RULES` or `CRITICAL RULES` or `REQUIREMENTS` |
| Output Schema | 20 | Has `OUTPUT.*JSON` or `JSON.*SCHEMA` |
| URL Validation | 15 | Has `URL.*valid` or `valid.*URL` |
| Unknown Handling | 15 | Has `unknown.*handling` or `unknowns.*array` |
| Placeholder Prohibition | 10 | Has `\[.*\].*forbidden` or `placeholder.*prohibit` |
| Adequate Length | 5 | ≥1,500 characters |

**Bonus Points:**
| Bonus | Points |
|-------|--------|
| Proxy Protocol | +10 |
| Evidence-Type Check | +10 |
| Assessor Insight | +10 |
| Sensitivity Range | +5 |

**Penalties:**
| Penalty | Points |
|---------|--------|
| Per Forbidden Pattern | -5 |

**Score Thresholds:**
- ≥75: Good (pass)
- 45-74: Warning (conditional pass)
- <45: Poor (fail)

### 10.3 Variable Flow Validation

The system validates that all template variables can be resolved at runtime.

**Base Variables:**
```
summary, publicArticleUrl, articleContent, trl, ipStatus,
grantName, grantVersionLabel, grantGuidelines, grantRubric, 
grantRubricJson, grantSummary, requiredInputs, sources, unknowns
```

**Dynamic Variables:**
- Any key from `required_inputs_json` (e.g., `{{project_title}}`, `{{budget}}`)

**Step References:**
- `{{step0}}` through `{{stepN-1}}` (previous step outputs)

**Validation Rules:**
1. No forward references (step N cannot reference step N+1)
2. No references to non-existent steps
3. All variables must exist in base variables, dynamic inputs, or previous steps

**Auto-Fix Behavior:**
- Unresolved required input variables → Extract instruction placeholder
- Unresolved other variables → Readable fallback instruction

---

## 11. Variable Reference

### 11.1 User Input Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{summary}}` | inputs_json | User's 100-word research summary |
| `{{publicArticleUrl}}` | inputs_json | URL to research article |
| `{{articleContent}}` | Firecrawl | Scraped article markdown |
| `{{trl}}` | inputs_json | Current Technology Readiness Level |
| `{{ipStatus}}` | inputs_json | IP protection status |

### 11.2 Grant Context Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{grantName}}` | grants table | Name of the grant |
| `{{grantVersionLabel}}` | grant_versions | Version identifier |
| `{{grantGuidelines}}` | grant_versions | Full guidelines text |
| `{{grantRubric}}` | grant_versions | Formatted rubric text |
| `{{grantRubricJson}}` | grant_versions | Rubric as JSON |
| `{{grantSummary}}` | AI extraction | AI-generated grant summary |
| `{{requiredInputs}}` | grant_versions | Required inputs JSON |

### 11.3 Step Output Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `{{step0}}` | report_run_steps | Output from step 0 (usually source pack) |
| `{{step1}}` | report_run_steps | Output from step 1 |
| `{{stepN}}` | report_run_steps | Output from step N |
| `{{sources}}` | Firecrawl | Formatted search results |
| `{{unknowns}}` | Step outputs | Aggregated unknowns array |

### 11.4 Semantic Equivalents

The system maps common aliases to canonical variables:

| Alias | Maps To |
|-------|---------|
| `{{project_summary}}` | `{{summary}}` |
| `{{research_summary}}` | `{{summary}}` |
| `{{article_url}}` | `{{publicArticleUrl}}` |

---

## Appendix: Model Tier Mapping

| Tier | Model |
|------|-------|
| lite | google/gemini-2.5-flash-lite |
| balanced | google/gemini-3-flash-preview |
| pro | google/gemini-3-pro-preview |

---

*This document is auto-generated reference material. For the authoritative source, see `supabase/functions/process-grant-guidelines/index.ts`.*
