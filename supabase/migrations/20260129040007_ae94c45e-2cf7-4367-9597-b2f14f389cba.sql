-- Function to get 7-day trend data for report runs
CREATE OR REPLACE FUNCTION public.get_report_trend_7_days()
RETURNS TABLE (
  date DATE,
  started INTEGER,
  completed INTEGER,
  failed INTEGER
) 
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    DATE(created_at) as date,
    COUNT(*)::INTEGER as started,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::INTEGER as completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::INTEGER as failed
  FROM report_runs
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY date DESC;
$$;