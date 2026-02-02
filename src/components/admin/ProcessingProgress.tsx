import { CheckCircle, Circle, Loader2, XCircle, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface ProcessingProgressProps {
  aiStatus: string;
  pipelineStatus: string;
  isUploading?: boolean;
}

type StepState = "pending" | "active" | "completed" | "failed";

interface Step {
  label: string;
  state: StepState;
}

export function ProcessingProgress({ 
  aiStatus, 
  pipelineStatus, 
  isUploading = false 
}: ProcessingProgressProps) {
  // Determine step states based on statuses
  const getSteps = (): Step[] => {
    const steps: Step[] = [
      { label: "Upload guidelines PDF", state: "pending" },
      { label: "Extract rubric and inputs", state: "pending" },
      { label: "Generate research pipeline", state: "pending" },
      { label: "Create prompt bundle", state: "pending" },
    ];

    // Step 1: Upload
    if (isUploading) {
      steps[0].state = "active";
    } else if (aiStatus !== "pending") {
      steps[0].state = "completed";
    }

    // Step 2: Extraction
    if (aiStatus === "analyzing") {
      steps[0].state = "completed";
      steps[1].state = "active";
    } else if (aiStatus === "completed" || aiStatus === "failed") {
      steps[0].state = "completed";
      steps[1].state = aiStatus === "failed" && pipelineStatus === "none" ? "failed" : "completed";
    }

    // Step 3: Pipeline generation
    if (pipelineStatus === "generating") {
      steps[1].state = "completed";
      steps[2].state = "active";
    } else if (pipelineStatus === "draft" || pipelineStatus === "published") {
      steps[2].state = "completed";
      steps[3].state = "completed";
    } else if (pipelineStatus === "failed") {
      steps[2].state = "failed";
    }

    return steps;
  };

  const steps = getSteps();
  
  // Calculate progress percentage
  const completedSteps = steps.filter(s => s.state === "completed").length;
  const activeSteps = steps.filter(s => s.state === "active").length;
  const progress = ((completedSteps + activeSteps * 0.5) / steps.length) * 100;

  const isProcessing = steps.some(s => s.state === "active");
  const hasFailed = steps.some(s => s.state === "failed");
  const isComplete = steps.every(s => s.state === "completed");

  const getIcon = (state: StepState) => {
    switch (state) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "active":
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground/40" />;
    }
  };

  if (!isProcessing && !hasFailed && !isComplete && !isUploading) {
    return null; // Don't show if nothing is happening
  }

  return (
    <Card className={hasFailed ? "border-destructive/50" : isComplete ? "border-green-500/50" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          {isProcessing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Processing Guidelines
            </>
          ) : hasFailed ? (
            <>
              <XCircle className="h-5 w-5 text-destructive" />
              Processing Failed
            </>
          ) : isComplete ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-500" />
              Processing Complete
            </>
          ) : (
            <>
              <Upload className="h-5 w-5 text-muted-foreground" />
              Ready to Process
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progress} className="h-2" />
        
        <div className="space-y-2">
          {steps.map((step, index) => (
            <div 
              key={index} 
              className={`flex items-center gap-3 text-sm ${
                step.state === "pending" ? "text-muted-foreground" : ""
              }`}
            >
              {getIcon(step.state)}
              <span className={step.state === "active" ? "font-medium" : ""}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {isProcessing && (
          <p className="text-xs text-muted-foreground">
            This may take 30-60 seconds...
          </p>
        )}
      </CardContent>
    </Card>
  );
}
