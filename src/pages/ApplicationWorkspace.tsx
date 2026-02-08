import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  GraduationCap, 
  ArrowLeft, 
  Loader2,
  CheckCircle,
  Sparkles,
  CreditCard
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useReportGeneration } from "@/hooks/useReportGeneration";
import { useAuth } from "@/hooks/useAuth";
import { PurchaseModal } from "@/components/PurchaseModal";
import { ReportInputs } from "@/components/workspace/ReportInputs";
import { GenerationProgress } from "@/components/workspace/GenerationProgress";
import { ReportsList } from "@/components/workspace/ReportsList";

interface ApplicationData {
  id: string;
  title: string | null;
  status: string;
  inputs_json: Record<string, string>;
  grant_version: {
    grant: {
      name: string;
    };
  };
}

export default function ApplicationWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [inputsCollapsed, setInputsCollapsed] = useState(false);
  const [projectName, setProjectName] = useState<string>("");
  const [inputs, setInputs] = useState<Record<string, string>>({
    publicArticleUrl: "",
    summary: "",
    trl: "",
    ipStatus: "",
  });
  const progressRef = useRef<HTMLDivElement>(null);
  
  const { availableReports, hasAvailableReport, isLoading: entitlementsLoading, refetch: refetchEntitlements } = useEntitlements();
  const { isSuperAdmin } = useAuth();
  
  // Callback when user runs out of credits - opens purchase modal
  const handleNoCredits = useCallback(() => {
    refetchEntitlements();
    setPurchaseModalOpen(true);
  }, [refetchEntitlements]);
  
  const { 
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
  } = useReportGeneration(id, { onNoCredits: handleNoCredits });

  useEffect(() => {
    const fetchApplication = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      if (!id) {
        navigate("/dashboard");
        return;
      }

      const { data, error } = await supabase
        .from("applications")
        .select(`
          id,
          title,
          status,
          inputs_json,
          grant_version:grant_versions!inner(
            grant:grants!inner(name)
          )
        `)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching application:", error);
        toast({
          title: "Error loading application",
          description: "Please try again.",
          variant: "destructive",
        });
        navigate("/dashboard");
      } else if (data) {
        const inputsData = data.inputs_json as Record<string, unknown> || {};
        
        // Convert all input values to strings for form state
        const normalizedInputs: Record<string, string> = {};
        for (const [key, value] of Object.entries(inputsData)) {
          if (value === null || value === undefined) {
            normalizedInputs[key] = "";
          } else if (typeof value === "object") {
            normalizedInputs[key] = JSON.stringify(value);
          } else {
            normalizedInputs[key] = String(value);
          }
        }
        
        // Ensure base fields exist
        if (!normalizedInputs.publicArticleUrl) normalizedInputs.publicArticleUrl = "";
        if (!normalizedInputs.summary) normalizedInputs.summary = "";
        if (!normalizedInputs.trl) normalizedInputs.trl = "";
        if (!normalizedInputs.ipStatus) normalizedInputs.ipStatus = "";
        
        // Extract grant name from grant version
        const grantVersionData = data.grant_version as unknown as { 
          grant: { name: string } | { name: string }[] 
        };
        
        const grantName = Array.isArray(grantVersionData?.grant) 
          ? grantVersionData.grant[0]?.name 
          : grantVersionData?.grant?.name || "Unknown Grant";
        
        const appData: ApplicationData = {
          id: data.id,
          title: data.title,
          status: data.status,
          inputs_json: normalizedInputs,
          grant_version: {
            grant: { name: grantName }
          }
        };
        setApplication(appData);
        setInputs(normalizedInputs);
        setProjectName(data.title || "");
      } else {
        toast({
          title: "Application not found",
          description: "The application you're looking for doesn't exist.",
          variant: "destructive",
        });
        navigate("/dashboard");
      }
      setIsLoading(false);
    };

    fetchApplication();
  }, [id, navigate, toast]);

  // Save inputs to database
  const saveInputs = useCallback(async () => {
    if (!id) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from("applications")
      .update({ inputs_json: JSON.parse(JSON.stringify(inputs)) })
      .eq("id", id);

    if (error) {
      console.error("Error saving:", error);
    } else {
      setLastSaved(new Date());
    }
    setIsSaving(false);
  }, [id, inputs]);

  // Save project name to database
  const saveProjectName = useCallback(async () => {
    if (!id) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from("applications")
      .update({ title: projectName || null })
      .eq("id", id);

    if (error) {
      console.error("Error saving project name:", error);
    } else {
      setLastSaved(new Date());
    }
    setIsSaving(false);
  }, [id, projectName]);

  // Debounced autosave for inputs
  useEffect(() => {
    if (!application) return;
    
    const timer = setTimeout(() => {
      if (inputs.summary || inputs.publicArticleUrl) {
        saveInputs();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [inputs, saveInputs, application]);

  // Debounced autosave for project name
  useEffect(() => {
    if (!application) return;
    
    const timer = setTimeout(() => {
      saveProjectName();
    }, 2000);
    return () => clearTimeout(timer);
  }, [projectName, saveProjectName, application]);

  // Auto-collapse inputs and scroll to progress when generation starts
  useEffect(() => {
    if (isGenerating) {
      setInputsCollapsed(true);
      // Small delay to allow collapse animation before scrolling
      setTimeout(() => {
        progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [isGenerating]);

  const handleInputChange = (key: string, value: string) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  const handleGenerateReport = async () => {
    if (!hasAvailableReport) {
      setPurchaseModalOpen(true);
      return;
    }

    await startGeneration();
    // Refetch entitlements after starting (credit consumed)
    setTimeout(() => refetchEntitlements(), 1000);
  };

  // Check if base required inputs are complete
  const inputsComplete = (inputs.publicArticleUrl || '').trim() !== "" && (inputs.summary || '').trim() !== "";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!application) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-hero">
                <GraduationCap className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-sm font-semibold">{application.grant_version.grant.name}</h1>
                {projectName && (
                  <p className="text-xs text-muted-foreground">{projectName}</p>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Report Credits Badge */}
            {!entitlementsLoading && (
              <Badge 
                variant={hasAvailableReport ? "outline" : "secondary"}
                className="cursor-pointer hover:bg-accent"
                onClick={() => setPurchaseModalOpen(true)}
              >
                <CreditCard className="h-3 w-3 mr-1" />
                {hasAvailableReport ? `${availableReports} credit${availableReports === 1 ? "" : "s"}` : "No credits"}
              </Badge>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle className="h-3 w-3 text-success" />
                  <span>Saved {lastSaved.toLocaleTimeString()}</span>
                </>
              ) : null}
            </div>
            <Badge variant="secondary" className="capitalize">{application.status.replace("_", " ")}</Badge>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container py-6 space-y-6">
        {/* Inputs Section */}
        <ReportInputs 
          inputs={inputs} 
          onInputChange={handleInputChange}
          disabled={isGenerating}
          isCollapsed={inputsCollapsed}
          onToggleCollapse={() => setInputsCollapsed(!inputsCollapsed)}
          projectName={projectName}
          onProjectNameChange={setProjectName}
        />

        {/* Generate Report Button */}
        <div className="flex flex-col items-center gap-4">
          {!isGenerating && !isStarting && (
            <Button 
              size="lg" 
              onClick={handleGenerateReport}
              disabled={!inputsComplete || isGenerating || isStarting}
              className="min-w-[200px]"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {hasAvailableReport ? "Generate Report" : "Purchase & Generate Report"}
            </Button>
          )}
          
          {!inputsComplete && !isGenerating && !isStarting && (
            <p className="text-sm text-muted-foreground">
              Please fill in the Article URL and Summary to generate your report.
            </p>
          )}
        </div>

        {/* Progress Indicator */}
        <div ref={progressRef}>
          {/* Show starting state */}
          {isStarting && (
            <GenerationProgress
              currentStep={0}
              totalSteps={15}
              completedSteps={0}
              steps={[]}
              status="pending"
              isStarting={true}
              activeRunId={activeRun?.id}
            />
          )}
          
          {/* Show processing/failed/stalled/completed state - keep logs visible */}
          {!isStarting && (isGenerating || activeRun?.status === "failed" || activeRun?.status === "stalled" || activeRun?.status === "completed") && activeRun && (
            <GenerationProgress
              currentStep={activeRun.current_step}
              totalSteps={activeRun.total_steps}
              completedSteps={completedSteps}
              steps={steps}
              status={activeRun.status}
              onCancel={() => cancelRun(activeRun.id)}
              onRestart={() => retryFromFailedStep(activeRun.id)}
              onResume={
                (activeRun.status === "failed" || activeRun.status === "stalled")
                  ? () => resumeReport(activeRun.id)
                  : undefined
              }
              onClearAndRestart={
                (activeRun.status === "failed" || activeRun.status === "stalled")
                  ? () => clearAndRestart(activeRun.id)
                  : undefined
              }
              onRecoverFinalize={
                canRecoverFinalize
                  ? () => recoverFinalizeReport(activeRun.id)
                  : undefined
              }
              isSuperAdmin={isSuperAdmin}
              emailOnComplete={activeRun.email_on_complete}
              onToggleEmailOnComplete={toggleEmailOnComplete}
              startedAt={activeRun.started_at}
              completedAt={activeRun.completed_at}
              activeRunId={activeRun.id}
              is504Error={activeRun.is504Error}
              isCancelling={isCancelling}
            />
          )}
        </div>

        {/* Reports List */}
        <ReportsList
          reports={reports}
          isLoading={isLoadingReports}
          onDownload={downloadReport}
          onDeleteReport={deleteReport}
        />
      </main>

      {/* Purchase Modal */}
      <PurchaseModal open={purchaseModalOpen} onOpenChange={setPurchaseModalOpen} />
    </div>
  );
}
