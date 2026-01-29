import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface StepFailure {
  step_number: number;
  step_name: string;
  count: number;
}

interface StepFailureBreakdownProps {
  stepFailures: StepFailure[];
  isLoading: boolean;
}

export function StepFailureBreakdown({ stepFailures, isLoading }: StepFailureBreakdownProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (stepFailures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
        <AlertTriangle className="h-6 w-6 mb-2 opacity-50" />
        <p className="text-sm">No stage gate failures recorded</p>
      </div>
    );
  }

  const maxCount = Math.max(...stepFailures.map(s => s.count));

  return (
    <div className="space-y-3">
      {stepFailures.map((step) => {
        const percentage = (step.count / maxCount) * 100;
        
        return (
          <div key={`${step.step_number}-${step.step_name}`} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                Step {step.step_number}: {step.step_name}
              </span>
              <span className="text-muted-foreground">
                {step.count} {step.count === 1 ? "failure" : "failures"}
              </span>
            </div>
            <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-destructive/80 rounded-full transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
