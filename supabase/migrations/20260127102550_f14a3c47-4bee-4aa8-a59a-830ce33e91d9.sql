-- Add restrictive policy to block anonymous access to profiles table
CREATE POLICY "Block anonymous access to profiles"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- Add restrictive policy to block anonymous access to email_outbox table
CREATE POLICY "Block anonymous access to email_outbox"
ON public.email_outbox
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- Add restrictive policy to block anonymous access to email_templates table
CREATE POLICY "Block anonymous access to email_templates"
ON public.email_templates
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);