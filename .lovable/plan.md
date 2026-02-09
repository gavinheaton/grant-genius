

## Allow Any Admin to Edit Prompt Bundles

Currently only Super Admins can create, update, and delete prompt bundles and their steps. This change updates the RLS policies so any Admin (including Super Admin) has full write access.

### Database Migration

Update 6 RLS policies across 2 tables:

**`prompt_bundles`** -- change 3 policies:
- "Super admins can delete prompt bundles" -> "Admins can delete prompt bundles" (using `is_admin()`)
- "Super admins can insert prompt bundles" -> "Admins can insert prompt bundles" (using `is_admin()`)
- "Super admins can update prompt bundles" -> "Admins can update prompt bundles" (using `is_admin()`)

**`prompt_bundle_steps`** -- change 3 policies:
- "Super admins can delete prompt bundle steps" -> "Admins can delete prompt bundle steps" (using `is_admin()`)
- "Super admins can insert prompt bundle steps" -> "Admins can insert prompt bundle steps" (using `is_admin()`)
- "Super admins can update prompt bundle steps" -> "Admins can update prompt bundle steps" (using `is_admin()`)

### What Changes

| Before | After |
|--------|-------|
| `has_role(auth.uid(), 'super_admin')` | `is_admin(auth.uid())` |
| Only Super Admins can edit | Any Admin or Super Admin can edit |

### No Frontend Changes Required

The frontend already uses the `useAuth` hook which provides `isAdmin` -- no UI gating changes are needed since the admin pages are already accessible to all admins.

