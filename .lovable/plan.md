

# Coordination Marker for Report Assembly

## Your Idea

Add a new status/phase marker that signals when research steps are complete and the worker should begin the HTML assembly phase. The Replit worker watches for this marker instead of using hardcoded step-number logic.

## Solution Design

### New Column: `phase` on `report_runs`

Add a simple enum column to `report_runs` that tracks the current pipeline phase:

| Phase | Meaning | Who Sets It |
|-------|---------|-------------|
| `research` | Research steps in progress (Steps 0 - N-3) | Initial/default |
| `assembly` | Research complete, ready for HTML assembly | Edge/worker-proxy |
| `complete` | Pipeline finished | Edge/worker-proxy |

### New Column: `is_assembly_step` on `prompt_bundle_steps`

Mark which steps are assembly steps vs research steps:

| Step | is_assembly_step | Pipeline Phase |
|------|------------------|----------------|
| 0-10 | `false` | `research` |
| 11 (assemble_sections_html) | `true` | `assembly` |
| 12 (build_tables_sources_html) | `true` | `assembly` |
| 13 (finalize_report_html) | `true` | `assembly` |

### Worker Coordination Flow

```text
┌─────────────────────────────────────────────────────────────┐
│                     REPLIT WORKER                           │
├─────────────────────────────────────────────────────────────┤
│  1. Fetch run context from worker-proxy                     │
│     → Gets: phase, current_step, step metadata              │
│                                                             │
│  2. Check phase:                                            │
│     IF phase = 'research' AND next_step.is_assembly_step:   │
│        → Set phase = 'assembly' via worker-proxy            │
│        → Continue with assembly step                        │
│                                                             │
│  3. Execute step normally using dynamic step data           │
│     → No hardcoded step numbers                             │
│     → Use step_outputs from worker-proxy response           │
│                                                             │
│  4. When last step completes:                               │
│        → Set phase = 'complete'                             │
│        → Call save_report                                   │
└─────────────────────────────────────────────────────────────┘
```

## Technical Implementation

### Database Migration

```sql
-- Add phase column to report_runs
ALTER TABLE report_runs 
ADD COLUMN phase TEXT DEFAULT 'research' 
CHECK (phase IN ('research', 'assembly', 'complete'));

-- Add is_assembly_step to prompt_bundle_steps  
ALTER TABLE prompt_bundle_steps 
ADD COLUMN is_assembly_step BOOLEAN DEFAULT false;

-- Mark existing assembly steps
UPDATE prompt_bundle_steps 
SET is_assembly_step = true 
WHERE step_name IN (
  'assemble_sections_html', 
  'build_tables_sources_html', 
  'finalize_report_html'
);
```

### worker-proxy Updates

1. **Include phase and is_assembly_step in `get_run_context` response**:
   - Add `phase` from `report_runs`
   - Add `is_assembly_step` flag on each step in the bundle

2. **New action `update_phase`** (or extend `update_run`):
   - Worker can set `phase = 'assembly'` when transitioning
   - Worker can set `phase = 'complete'` at the end

### Replit Worker Logic (Instructions for you)

Replace hardcoded step checks with:

```javascript
// Get context (already includes phase and is_assembly_step per step)
const { run, prompt_bundle, step_outputs } = await getRunContext(runId);

// Get the next step to execute
const nextStep = prompt_bundle.steps.find(s => s.step_number === run.current_step + 1);

// Phase transition detection (no hardcoded numbers!)
if (run.phase === 'research' && nextStep.is_assembly_step) {
  await updatePhase(runId, 'assembly');
  console.log('🔄 Transitioning to assembly phase');
}

// Execute step using dynamic prompt + step_outputs
const stepPrompt = interpolate(nextStep.prompt_template, {
  ...userInputs,
  ...step_outputs  // step0, step1, step2... from DB
});
```

## Files to Modify

| File | Change |
|------|--------|
| Database | Add `phase` column to `report_runs` |
| Database | Add `is_assembly_step` column to `prompt_bundle_steps` |
| `worker-proxy/index.ts` | Include `phase` and `is_assembly_step` in responses |
| `generate-report/index.ts` | Set initial `phase = 'research'` on run creation |

## Benefits

1. **No hardcoded step counts** - Works with any pipeline length
2. **Clear coordination point** - Worker knows exactly when to switch to assembly
3. **Observable** - You can query `SELECT * FROM report_runs WHERE phase = 'assembly'` to see runs in assembly
4. **Future-proof** - Easy to add more phases if needed (e.g., `validation`)

## Replit Worker Changes (Summary for you)

Tell the Replit worker to:
1. Read `phase` from the `get_run_context` response
2. Read `is_assembly_step` flag on each step
3. When `phase === 'research'` and `nextStep.is_assembly_step === true`, call `update_run` with `phase: 'assembly'`
4. Remove all hardcoded step number logic (no more checking `step12` exists at step 10)
5. Use `step_outputs` from the response directly (already keyed as `step0`, `step1`, etc.)

