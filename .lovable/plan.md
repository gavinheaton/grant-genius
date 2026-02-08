

# Stage 3 Pipeline Prompt: Universal Generalisation & Quality Hardening

## Overview

Eight targeted patches to make the Grant Bundle Architect grant-agnostic, eliminate unsourced claims, and enforce assessor-grade output quality. All changes are additive or replace specific sections—no full rewrite.

---

## Patch Locations Summary

| Patch | Section | Lines | Change Type |
|-------|---------|-------|-------------|
| A | Universal Generalisation | 1856-1865 | Add new rule block |
| B | Forbidden Patterns + Evidence Rules | 1932-1946, 1876-1880 | Expand existing |
| C | Evidence-Type Matching | 1886-1902 | Upgrade to validation gate |
| D | TAM/SAM/SOM Protocol | 1948-1979 | Strengthen existing |
| E | Commercial Reality Layer | 1908-1915, 2163-2169 | Expand requirements |
| F | Competitor Classification | 1916-1924 | Add hard rules |
| G | Final Assembly | 2099-2122 | Add zero-ID enforcement |
| H | Quality Gate | 2194-2217 | Add fail-fast + repair |

---

## Patch A: Universal Generalisation (Remove AEA/NRF Defaults)

**Location**: After line 1864 (after "mandatory Grant Writer Core plus archetype-specific modules")

**Add new block**:

```text
========== UNIVERSAL GENERALISATION RULE ==========

1. This pipeline MUST NOT assume NRF, AEA, or any specific program priorities unless they explicitly appear in:
   - grantGuidelines (extracted text)
   - rubric JSON (program_profile or priority_areas fields)
   - requiredInputs (applicant-provided program context)

2. Replace any reference to specific program priorities with:
   "Program priorities (derived from grantGuidelines/program_profile)"
   and ensure they are explicitly cited from Grant DNA Pack outputs.

3. If program priorities are not explicit in the provided guidelines:
   - Do NOT invent them
   - Output: "Not specified in provided guidelines"
   - Add to unknowns[]: { "what_is_missing": "program priorities", "what_would_validate": "grant guidelines section on priority areas or program objectives" }
```

---

## Patch B: Hard Ban on "Common Knowledge" + Unsourced Numbers

**Location 1**: Expand FORBIDDEN OUTPUT PATTERNS (lines 1932-1946)

**Add to forbidden list**:

```text
- "common knowledge" (case-insensitive) — banned outright
- "widely known", "generally accepted", "industry standard" — banned UNLESS immediately followed by a citation to an authoritative source_id
- Any numeric claim without a valid source_id (must use proxy or mark as "Not publicly disclosed")
```

**Location 2**: Expand EVIDENCE RULES (after line 1880)

**Add**:

```text
4. UNSOURCED NUMERIC BAN: Any numeric claim without a valid source_id MUST be replaced by EITHER:
   - A proxy calculation with cited inputs, sensitivity range, and confidence label, OR
   - "Not publicly disclosed" (only for company-private numbers), plus an unknowns[] entry with what_would_validate

5. BANNED HEDGE PHRASES: The following phrases are forbidden without immediate source citation:
   - "common knowledge", "widely known", "generally accepted", "industry standard"
   - If used, must be followed by (source_id) in the same sentence
```

---

## Patch C: Non-Negotiable Evidence-Type Matching Gate

**Location**: Replace lines 1886-1902 (EVIDENCE-TYPE MATCHING RULE section)

**Upgrade to validation gate**:

```text
========== EVIDENCE-TYPE VALIDATION GATE (Non-Negotiable) ==========

This is an ENFORCEMENT GATE, not advisory guidance. Before finalizing ANY step output:

1) For each claim, identify its category:
   - market sizing / revenue / pricing
   - disease burden / epidemiology
   - regulatory / reimbursement
   - competitor status / product claims

2) Check the evidence type against the allowed sources table:

| Claim Category | ALLOWED Sources | NEVER Use |
|----------------|-----------------|-----------|
| Market size / market growth / revenue / pricing | Market research firms, industry reports, procurement datasets, official spending stats (PBS/MBS/AIHW), ABS industry accounts, company annual reports, regulator price lists | Epidemiology studies, disease burden papers |
| Disease burden / incidence / mortality / prevalence | Government health statistics, AIHW, Cancer Australia, WHO, peer-reviewed epidemiology, clinical registries | Market reports, company financials |
| Regulatory pathway / approval / reimbursement | TGA/FDA/EMA guidance, PBS/HTA documents, standards bodies, official policy docs | General news, press releases |
| Competitor status / product claims | Company filings, regulator databases (ARTG, FDA 510k), clinical trial registries (ANZCTR, ClinicalTrials.gov), official product pages, peer-reviewed publications | Wikipedia, blog posts, undated sources |

3) If evidence type MISMATCH is detected:
   - Replace the claim with EXACTLY: "Unknown (evidence type mismatch)"
   - Add an unknowns[] entry with:
     - what_is_missing: specific data needed
     - what_would_validate: correct source types
     - proxy_attempted: true/false
     - next_best_source_types: (e.g., ABS, AIHW, PBS, company annual report, ARTG)

4) SPECIAL RULE FOR MARKET SIZING:
   - Evidence type mismatch is NOT allowed to terminate the step
   - Mismatch MUST trigger mandatory proxy sizing using correct evidence types
   - Log the mismatch in unknowns[] but proceed with proxy calculation
```

---

## Patch D: Mandatory Proxy Protocol Strengthening

**Location**: Expand lines 1948-1979 (MANDATORY PROXY PROTOCOL section)

**Replace/enhance with**:

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
[Keep existing proxy failure rule text from lines 1970-1978]
```

---

## Patch E: Commercial Reality Layer Enforcement

**Location 1**: Expand lines 1908-1915 (COMMERCIAL REALITY LAYER section)

**Replace with**:

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

MINIMUM EVIDENCE DIVERSITY REQUIREMENTS:
- Market sizing section: cite ≥3 distinct publishers (or log constrained search strategy)
- Competitor section: include ≥5 named entities OR document search strategy + why constrained
- Regulatory/reimbursement section: cite primary sources (regulator, HTA/PBS/MBS, standards bodies)
```

**Location 2**: Expand ASSESSOR INSIGHT OUTPUT CHECK (lines 2163-2169)

**Add after "Explicit unknowns with proxy methods where attempted"**:

```text
     - Buyer pathway clearly defined (who pays / decides / uses)
     - Adoption gating steps enumerated (procurement/reimbursement/regulatory)
     - ≥3 pricing anchors or documented constraint
     - Implementation friction addressed (training, integration, evidence burden)
     - Partner roles mapped to specific capability gaps"
```

---

## Patch F: Competitor/Partner Classification Hard Rules

**Location**: Expand lines 1916-1924 (COMPETITOR COMPARABILITY FRAMEWORK)

**Replace with**:

```text
COMPETITOR COMPARABILITY FRAMEWORK (Hard Rules):

Classification (required for every entity):
- Direct: Same buyer + same use case + same modality/class
- Adjacent: Same buyer OR same use case OR similar modality
- Enablers: Platforms, diagnostics, manufacturing, distribution, integrators

MEASURABLE ATTRIBUTE REQUIREMENT:
Every "competitor" must include at least ONE measurable attribute:
- price/pricing_anchor OR revenue OR TRL/stage OR trial_stage OR approval_status OR reimbursement_status

If NO measurable attribute available:
- Entity MUST be moved to "enablers" or "partners" category
- Mark as "Unknown (validation needed)"
- Add unknowns[] entry describing how to validate

NO PARTNER-LIKE ENTITIES IN COMPETITOR TABLES:
The following entity types CANNOT be listed as competitors unless they are explicitly commercial product vendors with measurable attributes:
- Hospitals, health services, clinics
- Universities, research institutes
- Biobanks, specimen repositories, research cohorts
- Government agencies, NGOs, foundations
- Standards bodies, accreditation agencies

If such entities appear in competitor research, classify them as:
- "Enablers" (if they provide platforms, access, or infrastructure)
- "Partners" (if they fill capability gaps in delivery)
- "Customers" (if they are target buyers)
```

---

## Patch G: Final Assembly Zero Internal IDs

**Location 1**: Expand N-1: report_assembly (lines 2099-2102)

**Add to report_assembly requirements**:

```text
N-1: report_assembly
  - Assembles an assessor-ready markdown report that explicitly follows rubric + required inputs coverage.
  - Must instruct the model to write like a grant writer and to explicitly reference rubric sections by title.
  
  ZERO INTERNAL IDS RULE:
  - You must NOT output any internal tokens or IDs in brackets/parentheses such as:
    - (S0-2), [S0-2], [article], [Source1], step9, step_outputs, {{step0}}
  - All citations in the assembled report must be human-readable APA in-text style:
    - e.g., (AIHW, 2023) or (Cancer Australia, 2024)
  - If a source lacks author/year, use (Publisher, n.d.)
```

**Location 2**: Expand N: finalize_citations (after line 2122)

**Add required output schema and validation**:

```text
  CITATION HYGIENE PASS (mandatory):
  1. Find and remove/replace ALL internal IDs and placeholders
  2. Every in-text citation must map to one and only one reference entry
  3. References must be complete (authors, year, title, publisher, URL)
  4. If any in-text citation cannot be resolved:
     - Replace with "Unknown (citation unresolved)" in the body
     - Add to unknowns[] with what_would_validate

  REQUIRED OUTPUT SCHEMA for finalize_citations:
  {
    "resolved_citations_count": number,
    "unresolved_citations": [
      {"token_found": "S0-2", "location_hint": "Section X", "fix_applied": "removed|replaced|flagged"}
    ],
    "references_apa": [ /* complete reference objects */ ],
    "report_html": "string (clean, no internal IDs)"
  }

  FINAL VALIDATION (must pass):
  The output must contain ZERO matches for:
  - /\bS\d+-\d+\b/
  - /\bSource\s*\d+\b/i
  - /\[article\]/i
  - /\{TBD\}|\[Insert/i
  - /step\d+|step_outputs/i
  - /\{\{[^}]+\}\}/
```

---

## Patch H: Quality Gate Fail-Fast with Repair

**Location**: Expand lines 2194-2217 (Quality Gates section)

**Add before "Return JSON"**:

```text
========== PIPELINE VALIDATION (FAIL-FAST WITH REPAIR) ==========

Before returning the pipeline JSON, perform these validation checks:

1. CORE STEP VALIDATION:
   - All Grant Writer Core steps must exist with exact names:
     build_source_pack, rubric_traceability_matrix, assessor_insight_layer,
     assumptions_register, comparables_market_signals, additionality_and_benefit_case,
     commercialisation_logic, risk_register_and_governance, budget_logic_and_value_for_money
   - Final steps report_assembly and finalize_citations must exist

2. SEQUENCE VALIDATION:
   - step_number must be sequential from 0 with no gaps
   - step_name must be snake_case and unique

3. PROMPT TEMPLATE VALIDATION:
   - Every prompt_template must be >= 1,500 characters
   - Must include: INPUTS, HARD RULES, FORBIDDEN PATTERNS, OUTPUT SCHEMA sections
   - Must NOT contain forbidden patterns from the banned list

4. DEPTH TARGET VALIDATION:
   - Every step_description must include a Depth Target (deliverable counts)

IF VALIDATION FAILS:
1. Log which validation(s) failed
2. Auto-repair prompts:
   - Missing sections: inject template boilerplate
   - Forbidden patterns: replace with compliant alternatives
   - Short prompts: expand with required sections
3. Re-validate after repair
4. Only return JSON after all validations pass
```

---

## Files to Modify

| File | Location | Change Summary |
|------|----------|----------------|
| `supabase/functions/process-grant-guidelines/index.ts` | Line 1865 | Add Universal Generalisation block |
| Same file | Lines 1876-1880 | Expand Evidence Rules |
| Same file | Lines 1886-1902 | Replace with Evidence-Type Validation Gate |
| Same file | Lines 1908-1915 | Expand Commercial Reality Layer |
| Same file | Lines 1916-1924 | Replace Competitor Framework with hard rules |
| Same file | Lines 1932-1946 | Expand Forbidden Patterns |
| Same file | Lines 1948-1979 | Strengthen Proxy Protocol |
| Same file | Lines 2099-2102 | Add Zero Internal IDs to report_assembly |
| Same file | Lines 2103-2122 | Expand finalize_citations requirements |
| Same file | Lines 2163-2169 | Expand Assessor Insight Output Check |
| Same file | Lines 2194-2217 | Add Fail-Fast Validation Gate |

---

## Expected Outcomes

After these patches:

1. **Grant-Agnostic**: No AEA/NRF assumptions—works for any Australian grant
2. **No Hand-Waving**: "Common knowledge" and unsourced numbers are blocked
3. **Evidence-Enforced**: Type matching is a gate, not advice
4. **Dual Proxy Required**: TAM/SAM/SOM always has top-down + bottom-up
5. **Commercial Depth**: Buyer pathway, gating steps, pricing anchors required
6. **Clean Competitors**: No partner-like entities polluting competitor tables
7. **Zero Internal IDs**: Final report contains only human-readable citations
8. **Fail-Fast**: Pipeline validates before returning, with auto-repair

