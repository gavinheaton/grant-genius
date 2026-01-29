

# Enhanced Admin Dashboard: Activity and Error Monitoring

## Current State

The existing admin dashboard shows only static totals (grants, users, emails, audit logs) with placeholder cards. It doesn't show any real-time operational insights.

## Available Data Sources

Based on database analysis, you have rich operational data:

| Source | Insights Available |
|--------|-------------------|
| `report_runs` | Generation status, success/failure rates, current step progress |
| `report_run_steps` | Step-level timing, errors, bottlenecks |
| `orders` | Revenue tracking, payment status |
| `entitlements` | Credit usage, remaining balances |
| `email_outbox` | Email delivery status |
| `audit_logs` | Admin actions, system changes |

## Proposed Dashboard Layout

```text
+------------------------------------------------------------------+
|                    ADMIN DASHBOARD                                |
+------------------------------------------------------------------+
|                                                                   |
|  [LIVE OPERATIONS]                                                |
|  +------------+  +------------+  +------------+  +------------+   |
|  | Currently  |  | Completed  |  | Failed     |  | Success    |   |
|  | Running: 1 |  | Today: 0   |  | Today: 5   |  | Rate: 0%   |   |
|  +------------+  +------------+  +------------+  +------------+   |
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
|  [ACTIVE REPORT RUNS]                               Auto-refresh  |
|  +---------------------------------------------------------------+|
|  | User          | Application    | Step    | Progress | Status  ||
|  |---------------|----------------|---------|----------|---------|
|  | gavin@...     | AEA Ignite     | 11/13   | 85%      | Running ||
|  +---------------------------------------------------------------+|
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
|  [RECENT FAILURES]                                   View All >>  |
|  +---------------------------------------------------------------+|
|  | Time     | User       | Step Failed    | Error Message        ||
|  |----------|------------|----------------|----------------------||
|  | 2h ago   | gavin@...  | Step 0         | (cancelled)          ||
|  +---------------------------------------------------------------+|
|                                                                   |
+------------------------------------------------------------------+
|                                                                   |
|  [7-DAY TREND]              |  [SYSTEM HEALTH]                   |
|  Reports: ===========       |  Emails Sent: 6                    |
|  Success: ====              |  Orders Paid: 7                    |
|  Failed:  =======           |  Active Users: 1                   |
|                              |  Credits Used: 12                  |
|                                                                   |
+------------------------------------------------------------------+
```

## Proposed Sections

### 1. Live Operations Cards (Top Row)
Real-time metrics with color coding:
- **Currently Running** (blue) - Active generation jobs
- **Completed Today** (green) - Successful completions in last 24h
- **Failed Today** (red) - Failures in last 24h
- **Success Rate** (dynamic color) - Percentage based on last 7 days

### 2. Active Report Runs Table
Live view of in-progress generations:
- User email
- Application title
- Current step / total steps
- Progress bar percentage
- Status badge (running/pending)
- Time elapsed
- Auto-refresh every 10 seconds

### 3. Recent Failures Panel
Quick view of recent issues:
- Timestamp (relative)
- User email
- Step that failed
- Error message preview
- Link to full run details
- Filter by error type vs user cancellation

### 4. 7-Day Trend Chart
Simple bar or line chart showing:
- Reports started per day
- Completed vs failed ratio
- Trend direction indicator

### 5. System Health Summary
Quick stats panel:
- Emails sent (with delivery success rate if webhooks configured)
- Orders/payments processed
- Active entitlements
- Recent admin actions count

### 6. Recent Admin Activity Feed
Compact list of recent audit log entries:
- Action type badges
- Entity affected
- Performing admin
- Relative timestamp

## Technical Implementation

### Data Fetching Strategy

```typescript
// Single query aggregation for efficiency
const { data: dashboardStats } = useQuery({
  queryKey: ["admin-dashboard-stats"],
  queryFn: async () => {
    const [
      runStats,
      activeRuns,
      recentFailures,
      trendData,
      systemHealth
    ] = await Promise.all([
      // Today's run statistics
      supabase.from("report_runs")
        .select("status")
        .gte("created_at", startOfToday),
      
      // Active runs with details
      supabase.from("report_runs")
        .select(`*, applications(title, user_id), profiles(email)`)
        .in("status", ["running", "pending"])
        .order("created_at", { ascending: false }),
      
      // Recent failures
      supabase.from("report_runs")
        .select(`*, applications(title), profiles(email)`)
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(5),
      
      // 7-day trend (using RPC or aggregation)
      supabase.rpc("get_report_trend_7_days"),
      
      // System health counts
      Promise.all([
        supabase.from("email_outbox").select("id", { count: "exact" }),
        supabase.from("orders").select("id", { count: "exact" }),
        supabase.from("entitlements").select("id", { count: "exact" }),
      ])
    ]);
    
    return { runStats, activeRuns, recentFailures, trendData, systemHealth };
  },
  refetchInterval: 10000, // Auto-refresh every 10 seconds
});
```

### UI Components to Add

| Component | Purpose |
|-----------|---------|
| `ActiveRunsTable` | Live progress tracking with step details |
| `FailuresPanel` | Recent errors with expandable details |
| `TrendChart` | 7-day visualization using recharts |
| `SystemHealthCards` | Quick-glance operational metrics |
| `ActivityFeed` | Recent audit log entries |

### Optional Database Function

For efficient trend aggregation:

```sql
CREATE OR REPLACE FUNCTION get_report_trend_7_days()
RETURNS TABLE (
  date DATE,
  started INTEGER,
  completed INTEGER,
  failed INTEGER
) AS $$
  SELECT 
    DATE(created_at) as date,
    COUNT(*)::INTEGER as started,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::INTEGER as completed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::INTEGER as failed
  FROM report_runs
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY date DESC
$$ LANGUAGE SQL STABLE;
```

## Files to Create/Modify

| File | Changes |
|------|---------|
| `src/pages/admin/AdminDashboard.tsx` | Complete rewrite with new sections |
| `src/components/admin/ActiveRunsTable.tsx` | New component for live run tracking |
| `src/components/admin/FailuresPanel.tsx` | New component for error display |
| `src/components/admin/TrendChart.tsx` | New component using recharts |
| `src/components/admin/SystemHealthCards.tsx` | New component for metrics |
| Database migration | Add `get_report_trend_7_days` function |

## Priority Features

For an MVP operational dashboard, I recommend implementing in this order:

1. **Live Operations Cards** - Immediate value for monitoring
2. **Active Report Runs Table** - Critical for debugging current issues
3. **Recent Failures Panel** - Quick error identification
4. **7-Day Trend** - Pattern recognition
5. **System Health** - Secondary metrics
6. **Activity Feed** - Lower priority audit trail

