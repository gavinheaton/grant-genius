import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Users, Mail, ScrollText } from "lucide-react";

export default function AdminDashboard() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [grantsRes, usersRes, emailsRes, logsRes] = await Promise.all([
        supabase.from("grants").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("email_outbox").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }),
      ]);

      return {
        grants: grantsRes.count ?? 0,
        users: usersRes.count ?? 0,
        emails: emailsRes.count ?? 0,
        auditLogs: logsRes.count ?? 0,
      };
    },
  });

  const statCards = [
    {
      title: "Total Grants",
      value: stats?.grants ?? 0,
      description: "Active grant programs",
      icon: FileText,
    },
    {
      title: "Users",
      value: stats?.users ?? 0,
      description: "Registered researchers",
      icon: Users,
    },
    {
      title: "Emails Sent",
      value: stats?.emails ?? 0,
      description: "Total transactional emails",
      icon: Mail,
    },
    {
      title: "Audit Entries",
      value: stats?.auditLogs ?? 0,
      description: "System activity logs",
      icon: ScrollText,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview of your Grant Genius platform
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Use the sidebar to navigate to different sections of the admin console.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              View the Audit Logs section for detailed activity history.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
