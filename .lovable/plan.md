

## Fix: "Currently Running" card not showing pending runs

### Root Cause

The "Currently Running" card on the Admin Dashboard only counts runs where `status === "running"` (line 136 of AdminDashboard.tsx):

```typescript
const currentlyRunning = activeRuns.filter((r: any) => r.status === "running").length;
```

However, the database currently has 1 active run with `status = "pending"`, which gets excluded from the count. The query itself fetches both running and pending runs correctly, but the card filter is too narrow.

### Fix

**`src/pages/admin/AdminDashboard.tsx`** (line 136)

Change the filter to count both `running` and `pending` runs:

```typescript
const currentlyRunning = activeRuns.length;
```

Since `activeRuns` is already filtered to only include running and pending statuses from the query, we can simply use its total length.

Optionally, rename the card title from "Currently Running" to "Active Runs" in `LiveOperationsCards.tsx` to better reflect that it includes pending runs too.

### Files Changed

| File | Change |
|---|---|
| `src/pages/admin/AdminDashboard.tsx` | Use `activeRuns.length` instead of filtering only for "running" |
| `src/components/admin/LiveOperationsCards.tsx` | Rename card title to "Active Runs" (optional) |

