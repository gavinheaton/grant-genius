

# GrantBundle Architect: Universal Pipeline Generator Specification

## Overview

This plan defines a reusable **Bundle Generator Specification** that enables Grant Genius to automatically generate prompt bundles for any grant type—commercialisation, R&D, infrastructure, social impact, climate, defence, arts, and more.

The specification will be implemented as a JSON configuration that drives the existing `process-grant-guidelines` edge function, making it truly grant-agnostic.

---

## What We're Building

A structured specification with these components:

| Component | Purpose |
|-----------|---------|
| **Grant DNA Pack Schema** | Captures the essential characteristics of any grant |
| **Writer Stance Contract** | Enforces professional grant-writer tone across all outputs |
| **Module Library** | Reusable research modules (market sizing, impact, competitors, etc.) |
| **Step Role Library** | Standardised step templates with quality-enforced prompts |
| **Grant Archetype Classifier** | Routes grants to appropriate module configurations |
| **Bundle Construction Algorithm** | Rules for assembling steps into pipelines |
| **Default Pipeline Template** | Base structure all pipelines extend |

---

## Phase-by-Phase Implementation

### Phase 1: Grant DNA Pack Schema

**Purpose**: Extract structured metadata from any grant's guidelines before research begins.

```text
grant_dna_pack_schema:
├── program_profile
│   ├── name, jurisdiction (AU State/Federal/International)
│   ├── applicant_type (SME, Researcher, University, Consortium)
│   ├── funding_type (Grant, Loan, Matched, Co-investment)
│   └── assessor_type (Panel, Expert, Peer-reviewed)
├── evaluation_criteria_map
│   ├── criterion → weight (if known)
│   ├── pass_threshold (what "good enough" looks like)
│   └── assessor_questions (what they're really asking)
├── compliance_rules
│   ├── mandatory_sections (attachments, page limits)
│   ├── forbidden_claims (no guaranteed outcomes, etc.)
│   └── formatting_constraints
├── claim_evidence_policy
│   ├── claim_categories (market, impact, technical)
│   ├── minimum_evidence_standard per category
│   └── allowed_source_classes (ABS, peer-reviewed, gov.au)
├── narrative_strategy
│   ├── story_spine (problem → solution → impact)
│   ├── additionality (why funding is needed)
│   └── jurisdiction_benefit (Australian jobs, exports, etc.)
└── missing_info (what couldn't be extracted)
```

**Implementation**: Enhance the first AI call in `process-grant-guidelines` to extract this full DNA Pack before pipeline generation.

---

### Phase 2: Writer Stance Contract (WSC)

**Purpose**: Ensure all AI outputs maintain professional grant-writer tone for assessors.

```text
writer_stance_contract:
├── persona: "Professional grant writer with 10+ years Australian funding experience"
├── audience: "Expert grant assessors evaluating against published criteria"
├── tone_rules:
│   ├── "No hype—use qualified language"
│   ├── "Assumptions labeled with confidence: (H/M/L)"
│   ├── "If unsupported, output: 'Unknown (no validated source found)'"
│   └── "Always address additionality and jurisdiction benefit"
├── evidence_rules:
│   ├── "All numeric claims require source_id"
│   ├── "Preserve source IDs exactly—never renumber"
│   └── "No placeholders like 'Source1' or '[insert]'"
└── output_constraints:
    ├── "JSON-only output, no code fences"
    └── "First char must be {, last char must be }"
```

**Implementation**: Inject this contract as a preamble into every AI step prompt.

---

### Phase 3: Grant Archetype Classifier

**Purpose**: Automatically categorise grants to select appropriate research modules.

| Archetype | Trigger Keywords | Required Modules |
|-----------|------------------|------------------|
| **Commercialisation/Innovation** | commercialise, market, IP, startup | market_sizing, competitors, ip_strategy, pathway |
| **R&D/Research** | research, scientific, discovery, PhD | technical_feasibility, literature_review, methodology |
| **Infrastructure/Capability** | equipment, facility, capacity | capability_gap, procurement, utilisation |
| **Social Impact/Community** | community, social, welfare, inclusion | needs_assessment, beneficiary_mapping, outcomes |
| **Export/Trade** | export, international, market entry | export_readiness, market_selection, channel |
| **Climate/Environment** | emissions, sustainability, net-zero | emissions_baseline, abatement, adaptation |
| **Health/Clinical Translation** | clinical, health, TGA, FDA | regulatory_pathway, clinical_evidence, health_economics |
| **Defence/Sovereign Capability** | defence, sovereign, security | supply_chain, capability_gap, sovereign_benefit |
| **Arts/Culture** | arts, cultural, creative | cultural_impact, audience_development, creative_merit |
| **Education/Workforce** | training, skills, workforce | skills_gap, curriculum_alignment, employment_outcomes |

**Implementation**: Add classification logic to `process-grant-guidelines` that analyses the Grant DNA Pack and selects appropriate modules.

---

### Phase 4: Module Library

**Purpose**: Reusable research modules that can be composed into pipelines.

```text
module_library:
├── market_sizing
│   ├── when: archetype in [Commercialisation, Export, Health]
│   ├── outputs: tam_au, sam_au, som, methodology, sources
│   └── depends_on: [evidence_source_pack]
├── competitor_analysis
│   ├── when: archetype in [Commercialisation, R&D, Health]
│   ├── outputs: competitors[], differentiation, threat_level
│   └── depends_on: [evidence_source_pack]
├── economic_impact
│   ├── when: ANY archetype (universal)
│   ├── outputs: jobs_direct, jobs_indirect, gdp_contribution, exports
│   └── depends_on: [market_sizing OR capability_gap]
├── ip_regulatory_strategy
│   ├── when: archetype in [Commercialisation, Health, Defence]
│   ├── outputs: ip_landscape, freedom_to_operate, regulatory_pathway
│   └── depends_on: [evidence_source_pack]
├── technical_feasibility
│   ├── when: archetype in [R&D, Infrastructure, Defence]
│   ├── outputs: trl_assessment, risks[], mitigation_strategies
│   └── depends_on: [evidence_source_pack]
├── stakeholder_mapping
│   ├── when: ANY archetype (universal)
│   ├── outputs: partners[], collaborators[], end_users[]
│   └── depends_on: [market_sizing OR needs_assessment]
├── nrf_alignment (National Reconstruction Fund)
│   ├── when: grant mentions NRF, priority areas, sovereign capability
│   ├── outputs: priority_alignment, capability_contribution, local_content
│   └── depends_on: [market_sizing, economic_impact]
└── [additional modules for each archetype...]
```

**Implementation**: Define each module as a JSON template in a new `module_templates` configuration within the pipeline generator.

---

### Phase 5: Step Role Library

**Purpose**: Standardised step definitions with quality-enforced prompts.

Each step role includes:
- **role_name**: Identifier (e.g., `build_source_pack`)
- **role_goal**: What this step achieves
- **inputs**: Required variables (e.g., `{{summary}}`, `{{step0}}`)
- **outputs_schema**: Exact JSON structure expected
- **hard_rules**: Non-negotiable constraints (5+ rules)
- **prompt_template**: Full 1,500+ character prompt

**Example: Universal Source Pack Builder**

```text
role_name: build_source_pack
phase: intake
role_goal: Curate 12-25 high-quality sources relevant to any research domain

inputs: [{{summary}}, {{grantGuidelines}}, {{archetype}}]

outputs_schema:
  sources: [{ source_id, title, publisher, url, date_accessed, relevance, confidence }]
  unknowns: [string]
  source_categories_found: { authoritative_gov, academic, industry, market_reports }

hard_rules:
  - "Prefer Australian authoritative sources first (ABS, AIHW, data.gov.au)"
  - "Every source MUST have valid URL or explicit 'URL not available'"
  - "Do NOT invent sources—only include what you can validate"
  - "Mark confidence: high (verified), medium (known publisher), low (unverified)"
  - "Include unknowns array listing source types you couldn't find"
```

**Implementation**: Store these in the specification JSON and inject into prompts during pipeline generation.

---

### Phase 6: QA Gates

**Purpose**: Three mandatory quality gates before final render.

| Gate | Checks |
|------|--------|
| **Citation Integrity** | All source_ids exist, no malformed JSON, no code fences |
| **Criteria Coverage** | Each rubric criterion addressed or listed as gap |
| **Assessor Readiness** | Narrative spine coherent, risks addressed, impact quantified, additionality clear |

**Implementation**: Add a QA step to every pipeline that validates these before the final `finalize_report_html` step.

---

### Phase 7: Bundle Construction Algorithm

**Rules for assembling steps into pipelines:**

```text
bundle_construction_algorithm:
├── grant_archetype_classifier (determine archetype from DNA Pack)
├── module_selection_rules:
│   ├── "Include all modules where archetype matches when_to_include"
│   ├── "Always include: evidence_source_pack, economic_impact, stakeholder_mapping"
│   └── "If unknown archetype, use Commercialisation as default"
├── step_ordering_rules:
│   ├── "Firecrawl steps ALWAYS before AI analysis"
│   ├── "Source pack ALWAYS step 0 (or after Firecrawl gather)"
│   ├── "Dependencies resolved: if B depends_on A, A.step_number < B.step_number"
│   └── "Assembly steps ALWAYS last 3 steps"
└── schema_stability_rules:
    ├── "All steps output JSON with consistent field naming"
    ├── "source_id format preserved across all steps"
    └── "report_html MUST be in final step outputs"
```

---

### Phase 8: Default Pipeline Template

**Standard structure all pipelines follow:**

```text
PHASES: intake → research → argument_build → assembly → qa → render

Default Steps:
├── [0-3] Firecrawl Data Gathering (if hybrid enabled)
├── [4] parse_grant_requirements (outputs: grant_dna_pack)
├── [5] build_writer_stance_contract (outputs: wsc)
├── [6] outline_constructor (outputs: section_outline)
├── [7] evidence_source_pack (outputs: sources[], unknowns[])
├── [8] claim_evidence_ledger (outputs: claims with source_ids)
├── [9-N] Archetype-specific modules (market, competitors, impact, etc.)
├── [N+1] assemble_sections_html (outputs: sections_html)
├── [N+2] build_tables_sources_html (outputs: tables, all_sources)
├── [N+3] qa_gates (validates all three gates)
└── [N+4] finalize_report_html (outputs: report_html)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/process-grant-guidelines/index.ts` | Integrate specification JSON, add archetype classifier, enhance DNA Pack extraction |
| `src/hooks/usePromptBundles.ts` | Add types for new schema fields |
| `src/components/admin/StepTypeEditor.tsx` | Add module selection UI for admins |
| New: `src/lib/bundleGeneratorSpec.ts` | Central specification JSON definition |
| New: `src/components/admin/GrantArchetypeSelector.tsx` | UI for viewing/overriding archetype classification |

---

## Technical Details

### Integration with External Worker

The specification maintains compatibility with the Replit worker:

- **No hardcoded step names**: Worker uses `step_number` and `step_type`
- **Step outputs as `step0..stepN`**: Standard access pattern preserved
- **`step_config_json`**: Contains module-specific configuration
- **`is_assembly_step`**: Flag for final render steps

### Quality Enforcement

Every generated prompt will be validated against the quality scoring function (already implemented) before insertion:

- Minimum 1,500 characters
- HARD RULES section present
- OUTPUT SCHEMA defined
- No template variables in schema descriptions

---

## Expected Outcomes

1. **Universal Coverage**: Any grant archetype handled with appropriate research modules
2. **Consistent Quality**: Writer Stance Contract enforces professional tone
3. **Evidence Auditability**: Claim-Evidence Ledger tracks all citations
4. **Assessor Focus**: QA Gates ensure report addresses rubric criteria
5. **Maintainability**: Module library enables updates without pipeline rewrites

---

## Next Steps

1. **Approve this plan** to begin implementation
2. I will create the specification JSON structure
3. Enhance `process-grant-guidelines` with archetype classification
4. Add the Grant DNA Pack extraction logic
5. Implement QA Gates step template

