

## Fix: `pipeline_generation_status` Check Constraint for Claude Engine

### Problem
When processing guidelines for a Claude-engine grant, the `process-grant-guidelines` edge function tries to set `pipeline_generation_status = 'not_required'`, but the database check constraint only allows: `none`, `generating`, `draft`, `published`.

### Solution
Add `not_required` to the allowed values in the check constraint. This is the correct semantic value for Claude/single-prompt grants that don't need a multi-step pipeline.

### Changes

**1. Database migration** -- alter the check constraint:
```sql
ALTER TABLE grant_versions 
  DROP CONSTRAINT grant_versions_pipeline_generation_status_check;

ALTER TABLE grant_versions 
  ADD CONSTRAINT grant_versions_pipeline_generation_status_check 
  CHECK (pipeline_generation_status = ANY (ARRAY[
    'none', 'generating', 'draft', 'published', 'not_required'
  ]));
```

**2. No code changes needed** -- the edge function already sets `not_required` correctly for Claude grants; it just couldn't save due to the constraint.

### After Fix
Retry the guidelines analysis from the Grant Edit page. It should complete successfully now.

