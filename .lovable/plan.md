

## Evolve Pipeline Quality Gate for Dynamic Pipelines

### Problem

The current `pipelineQualityGate.ts` and `pipelineValidation.ts` are built around a **hardcoded list of 14 core step names** (e.g., `build_source_pack`, `tam_sam_som_dual_methodology`, `finalize_citations`). This breaks for dynamically generated pipelines where:

1. **Step names vary by grant** -- a Social Impact grant won't have `tam_sam_som_dual_methodology`; it might have `beneficiary_outcome_mapping` instead.
2. **Resequencing invalidates data flow** -- moving a step that references `{{step3}}` above step 3 creates a forward reference, but the validator doesn't re-check after reorder.
3. **Hard-fail on missing "core steps"** means every dynamically generated pipeline fails validation unless it happens to use the exact same step names.

### Solution: Shift from Name-Based to Role-Based + Data-Flow Validation

Replace the rigid name-matching approach with two complementary checks:

**A. Structural Role Detection (replaces hardcoded `CORE_STEP_NAMES`)**
Instead of checking for exact step names, detect **functional roles** by scanning step content (name + description + prompt keywords). For example:
- "Source gathering" role: step name/description contains `source_pack`, `evidence`, `scrape`, `search`
- "Assembly" role: step has `is_assembly_step = true` or name contains `assembly`, `finalize`, `report`
- "Sanitiser" role: prompt contains `forbidden`, `sanitize`, `scan`, `clean`
- "Citation" role: prompt contains `citation`, `apa`, `reference list`

This allows any step name while still ensuring the pipeline has the right functional coverage.

**B. Data Flow Integrity (enhanced `pipelineValidation.ts`)**
The existing `validatePipelineDataFlow` already checks `{{stepN}}` references, but needs enhancement:
- After any resequence, re-validate all step references against the **new** ordering.
- Flag steps where `{{stepN}}` references a step that was moved to a position after the current step.
- Detect "orphaned" references -- step N references step M's output, but step M was deleted or moved.
- Surface these as **blocking errors** in the Quality Card UI.

### Changes

**1. `src/lib/pipelineQualityGate.ts` -- Major Refactor**

- Replace `CORE_STEP_NAMES` with `REQUIRED_ROLES` -- a list of functional role definitions, each with keyword matchers:

```text
REQUIRED_ROLES:
  - source_gathering: matches "source_pack", "source", "evidence gather"
  - market_sizing: matches "tam", "sam", "som", "market siz"
  - sanitiser: matches "sanitiser", "sanitizer", "pre_assembly", "forbidden token"
  - citation_finalization: matches "finalize_citation", "citation", "apa", "reference"
  - report_assembly: matches "report_assembly", "assembly", "finalize_report"
  - rubric_traceability: matches "rubric", "traceability", "matrix"
  - risk_governance: matches "risk", "governance", "register"
```

- `checkHardFails`: Instead of checking for exact step names, check that each required role is filled by at least one step. Keep the checks for: sequential numbering, minimum prompt length, forbidden patterns, duplicate names.

- `scoreStructuralCompleteness`: Score based on role coverage (how many of the required roles are filled) and ordering sanity (source gathering early, assembly/citation late).

- Red flag detection: Keep the content-quality checks (proxy protocol, dual methodology, etc.) but match by role/keyword rather than exact step name.

**2. `src/lib/pipelineValidation.ts` -- Data Flow Enhancement**

- Add a new function `validatePostReorder(steps)` that:
  - Sorts steps by `step_number`
  - For each step, extracts all `{{stepN}}` references
  - Checks that N < current step's position in the sorted order (not just its `step_number` value)
  - Reports broken references as errors with clear messages: "Step 'market_sizing' (position 5) references {{step7}} which is now at position 3 -- reference is stale"

- Add `detectStaleReferences(steps)` that identifies when a step's prompt references `{{stepN}}` but step N's content has changed meaning after reorder (e.g., step 3 used to be "competitor_research" but after reorder it's "risk_register").

**3. `src/pages/admin/PromptBundleEdit.tsx` -- Wire Up Data Flow Validation**

- Run `validatePipelineDataFlow` alongside `validatePipelineQuality` in the `useMemo`
- Pass data flow errors into the Quality Card or display as a separate "Data Flow" section
- Show per-step warnings inline in the `InlinePipelineEditor` when a step has broken references

**4. `src/components/admin/PipelineQualityCard.tsx` -- Add Data Flow Section**

- Add a new collapsible section for "Data Flow Issues" showing broken step references
- Each issue links to the affected step with a clear description of what's broken
- Color-code: red for forward/broken references, yellow for stale references

**5. Update tests in `src/test/pipelineQualityGate.test.ts`**

- Replace tests that check for exact `CORE_STEP_NAMES` with tests for role detection
- Add tests for reorder scenarios: swap two steps and verify validation catches broken references
- Add tests for dynamically named pipelines passing validation

### Technical Summary

| File | Change |
|------|--------|
| `src/lib/pipelineQualityGate.ts` | Replace `CORE_STEP_NAMES` with `REQUIRED_ROLES` keyword matching; update all scoring/red-flag functions to use role detection |
| `src/lib/pipelineValidation.ts` | Add `validatePostReorder()` and `detectStaleReferences()` functions |
| `src/pages/admin/PromptBundleEdit.tsx` | Run data flow validation alongside quality gate; pass results to UI |
| `src/components/admin/PipelineQualityCard.tsx` | Add "Data Flow Issues" collapsible section |
| `src/test/pipelineQualityGate.test.ts` | Update tests for role-based validation and reorder scenarios |

