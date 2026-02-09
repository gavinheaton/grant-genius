-- Drop the overly restrictive policy that only shows auth-required pages to authenticated users
DROP POLICY IF EXISTS "Authenticated users can view auth-required pages" ON public.cms_pages;

-- Create a new policy that allows authenticated users to see ALL published pages
CREATE POLICY "Authenticated users can view all published pages"
ON public.cms_pages
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (is_published = true);