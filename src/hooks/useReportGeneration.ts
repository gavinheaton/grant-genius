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
  is504Error?: boolean; // Flag for transient network errors
}

export interface Report {
  id: string;
  version_number: number;
  created_at: string;
  pdf_path: string | null;
  docx_path: string | null;
  content_json?: Json;
  review_status: string | null;
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

// 504 timeout patterns for auto-retry detection
const TRANSIENT_ERROR_PATTERNS = [
  /504/i,
  /proxy error/i,
  /gateway timeout/i,
  /network/i,
  /timeout/i,
  /ECONNRESET/i,
  /ETIMEDOUT/i,
];

// Helper to detect transient/504 errors
function isTransientError(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  return TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(errorMessage));
}

// Detect any final step failure that can potentially be recovered
function isRecoverableFinalizeError(step: ReportRunStep | undefined): boolean {
  if (!step) return false;
  
  // Standard finalize step failure
  if (
    step.step_name === "finalize_report_html" &&
    step.status === "failed" &&
    (step.error_message?.includes("No step output found with 'report_html'") ||
     step.error_message?.includes("Finalize FAILED"))
  ) {
    return true;
  }
  
  // Any final step that failed with missing variable errors
  // (single-prompt pipelines may fail at step 1 with variable issues)
  if (
    step.status === "failed" &&
    step.error_message?.includes("missingVars")
  ) {
    return true;
  }
  
  return false;
}

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
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeRun, setActiveRun] = useState<ReportRun | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [steps, setSteps] = useState<ReportRunStep[]>([]);

  // Calculate completed steps from steps array (include failed steps as they still represent progress)
  const completedSteps = steps.filter(s => s.status === 'completed' || s.status === 'failed').length;

  // Fetch existing reports for this application
  const fetchReports = useCallback(async () => {
    if (!applicationId) return;

    const { data, error } = await supabase
      .from("reports")
      .select("id, version_number, created_at, pdf_path, docx_path, content_json, review_status")
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
      // Fetch steps first so we can check activity-based staleness
      const { data: stepData } = await supabase
        .from("report_run_steps")
        .select("step_number, step_name, status, started_at, completed_at, error_message")
        .eq("report_run_id", data.id)
        .order("step_number", { ascending: true });

      const fetchedSteps = (stepData as ReportRunStep[]) || [];
      setSteps(fetchedSteps);

      // Find most recent step activity (completed_at or started_at)
      const latestStepActivity = fetchedSteps.reduce((latest, step) => {
        const stepTime = step.completed_at || step.started_at;
        return stepTime ? Math.max(latest, new Date(stepTime).getTime()) : latest;
      }, 0);

      const now = Date.now();
      const runStartTime = new Date(data.started_at || data.created_at).getTime();
      const timeSinceLastActivity = latestStepActivity 
        ? (now - latestStepActivity) 
        : (now - runStartTime);

      // Only mark as stalled if no step activity for 5+ minutes
      const isStale = timeSinceLastActivity > STALE_THRESHOLD_MS;

      // Check if any failed step has a 504/transient error
      const failedSteps = fetchedSteps.filter(s => s.status === 'failed');
      const has504Error = failedSteps.some(s => isTransientError(s.error_message));

      const runData: ReportRun = {
        ...data,
        status: isStale ? "stalled" : data.status,
        completed_at: data.completed_at ?? null,
        email_on_complete: data.email_on_complete ?? false,
        is504Error: has504Error,
      } as ReportRun;

      setActiveRun(runData);
      setIsGenerating(true);
    } else {
      // No active run - check for recent completed/failed run to keep logs visible
      const { data: recentRun } = await supabase
        .from("report_runs")
        .select("id, status, current_step, total_steps, created_at, started_at, completed_at, email_on_complete")
        .eq("application_id", applicationId)
        .in("status", ["completed", "failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentRun) {
        // Fetch steps for activity-based staleness check
        const { data: recentStepData } = await supabase
          .from("report_run_steps")
          .select("step_number, step_name, status, started_at, completed_at, error_message")
          .eq("report_run_id", recentRun.id)
          .order("step_number", { ascending: true });

        const recentSteps = (recentStepData as ReportRunStep[]) || [];
        setSteps(recentSteps);

        // Find most recent step activity
        const latestStepActivity = recentSteps.reduce((latest, step) => {
          const stepTime = step.completed_at || step.started_at;
          return stepTime ? Math.max(latest, new Date(stepTime).getTime()) : latest;
        }, 0);

        const now = Date.now();
        const runStartTime = new Date(recentRun.started_at || recentRun.created_at).getTime();
        const timeSinceLastActivity = latestStepActivity 
          ? (now - latestStepActivity) 
          : (now - runStartTime);

        // Only stale if running status AND no activity for 5+ minutes
        const isStale = recentRun.status === "running" && timeSinceLastActivity > STALE_THRESHOLD_MS;

        // Check for 504/transient errors
        const failedSteps = recentSteps.filter(s => s.status === 'failed');
        const has504Error = failedSteps.some(s => isTransientError(s.error_message));
        
        setActiveRun({
          ...recentRun,
          status: isStale ? "stalled" : recentRun.status,
          completed_at: recentRun.completed_at ?? null,
          email_on_complete: recentRun.email_on_complete ?? false,
          is504Error: has504Error,
        } as ReportRun);
      } else {
        setActiveRun(null);
        setSteps([]);
      }
      setIsGenerating(false);
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
            
            // Detect 504/transient error immediately when step fails
            if (updatedStep.status === 'failed' && isTransientError(updatedStep.error_message)) {
              console.log('504/transient error detected, flagging for auto-retry');
              setActiveRun(prev => prev ? { ...prev, is504Error: true } : null);
            }
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
            email_on_complete: updated.email_on_complete,
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
        // Mirror headers the client may send so preflight reflects reality.
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
          "x-client-info": "grant-genius-web",
          "x-supabase-client-platform": "web",
        },
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
        // Extract more details from the Supabase FunctionsHttpError shape
        // (structure can differ slightly across versions)
        const anyErr = error as unknown as {
          name?: string;
          message?: string;
          status?: number;
          context?: { status?: number; body?: unknown };
          details?: unknown;
        };

        const status = anyErr.status ?? anyErr.context?.status;
        const rawBody = anyErr.context?.body;
        const bodyText =
          typeof rawBody === "string" ? rawBody : rawBody ? JSON.stringify(rawBody) : undefined;

        console.error("generate-report invocation failed:", {
          name: anyErr.name,
          status,
          message: anyErr.message,
          body: bodyText,
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
        description: "This typically takes around 15 minutes. You'll see progress updates below.",
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
    if (isCancelling) return; // Prevent double-clicks
    
    setIsCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-report-run", {
        body: { reportRunId: runId },
      });

      if (error) {
        throw error;
      }

      // Success (including idempotent "already stopped" case)
      setActiveRun(null);
      setIsGenerating(false);
      setSteps([]);
      toast({
        title: "Generation cancelled",
        description: data?.alreadyStopped 
          ? "The generation was already stopped."
          : "Your credit has been refunded. You can try again when ready.",
      });
    } catch (error) {
      console.error("Error cancelling run:", error);
      
      // Check if error indicates run already stopped (idempotent success)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("already completed") || errorMessage.includes("already failed") || errorMessage.includes("already stopped")) {
        // Treat as success - the run is stopped
        setActiveRun(null);
        setIsGenerating(false);
        setSteps([]);
        toast({
          title: "Generation cancelled",
          description: "You can try again when ready.",
        });
      } else {
        toast({
          title: "Failed to cancel",
          description: "Please try again or contact support.",
          variant: "destructive",
        });
      }
    } finally {
      setIsCancelling(false);
    }
  }, [toast, isCancelling]);

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

  // Delete a report
  const deleteReport = useCallback(async (reportId: string) => {
    const { error } = await supabase
      .from("reports")
      .delete()
      .eq("id", reportId);

    if (error) {
      toast({
        title: "Error deleting report",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }

    // Remove from local state
    setReports(prev => prev.filter(r => r.id !== reportId));
    toast({
      title: "Report deleted",
      description: "The report has been permanently removed.",
    });
    return true;
  }, [toast]);

  // Recover from finalize step failure using deterministic assembly
  const recoverFinalizeReport = useCallback(async (runId: string) => {
    try {
      setIsGenerating(true);
      
      const { data, error } = await supabase.functions.invoke("recover-finalize-report", {
        body: { reportRunId: runId },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setActiveRun(null);
      setIsGenerating(false);
      setSteps([]);
      
      await fetchReports();
      
      toast({
        title: "Report recovered!",
        description: "Your report has been successfully assembled using deterministic finalization.",
      });

      return true;
    } catch (error) {
      console.error("Error recovering report:", error);
      setIsGenerating(false);
      toast({
        title: "Recovery failed",
        description: error instanceof Error ? error.message : "Failed to recover report. Please contact support.",
        variant: "destructive",
      });
      return false;
    }
  }, [toast, fetchReports]);

  // Check if current failure is recoverable
  const failedStep = steps.find(s => s.status === 'failed');
  const canRecoverFinalize = isRecoverableFinalizeError(failedStep);

  return {
    isStarting,
    isGenerating,
    isCancelling,
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
    deleteReport,
    recoverFinalizeReport,
    canRecoverFinalize,
    refetch: fetchReports,
  };
}
