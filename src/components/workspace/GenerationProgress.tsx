import { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, AlertCircle, Clock, XCircle, RefreshCw, Mail, Pause, Play, Trash2 } from "lucide-react";
import { ReportRunStep } from "@/hooks/useReportGeneration";

const AUTO_RETRY_SECONDS = 30;

interface GenerationProgressProps {
  currentStep: number;
  totalSteps: number;
  completedSteps: number;
  steps: ReportRunStep[];
  status: "pending" | "running" | "completed" | "failed" | "stalled";
  errorMessage?: string;
  onCancel?: () => void;
  onRestart?: () => void;
  onResume?: () => void;
  onClearAndRestart?: () => void;
  isSuperAdmin?: boolean;
  emailOnComplete?: boolean;
  onToggleEmailOnComplete?: (enabled: boolean) => void;
  startedAt?: string | null;
  completedAt?: string | null;
  isStarting?: boolean;
}

// Format step name from snake_case to Title Case
function formatStepName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
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
  completedSteps,
  steps,
  status, 
  errorMessage, 
  onCancel, 
  onRestart,
  onResume,
  onClearAndRestart,
  isSuperAdmin = false,
  emailOnComplete = false,
  onToggleEmailOnComplete,
  startedAt,
  completedAt,
  isStarting = false,
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

  // Calculate progress based on completed steps
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  
  // Get current step name from steps array
  const currentStepData = steps.find(s => s.step_number === currentStep);
  const runningStep = steps.find(s => s.status === 'running');
  const displayStep = runningStep || currentStepData;
  const currentStepName = displayStep?.step_name 
    ? formatStepName(displayStep.step_name)
    : "Initializing...";

  const isInProgress = status === "running" || status === "pending" || isStarting;

  // Show starting state
  if (isStarting) {
    return (
      <Card className="shadow-card border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Starting Generation...
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Setting up your report generation. This will only take a moment...
            </p>
            <Progress value={0} className="h-2" />
          </div>
        </CardContent>
      </Card>
    );
  }

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
              {status === "running" && `Step ${completedSteps + 1}/${totalSteps}: ${currentStepName}`}
              {status === "completed" && "Report generation complete!"}
              {status === "failed" && "Generation failed"}
              {status === "pending" && (completedSteps === 0 ? "Starting generation..." : `Preparing step ${completedSteps + 1}...`)}
              {status === "stalled" && `Stalled at step ${completedSteps + 1}/${totalSteps}`}
            </span>
            <span className="font-medium">{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

{status === "failed" && (() => {
          // Find failed step and its error message
          const failedStep = steps.find(s => s.status === 'failed');
          const stepErrorMessage = failedStep?.error_message;
          
          return (
          <div className="space-y-3">
            {/* Step-specific error message from database */}
            {stepErrorMessage && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                <strong>Step {failedStep.step_number} ({formatStepName(failedStep.step_name)}) failed:</strong>{" "}
                {stepErrorMessage}
              </div>
            )}
            {/* Fallback to general error message */}
            {!stepErrorMessage && errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
            
            {/* Auto-retry countdown */}
            {onRestart && shouldShowAutoRetry && (
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
            
            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {/* Resume button - available to all users */}
              {onResume && (
                <Button variant="default" size="sm" onClick={onResume} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Resume Report
                </Button>
              )}
              
              {/* Fallback to onRestart if no onResume provided */}
              {!onResume && onRestart && (
                <Button variant="default" size="sm" onClick={handleManualRetry} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Try Again Now
                </Button>
              )}
              
              {/* Clear & Restart - Super Admin only */}
              {isSuperAdmin && onClearAndRestart && (
                <Button variant="outline" size="sm" onClick={onClearAndRestart} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Clear & Restart
                </Button>
              )}
            </div>
          </div>
          );
        })()}

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
