-- Block anonymous access to profiles table to prevent email harvesting
CREATE POLICY "Block anonymous access to profiles"
ON public.profiles FOR SELECT
USING (auth.uid() IS NOT NULL);