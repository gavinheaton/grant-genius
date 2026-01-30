import { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, AlertCircle, Clock, XCircle, RefreshCw, Mail, Pause, Play } from "lucide-react";

// 15-STEP ARCHITECTURE: Step 0 (source pack) + Steps 1-11 (research) + Steps 12-14 (assembly)
const RESEARCH_STEPS = [
  "Building Australia-first source pack",
  "Extracting research context from article",
  "Searching for competing research",
  "Identifying market segments",
  "Finding existing competitors",
  "Building market sizing source pack",
  "Calculating Total Addressable Market",
  "Calculating Serviceable Addressable Market",
  "Calculating Serviceable Obtainable Market",
  "Analyzing Australian economic impact",
  "Building competitor comparison",
  "Finding Australian partner businesses",
  "Assembling report sections",
  "Building tables and source list",
  "Finalizing report",
];

const AUTO_RETRY_SECONDS = 30;

interface GenerationProgressProps {
  currentStep: number;
  totalSteps: number;
  status: "pending" | "running" | "completed" | "failed" | "stalled";
  errorMessage?: string;
  onCancel?: () => void;
  onRestart?: () => void;
  emailOnComplete?: boolean;
  onToggleEmailOnComplete?: (enabled: boolean) => void;
  startedAt?: string | null;
  completedAt?: string | null;
}

// Format elapsed time between two dates
function formatElapsedTime(startedAt: string | null | undefined, completedAt: string | null | undefined): string {
  if (!startedAt) return "-";
  
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function GenerationProgress({ 
  currentStep, 
  totalSteps, 
  status, 
  errorMessage, 
  onCancel, 
  onRestart,
  emailOnComplete = false,
  onToggleEmailOnComplete,
  startedAt,
  completedAt,
}: GenerationProgressProps) {
  const [countdown, setCountdown] = useState(AUTO_RETRY_SECONDS);
  const [isPaused, setIsPaused] = useState(false);
  const [hasAutoRetried, setHasAutoRetried] = useState(false);

  const shouldShowAutoRetry = (status === "failed" || status === "stalled") && onRestart && !hasAutoRetried;

  // Reset countdown when status changes to failed/stalled
  useEffect(() => {
    if (status === "failed" || status === "stalled") {
      setCountdown(AUTO_RETRY_SECONDS);
      setIsPaused(false);
      setHasAutoRetried(false);
    }
  }, [status]);

  // Countdown timer
  useEffect(() => {
    if (!shouldShowAutoRetry || isPaused) return;

    if (countdown <= 0) {
      setHasAutoRetried(true);
      onRestart?.();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, isPaused, shouldShowAutoRetry, onRestart]);

  const handlePauseToggle = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const handleManualRetry = useCallback(() => {
    setHasAutoRetried(true);
    onRestart?.();
  }, [onRestart]);

  // Progress is based on completed steps (currentStep represents last completed step, 0-12)
  // Total steps is 13 (0-12), so we calculate progress as (currentStep + 1) / 13 when running
  const progressPercent = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;
  // currentStep is 0-indexed (0-14), map to RESEARCH_STEPS array
  const currentStepName = currentStep >= 0 && currentStep < RESEARCH_STEPS.length 
    ? RESEARCH_STEPS[currentStep]
    : "Initializing...";

  const isInProgress = status === "running" || status === "pending";

  return (
    <Card className="shadow-card border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            {status === "running" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {status === "completed" && <CheckCircle className="h-5 w-5 text-success" />}
            {status === "failed" && <AlertCircle className="h-5 w-5 text-destructive" />}
            {status === "pending" && <Loader2 className="h-5 w-5 text-muted-foreground" />}
            {status === "stalled" && <Clock className="h-5 w-5 text-warning" />}
            Generating Report
          </div>
          {startedAt && (
            <div className="flex items-center gap-1.5 text-sm font-normal text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{formatElapsedTime(startedAt, completedAt)}</span>
            </div>
          )}
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
                {/* Auto-retry countdown */}
                {shouldShowAutoRetry && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {isPaused ? "Auto-retry paused" : `Retrying automatically in ${countdown}s...`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Your credit was refunded. The system will retry automatically.
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handlePauseToggle}
                      className="gap-1"
                    >
                      {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                      {isPaused ? "Resume" : "Pause"}
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="default" size="sm" onClick={handleManualRetry} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Try Again Now
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {status === "stalled" && (
          <div className="space-y-3">
            <p className="text-sm text-warning">
              Generation appears to have stalled. This can happen due to high demand or network issues.
            </p>
            {/* Auto-retry countdown */}
            {shouldShowAutoRetry && (
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {isPaused ? "Auto-retry paused" : `Retrying automatically in ${countdown}s...`}
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handlePauseToggle}
                  className="gap-1"
                >
                  {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  {isPaused ? "Resume" : "Pause"}
                </Button>
              </div>
            )}
            <div className="flex gap-2">
              {onRestart && (
                <Button variant="default" size="sm" onClick={handleManualRetry} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Try Again Now
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

        {isInProgress && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Grant Genius takes a few minutes to process. We'll be back soon with your report.
            </p>
            
            {/* Email notification option */}
            {onToggleEmailOnComplete && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
                <Checkbox 
                  id="email-on-complete" 
                  checked={emailOnComplete}
                  onCheckedChange={(checked) => onToggleEmailOnComplete(checked === true)}
                />
                <Label 
                  htmlFor="email-on-complete" 
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email me when my report is ready
                </Label>
              </div>
            )}
            
            {/* Cancel button for in-progress runs */}
            {onCancel && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onCancel} 
                className="gap-2 text-muted-foreground hover:text-destructive"
              >
                <XCircle className="h-4 w-4" />
                Cancel Generation
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
