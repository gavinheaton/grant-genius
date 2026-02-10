CREATE POLICY "Admins can delete applications"
ON public.applications FOR DELETE
USING (is_admin(auth.uid()));