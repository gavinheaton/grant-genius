import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useReportLogs, ReportLog } from "@/hooks/useReportLogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  Play,
  RotateCcw,
  XCircle,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronRight,
  Terminal,
} from "lucide-react";
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

interface RunData {
  id: string;
  status: string;
  phase: string | null;
  execution_engine: string | null;
  current_step: number;
  total_steps: number;
  halt_reason: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  email_on_complete: boolean | null;
  application: {
    id: string;
    title: string | null;
    user_id: string;
    profiles: {
      email: string;
    } | null;
  } | null;
}

function LogLevelIcon({ level }: { level: ReportLog["level"] }) {
  switch (level) {
    case "error":
      return <AlertCircle className="h-3 w-3 text-destructive" />;
    case "warn":
      return <AlertTriangle className="h-3 w-3 text-warning" />;
    default:
      return <Info className="h-3 w-3 text-muted-foreground" />;
  }
}

function LogEntry({ log }: { log: ReportLog }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasDetails = log.details && Object.keys(log.details).length > 0;

  const levelClasses = {
    info: "text-muted-foreground",
    warn: "text-warning",
    error: "text-destructive",
  };

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "--:--:--";
    }
  };

  return (
    <div className="font-mono text-xs border-b border-border/50 last:border-0">
      <div
        className={`flex items-start gap-2 py-1.5 px-2 ${hasDetails ? "cursor-pointer hover:bg-muted/50" : ""}`}
        onClick={() => hasDetails && setDetailsOpen(!detailsOpen)}
      >
        {hasDetails ? (
          <span className="mt-0.5 text-muted-foreground">
            {detailsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <span className="text-muted-foreground/60 shrink-0">{formatTime(log.timestamp)}</span>
        <LogLevelIcon level={log.level} />
        <span className={`flex-1 ${levelClasses[log.level]}`}>{log.message}</span>
      </div>
      {hasDetails && detailsOpen && (
        <div className="pl-10 pr-2 pb-2">
          <pre className="text-[10px] text-muted-foreground bg-muted/50 p-2 rounded overflow-x-auto">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

const statusVariant = (status: string) => {
  switch (status) {
    case "completed": return "default" as const;
    case "running": return "default" as const;
    case "failed": return "destructive" as const;
    default: return "secondary" as const;
  }
};

const statusClassName = (status: string) => {
  if (status === "running") return "bg-blue-500 hover:bg-blue-600";
  if (status === "completed") return "bg-green-600 hover:bg-green-700";
  return "";
};

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAdminAuth();
  const { logs, isLoading: logsLoading } = useReportLogs(runId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLogsLength = useRef(logs.length);

  const [run, setRun] = useState<RunData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);

  // Auto-scroll on new logs
  useEffect(() => {
    if (logs.length > prevLogsLength.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLogsLength.current = logs.length;
  }, [logs.length]);

  // Fetch run data
  useEffect(() => {
    if (!runId) return;

    const fetchRun = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("report_runs")
        .select(`
          id, status, phase, execution_engine, current_step, total_steps,
          halt_reason, created_at, started_at, completed_at, email_on_complete,
          applications!inner(id, title, user_id, profiles!applications_user_id_profiles_fkey(email))
        `)
        .eq("id", runId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching run:", error);
        toast.error("Failed to load run details");
      }

      if (data) {
        const app = data.applications as any;
        setRun({
          ...data,
          application: app
            ? {
                id: app.id,
                title: app.title,
                user_id: app.user_id,
                profiles: app.profiles,
              }
            : null,
        });
      }
      setIsLoading(false);
    };

    fetchRun();

    // Subscribe to run changes
    const channel = supabase
      .channel(`admin-run-${runId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "report_runs",
        filter: `id=eq.${runId}`,
      }, (payload) => {
        setRun((prev) => prev ? { ...prev, ...payload.new } : prev);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [runId]);

  const handleAction = async (action: "resume" | "restart" | "cancel") => {
    if (!runId) return;
    setActionLoading(action);

    const fnMap = {
      resume: "resume-report-run",
      restart: "clear-and-restart-run",
      cancel: "cancel-report-run",
    };

    try {
      const { error } = await supabase.functions.invoke(fnMap[action], {
        body: { reportRunId: runId },
      });
      if (error) throw error;
      toast.success(
        action === "resume" ? "Run resumed" :
        action === "restart" ? "Run cleared and restarted" :
        "Run cancelled"
      );
    } catch (err) {
      console.error(`${action} error:`, err);
      toast.error(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecover = async () => {
    if (!runId) return;
    setActionLoading("recover");
    try {
      const { data, error } = await supabase.functions.invoke("recover-finalize-report", {
        body: { reportRunId: runId },
      });
      if (error) throw error;
      const strategy = data?.strategy || "unknown";
      toast.success(`Report recovered (strategy: ${strategy})`);
    } catch (err) {
      console.error("recover error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to recover report");
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Run not found</p>
        <Button variant="link" onClick={() => navigate("/admin")}>Back to Dashboard</Button>
      </div>
    );
  }

  const formatTs = (ts: string | null) =>
    ts ? format(new Date(ts), "MMM d, yyyy HH:mm:ss") : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight truncate">
            Run {run.id.slice(0, 8)}…
          </h1>
          <p className="text-sm text-muted-foreground">
            {run.application?.profiles?.email || "Unknown user"} · {run.application?.title || "Untitled"}
          </p>
        </div>
        <Badge variant={statusVariant(run.status)} className={statusClassName(run.status)}>
          {run.status}
        </Badge>
      </div>

      {/* Metadata + Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium">{run.status}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Phase</span>
              <p className="font-medium">{run.phase || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Engine</span>
              <p className="font-medium">{run.execution_engine || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Progress</span>
              <p className="font-medium">Step {run.current_step} / {run.total_steps}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Created</span>
              <p className="font-medium">{formatTs(run.created_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Started</span>
              <p className="font-medium">{formatTs(run.started_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Completed</span>
              <p className="font-medium">{formatTs(run.completed_at)}</p>
            </div>
            {run.halt_reason && (
              <div className="col-span-2 md:col-span-3">
                <span className="text-muted-foreground">Halt Reason</span>
                <p className="font-medium text-destructive font-mono text-xs break-all mt-1">
                  {run.halt_reason}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-6 pt-4 border-t space-y-3">
            {run.status !== "completed" && (
              <p className="text-sm text-muted-foreground">
                Completed {run.current_step} of {run.total_steps} steps
              </p>
            )}
            <div className="flex gap-2">
              {(run.status === "failed" || run.status === "running" || run.status === "pending") && (
                <Button
                  size="sm"
                  onClick={() => handleAction("resume")}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "resume" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                  Resume from Step {run.current_step}
                </Button>
              )}
              {(run.status === "running" || run.status === "pending") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("cancel")}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "cancel" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                  Force Fail
                </Button>
              )}
              {isSuperAdmin && run.status !== "completed" && (
                <AlertDialog open={confirmRestart} onOpenChange={setConfirmRestart}>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!!actionLoading}
                    >
                      {actionLoading === "restart" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                      Wipe & Restart
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Wipe all progress?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete all {run.current_step} completed steps and restart from the beginning.
                        If you just want to continue from where it stopped, close this and use <strong>Resume from Step {run.current_step}</strong> instead.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => { setConfirmRestart(false); handleAction("restart"); }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, wipe & restart
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {run.status === "completed" && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRecover}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "recover" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                    Recover Report
                  </Button>
                  <span className="text-sm text-muted-foreground">Re-assemble report from completed step outputs</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Worker Logs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Worker Logs
            {logs.length > 0 && (
              <span className="text-muted-foreground font-normal text-sm">
                ({logs.length} {logs.length === 1 ? "entry" : "entries"})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading && logs.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading logs...</div>
          )}
          {!logsLoading && logs.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No worker logs recorded for this run.
            </div>
          )}
          {logs.length > 0 && (
            <ScrollArea className="h-[500px]" ref={scrollRef}>
              <div className="divide-y divide-border/50">
                {logs.map((log) => (
                  <LogEntry key={log.id} log={log} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
