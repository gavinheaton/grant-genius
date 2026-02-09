

## Add "Testing" Toggle for Grants

Allow admins to mark a grant as "Testing" so it only appears in the grant dropdown for admin users, enabling pipeline testing before wider release.

### How It Works

- A new `is_testing` column on the `grants` table (default `false`)
- When `is_testing = true`, the grant appears in the admin grant list with a "Testing" badge
- On the New Application page, testing grants are filtered out for regular researchers but shown for admins
- Admins can toggle this on/off from the Grant Edit page

### Changes

**1. Database migration**

Add an `is_testing` boolean column to the `grants` table:

```sql
ALTER TABLE public.grants ADD COLUMN is_testing boolean NOT NULL DEFAULT false;
```

No RLS changes needed -- the existing "Anyone can view active grants" policy still applies; the filtering happens at the application level.

**2. Grant Edit page (`src/pages/admin/GrantEdit.tsx`)**

Add a "Testing Mode" toggle (Switch) next to the existing "Active" toggle in the Details tab. When toggled on, the grant is only visible to admins in the application dropdown.

**3. Grants list (`src/pages/admin/Grants.tsx`)**

Show a "Testing" badge on grants where `is_testing = true`, so admins can quickly see which grants are in test mode.

**4. New Application page (`src/pages/NewApplication.tsx`)**

Update the grant-fetching query:
- Fetch the current user's role from `user_roles`
- If the user is an admin/super_admin, show all active grants (including testing ones)
- If the user is a regular researcher, filter out grants where `is_testing = true`

**5. Types update**

The `is_testing` column will be automatically reflected in the generated Supabase types after migration.

### Technical Details

| File | Change |
|------|--------|
| Migration SQL | Add `is_testing` column to `grants` |
| `src/pages/admin/GrantEdit.tsx` | Add Testing Mode toggle + state |
| `src/pages/admin/Grants.tsx` | Show "Testing" badge in grant list |
| `src/pages/NewApplication.tsx` | Filter testing grants for non-admin users |

