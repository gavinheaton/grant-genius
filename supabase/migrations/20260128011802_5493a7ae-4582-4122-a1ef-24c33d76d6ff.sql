-- Fix: Restrict grant_versions access to authenticated users only
-- This prevents competitors from accessing proprietary grant guidelines

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Anyone can view published grant versions" ON public.grant_versions;

-- Create a new policy that requires authentication
CREATE POLICY "Authenticated users can view published grant versions" 
ON public.grant_versions 
FOR SELECT 
USING (is_published = true AND auth.uid() IS NOT NULL);