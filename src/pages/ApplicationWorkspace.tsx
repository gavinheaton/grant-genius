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
import { PurchaseModal } from "@/components/PurchaseModal";
import { ReportInputs } from "@/components/workspace/ReportInputs";
import { GenerationProgress } from "@/components/workspace/GenerationProgress";
import { ReportsList } from "@/components/workspace/ReportsList";

interface ApplicationInputs {
  publicArticleUrl: string;
  summary: string;
  trl: string;
  ipStatus: string;
}

interface ApplicationData {
  id: string;
  title: string | null;
  status: string;
  inputs_json: ApplicationInputs;
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
  const [inputs, setInputs] = useState<ApplicationInputs>({
    publicArticleUrl: "",
    summary: "",
    trl: "",
    ipStatus: "",
  });
  const progressRef = useRef<HTMLDivElement>(null);
  
  const { availableReports, hasAvailableReport, isLoading: entitlementsLoading, refetch: refetchEntitlements } = useEntitlements();
  const { 
    isGenerating, 
    activeRun, 
    reports, 
    isLoadingReports, 
    startGeneration, 
    downloadReport 
  } = useReportGeneration(id);

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
        const appData = {
          id: data.id,
          title: data.title,
          status: data.status,
          inputs_json: {
            publicArticleUrl: (inputsData.publicArticleUrl as string) || "",
            summary: (inputsData.summary as string) || "",
            trl: (inputsData.trl as string) || "",
            ipStatus: (inputsData.ipStatus as string) || "",
          },
          grant_version: {
            grant: {
              name: (data.grant_version as any)?.grant?.name || "Unknown Grant"
            }
          }
        };
        setApplication(appData);
        setInputs(appData.inputs_json);
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

  // Debounced autosave
  useEffect(() => {
    if (!application) return;
    
    const timer = setTimeout(() => {
      if (inputs.summary || inputs.publicArticleUrl) {
        saveInputs();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [inputs, saveInputs, application]);

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

  const handleInputChange = (field: keyof ApplicationInputs, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
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

  // Check if inputs are complete
  const inputsComplete = inputs.publicArticleUrl.trim() !== "" && inputs.summary.trim() !== "";

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
              <div>
                <h1 className="text-sm font-semibold">{application.grant_version.grant.name}</h1>
                <p className="text-xs text-muted-foreground">Application #{id?.slice(0, 8)}</p>
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
        />

        {/* Generate Report Button */}
        <div className="flex flex-col items-center gap-4">
          {!isGenerating && (
            <Button 
              size="lg" 
              onClick={handleGenerateReport}
              disabled={!inputsComplete || isGenerating}
              className="min-w-[200px]"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {hasAvailableReport ? "Generate Report" : "Purchase & Generate Report"}
            </Button>
          )}
          
          {!inputsComplete && !isGenerating && (
            <p className="text-sm text-muted-foreground">
              Please fill in the Article URL and Summary to generate your report.
            </p>
          )}
        </div>

        {/* Progress Indicator */}
        <div ref={progressRef}>
          {isGenerating && activeRun && (
            <GenerationProgress
              currentStep={activeRun.current_step}
              totalSteps={activeRun.total_steps}
              status={activeRun.status}
            />
          )}
        </div>

        {/* Reports List */}
        <ReportsList
          reports={reports}
          isLoading={isLoadingReports}
          onDownload={downloadReport}
        />
      </main>

      {/* Purchase Modal */}
      <PurchaseModal open={purchaseModalOpen} onOpenChange={setPurchaseModalOpen} />
    </div>
  );
}
