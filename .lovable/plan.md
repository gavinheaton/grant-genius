
# Enable Delete for Reports and Applications on Dashboard

## Current State

### Dashboard Application Cards
- Delete button **already exists** for draft applications (status === "draft")
- Other statuses (in_progress, ready, failed) have **no delete option**
- User can only delete drafts, not completed or failed applications

### Reports
- No delete functionality exists in `ReportsList.tsx`
- Reports are displayed with View, DOCX, and PDF buttons only

### Database Constraints (BLOCKING ISSUE)
The following foreign key constraints will **block deletion**:

| Table | Column | References | Cascade? |
|-------|--------|------------|----------|
| `entitlement_consumptions` | `report_id` | `reports(id)` | **NO** |
| `entitlement_consumptions` | `report_run_id` | `report_runs(id)` | **NO** |

This means:
- Deleting a **report** fails if it has an entitlement consumption record
- Deleting an **application** cascades to reports, but will fail at entitlement_consumptions
- Deleting a **report_run** fails if linked to entitlement_consumptions

### RLS Policies
- `applications`: Users CAN delete their own applications (policy exists)
- `reports`: Users **CANNOT** delete (no DELETE policy exists)
- `report_runs`: Users **CANNOT** delete (no DELETE policy exists)

---

## Solution

### Part 1: Database Migration (Foreign Key Fixes + RLS)

Add `ON DELETE SET NULL` to entitlement_consumptions so deleting reports/runs doesn't fail:

```sql
-- 1. Fix foreign key constraints to allow deletion
ALTER TABLE public.entitlement_consumptions 
  DROP CONSTRAINT IF EXISTS entitlement_consumptions_report_id_fkey;
  
ALTER TABLE public.entitlement_consumptions
  ADD CONSTRAINT entitlement_consumptions_report_id_fkey 
    FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE SET NULL;

ALTER TABLE public.entitlement_consumptions 
  DROP CONSTRAINT IF EXISTS entitlement_consumptions_report_run_id_fkey;

ALTER TABLE public.entitlement_consumptions
  ADD CONSTRAINT entitlement_consumptions_report_run_id_fkey 
    FOREIGN KEY (report_run_id) REFERENCES public.report_runs(id) ON DELETE SET NULL;

-- 2. Add RLS policy for users to delete their own reports
CREATE POLICY "Users can delete own reports"
  ON public.reports
  FOR DELETE
  USING (auth.uid() = user_id);

-- 3. Add RLS policy for users to delete their own report runs (via application ownership)
CREATE POLICY "Users can delete own report runs"
  ON public.report_runs
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM applications
    WHERE applications.id = report_runs.application_id
    AND applications.user_id = auth.uid()
  ));
```

### Part 2: UI Changes - Dashboard (Applications)

**File: `src/pages/Dashboard.tsx`**

Currently, delete is only allowed for `draft` status. Extend to **all statuses** with appropriate confirmation messaging:

1. Remove the `app.status === "draft"` condition (line 319)
2. Update the confirmation dialog to show different messages based on status
3. For applications with reports, warn that reports will also be deleted

```typescript
// Current (line 319-331):
{app.status === "draft" && (
  <Button variant="ghost" size="icon" ...>

// Updated:
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 text-muted-foreground hover:text-destructive"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDeleteApplication(app);
  }}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

Update confirmation dialog messaging:
- Draft: "This will permanently delete the draft."
- Ready/In Progress: "This will permanently delete the application and all generated reports."
- Failed: "This will permanently delete the application."

### Part 3: UI Changes - Reports List

**File: `src/components/workspace/ReportsList.tsx`**

Add delete button for each report:

1. Add state for `reportToDelete` and `deleteReportModalOpen`
2. Add `onDelete` callback prop or handle inline
3. Add Trash2 icon button beside each report row
4. Add confirmation dialog
5. Call `supabase.from("reports").delete().eq("id", reportId)`

```typescript
interface ReportsListProps {
  reports: Report[];
  isLoading: boolean;
  onDownload: (reportId: string, format: "pdf" | "docx") => void;
  onDeleteReport?: (reportId: string) => void;  // New callback
  grantName?: string;
}

// Add delete button in the row (before View button):
<Button
  variant="ghost"
  size="icon"
  className="h-8 w-8 text-muted-foreground hover:text-destructive"
  onClick={() => handleDeleteReport(report)}
>
  <Trash2 className="h-4 w-4" />
</Button>
```

### Part 4: Hook Updates

**File: `src/hooks/useReportGeneration.ts`**

Add a `deleteReport` function:

```typescript
const deleteReport = useCallback(async (reportId: string) => {
  const { error } = await supabase
    .from("reports")
    .delete()
    .eq("id", reportId);

  if (error) {
    toast({
      title: "Error deleting report",
      description: error.message,
      variant: "destructive",
    });
    return false;
  }

  // Remove from local state
  setReports(prev => prev.filter(r => r.id !== reportId));
  toast({
    title: "Report deleted",
    description: "The report has been permanently removed.",
  });
  return true;
}, [toast]);
```

---

## Files to Modify

| File | Changes |
|------|---------|
| **Database Migration** | Add ON DELETE SET NULL to entitlement_consumptions FKs, add DELETE policies for reports and report_runs |
| `src/pages/Dashboard.tsx` | Enable delete for all application statuses (not just drafts), update confirmation messaging |
| `src/components/workspace/ReportsList.tsx` | Add delete button with confirmation dialog for each report |
| `src/hooks/useReportGeneration.ts` | Add `deleteReport` function, export in return object |

---

## UX Considerations

1. **Delete Application**: Shows different warnings based on status
   - Draft: Simple deletion
   - Ready: Warns that reports will be deleted
   - In Progress: May need to cancel run first (or block deletion)

2. **Delete Report**: Simple confirmation
   - "Delete Report v{version_number}?"
   - "This will permanently delete this report. The application and other reports will not be affected."

3. **Cascade Behavior**:
   - Deleting an application cascades to all its reports and report_runs
   - Deleting a report only deletes that report (not the application or other reports)
   - Entitlement consumption records are preserved (with NULL references) for billing audit

---

## Expected Behavior After Implementation

1. **Dashboard**: All application cards show delete button
2. **Application deletion**: Confirmation shows appropriate warning based on status
3. **Reports list**: Each report row has a delete button
4. **Report deletion**: Confirmation dialog, then remove from UI
5. **Database**: Cascades work correctly, entitlement history preserved
