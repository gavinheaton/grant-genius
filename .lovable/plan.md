

## Add Admin Delete Button for Applications

### Problem
Admins can view all applications in the `/admin/manual-queue` page but cannot delete them. The current RLS policies only allow users to delete their own applications -- there is no admin DELETE policy on the `applications` table.

### Changes

**1. Database migration -- Add admin DELETE policy**

Add an RLS policy so admins can delete any application:
```sql
CREATE POLICY "Admins can delete applications"
ON public.applications FOR DELETE
USING (is_admin(auth.uid()));
```

**2. Update `src/pages/admin/ManualQueue.tsx`**

- Import `Trash2` icon from lucide-react and `AlertDialog` components for a confirmation dialog
- Add a `deleteApplicationMutation` that deletes an application by ID via Supabase
- Add a `deletingId` state to track which application is pending confirmation
- Add a red delete (trash) button in the Actions column of the **All Applications** table for each row
- Clicking the button opens a confirmation dialog warning that this will permanently delete the application and all associated reports/runs
- On confirm, execute the delete and invalidate both query keys (`admin-all-applications` and `manual-queue`)
- Show a success toast on completion

### Technical Details

| Item | Detail |
|---|---|
| New RLS policy | `Admins can delete applications` -- DELETE policy using `is_admin(auth.uid())` |
| UI location | Actions column added to the All Applications table (right-most column) |
| Confirmation | AlertDialog with destructive styling and application title shown |
| Cascade | The existing database cascade handles cleaning up reports and runs |
| Queries invalidated | `admin-all-applications`, `manual-queue` |

