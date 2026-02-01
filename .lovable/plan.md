

# Grant-Specific Research Pipelines with Dynamic Step Generation

## Overview

This plan enables each grant to have its own tailored research pipeline where the AI analyzes grant guidelines and determines the optimal number of research steps needed to support that specific grant application.

**Key Principles:**
- **Research-focused**: The pipeline produces research evidence (market sizing, competitor analysis, partner mapping) that researchers use to write their grant applications
- **Dynamic step count**: Not fixed at 15 steps. The AI determines what research areas are needed based on the grant's assessment criteria
- **Human-in-the-loop**: AI proposes a draft pipeline, admin reviews and edits, Super Admin publishes

## Current State vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Step count | Fixed 15 steps for all grants | Variable (e.g., 8-20) based on grant requirements |
| Pipeline source | Single "active" bundle globally | Each grant version links to its own bundle |
| Step design | Hardcoded research areas | AI-determined based on grant rubric |
| Pipeline creation | Manual bundle creation | AI proposes from guidelines, admin refines |

## How It Works

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    GRANT PIPELINE GENERATION FLOW                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Admin uploads grant guidelines PDF                              │
│                      ↓                                              │
│  2. AI extracts rubric + required inputs (existing)                 │
│                      ↓                                              │
│  3. Admin clicks "Generate Research Pipeline"                       │
│                      ↓                                              │
│  4. AI analyzes rubric to determine:                                │
│     • What research areas are needed                                │
│     • How many steps required                                       │
│     • What evidence supports each criterion                         │
│                      ↓                                              │
│  5. AI creates draft prompt bundle:                                 │
│     • Step 0: Build Source Pack (always)                            │
│     • Steps 1-N: Research steps (variable)                          │
│     • Step N+1: Assemble Report (always)                            │
│     • Step N+2: Build Tables/Sources                                │
│     • Step N+3: Finalize Report                                     │
│                      ↓                                              │
│  6. Admin reviews + edits prompts in bundle editor                  │
│                      ↓                                              │
│  7. Super Admin publishes → Ready for researchers                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## AI Pipeline Generation Logic

The AI will analyze the grant's rubric sections and map them to research steps:

**Example: Commercialization Grant**
```text
Rubric Section               →  Research Step(s)
───────────────────────────────────────────────────
Market opportunity (30%)     →  market_segments, calculate_tam, 
                                calculate_sam, calculate_som
Competitive landscape (20%)  →  competitor_research, competitor_table
Commercial viability (25%)   →  economic_impact, partner_businesses
Innovation & IP (15%)        →  technology_context, ip_landscape
Team capability (10%)        →  (not research - applicant provides)
```

**Example: Research Impact Grant**
```text
Rubric Section               →  Research Step(s)
───────────────────────────────────────────────────
Research significance (40%)  →  extract_context, literature_review
National benefit (30%)       →  economic_impact, policy_alignment
Feasibility (20%)            →  methodology_analysis, resource_mapping
Track record (10%)           →  (not research - applicant provides)
```

The AI will:
1. Read each rubric section's criteria
2. Determine what research evidence would address those criteria
3. Generate appropriate steps with prompts that reference the specific criteria
4. Skip sections that require applicant input (not research)

## Database Changes

### Add columns to grant_versions

```sql
-- Link grant versions to their specific prompt bundle
ALTER TABLE grant_versions 
ADD COLUMN prompt_bundle_id UUID REFERENCES prompt_bundles(id);

-- Track pipeline generation status
ALTER TABLE grant_versions
ADD COLUMN pipeline_generation_status TEXT DEFAULT 'none'
CHECK (pipeline_generation_status IN ('none', 'generating', 'draft', 'published'));
```

### Remove step_number constraint from prompt_bundle_steps

Currently the table has a constraint limiting step numbers. For dynamic step counts, this needs to be flexible:

```sql
-- Remove existing constraint
ALTER TABLE prompt_bundle_steps 
DROP CONSTRAINT IF EXISTS prompt_bundle_steps_step_number_check;

-- Add a more flexible constraint (0-50 steps max)
ALTER TABLE prompt_bundle_steps 
ADD CONSTRAINT prompt_bundle_steps_step_number_check 
CHECK (step_number >= 0 AND step_number <= 50);
```

## Implementation Plan

### Part 1: Database & Core Infrastructure

**1.1 Database Migration**
- Add `prompt_bundle_id` and `pipeline_generation_status` to `grant_versions`
- Update step_number constraint to allow variable step counts

**1.2 Update worker-proxy to use grant-linked bundle**

Current flow:
```text
worker-proxy → fetch bundle where is_active = true (global)
```

New flow:
```text
worker-proxy → get application's grant_version_id
            → fetch grant_version.prompt_bundle_id
            → if exists, use that bundle
            → else fallback to global active bundle
```

### Part 2: AI Pipeline Generation Edge Function

**New function: `generate-grant-pipeline`**

This function:
1. Takes the grant version's rubric and summary
2. Calls Lovable AI to design a research pipeline
3. Creates a new prompt_bundle with generated steps
4. Links it to the grant_version
5. Sets status to "draft"

**AI Prompt Structure:**
```text
You are an expert at designing research pipelines for grant applications.

Given this grant's assessment criteria:
{rubric}

Grant summary:
{grant_summary}

Design a research pipeline that will gather evidence to support 
applications for this grant. The pipeline should:

1. Focus on RESEARCH that supports the application, not writing the application
2. Include only steps that gather objective, citable evidence
3. Skip criteria that require applicant-provided information (team experience, etc.)
4. Each step should produce structured, citable research

Required structure:
- Step 0: Build Source Pack (always first - curates sources)
- Steps 1-N: Research steps (you determine how many based on rubric)
- Final steps: Assembly (always last - combines research into report)

For each research step, provide:
- step_name: Short snake_case identifier
- step_description: What research this step produces
- prompt_template: The full prompt with {{variable}} placeholders
- research_area: Which rubric section(s) this addresses

Return JSON with:
{
  "total_steps": number,
  "steps": [
    {
      "step_number": number,
      "step_name": string,
      "step_description": string,
      "prompt_template": string,
      "model_tier": "lite" | "balanced" | "pro"
    }
  ],
  "rationale": string // Why this structure was chosen
}
```

### Part 3: Admin UI Updates

**New "Pipeline" tab in GrantEdit.tsx**

```text
┌─────────────────────────────────────────────────────────────────┐
│ Research Pipeline Configuration                        v3      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Status: ● None  ○ Generating...  ○ Draft  ○ Published          │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ This grant doesn't have a custom research pipeline yet.     │ │
│ │ Reports will use the default pipeline.                      │ │
│ │                                                              │ │
│ │ [Generate Pipeline from Guidelines]                         │ │
│ │                                                              │ │
│ │ Or select an existing bundle:                                │ │
│ │ [Select bundle ▼]  [Link Bundle]                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

After pipeline is generated:

```text
┌─────────────────────────────────────────────────────────────────┐
│ Research Pipeline Configuration                        v3      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Status: ○ None  ○ Generating...  ● Draft  ○ Published          │
│                                                                 │
│ Linked Bundle: "AEA Ignite Research Pipeline"                  │
│                                                                 │
│ Generated Pipeline (12 steps):                                  │
│ ┌───┬─────────────────────┬────────────────────────────────────┐│
│ │ 0 │ build_source_pack   │ Curate Australia-first sources    ││
│ │ 1 │ extract_context     │ Extract research domain context   ││
│ │ 2 │ market_opportunity  │ Analyze market opportunity (30%)  ││
│ │ 3 │ competitor_analysis │ Research competitive landscape... ││
│ │ ...                                                          ││
│ │11 │ finalize_report     │ Merge into final report JSON      ││
│ └───┴─────────────────────┴────────────────────────────────────┘│
│                                                                 │
│ [View/Edit in Bundle Editor]                                    │
│                                                                 │
│ ⚠ Draft pipelines must be reviewed before publishing           │
│                                                                 │
│ [Publish Pipeline] (Super Admin only)                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Files to Create/Modify

| File | Type | Description |
|------|------|-------------|
| Database migration | New | Add `prompt_bundle_id`, `pipeline_generation_status` to grant_versions; update step constraint |
| `supabase/functions/generate-grant-pipeline/index.ts` | New | AI pipeline generation edge function |
| `supabase/functions/worker-proxy/index.ts` | Modify | Use grant-linked bundle with fallback |
| `src/pages/admin/GrantEdit.tsx` | Modify | Add Pipeline tab |
| `src/components/admin/PipelineConfigPanel.tsx` | New | Pipeline configuration UI component |
| `src/hooks/usePromptBundles.ts` | Modify | Add mutation for creating bundle from pipeline |

## Backward Compatibility

- Grants without `prompt_bundle_id` continue using global active bundle
- Existing bundles and steps are unaffected
- No data migration required
- Researchers see no change unless admin creates grant-specific pipeline

## Step Types in Generated Pipelines

The AI will recognize these research categories and generate appropriate steps:

**Always Included:**
- `build_source_pack` (Step 0) - Curate authoritative sources
- Assembly steps (final 2-3 steps) - Combine research into report

**Research Steps (AI determines which are needed):**
- Market sizing: TAM, SAM, SOM calculations
- Competitor analysis: Identify and compare competitors
- Partner mapping: Find potential commercialization partners
- Economic impact: Australian economic benefit analysis
- Technology context: Extract research domain and innovations
- Literature review: Academic context and prior work
- Policy alignment: Government priorities and programs
- Industry analysis: Sector trends and opportunities

Each generated step will:
- Reference the specific grant criteria it addresses
- Include appropriate variable placeholders
- Specify recommended model tier (lite/balanced/pro)
- Focus on producing citable, structured research output

## Success Criteria

1. Admin can generate a research pipeline from grant guidelines with one click
2. Generated pipeline has appropriate number of steps for the grant's requirements
3. Each step's prompts reference the grant's specific assessment criteria
4. Admin can review, edit, and test the draft pipeline
5. Super Admin can publish the pipeline
6. Reports for that grant use the linked pipeline
7. Fallback to global bundle works for grants without custom pipelines

