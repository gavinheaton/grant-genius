import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Clock } from "lucide-react";

interface ActiveRun {
  id: string;
  status: string;
  current_step: number;
  total_steps: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  application: {
    title: string | null;
    user_id: string;
  } | null;
  user_email: string | null;
}

// Format elapsed time between two dates
function formatElapsedTime(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return "-";
  
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.floor((end - start) / 1000);
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

interface ActiveRunsTableProps {
  runs: ActiveRun[];
  isLoading: boolean;
}

export function ActiveRunsTable({ runs, isLoading }: ActiveRunsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No active report generations</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Application</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Elapsed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
      {runs.map((run) => {
          const progressPercent = Math.round((run.current_step / run.total_steps) * 100);
          
          return (
            <TableRow key={run.id}>
              <TableCell className="font-medium">
                <span className="truncate max-w-[150px] block" title={run.user_email || "Unknown"}>
                  {run.user_email || "Unknown"}
                </span>
              </TableCell>
              <TableCell>
                <span className="truncate max-w-[150px] block" title={run.application?.title || "Untitled"}>
                  {run.application?.title || "Untitled"}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 min-w-[120px]">
                  <Progress value={progressPercent} className="h-2 flex-1" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {run.current_step}/{run.total_steps}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge 
                  variant={run.status === "running" ? "default" : "secondary"}
                  className={run.status === "running" ? "bg-blue-500 hover:bg-blue-600" : ""}
                >
                  {run.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatElapsedTime(run.started_at, run.completed_at)}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
