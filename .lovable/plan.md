
# Fix: PostgREST 404 on Admin Dashboard Queries

## Problem
The Admin Dashboard queries are failing with 404 because PostgREST cannot resolve the embedded resource `profiles:user_id(email)` in queries like:

```sql
applications!inner(title, user_id, profiles:user_id(email))
```

## Root Cause
PostgREST uses **foreign key relationships** to enable embedded resources. While the database has:
- `report_runs.application_id` → `applications.id` (works)
- `applications.user_id` → `auth.users.id` (exists but points to auth schema)
- `profiles.user_id` → `auth.users.id` (exists but points to auth schema)

There is **no direct foreign key** from `applications` to `profiles`. PostgREST cannot infer that `applications.user_id` and `profiles.user_id` share the same values.

## Solution

### Option A: Add a foreign key from profiles to itself as a lookup table (Recommended)
Create a FK relationship so PostgREST can navigate from `applications.user_id` to `profiles.user_id`:

```sql
ALTER TABLE public.applications
ADD CONSTRAINT applications_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
ON DELETE CASCADE;
```

**Prerequisite**: The `profiles.user_id` column must have a UNIQUE constraint (it likely does since it references auth.users which is unique).

### Option B: Rewrite queries to avoid nested embedding
Change the Admin Dashboard queries to fetch profiles separately:

```typescript
// Instead of:
.select(`..., applications!inner(title, user_id, profiles:user_id(email))`)

// Use:
.select(`..., applications!inner(title, user_id)`)
// Then fetch emails separately via profiles table
```

This is more verbose but avoids schema changes.

## Implementation Steps

### Step 1: Add UNIQUE constraint on profiles.user_id (if missing)
```sql
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
```

### Step 2: Add foreign key from applications to profiles
```sql
ALTER TABLE public.applications
ADD CONSTRAINT applications_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
ON DELETE CASCADE;
```

### Step 3: Verify the query works
Test that the Admin Dashboard query now resolves correctly.

## Why 404 Specifically?
PostgREST returns 404 when it cannot find a valid relationship path for the embedded resource syntax. The `profiles:user_id` hint tells PostgREST "join profiles using the user_id column", but without a FK, PostgREST doesn't know how to make that join.

## Files Affected
- Database migration (new SQL migration file)
- No frontend code changes needed - the queries are already correct, they just need the FK to exist

## Risk Assessment
- **Low risk**: Adding a FK is a constraint that validates existing data; if all `applications.user_id` values already exist in `profiles.user_id`, the migration will succeed
- **If migration fails**: It means there are orphaned applications without matching profiles, which would need cleanup first
