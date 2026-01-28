

# Add Grant Context Variables to Prompt Bundle System

## Overview
Extend the prompt bundle system to include grant-specific context variables that can be used in prompts. This allows the AI to tailor responses based on the specific grant being applied for, including grant name, version, guidelines excerpt, and assessment rubric.

## New Variables to Support

| Variable | Description |
|----------|-------------|
| `{{grantName}}` | Name of the grant (e.g., "AEA Ignite") |
| `{{grantVersionLabel}}` | Version identifier (e.g., "v1" or "2026 Round 1") |
| `{{grantGuidelines}}` | Excerpt from the uploaded guidelines document |
| `{{grantRubric}}` | Structured assessment criteria/rubric in readable format |
| `{{grantSummary}}` | AI-generated summary of the grant (from ai_suggestions_json) |

## Current State

- The `grantVersionId` is already passed through the report generation pipeline
- Grant versions store `guidelines_raw_text`, `rubric_json`, and `ai_suggestions_json` 
- The `interpolatePrompt` function exists but doesn't have access to grant data
- The `AVAILABLE_VARIABLES` list in the admin UI doesn't include grant variables

## Implementation Approach

### 1. Update Edge Functions to Fetch Grant Data

Both `generate-report` and `resume-report-run` need to:
1. Query the `grant_versions` table joined with `grants` to get grant details
2. Add grant variables to the interpolation context passed to each step

The query pattern:
```text
SELECT 
  gv.guidelines_raw_text,
  gv.rubric_json,
  gv.ai_suggestions_json,
  gv.version_number,
  g.name as grant_name
FROM grant_versions gv
JOIN grants g ON g.id = gv.grant_id
WHERE gv.id = $grantVersionId
```

### 2. Format Rubric for Prompt Inclusion

The rubric is stored as structured JSON but needs to be formatted as readable text for prompts. Create a helper function:

```text
function formatRubricForPrompt(rubricJson: object): string
- Iterates through rubric.sections (from ai_suggestions_json)
- Formats each section with title, weight, and criteria
- Returns structured text suitable for AI consumption
```

Example output:
```text
Assessment Criteria:

1. Project Impact and Alignment (30%)
   - Clarity and urgency of the problem the project addresses
   - Alignment with National Reconstruction Fund priority areas
   - Potential for significant economic or social impact for Australia

2. Technical Merit and Feasibility (30%)
   - Feasibility of the proposed technical approach
   - Novelty of the research
   ...
```

### 3. Update Admin UI Variable Reference

Add the new grant variables to `AVAILABLE_VARIABLES` in `PromptBundleEdit.tsx`:
- Group variables into categories (User Inputs, Grant Context, Step Outputs)
- Add descriptions explaining when each variable is available

### 4. Limit Guidelines Text Length

Guidelines can be very long (100K+ characters). Add a configurable limit:
- Default to first 10,000 characters
- Include note about truncation if applicable
- Consider extracting key sections only

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/generate-report/index.ts` | MODIFY | Fetch grant data, add to interpolation context |
| `supabase/functions/resume-report-run/index.ts` | MODIFY | Fetch grant data, add to interpolation context |
| `src/pages/admin/PromptBundleEdit.tsx` | MODIFY | Add new grant variables to reference panel |

## Technical Details

### Edge Function Changes

In `generate-report/index.ts`, after fetching the application:

```text
// Fetch grant details for prompt context
const grantData = await fetchGrantContext(supabase, application.grant_version_id);

// Add grant variables to interpolation context
const variables = {
  summary,
  publicArticleUrl,
  articleContent,
  trl,
  ipStatus,
  grantName: grantData.name,
  grantVersionLabel: `v${grantData.version_number}`,
  grantGuidelines: grantData.guidelinesExcerpt,
  grantRubric: grantData.formattedRubric,
  grantSummary: grantData.summary,
};
```

In `resume-report-run/index.ts`, same pattern but grant data is fetched once and passed to `processSingleStep`.

### Helper Function for Grant Context

```text
async function fetchGrantContext(supabase, grantVersionId: string): Promise<{
  name: string;
  version_number: number;
  guidelinesExcerpt: string;
  formattedRubric: string;
  summary: string;
}>
```

This function:
1. Queries grant_versions joined with grants
2. Extracts and truncates guidelines_raw_text
3. Formats rubric from ai_suggestions_json.rubric.sections
4. Returns formatted context ready for interpolation

### Rubric Formatting Example

Input (from ai_suggestions_json):
```json
{
  "rubric": {
    "sections": [
      {
        "key": "project_impact",
        "title": "Project Impact and Alignment",
        "weight": 30,
        "criteria": ["Clarity of problem", "Alignment with NRF"]
      }
    ]
  }
}
```

Output:
```text
Assessment Criteria:

1. Project Impact and Alignment (30%)
   - Clarity of problem
   - Alignment with NRF
```

## Admin UI Updates

Update the variable reference card in `PromptBundleEdit.tsx` to show:

**User Inputs:**
- `{{summary}}` - User's 100-word research summary
- `{{publicArticleUrl}}` - URL of the research article
- `{{articleContent}}` - Scraped content from the article
- `{{trl}}` - Technology Readiness Level
- `{{ipStatus}}` - IP Status

**Grant Context:**
- `{{grantName}}` - Name of the grant being applied for
- `{{grantVersionLabel}}` - Version label (e.g., "v1")
- `{{grantGuidelines}}` - Excerpt from grant guidelines (up to 10,000 chars)
- `{{grantRubric}}` - Formatted assessment criteria
- `{{grantSummary}}` - AI-generated summary of the grant

**Step Outputs (available in later steps):**
- `{{marketSegments}}` - Output from market segments step
- `{{existingCompetitors}}` - Output from competitors step
- `{{tam}}`, `{{sam}}`, `{{som}}` - Market size calculations

## Usage Example

After implementation, prompt templates can include grant context:

```text
You are analyzing research for commercialization potential.

Grant: {{grantName}} ({{grantVersionLabel}})

Audience: Grant assessors in Australia

Grant guidelines excerpt:
{{grantGuidelines}}

Assessment criteria/rubric:
{{grantRubric}}

Research Summary: {{summary}}

Based on the grant requirements above, extract and summarize:
1. The core research innovation
2. How it aligns with the grant's priority areas
...
```

## Security Considerations

- Grant data is fetched using service role key (already in use)
- No new RLS policies needed (grants are publicly readable when published)
- Guidelines text is truncated to prevent excessively long prompts

