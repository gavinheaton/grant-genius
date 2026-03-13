

## Replace "Recent Failures" with "Recent Runs" (All Statuses)

### Changes

**1. `src/pages/admin/AdminDashboard.tsx`**
- Add a new query for **recent completed runs** (status=completed, limit 20, ordered by created_at desc) with user email and application title
- Pass completed runs alongside failures/cancellations to the renamed panel
- Rename card title from "Recent Failures" to "Recent Runs"

**2. `src/components/admin/FailuresPanel.tsx`** → Rename to **`RecentRunsPanel.tsx`**
- Add a third tab: **Completed** (with green checkmark icon, count badge)
- Add a `CompletedItem` component showing user email, application title, time ago, and a "Completed" badge — linking to `/admin/runs/:id`
- Keep existing Failures and Cancellations tabs as-is
- Update default tab to "all" or keep "failures" as default (failures are more actionable)

**3. Data shape for completed runs:**
```typescript
interface CompletedRun {
  id: string;
  created_at: string;
  completed_at: string | null;
  application: { title: string | null } | null;
  user_email: string | null;
}
```

This gives you one card with three tabs: **Stage Failures | Cancellations | Completed** — all linking to `/admin/runs/:id` for the Recover Report button.

