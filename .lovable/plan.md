

# Fix: Revert Dynamic Form to Research-Focused Inputs

## The Conceptual Error

The dynamic form was incorrectly designed to collect **grant application fields** from users. But Grant Genius's purpose is to **generate the support materials** that help researchers write those fields.

| What I Built (Wrong) | What It Should Be (Right) |
|---------------------|---------------------------|
| Dynamic form asks for `project_summary`, `nrf_priority_area` | Form asks for research context only |
| User fills in grant-specific application fields | User provides minimal inputs about their research |
| Platform acts like a form builder | Platform generates evidence to support the application |

## The Correct Model

```text
RESEARCHER INPUTS (minimal):          AI GENERATES (extensive):
├── Research Article URL               ├── Market Definition & Sizing
├── 100-Word Summary                   ├── Competitor Landscape  
├── TRL Level                          ├── TAM/SAM/SOM Analysis
├── IP Status                          ├── Economic Impact Assessment
└── (Optional) Project Name            ├── Partner Mapping
                                       ├── Risk Analysis
                                       └── Supporting Citations
```

## What `required_inputs_json` Should Actually Mean

The `required_inputs_json` in grant versions should inform the **pipeline's research priorities**, not create user-facing form fields:

- If the grant heavily weights "Economic Impact" (35%) → AI dedicates more steps to impact analysis
- If the grant requires "Competitor Analysis" → AI ensures thorough competitive landscape
- The user doesn't fill this in - the AI uses it to know WHAT TO RESEARCH

## Implementation Changes

### 1. Simplify ReportInputs Back to Core Fields

Keep only the essential researcher-provided inputs:
- Public Article URL (required)
- 100-Word Summary (required)  
- TRL Level (optional)
- IP Status (optional)
- Project Name (optional)

Remove the dynamic field generation that was pulling from `required_inputs_json`.

### 2. Keep the Semantic Equivalents Mapping

The `SEMANTIC_EQUIVALENTS` mapping in the edge functions is still valuable - it ensures that if a prompt template uses `{{project_summary}}`, it correctly falls back to `{{summary}}`.

### 3. Clarify the Role of `required_inputs_json`

This should be used by the **pipeline generator** to understand what research outputs the grant needs, not to generate form fields. Rename or document this clearly:
- Consider renaming to `grant_assessment_criteria_json` or `rubric_weights_json`
- Or add a clear distinction: `researcher_inputs_json` (form fields) vs `grant_criteria_json` (AI research guidance)

### 4. Update ApplicationWorkspace

Remove the passing of `required_inputs_json` to `ReportInputs` for form generation. Keep the grant metadata for display purposes only.

## Files to Modify

| File | Change |
|------|--------|
| `src/components/workspace/ReportInputs.tsx` | Remove dynamic field generation, keep core 4-5 fields |
| `src/pages/ApplicationWorkspace.tsx` | Stop passing `required_inputs_json` for form building |
| Documentation/memory | Clarify the distinction between user inputs and grant criteria |

## What to Preserve

- **Semantic Equivalents Mapping**: Keep the `SEMANTIC_EQUIVALENTS` in edge functions - it's a good safety net
- **Variable Hydration Logic**: The universal hydration strategy is still correct for feeding data into prompts
- **Grant-Specific Pipelines**: The pipeline generator using grant criteria to decide research steps is correct

## Key Insight

The `required_inputs_json` was being conflated with "what the user provides" when it should mean "what the grant assesses, so the AI knows what to research."

