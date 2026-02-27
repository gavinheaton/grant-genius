

## Fix: Increase Stalled Run Detection Threshold

### Problem
Reports take 10-20 minutes to complete, and individual pipeline steps (especially AI research and assembly steps) can legitimately run for several minutes. The current 5-minute inactivity threshold triggers false "stalled" warnings on runs that are actively progressing.

### Solution
Increase the stall detection threshold from 5 minutes to 15 minutes across all locations, and update the messaging to reflect the expected run duration.

### Changes

**1. `src/pages/admin/AdminDashboard.tsx`**
- Change `5 * 60 * 1000` threshold to `15 * 60 * 1000` (line 234)
- Update the card description from "5+ minutes" to "15+ minutes" (line 325)

**2. `src/hooks/useReportGeneration.ts`**
- Change `STALE_THRESHOLD_MS` from `5 * 60 * 1000` to `15 * 60 * 1000` (line 38)
- Update related comments referencing "5+ minutes" to "15+ minutes"

**3. `src/components/admin/StalledRunsTable.tsx`**
- Update empty state text from "5+ minutes" to "15+ minutes" (line 147)

These are simple constant and string changes across 3 files -- no logic changes needed.
