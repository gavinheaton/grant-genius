

# Fix Admin Dashboard - Active/Stalled Runs Not Showing

## Problem

Joanne's running report (`7b279e5c-61dc-4bab-990c-c2af995d8ca2`) is not appearing in the Admin Dashboard's "Currently Running" card or "Active Runs" table, even though:
- The report has `status: running` 
- It's been running for 12+ minutes (should show as stalled)
- The data exists correctly in the database

## Root Cause

The Supabase query uses `profiles:user_id(email)` to fetch user emails, but **there is no foreign key relationship** between `applications.user_id` and `profiles.user_id`. PostgREST requires a foreign key to resolve the nested relationship syntax.

Without the foreign key, PostgREST either:
- Returns null for the profiles object
- Fails to match rows correctly
- Or in some cases, filters out the row entirely

## Solution

Add a foreign key constraint from `profiles.user_id` to `auth.users.id`. This allows PostgREST to understand the relationship chain:

```
report_runs → applications (via application_id)
           → applications.user_id → profiles.user_id (via FK to auth.users)
```

### Database Migration

```sql
-- Add foreign key from profiles.user_id to auth.users.id
-- This enables PostgREST to resolve the profiles:user_id() syntax
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
```

### Why This Works

PostgREST uses foreign keys to determine how tables relate. With this constraint:
1. `profiles.user_id` → `auth.users.id` is established
2. `applications.user_id` and `profiles.user_id` both point to `auth.users.id`
3. PostgREST can now infer that `profiles:user_id` means "join profiles where profiles.user_id = applications.user_id"

## Alternative Approach (If FK Cannot Be Added)

If adding the foreign key is not desired, the dashboard queries would need to be rewritten to use raw SQL via RPC functions, or fetch profiles in a separate query:

```typescript
// Fetch runs first
const runs = await supabase
  .from("report_runs")
  .select(`id, status, ..., applications!inner(title, user_id)`)
  .in("status", ["running", "pending"]);

// Then fetch profiles separately
const userIds = runs.data.map(r => r.applications.user_id);
const profiles = await supabase
  .from("profiles")
  .select("user_id, email")
  .in("user_id", userIds);

// Merge manually
```

This is more complex but avoids needing to modify database constraints.

## Recommended Action

Add the foreign key constraint - it's the cleanest solution and aligns with Supabase best practices for the `profiles` table pattern.

## Technical Details

| Component | File | Change |
|-----------|------|--------|
| Database | Migration | Add FK constraint on `profiles.user_id` |
| No code changes needed | - | Once FK exists, existing queries will work |

