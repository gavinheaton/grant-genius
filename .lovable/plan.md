

# Enhanced Failures Panel: Differentiate Cancellations vs Stage Gate Failures

## Overview

Improve the FailuresPanel to clearly separate and visualize:
1. **User Cancellations** - Runs cancelled by the user (no actionable issue)
2. **Stage Gate Failures** - Actual pipeline step failures that need investigation

Additionally, add a **failure breakdown by step** to identify which steps fail most often.

## Current State

The existing FailuresPanel:
- Shows all failures in a single list
- Only differentiates cancellations via the badge text
- Doesn't provide aggregate analysis of which steps fail

## Proposed Changes

### 1. Split the Failures Panel into Tabs

```text
+----------------------------------------------------------+
|  Recent Failures                                          |
|  [Stage Failures (1)] [Cancellations (5)]                |
+----------------------------------------------------------+
|                                                           |
|  STAGE FAILURES TAB:                                      |
|  +------------------------------------------------------+ |
|  | Step 3: market_segments              | 500 Error     | |
|  | gavin@... | AEA Ignite | 2h ago      |               | |
|  +------------------------------------------------------+ |
|                                                           |
|  CANCELLATIONS TAB:                                       |
|  | (greyed out, less prominent)                         | |
|  | gavin@... | Step 0 | Cancelled | 3h ago              | |
|                                                           |
+----------------------------------------------------------+
```

### 2. Add Step Failure Breakdown Card

New card showing which steps fail most often (excluding cancellations):

```text
+----------------------------------------------------------+
|  Step Failure Breakdown (Last 30 days)                   |
+----------------------------------------------------------+
|  Step 3: market_segments     ██████████████  3 failures  |
|  Step 0: build_source_pack   ██████         1 failure    |
|  Step 5: market_sizing       ████           1 failure    |
+----------------------------------------------------------+
```

This helps identify problematic steps for prompt tuning.

### 3. Classification Logic

**Cancellation Detection**:
```typescript
const isCancelled = 
  error_message?.toLowerCase().includes("cancel") ||
  error_message?.toLowerCase().includes("cancelled");
```

**Stage Gate Failure** = Any failure that is NOT a cancellation

### 4. Data Fetching Updates

Update the dashboard query to:
- Fetch more failures (increase limit for analysis)
- Include step failure aggregation

```typescript
// Additional query for step failure breakdown
const stepFailuresRes = await supabase
  .from("report_run_steps")
  .select("step_number, step_name, error_message")
  .eq("status", "failed")
  .not("error_message", "ilike", "%cancel%");
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/admin/FailuresPanel.tsx` | Add tabs for Stage Failures vs Cancellations, restyle layout |
| `src/pages/admin/AdminDashboard.tsx` | Update query to separate failure types, add step breakdown data |
| `src/components/admin/StepFailureBreakdown.tsx` | **NEW** - Component showing which steps fail most often |

## UI Design Details

### FailuresPanel with Tabs

- **Stage Failures tab** (default, highlighted):
  - Red badge with failure count
  - Shows step name prominently
  - Shows actual error message (not "Cancelled")
  - Sorted by recency

- **Cancellations tab**:
  - Grey/muted badge
  - Less prominent styling
  - Quick scan for users who cancelled

### StepFailureBreakdown Component

- Horizontal bar chart or simple list
- Shows top 5 failing steps
- Excludes cancellations from count
- Links step name to help with debugging

## Implementation Approach

### Step 1: Update FailuresPanel Interface

```typescript
interface FailuresPanelProps {
  stageFailures: FailedRun[];
  cancellations: FailedRun[];
  isLoading: boolean;
}
```

### Step 2: Split Data in Dashboard

```typescript
// In AdminDashboard.tsx
const recentFailures = (recentFailuresRes.data || []).map(/* ... */);

// Separate cancellations from stage failures
const stageFailures = recentFailures.filter(
  f => !f.failed_step?.error_message?.toLowerCase().includes("cancel")
);
const cancellations = recentFailures.filter(
  f => f.failed_step?.error_message?.toLowerCase().includes("cancel")
);
```

### Step 3: Create StepFailureBreakdown

Aggregate step failures (excluding cancellations) and display as a ranked list.

## Expected Outcome

After implementation:
- Admin can quickly see **how many actual failures** vs cancellations
- Admin can identify **which pipeline steps need attention**
- Cancellations are de-emphasized but still visible
- Clear actionable insights for prompt tuning

