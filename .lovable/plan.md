

# Add Step Resolver / Pipeline Normaliser Prompt to Documentation

## Overview

Add the Step Resolver / Pipeline Normaliser prompt to `docs/pipeline-generator-prompts.md`. This prompt is used as a post-processing step after pipeline generation to ensure step references are deterministic and valid.

---

## Location in Document

Insert as **Section 10.4** within the existing "Validation Rules" section (Section 10), after "10.3 Variable Flow Validation".

The section numbering will be:
- 10.1 Forbidden Patterns (existing)
- 10.2 Quality Scoring Rubric (existing)
- 10.3 Variable Flow Validation (existing)
- **10.4 Step Resolver / Pipeline Normaliser Prompt** (new)

---

## Content to Add

### 10.4 Step Resolver / Pipeline Normaliser Prompt

This prompt is used to validate and normalize a generated pipeline, converting numeric step references (like `{{step0}}`) to name-based references (like `{{steps.build_source_pack}}`).

**Purpose:**
- Ensure canonical step numbering (0-indexed, no gaps)
- Convert all step references to deterministic name-based format
- Validate no forward references exist
- Enforce approved variable whitelist
- Produce a lint report for transparency

**Full Prompt:**

```text
SYSTEM
You are a pipeline compiler and validator. Your job is to take a generated pipeline JSON and produce a corrected, execution-safe pipeline JSON where step references are deterministic and valid.

INPUT
You will receive one JSON object:

pipeline: the draft pipeline JSON with fields { pipeline_name, pipeline_description, system_prompt, steps[] }

Each step in steps[] may include:
- step_number (may be missing or inconsistent)
- step_name (string)
- step_type (optional; e.g., firecrawl_search, model_call, etc.)
- prompt_template (string; may contain {{stepX}} variables)
- step_config_json (optional)

OBJECTIVE
Return a corrected pipeline JSON that satisfies all of these guarantees:

A) Canonical numbering
- Reassign step_number to be sequential integers starting at 0 with no gaps, in the same order as steps[].
- Add a top-level object step_index_by_name mapping every step_name to its canonical step_number.
- Enforce step_name uniqueness. If duplicates exist, rename deterministically by suffixing __2, __3, etc., and update all references accordingly.

B) Deterministic step references
- Convert ALL step-output references inside every prompt_template to name-based references of this form: {{steps.<step_name>}}
- If the pipeline currently uses numeric references like {{step0}}, {{step12}}, etc.: Resolve each numeric reference to the step currently assigned that canonical number after renumbering, then replace it with the equivalent name reference {{steps.<resolved_step_name>}}.
- Disallow forward references: A step may only reference {{steps.<name>}} where the referenced step appears earlier in the pipeline order.
- If a forward reference is found, fix it by either:
  - (preferred) moving the referenced step earlier if it does not break other constraints, OR
  - (fallback) rewriting the prompt_template to remove the forward dependency and log a blocking issue.

C) Approved variables & hygiene
- Only these variable families may appear anywhere in any prompt_template:
  - Base inputs: {{summary}}, {{grantName}}, {{grantVersionLabel}}, {{grantGuidelines}}, {{grantRubric}}, {{grantRubricJson}}, {{grantSummary}}, {{requiredInputs}}, {{publicArticleUrl}}, {{articleContent}}, {{trl}}, {{ipStatus}}, {{sources}}, {{unknowns}}
  - Step outputs: {{steps.<step_name>}}
- Remove or rewrite any other {{...}} variable usage into a readable instruction, and log it as an issue.
- Do NOT introduce new placeholder tokens like {TBD} or [Insert ...].

D) Output format contract
- Output ONLY valid JSON (no markdown fences, no prose).
- First character {, last character }.

REQUIRED OUTPUT JSON SCHEMA

Return exactly:
{
  "pipeline_name": "string",
  "pipeline_description": "string",
  "system_prompt": "string",
  "step_index_by_name": {
    "some_step_name": 0
  },
  "steps": [
    {
      "step_number": 0,
      "step_name": "string",
      "step_description": "string",
      "step_type": "string|null",
      "step_config_json": "object|null",
      "prompt_template": "string|null",
      "model_tier": "lite|balanced|pro"
    }
  ],
  "lint_report": {
    "passed": true,
    "blocking_issues": [],
    "advisory_issues": [],
    "replacements_made": [
      {
        "type": "variable_rewrite|step_rename|step_reorder|forward_ref_fix",
        "before": "string",
        "after": "string",
        "location": "step_name.prompt_template"
      }
    ]
  }
}

LINT RULES (MUST APPLY)
- passed = true only if:
  - no forward references remain
  - no unknown {{...}} variables remain
  - every step_name is unique
  - every {{steps.<step_name>}} references an existing earlier step
- If passed = false, still output the best corrected pipeline you can, but include clear blocking_issues.

IMPORTANT NORMALISATION NOTES
- Do not change the substantive content of prompts except where required to fix variable references, remove invalid variables, or eliminate forward references.
- Never remove "evidence discipline" rules or "forbidden patterns" rules from prompts.
```

**Lint Report Fields:**

| Field | Description |
|-------|-------------|
| `passed` | `true` if all validation rules pass |
| `blocking_issues` | Array of critical errors that prevent execution |
| `advisory_issues` | Array of non-critical warnings |
| `replacements_made` | Audit trail of all changes made |

**Replacement Types:**

| Type | Description |
|------|-------------|
| `variable_rewrite` | Unknown variable replaced with instruction |
| `step_rename` | Duplicate step_name renamed with suffix |
| `step_reorder` | Step moved earlier to fix forward reference |
| `forward_ref_fix` | Forward reference removed/rewritten |

---

## Changes Summary

| File | Change |
|------|--------|
| `docs/pipeline-generator-prompts.md` | Add new section 10.4 with Step Resolver / Pipeline Normaliser Prompt |

