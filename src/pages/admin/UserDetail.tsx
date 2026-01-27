import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ArrowLeft, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAdminAuth();

  const { data: user, isLoading } = useQuery({
    queryKey: ["admin-user", id],
    queryFn: async () => {
      const [profileRes, roleRes, applicationsRes, ordersRes, entitlementsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("user_roles").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("applications").select("*, grant_versions(grants(name))").eq("user_id", id!),
        supabase.from("orders").select("*, products(name)").eq("user_id", id!),
        supabase.from("entitlements").select("*").eq("user_id", id!),
      ]);

      if (profileRes.error) throw profileRes.error;

      return {
        profile: profileRes.data,
        role: roleRes.data?.role || "researcher",
        applications: applicationsRes.data || [],
        orders: ordersRes.data || [],
        entitlements: entitlementsRes.data || [],
      };
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (newRole: AppRole) => {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole })
        .eq("user_id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Role updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-user", id] });
    },
    onError: () => {
      toast({ title: "Error updating role", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.profile) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">User not found</p>
        <Button className="mt-4" onClick={() => navigate("/admin/users")}>
          Back to Users
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/users")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {user.profile.full_name || user.profile.email}
          </h1>
          <p className="text-muted-foreground mt-1">User details and activity</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user.profile.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Full Name</p>
              <p className="font-medium">{user.profile.full_name || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Joined</p>
              <p className="font-medium">
                {format(new Date(user.profile.created_at), "MMMM d, yyyy")}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Role & Permissions</CardTitle>
            <CardDescription>
              {isSuperAdmin
                ? "Manage user role"
                : "Only Super Admins can change roles"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Current Role</p>
              {isSuperAdmin ? (
                <Select
                  value={user.role}
                  onValueChange={(value) => updateRoleMutation.mutate(value as AppRole)}
                  disabled={updateRoleMutation.isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="researcher">Researcher</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Badge>{user.role.replace("_", " ")}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Applications ({user.applications.length})</CardTitle>
          <CardDescription>User's grant applications</CardDescription>
        </CardHeader>
        <CardContent>
          {user.applications.length === 0 ? (
            <p className="text-muted-foreground text-sm">No applications yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Grant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.applications.map((app: any) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">
                      {app.title || "Untitled"}
                    </TableCell>
                    <TableCell>
                      {app.grant_versions?.grants?.name || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{app.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(app.created_at), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orders ({user.orders.length})</CardTitle>
            <CardDescription>Purchase history</CardDescription>
          </CardHeader>
          <CardContent>
            {user.orders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No orders yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.orders.map((order: any) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.products?.name || "-"}</TableCell>
                      <TableCell>
                        ${(order.amount_cents / 100).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={order.status === "paid" ? "default" : "secondary"}
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entitlements ({user.entitlements.length})</CardTitle>
            <CardDescription>Report credits and access</CardDescription>
          </CardHeader>
          <CardContent>
            {user.entitlements.length === 0 ? (
              <p className="text-muted-foreground text-sm">No entitlements</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Used</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {user.entitlements.map((ent: any) => (
                    <TableRow key={ent.id}>
                      <TableCell>{ent.entitlement_type}</TableCell>
                      <TableCell>
                        {ent.used_quantity} / {ent.quantity}
                      </TableCell>
                      <TableCell>
                        {ent.expires_at
                          ? format(new Date(ent.expires_at), "MMM d, yyyy")
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
