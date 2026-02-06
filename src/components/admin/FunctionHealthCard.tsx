import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertTriangle, Zap, Loader2 } from "lucide-react";
import type { FunctionProbeResult } from "@/hooks/useBackendHealth";

interface FunctionHealthCardProps {
  probe: FunctionProbeResult;
  isDeploying?: boolean;
  onRequestDeploy?: () => void;
}

function StatusBadge({ status }: { status: "ok" | "error" | "not_deployed" }) {
  const variants: Record<typeof status, { variant: "default" | "destructive" | "secondary"; icon: typeof CheckCircle; label: string }> = {
    ok: { variant: "default", icon: CheckCircle, label: "OK" },
    error: { variant: "destructive", icon: XCircle, label: "Error" },
    not_deployed: { variant: "destructive", icon: AlertTriangle, label: "Not Deployed" },
  };
  
  const { variant, icon: Icon, label } = variants[status];
  
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function FunctionHealthCard({ probe, isDeploying, onRequestDeploy }: FunctionHealthCardProps) {
  const showDeployButton = probe.status === "not_deployed" || probe.status === "error";
  
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
      <div className="flex items-center gap-3">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm font-mono">{probe.name}</p>
          {probe.latencyMs !== null && probe.status === "ok" && (
            <p className="text-xs text-muted-foreground">{probe.latencyMs}ms</p>
          )}
          {probe.error && probe.status !== "not_deployed" && (
            <p className="text-xs text-destructive truncate max-w-48">{probe.error}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {probe.statusCode !== null && probe.status === "ok" && (
          <span className="text-xs text-muted-foreground">HTTP {probe.statusCode}</span>
        )}
        <StatusBadge status={probe.status} />
        {showDeployButton && onRequestDeploy && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onRequestDeploy}
            disabled={isDeploying}
            className="ml-2"
          >
            {isDeploying ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Deploying...
              </>
            ) : (
              "Deploy"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
