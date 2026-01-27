import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle, Clock, XCircle, RefreshCw } from "lucide-react";

const RESEARCH_STEPS = [
  "Extracting research context from article",
  "Searching for competing research",
  "Identifying market segments",
  "Finding existing competitors",
  "Calculating Total Addressable Market",
  "Calculating Serviceable Addressable Market",
  "Calculating Serviceable Obtainable Market",
  "Analyzing Australian economic impact",
  "Building competitor comparison",
  "Finding Australian partner businesses",
];

interface GenerationProgressProps {
  currentStep: number;
  totalSteps: number;
  status: "pending" | "running" | "completed" | "failed" | "stalled";
  errorMessage?: string;
  onCancel?: () => void;
  onRestart?: () => void;
}

export function GenerationProgress({ currentStep, totalSteps, status, errorMessage, onCancel, onRestart }: GenerationProgressProps) {
  const progressPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
  const currentStepName = currentStep > 0 && currentStep <= RESEARCH_STEPS.length 
    ? RESEARCH_STEPS[currentStep - 1] 
    : "Initializing...";

  return (
    <Card className="shadow-card border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {status === "running" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {status === "completed" && <CheckCircle className="h-5 w-5 text-success" />}
          {status === "failed" && <AlertCircle className="h-5 w-5 text-destructive" />}
          {status === "pending" && <Loader2 className="h-5 w-5 text-muted-foreground" />}
          {status === "stalled" && <Clock className="h-5 w-5 text-warning" />}
          Generating Report
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {status === "running" && `Step ${currentStep}/${totalSteps}: ${currentStepName}`}
              {status === "completed" && "Report generation complete!"}
              {status === "failed" && "Generation failed"}
              {status === "pending" && (currentStep === 0 ? "Starting generation..." : `Preparing step ${currentStep + 1}...`)}
              {status === "stalled" && `Stalled at step ${currentStep}/${totalSteps}`}
            </span>
            <span className="font-medium">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {status === "failed" && (
          <div className="space-y-3">
            {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
            {onRestart && (
              <>
                <Button variant="default" size="sm" onClick={onRestart} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
                <p className="text-xs text-muted-foreground">
                  Your credit was refunded. You can try again now.
                </p>
              </>
            )}
          </div>
        )}

        {status === "stalled" && (
          <div className="space-y-3">
            <p className="text-sm text-warning">
              Generation appears to have stalled. This can happen due to high demand or network issues.
            </p>
            <div className="flex gap-2">
              {onRestart && (
                <Button variant="default" size="sm" onClick={onRestart} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </Button>
              )}
              {onCancel && (
                <Button variant="outline" size="sm" onClick={onCancel} className="gap-2">
                  <XCircle className="h-4 w-4" />
                  Cancel & Start Over
                </Button>
              )}
            </div>
          </div>
        )}

        {status === "running" && (
          <p className="text-xs text-muted-foreground">
            This typically takes 2-3 minutes. The AI is conducting thorough market research with validated sources.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
