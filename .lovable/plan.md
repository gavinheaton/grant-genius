
# Assessor Insight Contract: Grant Bundle Architect Enhancement

## Overview

This plan upgrades the Grant Bundle Architect to produce **assessor-ready, commercially insightful, evidence-correct** reports. The changes inject new quality contracts into Stage 3 (Pipeline Generation) and Stage 4 (Auto-Enhancement), ensuring all future pipelines:

1. Match evidence types to claim categories (market data ≠ epidemiology)
2. Include decision-pathway artifacts (buyer journey, pricing anchors, regulatory gates)
3. Enforce the Proxy Protocol for unavailable data
4. Group competitors into comparability classes (Direct/Adjacent/Enablers)
5. Remove all internal citation markers before final output

---

## Files to Modify

| File | Change Type |
|------|-------------|
| `supabase/functions/process-grant-guidelines/index.ts` | Update Stage 3 prompt (~lines 1530-1806) + Stage 4 prompt (~lines 1950-2000) + add new contracts |
| `src/lib/bundleGeneratorSpec.ts` | Add `ASSESSOR_INSIGHT_CONTRACT` specification for documentation/reference |

---

## Technical Changes

### A. New Constants: Assessor Insight Contract

Add these new contract definitions (will be injected into every step prompt):

```typescript
// ============================================================================
// ASSESSOR INSIGHT CONTRACT (injected into all prompts)
// ============================================================================

const ASSESSOR_INSIGHT_CONTRACT = `
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
`;
```

---

### B. Update Stage 3 Pipeline Generation Prompt

**Location:** Lines ~1530-1806 in `process-grant-guidelines/index.ts`

Add the `ASSESSOR_INSIGHT_CONTRACT` after the existing `WRITER_STANCE_PREAMBLE` and before the Forbidden Patterns section.

Add new **Required Step Types** section to the pipeline generation prompt:

```text
========== ASSESSOR-GRADE EVIDENCE MODULES (include where relevant) ==========

In addition to the Grant Writer Core steps, include these assessor-grade modules
when the archetype/rubric demands them:

1. market_definition_buyer_pathway
   - buyer_persona: payer / decision-maker / user
   - buying_triggers: what events trigger purchase consideration
   - procurement_path: public tender / direct purchase / reimbursement
   - adoption_constraints: clinical evidence, training, integration
   - implementation_friction: barriers to adoption

2. pricing_willingness_to_pay
   - price_anchors[]: At least 3 (direct, adjacent, or proxy)
   - each anchor: { product/service, price, currency, year, source_id, relevance }
   - proxy_method (if no direct pricing): reimbursement schedules, procurement listings, adjacent categories
   - willingness_to_pay_signals: value-based evidence

3. regulatory_reimbursement_gates (for Health/Clinical/Defence archetypes)
   - pathway_table: stage → evidence_required → typical_time_range → typical_cost_range → source_id
   - adoption_evidence_required: what clinicians/buyers need to see
   - standards_compliance: applicable standards (ISO, TGA, FDA)

4. competitive_landscape_comparability
   - direct_competitors[]: Same buyer + use case + modality
   - adjacent_competitors[]: Overlapping markets
   - enablers[]: Platforms, diagnostics, manufacturing partners
   - each entry must include: { name, url, one_measurable (price/revenue/TRL/trial_stage/approval_status), source_id, differentiator }
   - differentiators must be measurable outcomes (not adjectives)

5. tam_sam_som_dual_methodology
   - top_down: { value, method: "Parent market × segment share", inputs[], source_ids[] }
   - bottom_up: { value, method: "Incidence × treatable pop × price × penetration", inputs[], source_ids[] }
   - reconciliation: explanation of differences if methods diverge
   - sensitivity: { low, mid, high } with confidence labels

6. delivery_risk_mitigations
   - risk_register[]: { risk, likelihood, impact, mitigation, owner, evidence_of_precedent }
   - align risks to rubric sections
   - mitigations must reference partners, standards, or precedent pathways

7. partner_mapping_with_evidence
   - partners[]: { name, role_in_delivery, url, validating_source_id, capability_gap_filled }
   - each partner must have at least one validating source OR be marked "Unknown (validation needed)"
   - capability_gaps: what partners are missing

========== MANDATORY PROMPT TEMPLATE ADDITIONS (for EVERY step) ==========

Each step's prompt_template MUST include these additional sections:

8. EVIDENCE-TYPE CHECK (add before OUTPUT SCHEMA):
   "Before writing, verify each claim uses the correct evidence type per the 
    Evidence-Type Matching Rule. If evidence type mismatch is detected 
    (e.g., using epidemiology for market sizing), replace the claim with 
    'Unknown (evidence type mismatch)' and log it to unknowns[]."

9. ASSESSOR INSIGHT OUTPUT CHECK (add at end):
   "Before finalizing output, verify it does NOT read like a generic summary. 
    If output is generic, rewrite to include:
    - Decision implications (who decides, why, when)
    - Quantified constraints (not vague qualifiers)
    - Validated anchors with source_ids
    - Explicit unknowns with proxy methods where attempted"

10. SOURCE ID RULES (strengthen existing):
   "Internal placeholders like [article], [Source1], {TBD}, [ARTICLE-1], or 
    bracketed source markers are FORBIDDEN in outputs.
    Only use source IDs from the Source Pack format S#-# (e.g., S0-1, S0-2).
    NEVER invent source IDs. If a source_id cannot be found, use 'Unknown (no source)' 
    and add to unknowns[]."
```

---

### C. Update Stage 4 Auto-Enhancement Prompt

**Location:** Lines ~1950-2000 in `process-grant-guidelines/index.ts`

Add new quality scoring checks to the enhancement prompt:

```text
ENHANCED QUALITY SCORING (must pass before output is considered 'good'):

1. EVIDENCE-TYPE COMPLIANCE SCORE (new):
   - Detect if market sizing references contain epidemiology paper citations (penalty: -15)
   - Detect if numeric claims lack source_ids (penalty: -5 per missing)
   - Detect if competitor entries lack measurable data points (penalty: -3 per entry)
   Formula: 100 - sum(penalties), minimum 0

2. ASSESSOR INSIGHT SCORE (new):
   Requires at least:
   - 1 decision-pathway artifact (buyer persona, procurement path, regulatory gate)
   - 1 sensitivity range for numeric estimates
   - 1 explicit unknown with "what_would_validate" guidance
   
   If missing any, auto-enhancement MUST rewrite the prompt to force:
   - Add DECISION PATHWAY section requiring buyer/procurement artifacts
   - Add SENSITIVITY ANALYSIS section for numeric outputs
   - Add VALIDATION GAPS section for unknowns with next steps

3. GENERICNESS PENALTY (new):
   Detect these generic patterns and penalize:
   - "significant market opportunity" without numbers (-5)
   - "growing demand" without CAGR/source (-5)
   - "competitive advantage" without measurable differentiator (-5)
   - Adjective-only competitor descriptions (-3 per entry)

4. FORBIDDEN PATTERN CHECK (existing, strengthened):
   - {TBD}, [Insert...], [PROJECT NAME], Hypothetical [Entity] → -10 each
   - [S0-1], [ARTICLE-1] in final OUTPUT SCHEMA descriptions → -10 each
   - "Source 1", "Source 2" → -10 each
   - Evidence type mismatch (epi → market) → -15 each

ENHANCEMENT INSTRUCTIONS (if score < 70):

For prompts failing EVIDENCE-TYPE COMPLIANCE:
- Add explicit "EVIDENCE-TYPE MATCHING" section with the claim-source mapping table
- Add instruction: "Cross-check every market/revenue claim against source type before output"

For prompts failing ASSESSOR INSIGHT SCORE:
- Add "COMMERCIAL REALITY REQUIREMENTS" section mandating buyer pathway and pricing anchors
- Add "SENSITIVITY RANGE REQUIREMENT" for all numeric estimates
- Add "UNKNOWN DOCUMENTATION" section with what_is_missing + what_would_validate format

For prompts failing GENERICNESS check:
- Add "ANTI-GENERICNESS RULES" section:
  * Replace "significant" with specific numbers or ranges
  * Replace "growing" with CAGR % and source
  * Replace adjective-based differentiators with measurable outcomes
```

---

### D. Update Assembly Logic (Final Report Hygiene)

**Location:** Lines 1121-1212 (`clean_citations_apa` step) and 1214-1270 (`finalize_report_html` step)

Add to the `clean_citations_apa` prompt template:

```text
CITATION AUDIT REQUIREMENT (new):
Your output must include a "citations_audit" object:
{
  "citations_audit": {
    "total_citations_found": number,
    "citations_resolved": number,
    "citations_removed": number,
    "evidence_type_compliant": [
      { "source_id": "S0-1", "claim_category": "market_size", "source_type": "market_report", "compliant": true }
    ],
    "non_compliant_citations": [
      { "source_id": "S0-5", "claim_category": "market_size", "source_type": "epidemiology", "issue": "Wrong evidence type" }
    ],
    "references_list_complete": true/false
  }
}

INTERNAL MARKER REMOVAL (strengthened):
The following patterns must NEVER appear in sections_html_cleaned or tables_cleaned:
- [S0-1], [S0-A1], [S1-2] (step-source format)
- [ARTICLE-1], [SEARCH-2], [SOURCE-12] (type-number format)
- [TBD], [{TBD}], [Insert...], {value}
- <sup>[S0-1]</sup> (superscript-wrapped markers)
- Source 1, Source 2 (numeric source placeholders)

If a claim has an internal marker that cannot be resolved to an APA citation:
- Remove the marker completely (leave no trace)
- If the claim is numeric, add note: "(Estimate - requires validation)"
- Add to unknowns with what_would_validate guidance
```

Add to the `finalize_report_html` prompt template:

```text
DATA GAP PRESENTATION (new):
If any unknowns exist from previous steps, include a "Data Gaps & Validation Needs" 
section before References with format:
- Gap description
- What would validate it
- Current proxy estimate (if any)

FINAL VALIDATION LINT (strengthened):
Before outputting, scan report_html for these patterns and REMOVE if found:
- Regex: /\[S\d+-\w*\d*\]/g (internal source markers)
- Regex: /\[ARTICLE-\d+\]/g
- Regex: /\[SEARCH-\d+\]/g
- Regex: /\{TBD\}|\[TBD\]|\[Insert[^\]]*\]/gi
- Regex: /Source\s+[12]\b/gi

If removal leaves orphan parentheses or broken sentences, clean them up.
```

---

### E. Update Quality Scoring Function

**Location:** Lines 229-262 in `process-grant-guidelines/index.ts`

Extend `calculateQualityScore()` to include new checks:

```typescript
function calculateQualityScore(prompt: string): { 
  total: number; 
  level: 'good' | 'warning' | 'poor'; 
  forbiddenPatterns: string[];
  hasProxyProtocol: boolean;
  hasEvidenceTypeCheck: boolean;
  hasAssessorInsight: boolean;
} {
  // ... existing logic ...
  
  // NEW: Evidence-type compliance check
  const hasEvidenceTypeCheck = /EVIDENCE.TYPE.*MATCHING|EVIDENCE.TYPE.*CHECK|claim.*uses.*correct.*evidence/i.test(prompt);
  const evidenceTypeBonus = hasEvidenceTypeCheck ? 10 : 0;
  
  // NEW: Assessor insight check
  const hasAssessorInsight = /ASSESSOR.*INSIGHT|COMMERCIAL.*REALITY|decision.*pathway|buyer.*persona|pricing.*anchor/i.test(prompt);
  const assessorInsightBonus = hasAssessorInsight ? 10 : 0;
  
  // NEW: Sensitivity range check
  const hasSensitivityRange = /sensitivity.*range|low.*high|confidence.*label/i.test(prompt);
  const sensitivityBonus = hasSensitivityRange ? 5 : 0;
  
  const baseTotal = Object.values(scores).reduce((a, b) => a + b, 0);
  const total = Math.max(0, baseTotal - forbiddenPenalty + proxyBonus + evidenceTypeBonus + assessorInsightBonus + sensitivityBonus);
  
  // Raise threshold for 'good' to 75 (from 70) to enforce higher standards
  const level = total >= 75 ? 'good' : total >= 45 ? 'warning' : 'poor';
  
  return { total: Math.round(total), level, forbiddenPatterns, hasProxyProtocol, hasEvidenceTypeCheck, hasAssessorInsight };
}
```

---

## Implementation Order

1. Add `ASSESSOR_INSIGHT_CONTRACT` constant near `WRITER_STANCE_PREAMBLE`
2. Update Stage 3 pipeline generation prompt with new sections
3. Update Stage 4 auto-enhancement prompt with new quality checks
4. Update `calculateQualityScore()` function with new scoring
5. Update `clean_citations_apa` step template
6. Update `finalize_report_html` step template
7. Update `src/lib/bundleGeneratorSpec.ts` for documentation
8. Deploy updated `process-grant-guidelines` edge function

---

## Acceptance Criteria

After implementation, pipelines generated should satisfy:

| Criterion | Validation Method |
|-----------|-------------------|
| Market sizing uses market sources (not epi) | Check `citations_audit.evidence_type_compliant` |
| Every numeric claim has source_id or is "Unknown" | Scan output for orphan numbers |
| Buyer pathway + adoption constraints present | Check for `buyer_persona` or `procurement_path` fields |
| Pricing anchors or proxy method documented | Check for `price_anchors[]` or `proxy_method` |
| Competitor comparability groups | Check for `direct_competitors`, `adjacent_competitors`, `enablers` |
| Sensitivity ranges for TAM/SAM/SOM | Check for `sensitivity: {low, high}` in market outputs |
| "Unknown" has validation guidance | Check `unknowns[]` entries have `what_would_validate` |
| No internal markers in final report | Regex scan for `[S0-`, `[ARTICLE-`, `{TBD}` |
| Citations audit object present | Check final step output has `citations_audit` |

---

## Testing Checklist

1. [ ] Generate a new pipeline for a Commercialisation grant
2. [ ] Verify prompts include Evidence-Type Matching section
3. [ ] Verify prompts include Assessor Insight requirements
4. [ ] Run report generation end-to-end
5. [ ] Check final report for internal citation markers (should be none)
6. [ ] Verify `citations_audit` object in finalization output
7. [ ] Check that market sizing sources are market reports, not epidemiology
8. [ ] Verify competitor entries have measurable data points

