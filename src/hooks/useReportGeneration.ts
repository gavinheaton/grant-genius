import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReportRun {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  current_step: number;
  total_steps: number;
  created_at: string;
}

interface Report {
  id: string;
  version_number: number;
  created_at: string;
  pdf_path: string | null;
  docx_path: string | null;
}

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

  // Check for active report runs
  const checkActiveRun = useCallback(async () => {
    if (!applicationId) return;

    const { data, error } = await supabase
      .from("report_runs")
      .select("id, status, current_step, total_steps, created_at")
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
      setActiveRun(data as ReportRun);
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
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to start report generation",
        variant: "destructive",
      });
    }
  }, [applicationId, toast, checkActiveRun]);

  // Poll for updates when generating
  useEffect(() => {
    if (!isGenerating || !applicationId) return;

    const pollInterval = setInterval(async () => {
      await checkActiveRun();
      await fetchReports();
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [isGenerating, applicationId, checkActiveRun, fetchReports]);

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

  return {
    isGenerating,
    activeRun,
    reports,
    isLoadingReports,
    startGeneration,
    downloadReport,
    refetch: fetchReports,
  };
}
