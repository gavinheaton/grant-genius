
## Allow Admins to Export Any User's Report (PDF and DOCX)

### Problem
Both `generate-pdf` and `generate-docx` edge functions include a hardcoded `.eq("user_id", userId)` filter on the reports query. This means admins like Joanne cannot export reports belonging to other users, even though RLS already grants admins SELECT access to all reports.

### Solution
Remove the `.eq("user_id", userId)` filter from both functions. RLS policies already handle access control correctly -- admins can SELECT all reports, and regular users can only SELECT their own. The redundant application-level filter is the sole cause of the issue.

### Technical Changes

**File: `supabase/functions/generate-pdf/index.ts`** (line 831)
- Remove `.eq("user_id", userId)` from the report query
- RLS policy "Admins can view all reports" already ensures admins get access; "Users can view own reports" restricts regular users

**File: `supabase/functions/generate-docx/index.ts`** (line 1241)
- Remove `.eq("user_id", userId)` from the report query
- Same RLS protection applies

No database changes needed. Both functions will auto-deploy.
