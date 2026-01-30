import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ReportLog {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  details?: Record<string, unknown> | null;
}

interface UseReportLogsOptions {
  maxLogs?: number;
}

export function useReportLogs(reportRunId: string | null | undefined, options: UseReportLogsOptions = {}) {
  const { maxLogs = 100 } = options;
  const [logs, setLogs] = useState<ReportLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial logs
  const fetchLogs = useCallback(async () => {
    if (!reportRunId) {
      setLogs([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("report_logs")
        .select("id, timestamp, level, message, details")
        .eq("report_run_id", reportRunId)
        .order("timestamp", { ascending: true })
        .limit(maxLogs);

      if (fetchError) throw fetchError;

      const formattedLogs: ReportLog[] = (data || []).map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level as "info" | "warn" | "error",
        message: log.message,
        details: log.details as Record<string, unknown> | null,
      }));

      setLogs(formattedLogs);
    } catch (err) {
      console.error("Error fetching report logs:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch logs");
    } finally {
      setIsLoading(false);
    }
  }, [reportRunId, maxLogs]);

  // Set up realtime subscription
  useEffect(() => {
    if (!reportRunId) {
      setLogs([]);
      return;
    }

    // Fetch initial logs
    fetchLogs();

    // Subscribe to new logs
    const channel = supabase
      .channel(`report-logs-${reportRunId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "report_logs",
          filter: `report_run_id=eq.${reportRunId}`,
        },
        (payload) => {
          const newLog: ReportLog = {
            id: payload.new.id,
            timestamp: payload.new.timestamp,
            level: payload.new.level as "info" | "warn" | "error",
            message: payload.new.message,
            details: payload.new.details as Record<string, unknown> | null,
          };

          setLogs((prev) => {
            const updated = [...prev, newLog];
            // Keep only the most recent logs
            if (updated.length > maxLogs) {
              return updated.slice(-maxLogs);
            }
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reportRunId, maxLogs, fetchLogs]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    isLoading,
    error,
    clearLogs,
    refetch: fetchLogs,
  };
}
