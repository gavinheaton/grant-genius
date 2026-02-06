import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, AlertTriangle, Server, ArrowRight } from "lucide-react";
import { useBackendHealth } from "@/hooks/useBackendHealth";

export function QuickHealthWidget() {
  const { checkHealth, isChecking, result } = useBackendHealth();

  // Check health on mount
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const summary = result?.summary;
  const hasIssues = (summary?.missing ?? 0) > 0 || (summary?.errors ?? 0) > 0;

  return (
    <Card className={hasIssues ? "border-destructive/50" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-4 w-4" />
          Backend Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isChecking && !result ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : result ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {hasIssues ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-500" />
              )}
              <span className="font-medium">
                {summary?.healthy}/{summary?.total} functions OK
              </span>
            </div>
            
            {summary?.missing && summary.missing > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.missing} not deployed
              </Badge>
            )}
            
            {summary?.errors && summary.errors > 0 && (
              <Badge variant="secondary" className="gap-1 ml-1">
                {summary.errors} errors
              </Badge>
            )}
            
            <Button variant="ghost" size="sm" asChild className="w-full justify-between mt-2">
              <Link to="/admin/system-health">
                View Details
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Unable to check</p>
        )}
      </CardContent>
    </Card>
  );
}
