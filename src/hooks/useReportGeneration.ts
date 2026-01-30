import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

interface ReportRun {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "stalled";
  current_step: number;
  total_steps: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  email_on_complete: boolean;
}

export interface Report {
  id: string;
  version_number: number;
  created_at: string;
  pdf_path: string | null;
  docx_path: string | null;
  content_json?: Json;
}

export interface ReportRunStep {
  step_number: number;
  step_name: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

// 5 minutes stale threshold
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

interface UseReportGenerationOptions {
  onNoCredits?: () => void;
}

export function useReportGeneration(
  applicationId: string | undefined,
  options?: UseReportGenerationOptions
) {
  const { toast } = useToast();
  const [isStarting, setIsStarting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeRun, setActiveRun] = useState<ReportRun | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [steps, setSteps] = useState<ReportRunStep[]>([]);

  // Calculate completed steps from steps array
  const completedSteps = steps.filter(s => s.status === 'completed').length;

  // Fetch existing reports for this application
  const fetchReports = useCallback(async () => {
    if (!applicationId) return;

    const { data, error } = await supabase
      .from("reports")
      .select("id, version_number, created_at, pdf_path, docx_path, content_json")
      .eq("application_id", applicationId)
      .order("version_number", { ascending: false });

    if (error) {
      console.error("Error fetching reports:", error);
    } else {
      setReports(data || []);
    }
    setIsLoadingReports(false);
  }, [applicationId]);

  // Fetch steps for the active run
  const fetchSteps = useCallback(async (runId: string) => {
    const { data, error } = await supabase
      .from("report_run_steps")
      .select("step_number, step_name, status, started_at, completed_at, error_message")
      .eq("report_run_id", runId)
      .order("step_number", { ascending: true });

    if (error) {
      console.error("Error fetching steps:", error);
    } else {
      setSteps((data as ReportRunStep[]) || []);
    }
  }, []);

  // Check for active report runs with stale detection
  const checkActiveRun = useCallback(async () => {
    if (!applicationId) return;

    const { data, error } = await supabase
      .from("report_runs")
      .select("id, status, current_step, total_steps, created_at, started_at, completed_at, email_on_complete")
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

      const runData: ReportRun = {
        ...data,
        status: isStale ? "stalled" : data.status,
        completed_at: data.completed_at ?? null,
        email_on_complete: data.email_on_complete ?? false,
      } as ReportRun;

      setActiveRun(runData);
      setIsGenerating(true);
      
      // Fetch steps for this run
      fetchSteps(data.id);
    } else {
      setActiveRun(null);
      setIsGenerating(false);
      setSteps([]);
    }
  }, [applicationId, fetchSteps]);

  // Subscribe to Realtime changes for steps
  useEffect(() => {
    if (!isGenerating || !activeRun?.id) return;

    const channel = supabase
      .channel(`report-steps-${activeRun.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'report_run_steps',
          filter: `report_run_id=eq.${activeRun.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newStep = payload.new as ReportRunStep;
            setSteps(prev => {
              // Avoid duplicates
              if (prev.some(s => s.step_number === newStep.step_number)) {
                return prev.map(s => s.step_number === newStep.step_number ? newStep : s);
              }
              return [...prev, newStep].sort((a, b) => a.step_number - b.step_number);
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedStep = payload.new as ReportRunStep;
            setSteps(prev => prev.map(s => 
              s.step_number === updatedStep.step_number ? updatedStep : s
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGenerating, activeRun?.id]);

  // Subscribe to Realtime changes for report_runs (instant status detection)
  useEffect(() => {
    if (!isGenerating || !activeRun?.id) return;

    const channel = supabase
      .channel(`report-run-${activeRun.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'report_runs',
          filter: `id=eq.${activeRun.id}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            status: "pending" | "running" | "completed" | "failed";
            current_step: number;
            total_steps: number;
            created_at: string;
            started_at: string | null;
            completed_at: string | null;
            email_on_complete: boolean;
          };

          // Update activeRun state with new data
          setActiveRun(prev => prev ? {
            ...prev,
            status: updated.status,
            current_step: updated.current_step,
            total_steps: updated.total_steps,
            completed_at: updated.completed_at,
          } : null);

          // Detect completion
          if (updated.status === 'completed') {
            setIsGenerating(false);
            fetchReports();
            toast({
              title: "Report ready!",
              description: "Your report has been generated successfully.",
            });
          }

          // Detect failure
          if (updated.status === 'failed') {
            setIsGenerating(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isGenerating, activeRun?.id, fetchReports, toast]);

  // Check if generate-report function is deployed (preflight check)
  const checkFunctionDeployment = useCallback(async (): Promise<{ deployed: boolean; error?: string }> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const url = `${supabaseUrl}/functions/v1/generate-report`;
    
    try {
      const response = await fetch(url, {
        method: "OPTIONS",
        headers: { "Content-Type": "application/json" },
      });
      
      // 200, 204, 401, 405 all indicate the function exists
      if (response.status === 404) {
        console.error("Preflight check: generate-report returns 404 - function not deployed");
        return { deployed: false, error: "Backend function not deployed (404)" };
      }
      
      return { deployed: true };
    } catch (error) {
      console.error("Preflight check failed:", error);
      return { deployed: false, error: error instanceof Error ? error.message : "Network error" };
    }
  }, []);

  // Start report generation with preflight check and detailed error handling
  const startGeneration = useCallback(async () => {
    if (!applicationId) return;

    setIsStarting(true);
    setSteps([]); // Clear previous steps

    try {
      // Preflight check: is the function deployed?
      const { deployed, error: deployError } = await checkFunctionDeployment();
      if (!deployed) {
        throw new Error(deployError || "Backend function unavailable");
      }

      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: { applicationId },
      });

      if (error) {
        // Extract more details from FunctionsHttpError
        const httpError = error as { status?: number; message?: string; context?: { body?: string } };
        const status = httpError.status;
        const body = httpError.context?.body;
        
        console.error("generate-report invocation failed:", {
          status,
          message: error.message,
          body,
          backendUrl: import.meta.env.VITE_SUPABASE_URL,
        });
        
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      // Successfully enqueued - switch to processing state
      setIsStarting(false);
      setIsGenerating(true);

      toast({
        title: "Report generation started",
        description: "This typically takes 2-3 minutes. You'll see progress updates below.",
      });

      // Start polling for updates
      checkActiveRun();
    } catch (error) {
      console.error("Error starting generation:", error);
      setIsStarting(false);
      setIsGenerating(false);
      
      const errorMessage = error instanceof Error ? error.message : "Failed to start report generation";
      
      // Check for specific error types
      if (errorMessage.includes("404") || errorMessage.includes("not deployed")) {
        toast({
          title: "Backend unavailable",
          description: "The report generation service is not available. Please try again in a few minutes or contact support.",
          variant: "destructive",
        });
      } else if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
        toast({
          title: "High demand",
          description: "The AI service is busy. Please wait a minute and try again.",
          variant: "destructive",
        });
      } else if (
        errorMessage.includes("402") || 
        errorMessage.toLowerCase().includes("no report credits")
      ) {
        toast({
          title: "Report credits needed",
          description: "You're out of credits! Purchase more to generate your report.",
          variant: "destructive",
        });
        // Trigger purchase modal via callback
        options?.onNoCredits?.();
      } else {
        toast({
          title: "Generation failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
  }, [applicationId, toast, checkActiveRun, options, checkFunctionDeployment]);

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

  // Retry from failed step - restart fresh (step 0), resume from checkpoint (step 1-10), or recover step 11
  const retryFromFailedStep = useCallback(async (runId: string) => {
    try {
      console.log("Retrying from failed step...");
      setIsGenerating(true);

      // Fetch the current run to check the step
      const { data: run, error: fetchError } = await supabase
        .from("report_runs")
        .select("current_step")
        .eq("id", runId)
        .single();

      if (fetchError || !run) {
        throw new Error("Could not find report run");
      }

      // CASE 1: Step 1 never completed - cancel and start fresh
      if (run.current_step === 0) {
        console.log("Step 1 never completed, cancelling and restarting...");
        
        // Clear resume tracking to prevent stale state
        resumeAttemptedRef.current.clear();
        setActiveRun(null);
        setSteps([]);
        
        // Cancel the stuck run (this refunds the credit)
        await supabase.functions.invoke("cancel-report-run", {
          body: { reportRunId: runId },
        });

        // Start a fresh generation
        await startGeneration();
        return;
      }

      // CASE 2: Step 12 stuck (final assembly failed) - backend will handle recovery
      if (run.current_step >= 12) {
        console.log("Step 12 stuck, triggering final step recovery...");
        
        // Set status to pending so backend accepts the resume
        const { error: updateError } = await supabase
          .from("report_runs")
          .update({ status: "pending" })
          .eq("id", runId);

        if (updateError) {
          throw updateError;
        }

        const { error } = await supabase.functions.invoke("resume-report-run", {
          body: { reportRunId: runId },
        });

        if (error) {
          throw error;
        }

        toast({
          title: "Retrying final assembly",
          description: "Re-running the final report assembly step.",
        });

        checkActiveRun();
        return;
      }

      // CASE 3: Steps 1-10 - normal resume from checkpoint
      const { error: updateError } = await supabase
        .from("report_runs")
        .update({ status: "pending" })
        .eq("id", runId);

      if (updateError) {
        throw updateError;
      }

      const { error } = await supabase.functions.invoke("resume-report-run", {
        body: { reportRunId: runId },
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Resuming generation",
        description: "Continuing from the last successful step.",
      });

      checkActiveRun();
    } catch (error) {
      console.error("Error retrying from failed step:", error);
      setIsGenerating(false);
      toast({
        title: "Retry failed",
        description: "Failed to resume report generation. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, checkActiveRun, startGeneration]);

  // Poll for updates when generating (backup for Realtime)
  useEffect(() => {
    if (!isGenerating || !applicationId) return;

    const pollInterval = setInterval(async () => {
      await checkActiveRun();
      await fetchReports();
    }, 5000); // Increased to 5s since we have Realtime now

    return () => clearInterval(pollInterval);
  }, [isGenerating, applicationId, checkActiveRun, fetchReports]);

  // Track resume attempts to prevent infinite loops
  const resumeAttemptedRef = useRef<Set<string>>(new Set());

  // 13-PHASE ARCHITECTURE: Detect checkpoint at any step 0-11 and auto-resume
  useEffect(() => {
    if (activeRun && activeRun.status === "pending") {
      // Create a unique key for this checkpoint attempt
      const attemptKey = `${activeRun.id}-${activeRun.current_step}`;
      
      // Only resume if we haven't already attempted this specific checkpoint
      if (!resumeAttemptedRef.current.has(attemptKey)) {
        // Steps 0-11 are valid checkpoints (step 12 is final assembly)
        if (activeRun.current_step >= 0 && activeRun.current_step <= 11) {
          resumeAttemptedRef.current.add(attemptKey);
          resumeFromCheckpoint(activeRun.id);
        }
      }
    }
    
    // Clear tracking when run completes or fails
    if (activeRun && (activeRun.status === "completed" || activeRun.status === "failed")) {
      resumeAttemptedRef.current.clear();
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
      setSteps([]);
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

  // Toggle email on complete preference
  const toggleEmailOnComplete = useCallback(async (enabled: boolean) => {
    if (!activeRun) return;

    const { error } = await supabase
      .from("report_runs")
      .update({ email_on_complete: enabled })
      .eq("id", activeRun.id);

    if (error) {
      console.error("Error toggling email preference:", error);
      toast({
        title: "Failed to update preference",
        description: "Please try again.",
        variant: "destructive",
      });
    } else {
      setActiveRun((prev) => prev ? { ...prev, email_on_complete: enabled } : null);
      toast({
        title: enabled ? "Email notifications enabled" : "Email notifications disabled",
        description: enabled 
          ? "We'll email you when your report is ready." 
          : "You won't receive an email notification.",
      });
    }
  }, [activeRun, toast]);

  // Resume report - re-enqueue the run to continue from checkpoint
  const resumeReport = useCallback(async (runId: string) => {
    try {
      setIsGenerating(true);

      // Reset status to pending
      const { error: updateError } = await supabase
        .from("report_runs")
        .update({ status: "pending" })
        .eq("id", runId);

      if (updateError) {
        throw updateError;
      }

      // Call enqueue-report to re-trigger the worker
      const { error } = await supabase.functions.invoke("enqueue-report", {
        body: { report_run_id: runId },
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Resuming report",
        description: "Re-triggering the report generation worker.",
      });

      checkActiveRun();
    } catch (error) {
      console.error("Error resuming report:", error);
      setIsGenerating(false);
      toast({
        title: "Resume failed",
        description: "Failed to resume report. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, checkActiveRun]);

  // Clear and restart - Super Admin only (deletes all steps and starts fresh)
  const clearAndRestart = useCallback(async (runId: string) => {
    try {
      setIsGenerating(true);

      // Call edge function (validates super admin server-side)
      const { error } = await supabase.functions.invoke("clear-and-restart-run", {
        body: { reportRunId: runId },
      });

      if (error) {
        throw error;
      }

      setSteps([]);
      toast({
        title: "Run cleared",
        description: "Starting fresh from Step 1.",
      });

      checkActiveRun();
    } catch (error) {
      console.error("Error clearing run:", error);
      setIsGenerating(false);
      toast({
        title: "Clear failed",
        description: error instanceof Error && error.message.includes("Super Admin") 
          ? "Super Admin access required." 
          : "Failed to clear run. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast, checkActiveRun]);

  return {
    isStarting,
    isGenerating,
    activeRun,
    reports,
    isLoadingReports,
    steps,
    completedSteps,
    startGeneration,
    downloadReport,
    cancelRun,
    retryFromFailedStep,
    toggleEmailOnComplete,
    resumeReport,
    clearAndRestart,
    refetch: fetchReports,
  };
}
