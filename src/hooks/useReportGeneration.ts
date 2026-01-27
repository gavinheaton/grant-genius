import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReportRun {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "stalled";
  current_step: number;
  total_steps: number;
  created_at: string;
  started_at: string | null;
}

interface Report {
  id: string;
  version_number: number;
  created_at: string;
  pdf_path: string | null;
  docx_path: string | null;
}

// 5 minutes stale threshold
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export function useReportGeneration(applicationId: string | undefined) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeRun, setActiveRun] = useState<ReportRun | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);

  // Fetch existing reports for this application
  const fetchReports = useCallback(async () => {
    if (!applicationId) return;

    const { data, error } = await supabase
      .from("reports")
      .select("id, version_number, created_at, pdf_path, docx_path")
      .eq("application_id", applicationId)
      .order("version_number", { ascending: false });

    if (error) {
      console.error("Error fetching reports:", error);
    } else {
      setReports(data || []);
    }
    setIsLoadingReports(false);
  }, [applicationId]);

  // Check for active report runs with stale detection
  const checkActiveRun = useCallback(async () => {
    if (!applicationId) return;

    const { data, error } = await supabase
      .from("report_runs")
      .select("id, status, current_step, total_steps, created_at, started_at")
      .eq("application_id", applicationId)
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error checking active run:", error);
      return;
    }

    if (data) {
      // Check if the run is stale (older than threshold)
      const startedAt = new Date(data.started_at || data.created_at);
      const now = new Date();
      const isStale = now.getTime() - startedAt.getTime() > STALE_THRESHOLD_MS;

      if (isStale) {
        // Mark as stalled for UI
        setActiveRun({
          ...data,
          status: "stalled" as const,
        } as ReportRun);
      } else {
        setActiveRun(data as ReportRun);
      }
      setIsGenerating(true);
    } else {
      setActiveRun(null);
      setIsGenerating(false);
    }
  }, [applicationId]);

  // Start report generation
  const startGeneration = useCallback(async () => {
    if (!applicationId) return;

    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: { applicationId },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast({
        title: "Report generation started",
        description: "This typically takes 2-3 minutes. You'll see progress updates below.",
      });

      // Start polling for updates
      checkActiveRun();
    } catch (error) {
      console.error("Error starting generation:", error);
      setIsGenerating(false);
      
      const errorMessage = error instanceof Error ? error.message : "Failed to start report generation";
      
      // Check for rate limit or service errors
      if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
        toast({
          title: "High demand",
          description: "The AI service is busy. Please wait a minute and try again.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("402")) {
        toast({
          title: "Service unavailable",
          description: "Please add credits to your workspace and try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Generation failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  }, [applicationId, toast, checkActiveRun]);

  // Auto-resume from checkpoint when detected
  const resumeFromCheckpoint = useCallback(async (runId: string) => {
    try {
      console.log("Resuming report generation from checkpoint...");
      const { error } = await supabase.functions.invoke("resume-report-run", {
        body: { reportRunId: runId },
      });

      if (error) {
        console.error("Error resuming from checkpoint:", error);
        toast({
          title: "Resume failed",
          description: "Failed to resume report generation. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error resuming from checkpoint:", error);
    }
  }, [toast]);

  // Poll for updates when generating
  useEffect(() => {
    if (!isGenerating || !applicationId) return;

    const pollInterval = setInterval(async () => {
      await checkActiveRun();
      await fetchReports();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [isGenerating, applicationId, checkActiveRun, fetchReports]);

  // Detect checkpoint status and auto-resume (step 5 OR step 8)
  useEffect(() => {
    if (activeRun && activeRun.status === "pending") {
      // Checkpoint at step 5 (Phase 2) or step 8 (Phase 3) - trigger resume
      if (activeRun.current_step === 5 || activeRun.current_step === 8) {
        resumeFromCheckpoint(activeRun.id);
      }
    }
  }, [activeRun, resumeFromCheckpoint]);

  // Initial fetch
  useEffect(() => {
    fetchReports();
    checkActiveRun();
  }, [fetchReports, checkActiveRun]);

  // Download report
  const downloadReport = useCallback(async (reportId: string, format: "pdf" | "docx") => {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;

    const path = format === "pdf" ? report.pdf_path : report.docx_path;
    if (!path) {
      toast({
        title: "Download unavailable",
        description: `${format.toUpperCase()} version is not available for this report.`,
        variant: "destructive",
      });
      return;
    }

    // For now, just show a toast - actual download implementation will come with storage
    toast({
      title: "Download started",
      description: `Downloading ${format.toUpperCase()} report...`,
    });
  }, [reports, toast]);

  // Cancel a stalled/stuck report run
  const cancelRun = useCallback(async (runId: string) => {
    try {
      const { error } = await supabase.functions.invoke("cancel-report-run", {
        body: { reportRunId: runId },
      });

      if (error) {
        throw error;
      }

      setActiveRun(null);
      setIsGenerating(false);
      toast({
        title: "Generation cancelled",
        description: "You can try again when ready.",
      });
    } catch (error) {
      console.error("Error cancelling run:", error);
      toast({
        title: "Failed to cancel",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    }
  }, [toast]);

  return {
    isGenerating,
    activeRun,
    reports,
    isLoadingReports,
    startGeneration,
    downloadReport,
    cancelRun,
    refetch: fetchReports,
  };
}
