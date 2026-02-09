

# Fix: CMS Pages Not Appearing in Menu

## Problem Identified

The network requests show the API is returning an empty array `[]` for the menu pages query, even though the page exists in the database with the correct flags set (`is_published: true`, `show_in_menu: true`, `requires_auth: false`).

**Root Cause**: The RLS policies on `cms_pages` were created as **RESTRICTIVE** policies instead of **PERMISSIVE** policies. When multiple restrictive policies exist, PostgreSQL requires ALL policies to pass for a row to be returned. Since the conditions are mutually exclusive (e.g., "anyone can view public pages" vs "authenticated users can view auth-required pages"), no rows are ever returned.

---

## Current vs Required Behavior

```text
CURRENT (RESTRICTIVE - broken):
┌─────────────────────────────────────────────────────┐
│ Policy 1: is_published=true AND requires_auth=false │──┐
│ Policy 2: is_published=true AND requires_auth=true  │──┼── ALL must pass
│ Policy 3: is_admin(auth.uid())                      │──┘   (impossible!)
└─────────────────────────────────────────────────────┘
Result: No rows returned

REQUIRED (PERMISSIVE - correct):
┌─────────────────────────────────────────────────────┐
│ Policy 1: is_published=true AND requires_auth=false │──┐
│ Policy 2: is_published=true AND requires_auth=true  │──┼── ANY can pass
│ Policy 3: is_admin(auth.uid())                      │──┘   (works!)
└─────────────────────────────────────────────────────┘
Result: Rows returned if ANY policy passes
```

---

## Solution

Create a migration to drop and recreate the SELECT policies with explicit `AS PERMISSIVE`:

```sql
-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Anyone can view public published pages" ON public.cms_pages;
DROP POLICY IF EXISTS "Authenticated users can view auth-required pages" ON public.cms_pages;
DROP POLICY IF EXISTS "Admins can view all pages" ON public.cms_pages;

-- Recreate as PERMISSIVE (OR logic between policies)
CREATE POLICY "Anyone can view public published pages"
ON public.cms_pages
AS PERMISSIVE
FOR SELECT
TO public
USING (is_published = true AND requires_auth = false);

CREATE POLICY "Authenticated users can view auth-required pages"
ON public.cms_pages
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (is_published = true AND requires_auth = true);

CREATE POLICY "Admins can view all pages"
ON public.cms_pages
AS PERMISSIVE
FOR SELECT
USING (is_admin(auth.uid()));
```

---

## Why This Happens

PostgreSQL RLS has two policy types:
- **PERMISSIVE** (default): Rows visible if ANY permissive policy passes (OR logic)
- **RESTRICTIVE**: Rows visible only if ALL restrictive policies pass (AND logic)

The migration likely created restrictive policies unintentionally. The fix ensures proper OR logic so:
- Anonymous users see published public pages
- Authenticated users see published pages (both public and auth-required)
- Admins see all pages

---

## Implementation

1. Run a database migration to drop and recreate the three SELECT policies with `AS PERMISSIVE`
2. Test that the menu and footer pages appear correctly

---

## Files Changed

**Database migration only** - no frontend code changes needed since the code is correct; it's just not receiving data due to the RLS issue.

