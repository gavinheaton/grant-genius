import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Terminal, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useReportLogs, ReportLog } from "@/hooks/useReportLogs";
import { formatDistanceToNow } from "date-fns";

interface ReportLogViewerProps {
  reportRunId: string | null | undefined;
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
        {hasDetails && (
          <span className="mt-0.5 text-muted-foreground">
            {detailsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
        )}
        {!hasDetails && <span className="w-3" />}
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

export function ReportLogViewer({ reportRunId }: ReportLogViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { logs, isLoading, error } = useReportLogs(reportRunId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLogsLength = useRef(logs.length);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logs.length > prevLogsLength.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLogsLength.current = logs.length;
  }, [logs.length]);

  // Auto-open when first log arrives
  useEffect(() => {
    if (logs.length > 0 && !isOpen) {
      setIsOpen(true);
    }
  }, [logs.length, isOpen]);

  if (!reportRunId) return null;

  const hasErrors = logs.some((log) => log.level === "error");
  const hasWarnings = logs.some((log) => log.level === "warn");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-4">
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium flex-1 text-left">
          Worker Logs
          {logs.length > 0 && (
            <span className="text-muted-foreground font-normal ml-1">
              ({logs.length} {logs.length === 1 ? "entry" : "entries"})
            </span>
          )}
        </span>
        {hasErrors && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">errors</Badge>}
        {!hasErrors && hasWarnings && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-warning border-warning">warnings</Badge>}
        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 border rounded-lg bg-background">
          {isLoading && logs.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading logs...
            </div>
          )}
          {error && (
            <div className="p-4 text-center text-sm text-destructive">
              Error: {error}
            </div>
          )}
          {!isLoading && logs.length === 0 && !error && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No logs yet. Logs will appear here as the worker processes your report.
            </div>
          )}
          {logs.length > 0 && (
            <ScrollArea className="h-[200px]" ref={scrollRef}>
              <div className="divide-y divide-border/50">
                {logs.map((log) => (
                  <LogEntry key={log.id} log={log} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
