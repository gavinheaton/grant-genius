-- Remove the overly restrictive policy that blocks ALL access (including authenticated users)
-- The existing "Users can view own profile" and "Admins can view all profiles" policies 
-- already provide proper access control
DROP POLICY IF EXISTS "Block anonymous access to profiles" ON public.profiles;