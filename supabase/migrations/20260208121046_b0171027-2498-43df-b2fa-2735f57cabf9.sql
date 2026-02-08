-- Enable realtime for grant_versions table to support live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.grant_versions;