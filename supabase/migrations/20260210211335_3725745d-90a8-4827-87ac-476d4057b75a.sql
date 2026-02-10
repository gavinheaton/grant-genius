-- Allow admins to read any report (needed for review workflow)
CREATE POLICY "Admins can view all reports"
  ON public.reports FOR SELECT
  USING (is_admin(auth.uid()));

-- Allow admins to update any report (needed for editing in review)
CREATE POLICY "Admins can update all reports"
  ON public.reports FOR UPDATE
  USING (is_admin(auth.uid()));