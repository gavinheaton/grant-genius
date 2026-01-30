
# Execution Engine Toggle for Report Runs

## Overview

This feature adds the ability to select between **Edge Functions** (current 60s limit, good for debugging) and **Cloud Run** (no timeout limit, production-ready) as the execution engine for report generation. The default will be Cloud Run, with Edge available only for debugging purposes by Super Admin.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Report Generation Flow                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User clicks "Generate Report"                                           │
│            │                                                                 │
│            ▼                                                                 │
│  ┌────────────────────────┐                                                 │
│  │  generate-report       │ ◄─── Creates report_run record                  │
│  │  (Edge Function)       │      Sets execution_engine from grant_version   │
│  └────────────────────────┘                                                 │
│            │                                                                 │
│            ▼                                                                 │
│  ┌────────────────────────────────────────┐                                 │
│  │        Dispatcher Logic                 │                                 │
│  ├────────────────────────────────────────┤                                 │
│  │ if execution_engine = 'cloud_run'      │                                 │
│  │   → Call Cloud Run enqueue endpoint    │ ◄─── Future: webhook-based      │
│  │   → Return immediately                 │                                 │
│  │                                        │                                 │
│  │ if execution_engine = 'edge'           │                                 │
│  │   → Use existing step runner           │ ◄─── Current 15-phase flow      │
│  │   → Frontend polls for next step       │                                 │
│  └────────────────────────────────────────┘                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Model Changes

### 1. Create Execution Engine Enum

```sql
CREATE TYPE public.execution_engine AS ENUM ('cloud_run', 'edge');
```

### 2. Update grant_versions Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| execution_engine_default | execution_engine | 'cloud_run' | Default engine for new runs |
| edge_allowed | boolean | false | Whether Edge engine is selectable (debug only) |

### 3. Update report_runs Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| execution_engine | execution_engine | NULL | Engine used for this run |
| execution_engine_reason | text | NULL | Why this engine was selected |
| engine_overridden_by | uuid | NULL | User ID if manually overridden |
| engine_overridden_at | timestamptz | NULL | When override occurred |

### 4. Update report_run_steps Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| attempt_count | integer | 0 | Number of retry attempts |
| last_attempt_at | timestamptz | NULL | Timestamp of last attempt |
| worker | text | NULL | Worker identifier (edge function ID, cloud run job ID) |

### 5. Update prompt_bundle_steps Table (Guardrails)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| is_heavy | boolean | false | Marks step as too heavy for edge (>45s typical) |
| max_expected_seconds | integer | NULL | Expected max runtime (for monitoring/alerts) |

## Implementation Phases

### Phase 1: Database Schema

1. Create `execution_engine` enum type
2. Add new columns to `grant_versions`, `report_runs`, `report_run_steps`, `prompt_bundle_steps`
3. Set defaults for existing data

### Phase 2: Backend Logic

1. **Update `generate-report/index.ts`:**
   - Fetch `grant_version.execution_engine_default` when creating run
   - Store `execution_engine` on `report_runs` record
   - Add dispatcher logic based on engine selection

2. **Create `enqueue-cloud-run/index.ts` (stub):**
   - Placeholder edge function that will call external Cloud Run endpoint
   - Returns job ID for tracking
   - For now: logs and falls back to edge execution

3. **Update `resume-report-run/index.ts`:**
   - Add `attempt_count` increment on each step execution
   - Record `last_attempt_at` and `worker` identifier

### Phase 3: Admin UI - Grant Version Settings

**Location:** `/admin/grants/:id` → Grant Version → New "Advanced" tab

1. **"Allow Edge execution (debug only)" toggle:**
   - Only visible to Super Admin
   - Controls `edge_allowed` on version
   - Shows warning: "Edge execution has a 60-second timeout limit"

2. **"Default execution engine" dropdown:**
   - Options: Cloud Run (recommended) | Edge (debug only)
   - Disabled unless `edge_allowed = true`
   - Controls `execution_engine_default`

### Phase 4: Admin UI - Report Run Detail

**Location:** Admin Dashboard → Active Runs → Run Detail (new view)

1. **Display current engine** in run header with badge
2. **Super Admin "Re-run using engine" action:**
   - Dropdown: Cloud Run | Edge
   - Confirms action and creates new run with override
   - Records `engine_overridden_by` and `engine_overridden_at`

### Phase 5: Guardrails

**Location:** `/admin/prompt-bundles/:id` → Step Editor

1. **Add "Heavy Step" toggle per step:**
   - Marks steps expected to exceed edge limits
   - Stored in `prompt_bundle_steps.is_heavy`

2. **Add "Max Expected Seconds" input (optional):**
   - For monitoring/alerting purposes
   - Stored in `prompt_bundle_steps.max_expected_seconds`

3. **Validation on engine selection:**
   - When user selects Edge engine and any step is marked `is_heavy`:
   - Show warning dialog: "This prompt bundle contains heavy steps that may timeout on Edge"
   - Require Super Admin confirmation to proceed
   - Auto-default to Cloud Run unless explicitly overridden

### Phase 6: Analytics

1. **Add execution_engine grouping to existing analytics:**

   - Update `get_report_trend_7_days()` RPC to include engine breakdown
   - OR create new RPC: `get_report_stats_by_engine()`

2. **Admin Dashboard enhancements:**
   - Show completion/failure rates split by engine
   - Highlight if Edge runs have higher failure rate

## Files to Create/Modify

### Database Migration
- New migration: Add execution engine columns and enum

### Edge Functions
| File | Action |
|------|--------|
| `supabase/functions/generate-report/index.ts` | Modify - add engine selection + dispatcher |
| `supabase/functions/resume-report-run/index.ts` | Modify - add step tracking fields |
| `supabase/functions/enqueue-cloud-run/index.ts` | Create - stub for Cloud Run dispatch |

### Frontend - Hooks
| File | Action |
|------|--------|
| `src/hooks/usePromptBundles.ts` | Modify - add `is_heavy`, `max_expected_seconds` |

### Frontend - Admin Pages
| File | Action |
|------|--------|
| `src/pages/admin/GrantEdit.tsx` | Modify - add Advanced tab with engine settings |
| `src/pages/admin/PromptBundleEdit.tsx` | Modify - add heavy step toggle |
| `src/pages/admin/AdminDashboard.tsx` | Modify - add engine breakdown to analytics |
| `src/components/admin/PromptStepEditor.tsx` | Modify - add is_heavy toggle |

### Frontend - New Components
| File | Action |
|------|--------|
| `src/components/admin/EngineSettingsCard.tsx` | Create - reusable engine settings form |
| `src/components/admin/ReportRunDetail.tsx` | Create - detailed run view with re-run action |

## Security Considerations

1. **Super Admin Only:**
   - Toggle `edge_allowed` on grant versions
   - Override engine on individual runs
   - Access run re-run functionality

2. **Admin Can:**
   - View engine settings (read-only)
   - View run engine details

3. **RLS Policies:**
   - Existing admin policies cover new columns
   - Override columns (`engine_overridden_by`) use service role key

## Rollout Strategy

1. **Default to Cloud Run** for all new runs (stub returns immediately, edge fallback)
2. **Edge remains operational** for debugging
3. **Cloud Run integration** implemented separately when endpoint is ready
4. **Feature flag** (via grant_version.edge_allowed) controls visibility

## Technical Notes

### Cloud Run Stub Behavior (Initial Implementation)

```typescript
// enqueue-cloud-run/index.ts (stub)
async function enqueueCloudRun(reportRunId: string, stepNumber: number) {
  console.log(`Cloud Run stub: Would enqueue step ${stepNumber} for run ${reportRunId}`);
  
  // For now: fall back to edge execution by returning null
  // Future: return { jobId: "cloud-run-job-xxx" }
  return null;
}
```

### Dispatcher Logic in generate-report

```typescript
// After creating report_run with execution_engine set:
if (executionEngine === 'cloud_run') {
  // Call Cloud Run enqueue endpoint
  const result = await enqueueCloudRun(reportRun.id, 0);
  if (!result) {
    // Fallback to edge if Cloud Run unavailable
    await processStep0Only(...);
  }
} else {
  // Existing edge function flow
  await processStep0Only(...);
}
```

### Heavy Step Detection

Steps considered "heavy" by default (based on current timeouts):
- Step 0: Source pack building (42s timeout)
- Step 12: Section assembly (42s timeout)
- Step 13: Tables/sources (42s timeout)
- Steps 6-8: TAM/SAM/SOM (38s timeout)

## Success Criteria

1. Grant versions have configurable execution engine defaults
2. Report runs track which engine executed them
3. Super Admin can toggle Edge access per grant version
4. Super Admin can re-run reports with different engine
5. Heavy steps are flagged with appropriate warnings
6. Analytics show completion rates by engine type
