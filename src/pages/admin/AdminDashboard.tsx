import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { startOfDay, subDays, differenceInMinutes } from "date-fns";
import { LiveOperationsCards } from "@/components/admin/LiveOperationsCards";
import { ActiveRunsTable } from "@/components/admin/ActiveRunsTable";
import { RecentRunsPanel } from "@/components/admin/RecentRunsPanel";
import { StepFailureBreakdown } from "@/components/admin/StepFailureBreakdown";
import { TrendChart } from "@/components/admin/TrendChart";
import { SystemHealthCards } from "@/components/admin/SystemHealthCards";
import { StalledRunsTable } from "@/components/admin/StalledRunsTable";
import { QuickHealthWidget } from "@/components/admin/QuickHealthWidget";
import { useAdminAuth } from "@/hooks/useAdminAuth";

// Helper to check if an error message indicates cancellation
function isCancellation(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return lower.includes("cancel");
}

export default function AdminDashboard() {
  const { isSuperAdmin } = useAdminAuth();
  const todayStart = startOfDay(new Date()).toISOString();
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Fetch all dashboard data with auto-refresh
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const [
        todayRunsRes,
        activeRunsRes,
        recentFailuresRes,
        trendDataRes,
        emailsRes,
        ordersRes,
        entitlementsRes,
        auditRes,
        stepFailuresRes,
        stalledRunsRes,
      ] = await Promise.all([
        // Today's run statistics
        supabase
          .from("report_runs")
          .select("status")
          .gte("created_at", todayStart),

        // Active runs with user info via applications
        supabase
          .from("report_runs")
          .select(`
            id,
            status,
            current_step,
            total_steps,
            created_at,
            started_at,
            completed_at,
            applications!inner(title, user_id, profiles:user_id(email))
          `)
          .in("status", ["running", "pending"])
          .order("created_at", { ascending: false })
          .limit(10),

        // Recent failures with step info (increased limit for better analysis)
        supabase
          .from("report_runs")
          .select(`
            id,
            current_step,
            total_steps,
            created_at,
            completed_at,
            applications!inner(title, user_id, profiles:user_id(email)),
            report_run_steps(step_name, error_message)
          `)
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(20),

        // 7-day trend data
        supabase.rpc("get_report_trend_7_days"),

        // System health counts
        supabase.from("email_outbox").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "paid"),
        supabase.from("entitlements").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }),

        // Step failure breakdown (last 30 days, excluding cancellations)
        supabase
          .from("report_run_steps")
          .select("step_number, step_name, error_message")
          .eq("status", "failed")
          .gte("created_at", thirtyDaysAgo),

        // Recent completed runs
        supabase
          .from("report_runs")
          .select(`
            id,
            created_at,
            completed_at,
            applications!inner(title, user_id, profiles:user_id(email))
          `)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(20),

        // Stalled runs - fetch all running/pending, filter by activity client-side
        supabase
          .from("report_runs")
          .select(`
            id,
            current_step,
            total_steps,
            created_at,
            started_at,
            execution_engine,
            applications!inner(title, user_id, profiles:user_id(email))
          `)
          .in("status", ["running", "pending"])
          .order("started_at", { ascending: true }),
      ]);

      // Calculate today's stats
      const todayRuns = todayRunsRes.data || [];
      const completedToday = todayRuns.filter((r) => r.status === "completed").length;
      const failedToday = todayRuns.filter((r) => r.status === "failed").length;

      // Calculate active runs
      const activeRuns = (activeRunsRes.data || []).map((run: any) => ({
        id: run.id,
        status: run.status,
        current_step: run.current_step,
        total_steps: run.total_steps,
        created_at: run.created_at,
        started_at: run.started_at,
        completed_at: run.completed_at,
        application: run.applications ? { 
          title: run.applications.title,
          user_id: run.applications.user_id 
        } : null,
        user_email: run.applications?.profiles?.email || null,
      }));

      const currentlyRunning = activeRuns.length;

      // Calculate 7-day success rate
      const trendData = trendDataRes.data || [];
      const totalCompleted = trendData.reduce((sum: number, d: any) => sum + (d.completed || 0), 0);
      const totalFailed = trendData.reduce((sum: number, d: any) => sum + (d.failed || 0), 0);
      const totalFinished = totalCompleted + totalFailed;
      const successRate7d = totalFinished > 0 ? Math.round((totalCompleted / totalFinished) * 100) : 0;

      // Map failures with step info
      const recentFailures = (recentFailuresRes.data || []).map((run: any) => {
        // Find the failed step (usually the one with an error message or at current_step)
        const failedStep = run.report_run_steps?.find(
          (s: any) => s.error_message || s.step_number === run.current_step
        );
        
        return {
          id: run.id,
          current_step: run.current_step,
          total_steps: run.total_steps,
          created_at: run.created_at,
          completed_at: run.completed_at,
          application: run.applications ? { title: run.applications.title } : null,
          user_email: run.applications?.profiles?.email || null,
          failed_step: failedStep ? {
            step_name: failedStep.step_name,
            error_message: failedStep.error_message,
          } : null,
        };
      });

      // Separate stage failures from cancellations
      const stageFailures = recentFailures.filter(
        f => !isCancellation(f.failed_step?.error_message)
      );
      const cancellations = recentFailures.filter(
        f => isCancellation(f.failed_step?.error_message)
      );

      // Aggregate step failure breakdown (excluding cancellations)
      const stepFailuresRaw = stepFailuresRes.data || [];
      const stepFailureMap = new Map<string, { step_number: number; step_name: string; count: number }>();
      
      for (const step of stepFailuresRaw) {
        if (isCancellation(step.error_message)) continue;
        
        const key = `${step.step_number}-${step.step_name}`;
        const existing = stepFailureMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          stepFailureMap.set(key, {
            step_number: step.step_number,
            step_name: step.step_name,
            count: 1,
          });
        }
      }

      // Sort by count descending and take top 5
      const stepFailureBreakdown = Array.from(stepFailureMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Process stalled runs with activity-based detection
      const now = new Date();
      const candidateRuns = stalledRunsRes.data || [];
      
      // Fetch latest step activity for each candidate run
      let stalledRuns: any[] = [];
      if (candidateRuns.length > 0) {
        const runIds = candidateRuns.map((r: any) => r.id);
        const { data: stepData } = await supabase
          .from("report_run_steps")
          .select("report_run_id, step_name, step_number, started_at, completed_at")
          .in("report_run_id", runIds)
          .order("step_number", { ascending: false });

        // Build map of latest activity per run + current step name
        const latestActivityMap = new Map<string, Date>();
        const currentStepNameMap = new Map<string, string>();
        for (const step of (stepData || [])) {
          const runId = step.report_run_id;
          if (!latestActivityMap.has(runId)) {
            const timestamps = [step.started_at, step.completed_at].filter(Boolean).map((t: string) => new Date(t));
            if (timestamps.length > 0) {
              latestActivityMap.set(runId, new Date(Math.max(...timestamps.map(t => t.getTime()))));
            }
          }
          // Match step name to current_step for this run
          const run = candidateRuns.find((r: any) => r.id === runId);
          if (run && step.step_number === run.current_step && !currentStepNameMap.has(runId)) {
            currentStepNameMap.set(runId, step.step_name);
          }
        }

        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);

        stalledRuns = candidateRuns
          .map((run: any) => {
            const lastActivity = latestActivityMap.get(run.id) 
              || (run.started_at ? new Date(run.started_at) : new Date(run.created_at));
            
            return {
              id: run.id,
              current_step: run.current_step,
              total_steps: run.total_steps,
              started_at: run.started_at,
              created_at: run.created_at,
              application: run.applications ? {
                title: run.applications.title,
                user_id: run.applications.user_id,
              } : null,
              user_email: run.applications?.profiles?.email || null,
              stalled_duration_minutes: differenceInMinutes(now, lastActivity),
              step_name: currentStepNameMap.get(run.id) || null,
              execution_engine: run.execution_engine || null,
              lastActivity,
            };
          })
          .filter((run: any) => run.lastActivity < fifteenMinAgo);
      }

      return {
        currentlyRunning,
        completedToday,
        failedToday,
        successRate7d,
        activeRuns,
        stageFailures,
        cancellations,
        stepFailureBreakdown,
        stalledRuns,
        trendData,
        systemHealth: {
          emailsSent: emailsRes.count ?? 0,
          ordersPaid: ordersRes.count ?? 0,
          activeEntitlements: entitlementsRes.count ?? 0,
          auditEntries: auditRes.count ?? 0,
        },
      };
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Real-time monitoring of report generation and system health
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" style={{ animationDuration: "3s" }} />
          <span>Auto-refresh</span>
          {lastUpdated && (
            <Badge variant="outline" className="ml-2">
              Updated {lastUpdated}
            </Badge>
          )}
        </div>
      </div>

      {/* Live Operations Cards */}
      <LiveOperationsCards
        currentlyRunning={data?.currentlyRunning ?? 0}
        completedToday={data?.completedToday ?? 0}
        failedToday={data?.failedToday ?? 0}
        successRate7d={data?.successRate7d ?? 0}
        isLoading={isLoading}
      />

      {/* Stalled Runs Alert */}
      {(data?.stalledRuns?.length ?? 0) > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <CardTitle className="text-destructive">Stalled Runs Detected</CardTitle>
                  <CardDescription>
                    These runs have been stuck for 15+ minutes and may need manual intervention
                  </CardDescription>
                </div>
              </div>
              <Badge variant="destructive">{data?.stalledRuns?.length} stalled</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <StalledRunsTable runs={data?.stalledRuns ?? []} isLoading={isLoading} isSuperAdmin={isSuperAdmin} />
          </CardContent>
        </Card>
      )}

      {/* Active Report Runs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Report Runs</CardTitle>
              <CardDescription>Currently generating or pending reports</CardDescription>
            </div>
            {(data?.activeRuns?.length ?? 0) > 0 && (
              <Badge>{data?.activeRuns?.length} active</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ActiveRunsTable runs={data?.activeRuns ?? []} isLoading={isLoading} />
        </CardContent>
      </Card>

      {/* Two Column Layout: Failures + Step Breakdown | Trend/Health */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Column: Failures + Step Breakdown */}
        <div className="space-y-6">
          {/* Recent Failures with Tabs */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Failures</CardTitle>
              <CardDescription>Stage gate failures vs user cancellations</CardDescription>
            </CardHeader>
            <CardContent>
              <FailuresPanel 
                stageFailures={data?.stageFailures ?? []} 
                cancellations={data?.cancellations ?? []}
                isLoading={isLoading} 
              />
            </CardContent>
          </Card>

          {/* Step Failure Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Step Failure Breakdown</CardTitle>
              <CardDescription>Which steps fail most often (last 30 days, excludes cancellations)</CardDescription>
            </CardHeader>
            <CardContent>
              <StepFailureBreakdown 
                stepFailures={data?.stepFailureBreakdown ?? []} 
                isLoading={isLoading} 
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Trend + Health */}
        <div className="space-y-6">
          {/* 7-Day Trend */}
          <Card>
            <CardHeader>
              <CardTitle>7-Day Trend</CardTitle>
              <CardDescription>Report generation activity over the past week</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart data={data?.trendData ?? []} isLoading={isLoading} />
            </CardContent>
          </Card>

          {/* System Health */}
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Overall platform metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <SystemHealthCards
                emailsSent={data?.systemHealth?.emailsSent ?? 0}
                ordersPaid={data?.systemHealth?.ordersPaid ?? 0}
                activeEntitlements={data?.systemHealth?.activeEntitlements ?? 0}
                auditEntries={data?.systemHealth?.auditEntries ?? 0}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>

          {/* Backend Health Widget */}
          <QuickHealthWidget />
        </div>
      </div>
    </div>
  );
}
