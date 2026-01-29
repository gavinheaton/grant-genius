

# Elapsed Time Display for Report Generation

## Overview

Add a simple elapsed time display that calculates duration from `started_at` to `completed_at` (or current time for running reports). No real-time counters needed - just a static calculation on each data fetch.

## Data Available

The `report_runs` table already has all the fields needed:
- `started_at` - When generation began
- `completed_at` - When generation finished (null if still running)

## Implementation

### 1. Create a utility function for formatting duration

```typescript
// Format elapsed time between two dates
function formatElapsedTime(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "-";
  
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
```

### 2. Update GenerationProgress Component

**File**: `src/components/workspace/GenerationProgress.tsx`

- Add props: `startedAt?: string | null`, `completedAt?: string | null`
- Display elapsed time in the progress header
- For running: show time since `started_at`
- For completed: show total duration

### 3. Update ActiveRunsTable Component

**File**: `src/components/admin/ActiveRunsTable.tsx`

- Already fetches `started_at`
- Add `completed_at` to the select query
- Replace "Started X ago" column with calculated elapsed time
- For running: calculate from `started_at` to now
- For completed: use `started_at` to `completed_at`

### 4. Update ReportRun Interface and Hook

**File**: `src/hooks/useReportGeneration.ts`

- Add `completed_at` to the ReportRun interface
- Include `completed_at` in the select query

### 5. Pass Props in ApplicationWorkspace

**File**: `src/pages/ApplicationWorkspace.tsx`

- Pass `startedAt` and `completedAt` from `activeRun` to `GenerationProgress`

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/workspace/GenerationProgress.tsx` | Add elapsed time display with new props |
| `src/components/admin/ActiveRunsTable.tsx` | Add elapsed time column using existing data |
| `src/hooks/useReportGeneration.ts` | Add `completed_at` to interface and query |
| `src/pages/ApplicationWorkspace.tsx` | Pass timestamp props to GenerationProgress |

## UI Display

**User view (during generation)**:
```text
Generating Report                                    [Clock icon] 2m 35s
Step 5/13: Building market sizing source pack        38%
[=================                                              ]
```

**Admin table**:
| User | Application | Progress | Status | Elapsed |
|------|-------------|----------|--------|---------|
| gavin@... | AEA Ignite | 11/13 | Running | 3m 42s |

