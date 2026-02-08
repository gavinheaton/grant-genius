# Quality Patches for Stage 3 Pipeline Prompt - COMPLETED ✓

All 5 quality patches have been integrated into `supabase/functions/process-grant-guidelines/index.ts`.

## Patches Applied

| Patch | Description | Status |
|-------|-------------|--------|
| A | Proxy Failure Escape Hatch | ✓ Applied |
| B | Type-Matched Comparables | ✓ Applied |
| C | Assessor Artefacts (Step 2 + Step 5) | ✓ Applied |
| D | Decision-Grade Specificity Rule | ✓ Applied |
| E | Finalize Citations Rewrite | ✓ Applied |

## Summary of Changes

- **Proxy Failure Rule**: Now requires documented `proxy_attempts[]`, `anchors_missing[]`, `next_best_sources[]`, and `recommended_user_inputs[]` before allowing "Proxy not possible" output
- **Forbidden Patterns**: Updated to require proxy attempt OR failure rule compliance
- **Step 4 Comparables**: Now classifies as direct|adjacent|enabler with min(3, available) requirement and evidence-type rules
- **Step 2 Assessor Insight**: Now mandates 6 output artefacts (intent, failure modes, success indicators, evidence plan, applicant requests, red flags)
- **Step 5 Additionality**: Now mandates counterfactual story, additionality proofs, jurisdiction metrics, and time-to-impact
- **Decision-Grade Specificity**: New rule requiring decision thresholds, quantified ranges, or gating dependencies
- **Finalize Citations**: Full transformation rules with citation audit and hard ban on bracketed tokens
