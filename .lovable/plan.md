

# Integrate Quality Patches into Stage 3 Pipeline Prompt

## Overview

Five patches to tighten the pipeline generation prompt, preventing shallow proxies, junk comparables, generic compliance writing, and residual bracketed source IDs.

## Patch Locations in `process-grant-guidelines/index.ts`

| Patch | Insert Location | Lines |
|-------|-----------------|-------|
| A - Proxy Failure Escape Hatch | After MANDATORY PROXY PROTOCOL section | ~1968 |
| B - Type-Matched Comparables | Update Step 4 definition + new evidence-type rule | ~2036-2039 |
| C - Assessor Artefacts | Update Step 2 + Step 5 output requirements | ~2029-2044 |
| D - Decision-Grade Specificity | New section after ASSESSOR INSIGHT OUTPUT CHECK | ~2120 |
| E - Finalize Citations Rewrite | Replace N: finalize_citations block | ~2071-2074 |

---

## Patch A: Proxy Failure Escape Hatch

**Purpose**: Prevents shallow "Unknown" outputs by requiring documented proxy attempts before admitting failure.

**Insert after line 1968** (after "NEVER output 'Unknown' for TAM/SAM/SOM..."):

```text
PROXY FAILURE RULE (Allowed Only After Attempts):
If no valid anchors exist to compute a proxy estimate without violating the Evidence-Type Matching Rule, you may output:
"Proxy not possible (insufficient validated anchors)"

BUT ONLY if you also include in unknowns[]:
- proxy_attempts[]: at least 2 attempted proxy methods with why each fails
- anchors_missing[]: what exact anchors are missing
- next_best_sources[]: what would validate (e.g., HTA submission, procurement listings, PBS item pricing, tender award data, annual report segment revenue)
- recommended_user_inputs[]: what the applicant could supply to unlock a proxy (e.g., expected per-unit cost, target price band, treatable population assumptions)
```

**Update FORBIDDEN OUTPUT PATTERNS** (lines 1932-1946):

Replace line 1939:
```text
- "Unknown (no validated source found)" WITHOUT a proxy attempt
```

With:
```text
- "Unknown..." without proxy attempt OR proxy failure rule compliance
```

---

## Patch B: Type-Matched Comparables Enforcement

**Purpose**: Prevents junk comparables by requiring classification and evidence-type matching for competitor data.

**Update Step 4 definition** (lines 2036-2039) to:

```text
Step 4: comparables_market_signals
  - Identify comparables classified as: direct | adjacent | enabler
  - Minimum direct comparables = min(3, available_in_market), NOT always 5
  - If fewer than 3 direct exist, require:
    - why_direct_is_limited: explanation of market constraints
    - adjacent_compensations: how adjacent/enabler comparables support assessor evaluation
  - Include 2+ market_signals (investment rounds, regulatory approvals, procurement, revenue) with source_id
  - Output: comparables[], why_direct_is_limited (if applicable), adjacent_compensations[], search_strategy_if_limited, market_signals[], unknowns[]

  EVIDENCE-TYPE RULE FOR COMPARABLES:
  | Signal Type | ALLOWED Sources |
  |-------------|-----------------|
  | Investment rounds | Credible databases (Crunchbase, PitchBook), SEC/ASIC filings, reputable business press (AFR, WSJ, Reuters) |
  | Regulatory approvals | Regulator databases (ARTG, FDA 510k, TGA, EMA) |
  | Procurement | Tender databases (AusTender, state procurement portals, BuySMARTer), contract award notices |
  | Revenue/pricing | Annual reports, SEC filings, official price lists, PBS schedules |
```

---

## Patch C: Hard-Require Assessor Artefacts

**Purpose**: Forces insight-driven outputs instead of generic summaries.

**Update Step 2 definition** (lines 2029-2031) to:

```text
Step 2: assessor_insight_layer
  - For each rubric section, generate deep assessor intelligence
  - OUTPUT MUST INCLUDE:
    - assessor_intent: 1-2 sentences on what the assessor is really testing for
    - typical_failure_modes[]: at least 5 concrete failure patterns (not generic)
    - what_good_looks_like[]: measurable success indicators
    - evidence_plan[]: criterion → evidence type → likely sources mapping
    - applicant_requests[]: questions to ask applicant to de-risk unknowns
    - red_flags[]: what triggers scoring penalties
```

**Update Step 5 definition** (lines 2041-2043) to:

```text
Step 5: additionality_and_benefit_case
  - Produces the counterfactual, need for funding, and jurisdiction benefit logic
  - OUTPUT MUST INCLUDE:
    - counterfactual_story: { without_funding: narrative, with_funding: narrative, causal_chain: string[] }
    - additionality_proofs[]: evidence that would prove additionality (letters, co-funding commitments, procurement pathway constraints, etc.)
    - jurisdiction_benefit_metrics[]: measurable metrics aligned to grant (jobs, exports, health outcomes, emissions, etc.) with target ranges
    - time_to_impact: { min_years, max_years, sources_or_assumptions[] }
```

---

## Patch D: Decision-Grade Specificity Rule

**Purpose**: Prevents vague professional-sounding but empty statements.

**Insert after line 2120** (after ASSESSOR INSIGHT OUTPUT CHECK):

```text
11. DECISION-GRADE SPECIFICITY RULE (add before OUTPUT SCHEMA):
    "For any recommendation or strategic claim, include at least ONE of:
     - A decision threshold (e.g., 'adoption requires X evidence', 'reimbursement requires Y outcome data')
     - A quantified range (low/high) with method documented
     - A gating dependency (regulatory milestone, procurement stage, clinical evidence level, standards certification)
     
     If none can be provided, label it as 'Unknown (decision criteria not established)' and add to unknowns[] with what_would_validate.
     
     REJECT generic phrases like 'significant market opportunity', 'strong competitive position', 'considerable potential' unless accompanied by quantified thresholds."
```

---

## Patch E: Finalize Citations Rewrite

**Purpose**: Hard-bans bracketed source IDs in final output with audit trail.

**Replace lines 2071-2074** (N: finalize_citations) with:

```text
N: finalize_citations
  - Inputs: {{step0}} (source pack), {{stepN-1}} (assembled report markdown), all prior step_outputs
  - Must produce JSON with:
    - report_markdown_clean: same report content with in-text citations converted to APA-style hyperlinks and NO bracketed internal source IDs
    - references_apa[]: complete validated reference list, no malformed entries
    - citation_audit[]: array where each item includes:
      - in_text_marker: original marker found (e.g., [S0-1])
      - source_id: mapped source ID
      - evidence_type_category: market|clinical|regulatory|competitor|other
      - appears_in_references: true/false
      - compliant_with_evidence_type_rule: true/false

  TRANSFORMATION RULES:
  1. Replace any [S0-1] style tokens with (Author, Year) hyperlinked to the source URL
  2. If author/year missing, use (Publisher, n.d.)
  3. If URL missing, hyperlink omitted and note in references as "URL not available"
  4. If a bracketed token references a non-existent source_id, replace with (Source not validated) and log in audit

  HARD BAN: No [ ] bracketed source tokens may remain anywhere in report_markdown_clean.
  Final validation: regex scan for /\[S\d+-\d+\]/ or /\[ARTICLE-\d+\]/ must return zero matches.
```

---

## Summary of Changes

| Section | Current State | After Patch |
|---------|---------------|-------------|
| Proxy Protocol | No escape hatch | Documented failure with attempt proof |
| Forbidden Patterns | Simple ban on "Unknown" | Requires proxy attempt OR failure rule |
| Step 4 Comparables | "at least 5" | min(3, available) + classification |
| Step 2 Assessor | Generic "generate insights" | 6 mandatory output artefacts |
| Step 5 Additionality | Basic output schema | 4 mandatory structured artefacts |
| Specificity Rule | None | New section enforcing decision-grade claims |
| Finalize Citations | Basic APA requirement | Full transformation rules + audit + hard ban |

---

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `supabase/functions/process-grant-guidelines/index.ts` | 1932-1946 | Update forbidden patterns |
| Same file | 1968 | Insert Proxy Failure Rule |
| Same file | 2029-2031 | Expand Step 2 output requirements |
| Same file | 2036-2039 | Expand Step 4 with classification + evidence rules |
| Same file | 2041-2043 | Expand Step 5 output requirements |
| Same file | 2071-2074 | Replace finalize_citations block |
| Same file | ~2120 | Insert Decision-Grade Specificity Rule |

