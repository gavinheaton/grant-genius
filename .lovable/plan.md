

# Fix: Remove `phase` Column from Pipeline Step Inserts

## Problem

The `process-grant-guidelines` edge function is failing with error:
```
Could not find the 'phase' column of 'prompt_bundle_steps' in the schema cache
```

The function is attempting to insert a `phase` field into `prompt_bundle_steps`, but this column **does not exist** in the database schema.

### Affected Code Locations

| Line | Code | Issue |
|------|------|-------|
| 1180 | `phase: step.phase` | Firecrawl steps |
| 1197 | `phase: "research"` | AI analysis steps |
| 1214 | `phase: qaGatesTemplate.phase` | QA Gates step |
| 1231 | `phase: step.phase` | Assembly steps |

---

## Solution

Remove all `phase` properties from the step objects before inserting into the database. The `is_assembly_step` boolean column already exists and serves a similar purpose for distinguishing research vs assembly steps.

Instead of storing `phase`, we can:
1. Remove the `phase` field from all step insert objects
2. Set `is_assembly_step: true` for assembly steps and `is_assembly_step: false` for research steps

---

## Changes

**File: `supabase/functions/process-grant-guidelines/index.ts`**

### 1. Firecrawl Steps (around line 1180)
Remove `phase: step.phase` from the step object mapping.

### 2. AI Analysis Steps (around line 1197)
Remove `phase: "research"` from the step object mapping.

### 3. QA Gates Step (around line 1214)
Remove `phase: qaGatesTemplate.phase` from the step object.

### 4. Assembly Steps (around line 1231)
Remove `phase: step.phase` from the step object mapping, and add `is_assembly_step: true`.

### Summary of Field Changes

| Step Type | Remove | Add |
|-----------|--------|-----|
| Firecrawl | `phase` | `is_assembly_step: false` |
| AI Analysis | `phase` | `is_assembly_step: false` |
| QA Gates | `phase` | `is_assembly_step: false` |
| Assembly | `phase` | `is_assembly_step: true` |

---

## Expected Outcome

After this fix:
1. The edge function will successfully insert pipeline steps
2. The `is_assembly_step` field correctly indicates assembly vs research phases
3. Guidelines upload and pipeline generation will complete without errors

---

## Testing

After deployment:
1. Navigate to the admin grants page
2. Upload a grant guidelines PDF
3. Verify the pipeline is generated with correct step counts
4. Confirm the generated steps have appropriate `is_assembly_step` flags

