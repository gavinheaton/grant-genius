
# Automated Pipeline Generation: Option A Implementation

## Overview

This plan implements a single orchestrating edge function (`process-grant-guidelines`) that automatically handles the entire pipeline setup when an admin uploads grant guidelines. The admin only needs to upload a PDF, and the system handles extraction, application, and pipeline generation in one seamless process.

## What Changes

### Current Flow (Manual - 4 Steps)
1. Upload PDF
2. Click "Analyze with AI"
3. Select and click "Apply Suggestions"
4. (Pipeline generation not yet implemented)

### New Automated Flow (1 Action)
1. Upload PDF - everything else happens automatically
   - Extracts rubric and required inputs
   - Auto-applies to grant version
   - Generates custom research pipeline
   - Creates and links prompt bundle
   - Sets status to "draft" for Super Admin review

## Files to Create

### 1. `supabase/functions/process-grant-guidelines/index.ts`
A new orchestrating edge function that combines all processing into one call:

**Processing Steps:**
1. Update grant version status to "processing"
2. **AI Call #1**: Extract rubric + required inputs (existing logic from analyze-grant-guidelines)
3. Auto-apply extracted data to `grant_versions.required_inputs_json` and `rubric_json`
4. **AI Call #2**: Generate research pipeline based on rubric
   - Analyzes rubric sections to determine research steps needed
   - Generates between 8-20 steps typically (dynamic based on complexity)
   - Creates prompts tailored to grant criteria
5. Create new `prompt_bundle` with generated steps
6. Link bundle to grant version (`prompt_bundle_id`)
7. Set `pipeline_generation_status = "draft"`
8. Update status to "completed"

**AI Pipeline Generation Prompt** will instruct the model to:
- Focus on RESEARCH that supports applications (not application writing)
- Determine optimal step count based on rubric complexity
- Skip criteria requiring applicant-provided info (team bios, track record)
- Include mandatory steps: Step 0 (Source Pack), Final 3 steps (Assembly)
- Generate prompts with {{variable}} placeholders

### 2. `src/components/admin/ProcessingProgress.tsx`
A new component showing unified processing progress:

```
[████████████░░░░░░░░░░░░] 45%

 PDF uploaded
 Extracting rubric and inputs...
○ Generating research pipeline...
○ Creating prompt bundle...
```

Displays real-time status based on `ai_analysis_status` and `pipeline_generation_status` fields.

## Files to Modify

### 3. `src/components/admin/GuidelinesUploader.tsx`
**Changes:**
- After successful PDF upload, automatically call `process-grant-guidelines` edge function
- Remove the "You can now analyze them with AI" toast message
- Add new prop `onProcessingStart` to signal parent component

**New behavior:**
1. Upload PDF to storage
2. Immediately trigger `process-grant-guidelines`
3. Parent component shows processing progress

### 4. `src/components/admin/AIAnalysisPanel.tsx`
**Changes:**
- Transform from manual trigger to status display
- Remove "Analyze with AI" button (now automatic)
- Remove "Apply Selected Suggestions" button (now automatic)
- Show read-only preview of extracted rubric and inputs
- Add link to generated pipeline when complete

**New sections:**
- Processing status with progress indicator
- Read-only summary of extracted data
- Pipeline preview (step count, step names)
- "View Full Pipeline" link to bundle editor
- "Regenerate" button for manual override

### 5. `src/pages/admin/GrantEdit.tsx`
**Changes:**
- Add `pipeline_generation_status` and `prompt_bundle_id` to the query
- Add state variables for new fields
- Pass processing status to child components
- Add Pipeline tab with link to bundle editor when pipeline exists
- Add polling for status updates during processing

**New tab structure:**
```
Details | Versions | Guidelines | Pipeline | Required Inputs | Rubric | Advanced
```

### 6. `supabase/functions/worker-proxy/index.ts`
**Changes:**
Update `handleGetRunContext` to use grant-linked bundle:

```
Current: SELECT bundle WHERE is_active = true (global)

New:
1. Get application's grant_version_id
2. Fetch grant_version.prompt_bundle_id
3. If exists, use that bundle's steps
4. Else fallback to global active bundle
```

This ensures reports use the grant-specific pipeline when available.

### 7. `supabase/config.toml`
Add configuration for new edge function:
```toml
[functions.process-grant-guidelines]
verify_jwt = false
```

## Database Status Fields Used

| Field | Values | Purpose |
|-------|--------|---------|
| `ai_analysis_status` | pending, processing, completed, failed | Tracks extraction phase |
| `pipeline_generation_status` | none, generating, draft, published | Tracks pipeline creation |

## Processing Timeline

Estimated total time: **30-60 seconds**

| Phase | Duration | Status Fields |
|-------|----------|---------------|
| PDF Upload | 2-5s | - |
| Extraction (AI Call #1) | 10-20s | ai_analysis_status: processing |
| Auto-apply | <1s | - |
| Pipeline Generation (AI Call #2) | 15-30s | pipeline_generation_status: generating |
| Bundle Creation | <1s | pipeline_generation_status: draft |

## UI States

### Guidelines Tab - Before Upload
```
┌────────────────────────────────────────────────────────┐
│  [Drop Zone]                                            │
│  Upload Grant Guidelines                                │
│  Drag and drop a PDF, or click to browse               │
└────────────────────────────────────────────────────────┘
```

### Guidelines Tab - Processing
```
┌────────────────────────────────────────────────────────┐
│  [Spinning] Processing Guidelines                       │
│                                                         │
│  [████████████░░░░░░░░░] 60%                           │
│                                                         │
│   Uploaded guidelines.pdf                              │
│   Extracted rubric and required inputs                 │
│  ○ Generating research pipeline...                     │
│  ○ Creating prompt bundle...                           │
│                                                         │
│  This may take 30-60 seconds                           │
└────────────────────────────────────────────────────────┘
```

### Guidelines Tab - Complete
```
┌────────────────────────────────────────────────────────┐
│  [CheckCircle] Processing Complete                      │
│                                                         │
│  Grant Summary:                                         │
│  "The AEA Ignite grant supports commercialization..."  │
│                                                         │
│  Extracted:                                             │
│  • 8 required inputs                                    │
│  • 5 rubric sections                                    │
│  • 12-step research pipeline                           │
│                                                         │
│  [View Pipeline] [View Rubric] [Regenerate]            │
│                                                         │
│  ⚠ Draft - Super Admin must publish before use         │
└────────────────────────────────────────────────────────┘
```

## Error Handling

If either AI call fails:
1. Set appropriate status to "failed"
2. Preserve any partial results
3. Show error message with "Retry" button
4. Log to `audit_logs` for debugging

The admin can:
- Click "Retry" to re-run the entire process
- Manually create a pipeline via existing bundle editor
- Link an existing bundle as fallback

## Manual Override Options (Preserved)

For admins who want more control:
- "Regenerate Pipeline" button to re-run pipeline generation only
- "View Full Pipeline" link opens bundle editor for manual edits
- "Link Existing Bundle" dropdown in Pipeline tab
- Super Admin publish gate remains (draft cannot be used until published)

## Backward Compatibility

- Grants without `prompt_bundle_id` continue using global active bundle
- Existing `analyze-grant-guidelines` function remains (for potential direct API use)
- Manual workflow still available via "Regenerate" or bundle editor
- No changes to researcher experience

## Technical Considerations

### Rate Limits
Both AI calls use Gemini-3-Flash which has reasonable rate limits. If rate limited, show clear message with retry option.

### Processing Timeout
Edge function timeout is 120 seconds, which should be sufficient for both AI calls. If needed, we can implement checkpointing.

### Concurrency
The function uses atomic status updates to prevent duplicate processing if admin accidentally triggers multiple uploads.

## Success Criteria

1. Admin uploads PDF and walks away
2. System automatically processes guidelines and generates pipeline
3. Admin returns to see draft pipeline ready for review
4. Super Admin can publish with one click
5. Researchers can run reports using the grant-specific pipeline
6. Fallback to global bundle works for grants without custom pipelines
