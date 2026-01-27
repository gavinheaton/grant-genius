import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

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
  status: "pending" | "running" | "completed" | "failed";
  errorMessage?: string;
}

export function GenerationProgress({ currentStep, totalSteps, status, errorMessage }: GenerationProgressProps) {
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
              {status === "pending" && "Starting generation..."}
            </span>
            <span className="font-medium">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {status === "failed" && errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
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
