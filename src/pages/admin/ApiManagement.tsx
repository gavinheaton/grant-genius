import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Globe, Activity, BarChart3, Clock, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import DeveloperIntegrationCard from "@/components/admin/DeveloperIntegrationCard";

interface ApiSettings {
  id: string;
  is_enabled: boolean;
  default_grant_id: string | null;
  api_system_user_id: string | null;
  updated_at: string;
}

interface UsageLog {
  id: string;
  client_name: string | null;
  endpoint: string;
  report_run_id: string | null;
  source: string;
  response_status: number;
  created_at: string;
}

interface UsageStats {
  total: number;
  today: number;
  byClient: Record<string, number>;
  byEndpoint: Record<string, number>;
}

interface Grant {
  id: string;
  name: string;
  is_active: boolean;
}

interface Profile {
  user_id: string;
  email: string;
  full_name: string | null;
}

export default function ApiManagement() {
  const { isSuperAdmin } = useAdminAuth();
  const [settings, setSettings] = useState<ApiSettings | null>(null);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [stats, setStats] = useState<UsageStats>({ total: 0, today: 0, byClient: {}, byEndpoint: {} });
  const [grants, setGrants] = useState<Grant[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch settings, logs, grants, and profiles in parallel
      const [settingsRes, logsRes, grantsRes, profilesRes] = await Promise.all([
        supabase.from("api_settings").select("*").limit(1).single(),
        supabase.from("api_usage_logs").select("*").order("created_at", { ascending: false }).limit(50),
        supabase.from("grants").select("id, name, is_active").eq("is_active", true).order("name"),
        supabase.from("profiles").select("user_id, email, full_name").order("email"),
      ]);

      if (settingsRes.data) setSettings(settingsRes.data as unknown as ApiSettings);
      
      const typedLogs = (logsRes.data || []) as unknown as UsageLog[];
      setLogs(typedLogs);
      setGrants((grantsRes.data || []) as unknown as Grant[]);
      setProfiles((profilesRes.data || []) as unknown as Profile[]);

      // Calculate stats
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const total = typedLogs.length;
      const today = typedLogs.filter((l) => l.created_at >= todayStart).length;

      const byClient: Record<string, number> = {};
      const byEndpoint: Record<string, number> = {};
      for (const log of typedLogs) {
        const client = log.client_name || "unknown";
        byClient[client] = (byClient[client] || 0) + 1;
        byEndpoint[log.endpoint] = (byEndpoint[log.endpoint] || 0) + 1;
      }
      setStats({ total, today, byClient, byEndpoint });
    } catch (err) {
      console.error("Failed to fetch API data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleApi = async (enabled: boolean) => {
    if (!settings) return;
    setIsToggling(true);
    try {
      const { error } = await supabase
        .from("api_settings")
        .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
        .eq("id", settings.id);
      if (error) throw error;
      setSettings({ ...settings, is_enabled: enabled });
      toast.success(`API access ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      console.error("Failed to toggle API:", err);
      toast.error("Failed to update API settings");
    } finally {
      setIsToggling(false);
    }
  };

  const handleUpdateSetting = async (field: string, value: string | null) => {
    if (!settings) return;
    try {
      const { error } = await supabase
        .from("api_settings")
        .update({ [field]: value, updated_at: new Date().toISOString() } as Record<string, unknown>)
        .eq("id", settings.id);
      if (error) throw error;
      setSettings({ ...settings, [field]: value } as ApiSettings);
      toast.success("Setting updated");
    } catch (err) {
      console.error("Failed to update setting:", err);
      toast.error("Failed to update setting");
    }
  };

  const statusBadge = (status: number) => {
    if (status >= 200 && status < 300) return <Badge variant="default">{status}</Badge>;
    if (status >= 400 && status < 500) return <Badge variant="secondary">{status}</Badge>;
    return <Badge variant="destructive">{status}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Management</h1>
          <p className="text-muted-foreground">Manage external API access and monitor usage</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Developer Integration (Super Admin only) */}
      {isSuperAdmin && <DeveloperIntegrationCard />}

      {/* API Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            API Access Control
          </CardTitle>
          <CardDescription>Enable or disable external API access for report generation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="api-toggle" className="text-base font-medium">External API Access</Label>
              <p className="text-sm text-muted-foreground">
                {settings?.is_enabled
                  ? "External apps can trigger report generation"
                  : "API access is disabled — external requests will receive 503"}
              </p>
            </div>
            <Switch
              id="api-toggle"
              checked={settings?.is_enabled ?? false}
              onCheckedChange={handleToggleApi}
              disabled={isToggling}
            />
          </div>
        </CardContent>
      </Card>

      {/* API Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            API Configuration
          </CardTitle>
          <CardDescription>
            Configure the default grant and system user for API-triggered reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Default Grant */}
            <div className="space-y-2">
              <Label>Default Grant</Label>
              <Select
                value={settings?.default_grant_id || "none"}
                onValueChange={(val) => handleUpdateSetting("default_grant_id", val === "none" ? null : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a default grant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No default —</SelectItem>
                  {grants.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used when API callers don't specify a grant_id. If not set, requests without a grant_id will be rejected.
              </p>
            </div>

            {/* System User */}
            <div className="space-y-2">
              <Label>API System User (Application Owner)</Label>
              <Select
                value={settings?.api_system_user_id || "none"}
                onValueChange={(val) => handleUpdateSetting("api_system_user_id", val === "none" ? null : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a system user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Fall back to first Super Admin —</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.full_name ? `${p.full_name} (${p.email})` : p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                All API-generated applications will be owned by this user. Create a dedicated service account for cleaner tracking.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total API Calls</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.today}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{Object.keys(stats.byClient).length}</p>
                <p className="text-xs text-muted-foreground">Unique Clients</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.byEndpoint["generate-report"] || 0}</p>
                <p className="text-xs text-muted-foreground">Reports Generated</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Client Breakdown */}
      {Object.keys(stats.byClient).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Usage by Client</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byClient)
                .sort(([, a], [, b]) => b - a)
                .map(([client, count]) => (
                  <Badge key={client} variant="secondary" className="text-sm">
                    {client}: {count}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent API Calls</CardTitle>
          <CardDescription>Last 50 API requests</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No API calls recorded yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Run ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.client_name || "—"}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                    <TableCell>{statusBadge(log.response_status)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.report_run_id ? log.report_run_id.substring(0, 8) + "…" : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
