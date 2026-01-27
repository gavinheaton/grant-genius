-- Add email_on_complete column to report_runs table
ALTER TABLE report_runs ADD COLUMN email_on_complete boolean DEFAULT false;