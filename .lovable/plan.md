

# Editable Prompt Bundle Admin Section

## Overview
Create an admin interface at `/admin/prompt-bundles` that allows administrators to view and edit the AI prompts used in the 10-step report generation pipeline. This moves hardcoded prompts from edge functions into the database, enabling real-time tweaking without code deployments.

## Current State

The prompts are currently hardcoded in two edge functions:
- `supabase/functions/generate-report/index.ts` - Step 1 (context extraction)
- `supabase/functions/resume-report-run/index.ts` - Steps 2-10 (all other research steps)

Key components:
- **System Prompt**: Shared across all steps
- **Step Prompts**: 10 individual prompts for each research phase
- **Model Selection**: Different models for different step complexity

## Implementation Plan

### 1. Database Schema

Create a new `prompt_bundles` table to store editable prompts:

```text
Table: prompt_bundles
- id (uuid, primary key)
- name (text) - e.g., "Default Bundle"
- description (text, nullable)
- is_active (boolean, default true) - only one bundle active at a time
- system_prompt (text) - shared system prompt for all steps
- created_at (timestamp)
- updated_at (timestamp)
```

Create a `prompt_bundle_steps` table for individual step prompts:

```text
Table: prompt_bundle_steps
- id (uuid, primary key)
- bundle_id (uuid, FK to prompt_bundles)
- step_number (integer, 1-10)
- step_name (text) - e.g., "extract_context"
- step_description (text) - user-friendly description
- prompt_template (text) - the actual prompt with {{variable}} placeholders
- model_override (text, nullable) - optional model override for this step
- created_at (timestamp)
- updated_at (timestamp)
- UNIQUE(bundle_id, step_number)
```

RLS Policies:
- Admins can view all bundles and steps
- Only Super Admins can insert/update/delete

### 2. Admin UI Components

#### Navigation Update
Add "AI Prompts" to the Reports section in AdminSidebar:
```text
Reports:
- PDF Templates
- AI Prompts (NEW)
```

#### Main Prompt Bundles Page (`/admin/prompt-bundles`)

Layout:
- Header with title "AI Prompt Bundles"
- Active bundle indicator card
- List of all bundles with actions (Edit, Clone, Set Active, Delete)

Features:
- Create new bundle (clones from default or starts fresh)
- Set active bundle (used for all new report generations)
- View bundle details

#### Bundle Editor Page (`/admin/prompt-bundles/:id`)

Layout:
- Header with bundle name and status
- System prompt editor (large textarea)
- Accordion or tabs for 10 step prompts
- Each step shows:
  - Step name and description
  - Prompt template editor with syntax highlighting for variables
  - Optional model override selector
  - Variable reference panel showing available placeholders

Available variables for prompts:
- `{{summary}}` - User's research summary
- `{{publicArticleUrl}}` - Article URL
- `{{articleContent}}` - Scraped article content
- `{{trl}}` - Technology Readiness Level
- `{{ipStatus}}` - IP Status
- `{{previousStepOutputs}}` - Context from prior steps (auto-injected)

### 3. Edge Function Updates

Modify both edge functions to:
1. Fetch the active prompt bundle from the database
2. Use database prompts instead of hardcoded ones
3. Fall back to hardcoded defaults if no active bundle exists

Changes to `generate-report/index.ts`:
```text
- Add function to fetch active bundle from database
- Replace hardcoded SYSTEM_PROMPT with bundle.system_prompt
- Replace Step 1 prompt with bundle step template
- Interpolate variables into template
```

Changes to `resume-report-run/index.ts`:
```text
- Fetch active bundle at start
- For each step (2-10), use the corresponding step prompt from bundle
- Interpolate variables from checkpoint data and inputs
```

### 4. Seed Data

Insert a default bundle with current hardcoded prompts as initial data via migration:
- System prompt (existing)
- All 10 step prompts (extracted from current code)
- Marks as active

### 5. File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| Database Migration | CREATE | New tables: prompt_bundles, prompt_bundle_steps |
| `src/components/admin/AdminSidebar.tsx` | MODIFY | Add "AI Prompts" nav item |
| `src/App.tsx` | MODIFY | Add routes for prompt bundle pages |
| `src/pages/admin/PromptBundles.tsx` | CREATE | Main listing page |
| `src/pages/admin/PromptBundleEdit.tsx` | CREATE | Bundle editor page |
| `src/components/admin/PromptStepEditor.tsx` | CREATE | Reusable step prompt editor |
| `src/hooks/usePromptBundles.ts` | CREATE | Query hooks for bundles |
| `supabase/functions/generate-report/index.ts` | MODIFY | Use database prompts |
| `supabase/functions/resume-report-run/index.ts` | MODIFY | Use database prompts |

### 6. Security Considerations

- Only Admins can view prompt bundles
- Only Super Admins can modify/activate bundles
- Prompt changes are logged to audit_logs table
- Active bundle changes require confirmation dialog

### 7. User Experience Flow

1. Admin navigates to `/admin/prompt-bundles`
2. Sees list of bundles with "Default Bundle" marked as active
3. Clicks "Edit" to open bundle editor
4. Expands Step 5 (TAM Calculation) accordion
5. Modifies the prompt to be more specific about Australian market data
6. Clicks "Save Changes"
7. Next report generation uses the updated prompt

### 8. Variable Interpolation Logic

Create a shared utility function for template interpolation:

```text
function interpolatePrompt(template: string, variables: Record<string, string>): string
- Replace {{variableName}} with variable values
- Handle missing variables gracefully (leave placeholder or remove)
- Support nested object paths: {{checkpoint.marketSegments}}
```

### 9. Default Prompts (Seed Data)

The migration will include the current prompts as defaults:

**System Prompt:**
"You are a research commercialization expert helping prepare grant applications. Provide detailed, well-researched responses. Always cite sources where possible. If data cannot be validated, clearly indicate this."

**Step Prompts (1-10):**
Each step's current hardcoded prompt will be converted to a template with appropriate variable placeholders.

