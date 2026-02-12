import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Clock, Loader2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface StalledRun {
  id: string;
  current_step: number;
  total_steps: number;
  started_at: string | null;
  created_at: string;
  application: {
    title: string | null;
    user_id: string;
  } | null;
  user_email: string | null;
  stalled_duration_minutes: number;
}

interface StalledRunsTableProps {
  runs: StalledRun[];
  isLoading: boolean;
}

export function StalledRunsTable({ runs, isLoading }: StalledRunsTableProps) {
  const [cleaningRunId, setCleaningRunId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleForceFail = async (runId: string) => {
    setCleaningRunId(runId);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        toast.error("You must be logged in to perform this action");
        return;
      }

      const response = await supabase.functions.invoke("cleanup-stalled-runs", {
        body: { run_id: runId },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      if (result.cleaned && result.cleaned.length > 0) {
        const cleaned = result.cleaned[0];
        toast.success(
          `Run marked as failed${cleaned.credit_refunded ? " and credit refunded" : ""}`
        );
      } else {
        toast.info("Run was already cleaned up or not found");
      }

      // Refresh dashboard data
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard-stats"] });
    } catch (error) {
      console.error("Force fail error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to clean up run");
    } finally {
      setCleaningRunId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No stalled runs detected</p>
        <p className="text-xs mt-1">Runs are considered stalled after 5+ minutes without progress</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Application</TableHead>
          <TableHead>Step</TableHead>
          <TableHead>Stalled For</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="font-medium">
              <Link to={`/admin/runs/${run.id}`} className="text-primary hover:underline truncate max-w-[150px] block">
                {run.user_email || "Unknown"}
              </Link>
            </TableCell>
            <TableCell>
              <span className="truncate max-w-[150px] block text-muted-foreground">
                {run.application?.title || "Untitled"}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="gap-1">
                <AlertTriangle className="h-3 w-3 text-warning" />
                Step {run.current_step}/{run.total_steps}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="text-destructive font-medium">
                {run.stalled_duration_minutes >= 60
                  ? `${Math.floor(run.stalled_duration_minutes / 60)}h ${run.stalled_duration_minutes % 60}m`
                  : `${run.stalled_duration_minutes}m`}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cleaningRunId === run.id}
                  >
                    {cleaningRunId === run.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-1" />
                        Force Fail
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Force fail this run?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the run as failed, update the step with a timeout error,
                      and refund the user's credit if one was consumed.
                      <br /><br />
                      <strong>User:</strong> {run.user_email || "Unknown"}<br />
                      <strong>Application:</strong> {run.application?.title || "Untitled"}<br />
                      <strong>Stuck at:</strong> Step {run.current_step}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleForceFail(run.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Force Fail & Refund
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
