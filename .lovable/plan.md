

## Fix: Tighten AI Validator to Objective-Only Feedback

### Problem

The validator's system prompt is too loose. It allows Gemini to offer subjective architectural opinions ("it's generally better to summarize before assembly") which conflict with deliberate design choices. The validator should only flag things that are **objectively wrong** — broken data flow, missing references, actual errors — not style preferences.

### Root Cause

The prompt's category definitions are open-ended. For example, "redundancy" asks "Would merging them improve the pipeline?" and "sequencing" asks "Are steps in a sensible order?" — these invite subjective opinions. There are no guardrails telling the AI to respect the admin's architectural choices.

### Changes

**`supabase/functions/validate-pipeline/index.ts`** — Update the system prompt rules section to:

1. Add an explicit constraint: **"Do NOT suggest alternative architectures or data flow patterns. If a step correctly references an upstream variable that exists and is produced by a preceding step, that reference is valid regardless of whether you would design it differently."**

2. Tighten category definitions:
   - **data_flow**: Only flag when a variable reference points to a step that **does not exist** or **has not run yet** (forward reference). Do NOT suggest that raw vs processed data is a problem — that is an architectural choice.
   - **redundancy**: Only flag when two steps produce **substantially identical outputs** with the same inputs. Do NOT flag steps that work on similar topics but with different scopes or outputs.
   - **sequencing**: Only flag when a step **cannot logically execute** in its current position (e.g., it needs data that hasn't been produced yet). Do NOT suggest reordering for stylistic reasons.
   - **completeness**: Only flag when a section that is **explicitly required by the step descriptions** is never produced. Do NOT suggest adding sections the admin hasn't included.
   - **contract_mismatch**: Only flag when a downstream step references a specific field or structure that the upstream step's prompt **explicitly does not produce**.

3. Add a new rule: **"Severity 'info' should only be used for factual observations, never for subjective suggestions. If you cannot point to a specific broken reference or missing data dependency, do not create an issue."**

4. Raise the bar for "issues_found" verdict: only use it when there are genuine warnings or errors, not just info-level style suggestions.

### What Changes for Admins

- The validator will stop second-guessing deliberate design decisions
- It will still catch genuine problems: broken variable references, forward references, missing steps, duplicate work
- Fewer false positives means the feedback is trustworthy and actionable
- The "Pass" verdict will be more common for well-structured pipelines, which is correct

### Technical Summary

| File | Change |
|------|--------|
| `supabase/functions/validate-pipeline/index.ts` | Rewrite system prompt rules to restrict AI to objective-only validation; ban subjective architecture suggestions |

