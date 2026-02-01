

# Plan: Add HTML Assembly Steps to AEA Ignite Pipeline

## Problem Summary

The AEA Ignite bundle (`AEA_Ignite_2026_Evidence_Gathering_Pipeline`) has only 11 steps (0-10) focused on evidence gathering but lacks the final report assembly steps that produce proper HTML output.

**Current Issue:**
- Step 9 (`report_assembly`) outputs JSON/markdown without HTML formatting
- Step 10 (`finalize_citations`) just compiles references
- No step produces the required `report_html` field
- The final output contains ````json { "title"...` code fences because there's no HTML conversion step

**Comparison with Global Bundle:**
The global active bundle has 15 steps, with steps 12-14 specifically handling HTML assembly:

| Step | Name | Purpose |
|------|------|---------|
| 12 | `assemble_sections` | Generate DOCX-safe markdown with strict JSON rules |
| 13 | `build_tables_sources` | Build HTML tables and consolidated source list |
| 14 | `finalize_report` | Final HTML assembly with `report_html` output |

## Solution Options

### Option A: Add 3 New Steps to AEA Ignite Bundle (Recommended)

Add steps 11, 12, 13 that mirror the global bundle's HTML assembly logic:

```text
AEA Ignite Pipeline (After Fix):
├── Steps 0-8: Evidence gathering (unchanged)
├── Step 9: report_assembly → Integrate findings (unchanged)
├── Step 10: finalize_citations (unchanged)
├── Step 11: assemble_sections_html → Generate HTML narrative
├── Step 12: build_tables_sources_html → Build HTML tables
└── Step 13: finalize_report_html → Final report_html output
```

**Total steps: 14** (0-13)

### Option B: Modify Existing Steps 9-10

Rewrite step 9 and 10 prompts to include HTML generation logic. This is riskier as it changes the existing evidence gathering flow.

## Recommended Changes (Option A)

### Step 11: `assemble_sections_html`

Prompt template based on global step 12, adapted for AEA Ignite context:

```text
STEP 11 — Assemble Sections as HTML

You are a grant-commercialisation analyst writing for Australian government grant assessors.

INPUTS (from previous steps):
- Step 0-10 outputs available as {{step0}} through {{step10}}
- Grant: {{grantName}} ({{grantVersionLabel}})

PURPOSE:
Generate the report sections as clean HTML narrative.

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON with a single top-level object
2. Do NOT include code fences (no ``` anywhere)
3. The first character must be { and last must be }
4. Include a "report_html" field containing semantic HTML

REQUIRED SECTIONS:
1. Executive Summary
2. Research Context and Innovation  
3. Unmet Need and Australian Relevance
4. Commercialisation Pathways
5. Competitive Landscape
6. Market Sizing (TAM/SAM/SOM)
7. IP and Regulatory Pathway
8. Economic Impact
9. Stakeholders and Partners
10. Data Gaps and Validation Needs
11. Sources and References

OUTPUT JSON SCHEMA:
{
  "title": "Grant Report: [Project Title]",
  "report_html": "<h1>Executive Summary</h1><p>...</p><h2>Research Context</h2>...",
  "data_gaps": ["gap1", "gap2"]
}

HTML FORMATTING RULES:
- Use <h1> for main title, <h2> for sections, <h3> for subsections
- Use <p> for paragraphs
- Use <ul>/<li> for lists
- Use <table> for tabular data
- Include citation markers as [S0-1], [S3-2] etc.
- Do NOT use markdown syntax inside HTML
```

### Step 12: `build_tables_sources_html`

Compile all tables and sources into HTML format:

```text
STEP 12 — Build Tables and Sources (HTML)

Using the data from {{step9}} and {{step10}}, compile:

1. All comparison tables as HTML <table> elements
2. TAM/SAM/SOM summary table
3. Competitor comparison table
4. Partner capability table
5. Consolidated source list as HTML

OUTPUT JSON (no code fences):
{
  "tables": [
    {"title": "...", "html": "<table>...</table>"}
  ],
  "all_sources": [
    {"id": "S0-1", "mla_citation": "...", "url": "..."}
  ]
}
```

### Step 13: `finalize_report_html`

Final assembly into complete report_html:

```text
STEP 13 — Finalize Report (HTML)

Combine {{step11}} narrative with {{step12}} tables and sources.

OUTPUT (CRITICAL - NO CODE FENCES):
{
  "title": "Grant Report: [Title]",
  "report_html": "[Complete HTML document with all sections and tables]",
  "all_sources": [sources array],
  "tables": [tables array],
  "data_gaps": [gaps array]
}

The report_html must be valid semantic HTML ready for display.
Do NOT wrap output in ```json or any code fences.
```

## Database Changes

Insert 3 new steps into `prompt_bundle_steps` table for bundle `0393efea-a3c2-48f1-8087-278e7da3fbc4`:

| step_number | step_name | model_override |
|-------------|-----------|----------------|
| 11 | assemble_sections_html | google/gemini-3-flash-preview |
| 12 | build_tables_sources_html | google/gemini-3-flash-preview |
| 13 | finalize_report_html | google/gemini-2.5-flash-lite |

## Validation

After implementation:
1. Run a new AEA Ignite 2026 report
2. Verify the run creates 14 step records (0-13)
3. Verify step 13 output contains clean `report_html` (no code fences)
4. Verify the report displays correctly in the HTML viewer
5. Verify DOCX export works

## Risk Mitigation

- The prompts explicitly instruct "no code fences" at multiple levels
- The `worker-proxy` already applies `stripCodeFences()` as a safety net
- The `htmlReportUtils.ts` frontend parsing handles edge cases

