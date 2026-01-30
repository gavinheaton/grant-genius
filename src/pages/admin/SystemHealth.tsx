import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Server, Key, Zap } from "lucide-react";
import { useBackendHealth, type FunctionProbeResult } from "@/hooks/useBackendHealth";

function StatusBadge({ status }: { status: "ok" | "error" | "not_deployed" | "unreachable" }) {
  const variants: Record<typeof status, { variant: "default" | "destructive" | "secondary"; icon: typeof CheckCircle }> = {
    ok: { variant: "default", icon: CheckCircle },
    error: { variant: "destructive", icon: XCircle },
    not_deployed: { variant: "destructive", icon: AlertTriangle },
    unreachable: { variant: "secondary", icon: AlertTriangle },
  };
  
  const { variant, icon: Icon } = variants[status];
  
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {status === "not_deployed" ? "Not Deployed" : status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function FunctionProbeCard({ probe }: { probe: FunctionProbeResult }) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <Zap className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium text-sm">{probe.name}</p>
          {probe.latencyMs !== null && (
            <p className="text-xs text-muted-foreground">{probe.latencyMs}ms</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {probe.statusCode !== null && (
          <span className="text-xs text-muted-foreground">HTTP {probe.statusCode}</span>
        )}
        <StatusBadge status={probe.status} />
      </div>
    </div>
  );
}

export default function SystemHealth() {
  const { checkHealth, isChecking, result, error } = useBackendHealth();

  // Auto-check on mount
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">System Health</h1>
          <p className="text-muted-foreground">
            Backend diagnostics and function deployment status
          </p>
        </div>
        <Button onClick={checkHealth} disabled={isChecking}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Backend Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Backend Configuration
          </CardTitle>
          <CardDescription>
            Connection details for the backend environment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isChecking && !result ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : result ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Backend URL</p>
                <p className="font-mono text-sm break-all">{result.backendUrl}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Project Ref</p>
                <p className="font-mono text-sm">{result.projectRef}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Check</p>
                <p className="text-sm">{new Date(result.timestamp).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">System Status</p>
                <StatusBadge status={result.systemHealth.status} />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No data yet</p>
          )}
        </CardContent>
      </Card>

      {/* Secrets Status */}
      {result?.systemHealth.data && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Secrets Configuration
            </CardTitle>
            <CardDescription>
              Required secrets presence (values are never exposed)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const secrets = (result.systemHealth.data as { secrets?: { configured?: Record<string, boolean> } })?.secrets?.configured;
              if (!secrets) return <p className="text-muted-foreground">No secrets data</p>;
              
              return (
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(secrets).map(([name, present]) => (
                    <div key={name} className="flex items-center justify-between p-2 border rounded">
                      <span className="font-mono text-xs">{name}</span>
                      {present ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Function Probes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Function Deployment Status
          </CardTitle>
          <CardDescription>
            Critical backend functions probed via OPTIONS request
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isChecking && !result ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : result?.functionProbes ? (
            <div className="space-y-2">
              {result.functionProbes.map((probe) => (
                <FunctionProbeCard key={probe.name} probe={probe} />
              ))}
              {result.functionProbes.some(p => p.status === "not_deployed") && (
                <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive font-medium">
                    ⚠️ Some functions are not deployed. This will cause 404 errors when users try to generate reports.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Functions should auto-deploy when code is published. If this persists, try re-publishing the project.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">No data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
