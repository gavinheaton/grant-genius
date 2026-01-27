-- Allow users to update their own report runs (for retry/cancel)
CREATE POLICY "Users can update own report runs"
  ON report_runs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = report_runs.application_id
      AND applications.user_id = auth.uid()
    )
  );