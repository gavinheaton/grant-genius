
# Patch F: Add "Depth Budget" Controls to Prevent Superficial Breadth

## Purpose

Prevents the pipeline generator from producing many shallow steps that look comprehensive but lack depth. Forces the AI to prioritize quality over quantity.

## Current State (Lines 2205-2210)

```text
Output integrity rules:
- step_number sequential from 0 with no gaps
- step_name snake_case unique
- include at least 12 total steps (9 core + archetype modules + 2 final)
- include all Grant Writer Core steps
- include final report_assembly and finalize_citations steps
```

**Problems with current state:**
- Only has a minimum (12 steps), no maximum
- No depth requirements per step
- Encourages breadth over depth

## Proposed Changes

### Location: Lines 2205-2210 (Output integrity rules section)

Replace the current block with expanded rules that include depth controls:

```text
Output integrity rules:
- step_number sequential from 0 with no gaps
- step_name snake_case unique
- include all Grant Writer Core steps
- include final report_assembly and finalize_citations steps

DEPTH BUDGET CONTROLS:
- Prefer fewer steps with deeper outputs over many shallow steps
- Each step_description MUST include a Depth Target (e.g., "produce 3 tables + 10 sources + sensitivity range", "identify 5+ named comparables with evidence signals", "generate 4 additionality proofs with source_ids")
- Minimum steps: 12 (9 core + archetype modules + 2 final assembly)
- Maximum steps: 16 unless rubric has >4 weighted sections requiring additional research depth
- If archetype modules exceed the cap, consolidate related analyses into single deeper steps rather than splitting into multiple shallow steps
- Quality check: if any step's prompt_template lacks a concrete deliverable count (tables, sources, entities, metrics), flag it for rewrite
```

## Technical Summary

| Aspect | Before | After |
|--------|--------|-------|
| Step minimum | 12 | 12 (unchanged) |
| Step maximum | None | 16 (unless rubric >4 sections) |
| Depth target | Not required | Mandatory in step_description |
| Quality focus | Breadth | Depth over breadth |

## Files to Modify

| File | Lines | Change |
|------|-------|--------|
| `supabase/functions/process-grant-guidelines/index.ts` | 2205-2210 | Expand output integrity rules with depth budget controls |

## Expected Outcome

After this patch, generated pipelines will:
1. Have explicit deliverable counts in each step description
2. Be capped at 16 steps for standard grants
3. Consolidate shallow steps into deeper, more comprehensive analyses
4. Produce assessor-grade depth rather than checkbox-style breadth
