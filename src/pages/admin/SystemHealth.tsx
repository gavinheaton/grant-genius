import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, CheckCircle, XCircle, AlertTriangle, Server, Key, Zap, Rocket } from "lucide-react";
import { useBackendHealth, FUNCTION_CATEGORIES } from "@/hooks/useBackendHealth";
import { FunctionCategorySection } from "@/components/admin/FunctionCategorySection";
import { toast } from "@/hooks/use-toast";

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

export default function SystemHealth() {
  const { 
    checkHealth, 
    isChecking, 
    result, 
    error, 
    deployingFunctions,
    markDeploying,
    clearDeploying,
    getMissingFunctions,
    getProbesByCategory,
  } = useBackendHealth();
  
  const [isDeployingAll, setIsDeployingAll] = useState(false);

  // Auto-check on mount
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const missingFunctions = getMissingFunctions();
  const hasMissing = missingFunctions.length > 0;

  const handleRequestDeploy = (functionName: string) => {
    markDeploying(functionName);
    toast({
      title: "Deployment Requested",
      description: (
        <div className="space-y-2">
          <p>To deploy <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{functionName}</code>:</p>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Make a small change to the function code</li>
            <li>Or click "Publish" to republish the project</li>
          </ol>
          <p className="text-xs text-muted-foreground">Edge functions auto-deploy on publish.</p>
        </div>
      ),
      duration: 8000,
    });
    
    // Clear deploying state after a delay
    setTimeout(() => {
      clearDeploying(functionName);
    }, 5000);
  };

  const handleDeployAllMissing = () => {
    setIsDeployingAll(true);
    missingFunctions.forEach(f => markDeploying(f.name));
    
    toast({
      title: `${missingFunctions.length} Functions Need Deployment`,
      description: (
        <div className="space-y-2">
          <p>Missing functions:</p>
          <ul className="list-disc list-inside text-sm">
            {missingFunctions.map(f => (
              <li key={f.name} className="font-mono text-xs">{f.name}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-2">
            Click "Publish" in the top right to deploy all functions.
          </p>
        </div>
      ),
      duration: 10000,
    });
    
    // Clear deploying state after a delay
    setTimeout(() => {
      missingFunctions.forEach(f => clearDeploying(f.name));
      setIsDeployingAll(false);
    }, 5000);
  };

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
                        <CheckCircle className="h-4 w-4 text-primary" />
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

      {/* Function Probes with Categories */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Edge Functions
              </CardTitle>
              <CardDescription>
                {result?.summary 
                  ? `${result.summary.healthy}/${result.summary.total} functions healthy` 
                  : "Probing backend functions..."}
              </CardDescription>
            </div>
            {hasMissing && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleDeployAllMissing}
                disabled={isDeployingAll}
              >
                <Rocket className="h-4 w-4 mr-2" />
                Deploy All Missing ({missingFunctions.length})
              </Button>
            )}
          </div>
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
              {FUNCTION_CATEGORIES.map((category) => (
                <FunctionCategorySection
                  key={category.id}
                  category={category}
                  probes={getProbesByCategory(category.id)}
                  deployingFunctions={deployingFunctions}
                  onRequestDeploy={handleRequestDeploy}
                />
              ))}
              
              {hasMissing && (
                <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm text-destructive font-medium">
                    ⚠️ {missingFunctions.length} function{missingFunctions.length > 1 ? "s are" : " is"} not deployed.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Edge functions auto-deploy when you publish the project. Click "Publish" in the top-right corner to deploy all functions.
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
