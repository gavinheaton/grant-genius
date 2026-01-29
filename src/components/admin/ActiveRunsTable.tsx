import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { Activity } from "lucide-react";

interface ActiveRun {
  id: string;
  status: string;
  current_step: number;
  total_steps: number;
  created_at: string;
  started_at: string | null;
  application: {
    title: string | null;
    user_id: string;
  } | null;
  user_email: string | null;
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
          <TableHead>Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => {
          const progressPercent = Math.round((run.current_step / run.total_steps) * 100);
          const startTime = run.started_at || run.created_at;
          
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
                {formatDistanceToNow(new Date(startTime), { addSuffix: true })}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
