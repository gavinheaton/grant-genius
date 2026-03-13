import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, XCircle, Ban, CheckCircle2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { Link } from "react-router-dom";

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

interface CompletedRun {
  id: string;
  created_at: string;
  completed_at: string | null;
  application: { title: string | null } | null;
  user_email: string | null;
}

interface RecentRunsPanelProps {
  stageFailures: FailedRun[];
  cancellations: FailedRun[];
  completedRuns: CompletedRun[];
  isLoading: boolean;
}

function FailureItem({ failure, isCancellation }: { failure: FailedRun; isCancellation: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const failureTime = failure.completed_at || failure.created_at;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className={`flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer ${isCancellation ? "opacity-70" : ""}`}>
          <div className="flex items-center gap-3">
            {isCancellation ? (
              <Ban className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
            )}
            <div className="text-left">
              <Link to={`/admin/runs/${failure.id}`} className="text-sm font-medium truncate max-w-[200px] block text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                {failure.user_email || "Unknown user"}
              </Link>
              <p className="text-xs text-muted-foreground">
                Step {failure.current_step}: {failure.failed_step?.step_name || "Unknown step"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isCancellation ? "secondary" : "destructive"} className="text-xs">
              {isCancellation ? "Cancelled" : "Failed"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(failureTime), { addSuffix: true })}
            </span>
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className={`mt-1 p-3 rounded-lg bg-muted/30 border-l-2 text-sm ${isCancellation ? "border-muted-foreground" : "border-destructive"}`}>
          <p className="font-medium text-muted-foreground mb-1">Application:</p>
          <p className="mb-2">{failure.application?.title || "Untitled"}</p>
          {!isCancellation && (
            <>
              <p className="font-medium text-muted-foreground mb-1">Error:</p>
              <p className="text-destructive font-mono text-xs break-all">
                {failure.failed_step?.error_message || "No error message recorded"}
              </p>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FailuresList({ failures, isCancellation }: { failures: FailedRun[]; isCancellation: boolean }) {
  if (failures.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">
          {isCancellation ? "No recent cancellations" : "No recent stage failures"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {failures.map((failure) => (
        <FailureItem key={failure.id} failure={failure} isCancellation={isCancellation} />
      ))}
    </div>
  );
}

function CompletedList({ runs }: { runs: CompletedRun[] }) {
  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <CheckCircle2 className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No recent completed runs</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const runTime = run.completed_at || run.created_at;
        return (
          <Link
            key={run.id}
            to={`/admin/runs/${run.id}`}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors block"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <div className="text-left">
                <span className="text-sm font-medium truncate max-w-[200px] block text-primary hover:underline">
                  {run.user_email || "Unknown user"}
                </span>
                <p className="text-xs text-muted-foreground">
                  {run.application?.title || "Untitled"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">
                Completed
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(runTime), { addSuffix: true })}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export function RecentRunsPanel({ stageFailures, cancellations, completedRuns, isLoading }: RecentRunsPanelProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="failures" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="failures" className="gap-2">
          Failures
          {stageFailures.length > 0 && (
            <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5">
              {stageFailures.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="cancellations" className="gap-2">
          Cancelled
          {cancellations.length > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
              {cancellations.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="completed" className="gap-2">
          Completed
          {completedRuns.length > 0 && (
            <Badge variant="outline" className="ml-1 h-5 min-w-5 px-1.5">
              {completedRuns.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="failures" className="mt-4">
        <FailuresList failures={stageFailures} isCancellation={false} />
      </TabsContent>
      <TabsContent value="cancellations" className="mt-4">
        <FailuresList failures={cancellations} isCancellation={true} />
      </TabsContent>
      <TabsContent value="completed" className="mt-4">
        <CompletedList runs={completedRuns} />
      </TabsContent>
    </Tabs>
  );
}
