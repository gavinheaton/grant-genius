

# Create Consolidated Pipeline Generator Prompt Documentation

## Overview

This plan creates a single markdown document that captures all the prompts and contracts used by the Pipeline Generator system (`process-grant-guidelines`). The document will serve as a reference for reviewing, auditing, and iterating on the prompt architecture.

---

## Document Structure

The consolidated document will be organized into these sections:

| Section | Content |
|---------|---------|
| 1. Core Contracts | Writer Stance and Assessor Insight contracts injected into all prompts |
| 2. Grant Archetypes | Classification system and module library |
| 3. AI Call #1 | Grant DNA Pack extraction prompt |
| 4. AI Call #2 | Research pipeline generation meta-prompt |
| 5. Grant Writer Core Steps | Default templates for mandatory research steps |
| 6. Assembly Steps | HTML assembly and citation cleaning prompts |
| 7. QA Gates | Validation step template |
| 8. Quality Enhancement | Auto-enhancement prompts for low-quality steps |
| 9. Validation Rules | Forbidden patterns, quality scoring, variable flow |

---

## File Location

```text
docs/pipeline-generator-prompts.md
```

This keeps documentation separate from source code while being accessible for review.

---

## Content Summary

### 1. Core Contracts

**Writer Stance Contract** (~25 lines)
- Professional grant writer persona
- Tone rules: no hype, confidence labels, additionality, jurisdiction benefit
- Evidence rules: source_ids, no placeholders, proxy estimates
- Output constraints: valid JSON only

**Assessor Insight Contract** (~60 lines)
- Evidence-type matching table (market vs epidemiology sources)
- Assumption discipline format
- Proxy estimate requirements with sensitivity
- Commercial reality layer (buyer pathway, pricing anchors)
- Competitor comparability framework
- Additionality and jurisdiction benefit requirements

---

### 2. Grant Archetypes

**10 archetypes defined:**
- Commercialisation/Innovation
- R&D/Research
- Infrastructure/Capability
- Social Impact/Community
- Export/Trade
- Climate/Environment
- Health/Clinical Translation
- Defence/Sovereign Capability
- Arts/Culture
- Education/Workforce

**Module Library:** 8 modules with archetype-conditional inclusion

---

### 3. AI Call #1: Extract Grant DNA Pack

**Purpose:** Analyze guidelines PDF and extract structured metadata

**Tool function:** `extract_grant_dna_pack`

**Extracts:**
- Required inputs (form fields)
- Rubric/assessment criteria with weights
- Grant summary
- Program profile (jurisdiction, applicant types, funding type)
- Compliance rules (mandatory sections, forbidden claims)

---

### 4. AI Call #2: Generate Research Pipeline

**Purpose:** Design a bespoke research pipeline based on extracted metadata

**Tool function:** `create_pipeline`

**Mega-prompt components (~600 lines):**
- Authoritative inputs injection (rubric JSON, required inputs JSON, guidelines)
- Archetype and selected modules context
- Writer Stance Contract (full)
- Assessor Insight Contract (full)
- Evidence-type validation gate
- Commercial reality layer requirements
- Forbidden output patterns
- Mandatory proxy protocol for TAM/SAM/SOM
- Grant Writer Core step structure (9 mandatory steps)
- Assembly step requirements
- Self-validation instructions

---

### 5. Grant Writer Core Step Templates

**9 mandatory steps with full prompt templates:**

| Step | Name | Purpose |
|------|------|---------|
| 0 | build_source_pack | Curate 12-25 evidence sources |
| 1 | rubric_mapping_matrix | Map criteria to evidence types |
| 2 | required_inputs_coverage_map | Checklist of application inputs |
| 3 | assumptions_register | Structured assumptions with confidence |
| 4 | tam_sam_som_dual_methodology | Market sizing with top-down + bottom-up |
| 5 | additionality_and_benefit_case | Counterfactual and jurisdiction benefit |
| 6 | delivery_plan_and_milestones | Timeline, TRL progression, validation |
| 7 | risk_register_and_governance | Risks, mitigations, compliance |
| 8 | budget_logic_and_value_for_money | Cost categories, co-contribution, VFM |

Each template includes:
- INPUTS section with variable references
- HARD RULES section (5+ constraints)
- UNKNOWN HANDLING protocol
- OUTPUT JSON SCHEMA with field definitions

---

### 6. Assembly Steps

**4 HTML assembly steps:**

| Step | Name | Purpose |
|------|------|---------|
| N+1 | assemble_sections_html | Transform research into narrative HTML |
| N+2 | build_tables_sources_html | Generate data tables and source list |
| N+3 | clean_citations_apa | Convert internal IDs to numbered links |
| N+4 | finalize_report_html | Merge sections, tables, citations, data gaps |

---

### 7. QA Gates Step

**Validation step with 3 gates:**
- Gate 1: Citation Integrity (source_id validation)
- Gate 2: Criteria Coverage (rubric mapping check)
- Gate 3: Assessor Readiness (narrative spine, additionality, evidence quality)

---

### 8. Quality Enhancement Prompt

**Auto-enhancement for prompts scoring below threshold:**
- Adds missing sections (HARD RULES, FORBIDDEN PATTERNS, PROXY PROTOCOL)
- Expands prompts to 1,500+ characters
- Removes forbidden patterns
- Adds evidence-type compliance checks
- Adds assessor insight requirements
- Adds anti-genericness rules

---

### 9. Validation Rules

**Forbidden Patterns** (14 patterns):
```text
{TBD}, [Insert...], Hypothetical [X], [PROJECT NAME], [COMPANY], 
{value}, Source 1/2, [Your..., {}, [TBD], $Z, A%, B%, C%
```

**Quality Scoring Rubric** (100 points):
- Context header: 15 pts
- Hard rules section: 20 pts
- Output schema: 20 pts
- URL validation: 15 pts
- Unknown handling: 15 pts
- Placeholder prohibition: 10 pts
- Adequate length (1500+ chars): 5 pts
- Proxy protocol bonus: +10 pts
- Evidence-type check bonus: +10 pts
- Assessor insight bonus: +10 pts
- Sensitivity range bonus: +5 pts
- Forbidden pattern penalty: -5 pts each

**Variable Flow Validation:**
- Base variables: summary, publicArticleUrl, articleContent, trl, ipStatus, grant context, etc.
- Dynamic input keys from required_inputs_json
- Step references: {{step0}} through {{stepN-1}}
- Forward references blocked
- Unresolved variables auto-fixed

---

## Technical Details

### File Creation

Create a new markdown file at `docs/pipeline-generator-prompts.md` containing:

1. All contract text (Writer Stance, Assessor Insight)
2. All step templates (9 core + 4 assembly + 1 QA)
3. All AI call prompts (extraction + pipeline generation)
4. All validation rules and scoring logic
5. Variable reference documentation

### Document Size

Estimated ~3,000 lines of documentation covering the complete prompt architecture.

---

## Summary

A single comprehensive markdown document will be created containing all prompts, contracts, and validation rules used by the Pipeline Generator. This provides a complete reference for the ~3,000 line `process-grant-guidelines` Edge Function's AI interaction layer.

