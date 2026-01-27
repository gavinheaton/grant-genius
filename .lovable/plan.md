

# Credit Refund and Checkpoint System Implementation

## Overview

Two improvements to make report generation more robust:
1. **Refund credits** when a report fails or is cancelled
2. **Add checkpoint at step 5** to split processing into two phases, avoiding edge function timeouts

---

## Current Problems

| Problem | Impact |
|---------|--------|
| Credits consumed before processing starts | User loses credit even if generation fails |
| 10 steps run in one function call | Risk of hitting edge function timeout (~5min) |
| No way to resume from checkpoint | Failed runs waste all prior work |

---

## Implementation Plan

### 1. Credit Refund on Failure/Cancellation

When a report run fails or is cancelled, refund the credit by:
- Decreasing `used_quantity` on the entitlement
- Deleting the corresponding `entitlement_consumptions` record

**Update `cancel-report-run/index.ts`:**
```typescript
// After marking run as failed, find and refund the consumption
const { data: consumption } = await supabaseAdmin
  .from("entitlement_consumptions")
  .select("id, entitlement_id")
  .eq("report_run_id", reportRunId)
  .maybeSingle();

if (consumption) {
  // Decrement used_quantity
  await supabaseAdmin.rpc("decrement_entitlement", { 
    ent_id: consumption.entitlement_id 
  });
  
  // Delete consumption record
  await supabaseAdmin
    .from("entitlement_consumptions")
    .delete()
    .eq("id", consumption.id);
    
  console.log("Credit refunded for cancelled run");
}
```

**Add database function for safe decrement:**
```sql
CREATE OR REPLACE FUNCTION decrement_entitlement(ent_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE entitlements 
  SET used_quantity = GREATEST(0, used_quantity - 1)
  WHERE id = ent_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Link consumption to report run:**
Add `report_run_id` column to `entitlement_consumptions` table to track which run consumed which credit.

### 2. Checkpoint System at Step 5

Split the 10-step pipeline into two phases:
- **Phase 1** (Steps 1-5): Context, Competitors, Segments, Find Competitors, TAM
- **Phase 2** (Steps 6-10): SAM, SOM, Impact, Table, Partners

**How it works:**

1. After completing Step 5, save checkpoint data to `report_runs`:
   ```typescript
   await supabase
     .from("report_runs")
     .update({
       checkpoint_data_json: reportContent,
       checkpoint_citations_json: citations,
       current_step: 5,
       status: "checkpoint",  // New status
     })
     .eq("id", reportRunId);
   ```

2. Return early from the edge function

3. **New endpoint `resume-report-run`** picks up from checkpoint:
   - Loads `checkpoint_data_json` 
   - Continues steps 6-10
   - Completes the report

4. **Frontend polling** detects `checkpoint` status and calls `resume-report-run`:
   ```typescript
   if (activeRun.status === "checkpoint") {
     await supabase.functions.invoke("resume-report-run", {
       body: { reportRunId: activeRun.id }
     });
   }
   ```

**Database schema changes:**
```sql
-- Add checkpoint columns to report_runs
ALTER TABLE report_runs 
ADD COLUMN checkpoint_data_json jsonb DEFAULT '{}',
ADD COLUMN checkpoint_citations_json jsonb DEFAULT '[]';

-- Add new status value
-- (Note: step_status enum already includes the statuses we need)

-- Add report_run_id to entitlement_consumptions
ALTER TABLE entitlement_consumptions
ADD COLUMN report_run_id uuid REFERENCES report_runs(id);
```

---

## File Changes

| File | Changes |
|------|---------|
| `supabase/functions/generate-report/index.ts` | Add checkpoint save after step 5, return early |
| `supabase/functions/cancel-report-run/index.ts` | Add credit refund logic |
| `supabase/functions/resume-report-run/index.ts` | **NEW** - Resume from checkpoint |
| `src/hooks/useReportGeneration.ts` | Detect checkpoint status, auto-call resume |
| Database migration | Add checkpoint columns, decrement function, consumption tracking |

---

## Flow Diagram

```text
User clicks "Generate Report"
         ↓
┌─────────────────────────┐
│  generate-report        │
│  Steps 1-5              │
│  Save checkpoint        │
│  Return "checkpoint"    │
└─────────────────────────┘
         ↓
Frontend detects "checkpoint" status
         ↓
┌─────────────────────────┐
│  resume-report-run      │
│  Load checkpoint        │
│  Steps 6-10             │
│  Complete report        │
└─────────────────────────┘
         ↓
Report ready!

─── If failure at any point ───
         ↓
User clicks "Cancel & Retry"
         ↓
┌─────────────────────────┐
│  cancel-report-run      │
│  Mark run as failed     │
│  REFUND CREDIT ← NEW    │
└─────────────────────────┘
```

---

## Benefits

| Before | After |
|--------|-------|
| Credit lost on failure | Credit refunded automatically |
| Single long-running call | Two shorter calls with checkpoint |
| Lost progress on timeout | Can resume from step 5 |
| ~10 min processing risk | ~5 min per phase, safer |

