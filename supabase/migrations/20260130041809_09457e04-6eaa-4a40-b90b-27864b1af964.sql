-- Block anonymous access to user_roles table
-- This prevents attackers from identifying admin accounts for social engineering attacks
CREATE POLICY "Block anonymous access to user_roles"
ON public.user_roles
AS RESTRICTIVE
FOR SELECT
USING (auth.uid() IS NOT NULL);