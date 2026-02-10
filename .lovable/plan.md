
## Fix: Admin Access to Reports for Review Editing

### Problem
Two missing RLS policies prevent the review page from working for admins:
1. **`reports` table** -- no admin SELECT policy, so the report content never loads
2. **`reports` table** -- no admin UPDATE policy, so saving edits back to the report would fail

The `report_reviews` table already has correct policies (admin SELECT, admin INSERT, and reviewer UPDATE).

### Fix

**Database Migration** -- Add two RLS policies to the `reports` table:

```sql
-- Allow admins to read any report (needed for review workflow)
CREATE POLICY "Admins can view all reports"
  ON public.reports FOR SELECT
  USING (is_admin(auth.uid()));

-- Allow admins to update any report (needed for editing in review)
CREATE POLICY "Admins can update all reports"
  ON public.reports FOR UPDATE
  USING (is_admin(auth.uid()));
```

### No code changes needed
The `ReportReview.tsx` component already has the full edit/preview UI with HTML editing, save draft, and approve buttons. Once the data is accessible via these policies, everything will work -- the report content will load into the editor and admins can save their edits.
