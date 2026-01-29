import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { startOfDay } from "date-fns";
import { LiveOperationsCards } from "@/components/admin/LiveOperationsCards";
import { ActiveRunsTable } from "@/components/admin/ActiveRunsTable";
import { FailuresPanel } from "@/components/admin/FailuresPanel";
import { TrendChart } from "@/components/admin/TrendChart";
import { SystemHealthCards } from "@/components/admin/SystemHealthCards";

export default function AdminDashboard() {
  const todayStart = startOfDay(new Date()).toISOString();

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
            applications!inner(title, user_id, profiles:user_id(email))
          `)
          .in("status", ["running", "pending"])
          .order("created_at", { ascending: false })
          .limit(10),

        // Recent failures with step info
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
          .limit(5),

        // 7-day trend data
        supabase.rpc("get_report_trend_7_days"),

        // System health counts
        supabase.from("email_outbox").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "paid"),
        supabase.from("entitlements").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }),
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
        application: run.applications ? { 
          title: run.applications.title,
          user_id: run.applications.user_id 
        } : null,
        user_email: run.applications?.profiles?.email || null,
      }));

      const currentlyRunning = activeRuns.filter((r: any) => r.status === "running").length;

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

      return {
        currentlyRunning,
        completedToday,
        failedToday,
        successRate7d,
        activeRuns,
        recentFailures,
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

      {/* Two Column Layout: Failures + Trend/Health */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Failures */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Failures</CardTitle>
            <CardDescription>Last 5 failed or cancelled report generations</CardDescription>
          </CardHeader>
          <CardContent>
            <FailuresPanel failures={data?.recentFailures ?? []} isLoading={isLoading} />
          </CardContent>
        </Card>

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
        </div>
      </div>
    </div>
  );
}
