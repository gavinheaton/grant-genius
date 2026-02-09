
# Fix: Authenticated Users Cannot See Public CMS Pages

## Problem

The RLS policy for authenticated users is incorrectly filtering out public pages:

| User Type | Current Policy | Result |
|-----------|---------------|--------|
| Anonymous | `is_published = true AND requires_auth = false` | Sees public pages only |
| Authenticated | `is_published = true AND requires_auth = true` | Sees auth-required pages only |
| Admin | `is_admin(auth.uid())` | Sees all pages |

**The Disclaimer page has `requires_auth = false`**, so authenticated (non-admin) users cannot see it - but anonymous users can!

## Solution

Update the authenticated user policy to allow viewing ALL published pages:

```sql
-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Authenticated users can view auth-required pages" ON public.cms_pages;

-- Create a new policy that allows authenticated users to see ALL published pages
CREATE POLICY "Authenticated users can view all published pages"
ON public.cms_pages
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (is_published = true);
```

## Why This Is Correct

- **Anonymous users**: See only public pages (`requires_auth = false`) - unchanged
- **Authenticated users**: See ALL published pages (both public and auth-required)
- **Admins**: See all pages including unpublished drafts - unchanged

This matches the expected behavior where authentication unlocks more content, not less.

## Technical Details

- **Change scope**: Single database migration only
- **No frontend changes required**
- **Tables affected**: `cms_pages` RLS policies
