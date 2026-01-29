import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, XCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";

interface FailedRun {
  id: string;
  current_step: number;
  total_steps: number;
  created_at: string;
  completed_at: string | null;
  application: {
    title: string | null;
  } | null;
  user_email: string | null;
  failed_step?: {
    step_name: string;
    error_message: string | null;
  } | null;
}

interface FailuresPanelProps {
  failures: FailedRun[];
  isLoading: boolean;
}

export function FailuresPanel({ failures, isLoading }: FailuresPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (failures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No recent failures</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {failures.map((failure) => {
        const failureTime = failure.completed_at || failure.created_at;
        const isCancelled = failure.failed_step?.error_message?.toLowerCase().includes("cancel");
        
        return (
          <Collapsible 
            key={failure.id}
            open={expandedId === failure.id}
            onOpenChange={(open) => setExpandedId(open ? failure.id : null)}
          >
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium truncate max-w-[200px]">
                      {failure.user_email || "Unknown user"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Step {failure.current_step}: {failure.failed_step?.step_name || "Unknown step"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isCancelled ? "secondary" : "destructive"} className="text-xs">
                    {isCancelled ? "Cancelled" : "Failed"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(failureTime), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 p-3 rounded-lg bg-muted/30 border-l-2 border-destructive text-sm">
                <p className="font-medium text-muted-foreground mb-1">Application:</p>
                <p className="mb-2">{failure.application?.title || "Untitled"}</p>
                <p className="font-medium text-muted-foreground mb-1">Error:</p>
                <p className="text-destructive font-mono text-xs break-all">
                  {failure.failed_step?.error_message || "No error message recorded"}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
