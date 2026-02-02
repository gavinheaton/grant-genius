

# Coordination Marker for Report Assembly

## ✅ IMPLEMENTED

The phase coordination system is now fully implemented on the Lovable side.

## What Was Added

### Database
- `phase` column on `report_runs` (values: `research`, `assembly`, `complete`)
- `is_assembly_step` column on `prompt_bundle_steps` (boolean)
- Existing assembly steps (`assemble_sections_html`, `build_tables_sources_html`, `finalize_report_html`) marked with `is_assembly_step = true`

### Edge Functions

**`worker-proxy/index.ts`**:
- `get_run_context` now returns `run.phase` and `is_assembly_step` flag on each step
- `update_run` now accepts `phase` parameter with validation

**`generate-report/index.ts`**:
- Sets initial `phase: 'research'` on run creation

## Replit Worker Instructions

The Replit worker should now:

1. **Read `phase` from the `get_run_context` response**:
   ```javascript
   const { run, prompt_bundle, step_outputs } = await getRunContext(runId);
   console.log(`Current phase: ${run.phase}`);
   ```

2. **Read `is_assembly_step` flag on each step**:
   ```javascript
   const nextStep = prompt_bundle.steps.find(s => s.step_number === run.current_step + 1);
   console.log(`Next step ${nextStep.step_name} is assembly: ${nextStep.is_assembly_step}`);
   ```

3. **Transition to assembly phase when needed**:
   ```javascript
   if (run.phase === 'research' && nextStep.is_assembly_step) {
     await updateRun(runId, { phase: 'assembly' });
     console.log('🔄 Transitioning to assembly phase');
   }
   ```

4. **Set phase to complete at the end**:
   ```javascript
   if (stepNumber === run.total_steps - 1) {
     await updateRun(runId, { phase: 'complete', status: 'completed' });
   }
   ```

5. **Remove ALL hardcoded step number logic**:
   - No more checking `step12 exists at step 10`
   - Use `step_outputs` from the response directly (keyed as `step0`, `step1`, etc.)
   - Use `run.total_steps` for pipeline length checks

## API Contract

### get_run_context Response
```json
{
  "run": {
    "id": "uuid",
    "status": "running",
    "current_step": 10,
    "total_steps": 14,
    "phase": "research",  // NEW
    ...
  },
  "prompt_bundle": {
    "steps": [
      {
        "step_number": 11,
        "step_name": "assemble_sections_html",
        "is_assembly_step": true,  // NEW
        ...
      }
    ]
  },
  "step_outputs": {
    "step0": {...},
    "step1": {...}
  }
}
```

### update_run Request
```json
{
  "action": "update_run",
  "report_run_id": "uuid",
  "phase": "assembly"  // NEW - valid values: research, assembly, complete
}
```
