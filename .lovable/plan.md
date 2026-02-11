

## Add Credits, Reports Count, and Delete to Admin Users Page

### What Changes

The `/admin/users` table will show two new columns: **Credits Remaining** and **Reports Generated**. A **Delete** button (Super Admin only) will allow removing users entirely, with a confirmation dialog.

### Data Sources

- **Credits remaining**: Calculated from `entitlements` table -- `SUM(quantity - used_quantity)` for non-expired `REPORT_ONE_OFF` entitlements per user
- **Reports generated**: Count of rows in the `reports` table per user

### Implementation

#### 1. Update the Users page query (`src/pages/admin/Users.tsx`)

Extend the existing query to also fetch:
- All entitlements (admin RLS already allows this): `supabase.from("entitlements").select("user_id, quantity, used_quantity, expires_at, entitlement_type")`
- All reports (admin RLS allows this): `supabase.from("reports").select("user_id")`

Then aggregate per-user:
- **Credits**: sum of `(quantity - used_quantity)` for non-expired `REPORT_ONE_OFF` entitlements
- **Reports**: count of report rows

Add two new table columns between "Joined" and "Actions":
- **Credits** -- shows the remaining count (e.g., "3")
- **Reports** -- shows the generated count (e.g., "7")

#### 2. Add Delete button and confirmation dialog

- Add a `Trash2` icon button next to the existing `Eye` button, visible only for Super Admins
- Cannot delete yourself (button disabled/hidden for current user)
- Clicking opens an `AlertDialog` confirming: "Delete user {email}? This will permanently remove their account, applications, reports, and all associated data."
- On confirm, calls a new edge function `delete-user`

#### 3. New edge function: `supabase/functions/delete-user/index.ts`

- Accepts `{ userId: string }` in body
- Validates the caller is a Super Admin (via service role query on `user_roles`)
- Calls `supabase.auth.admin.deleteUser(userId)` using the service role key
- The `ON DELETE CASCADE` on foreign keys in `user_roles` handles role cleanup; other tables (profiles, applications, etc.) may need manual cleanup if they don't cascade
- Returns success/error

#### 4. Database: check cascade behavior

Review whether `profiles.user_id`, `applications.user_id`, `entitlements.user_id`, `orders.user_id`, and `reports.user_id` have `ON DELETE CASCADE` from `auth.users`. If not, the edge function will delete related rows manually before deleting the auth user, or we add a migration for cascades.

### Files Changed

| File | Change |
|---|---|
| `src/pages/admin/Users.tsx` | Add credits/reports columns, delete button with AlertDialog, delete mutation |
| `supabase/functions/delete-user/index.ts` | New edge function for Super Admin user deletion |

### Security

- Delete is restricted to **Super Admin** only (both UI-gated and server-validated)
- Edge function verifies caller role server-side using service role key
- Cannot delete your own account from this page

