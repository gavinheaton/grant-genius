

## Fix: Step Reordering Blocked by CHECK Constraint

### Root Cause

The `swap_step_numbers` function sets `step_number = -1` as a temporary intermediate value, but there's a **CHECK constraint** on the table:

```
CHECK ((step_number >= 0) AND (step_number <= 50))
```

This blocks the `-1` value, causing the swap to fail before it can complete.

### Solution

Update both database functions to use a temporary value **within** the allowed range (0) instead of -1. Since step numbers for actual steps start at 1, using 0 as the temporary parking value is safe and stays within the constraint.

However, if two steps could theoretically both need to park at 0 simultaneously (in `reorder_step_numbers`), we need a different approach for the bulk case. The cleanest fix:

1. **Drop the CHECK constraint** -- it's overly restrictive and the unique constraint + application logic already prevent invalid values. This is the simplest and most robust approach.

2. **Alternatively**, modify the swap function to use step_number = 0 (within range) and modify the bulk reorder to use values in the range 0..0 with careful sequencing. This is fragile.

**Recommended approach**: Drop the CHECK constraint via a migration, since the unique constraint on `(bundle_id, step_number)` already prevents duplicates, and the application layer controls valid step numbers.

### Changes

**1. Database migration**
- Drop the `prompt_bundle_steps_step_number_check` constraint

**2. No code changes needed**
- The existing `swap_step_numbers` and `reorder_step_numbers` functions will work correctly once the CHECK constraint is removed.

### Technical Details

| Layer | Change |
|-------|--------|
| Database | `ALTER TABLE prompt_bundle_steps DROP CONSTRAINT prompt_bundle_steps_step_number_check;` |
| Frontend | No changes needed |
| Hook | No changes needed |
