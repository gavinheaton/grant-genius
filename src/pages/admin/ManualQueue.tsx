import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Clock, User, FileText, ExternalLink, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ManualReportEditor } from "@/components/admin/ManualReportEditor";

interface ManualSubmission {
  id: string;
  title: string | null;
  manual_status: string;
  manual_submitted_at: string;
  inputs_json: Record<string, string>;
  user_id: string;
  grant_version: {
    grant: {
      id: string;
      name: string;
    };
  };
  profile: {
    email: string;
    full_name: string | null;
  };
}

interface AllApplication {
  id: string;
  title: string | null;
  status: "draft" | "in_progress" | "ready" | "failed";
  created_at: string;
  updated_at: string;
  grant_version: {
    grant: {
      id: string;
      name: string;
    };
  };
  profile: {
    email: string;
    full_name: string | null;
  } | null;
}

export default function ManualQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState<string | null>(null);
  const [deletingApp, setDeletingApp] = useState<{ id: string; title: string } | null>(null);

  // Query for manual submissions (existing)
  const { data: submissions, isLoading: submissionsLoading } = useQuery({
    queryKey: ["manual-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(`
          id,
          title,
          manual_status,
          manual_submitted_at,
          inputs_json,
          user_id,
          grant_version:grant_versions!inner(
            grant:grants!inner(id, name)
          ),
          profile:profiles!applications_user_id_profiles_fkey(email, full_name)
        `)
        .not("manual_status", "is", null)
        .order("manual_submitted_at", { ascending: false });

      if (error) throw error;
      return data as unknown as ManualSubmission[];
    },
  });

  // Query for ALL applications
  const { data: allApplications, isLoading: allAppsLoading } = useQuery({
    queryKey: ["admin-all-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(`
          id,
          title,
          status,
          created_at,
          updated_at,
          grant_version:grant_versions!inner(
            grant:grants!inner(id, name)
          ),
          profile:profiles!applications_user_id_profiles_fkey(email, full_name)
        `)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data as unknown as AllApplication[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("applications")
        .update({ manual_status: status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual-queue"] });
    },
  });

  const getManualStatusBadge = (status: string) => {
    switch (status) {
      case "pending_review":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="border-warning text-warning-foreground"><Loader2 className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-success text-success-foreground"><FileText className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getApplicationStatusBadge = (status: AllApplication["status"]) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary"><FileText className="h-3 w-3 mr-1" />Draft</Badge>;
      case "in_progress":
        return <Badge variant="outline" className="border-primary text-primary"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      case "ready":
        return <Badge variant="default" className="bg-success text-success-foreground"><CheckCircle className="h-3 w-3 mr-1" />Ready</Badge>;
      case "failed":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleStartWork = (id: string) => {
    updateStatusMutation.mutate({ id, status: "in_progress" });
    setEditorOpen(id);
  };

  const isLoading = submissionsLoading || allAppsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate stats for all applications
  const draftCount = allApplications?.filter(a => a.status === "draft").length || 0;
  const inProgressCount = allApplications?.filter(a => a.status === "in_progress").length || 0;
  const readyCount = allApplications?.filter(a => a.status === "ready").length || 0;
  const failedCount = allApplications?.filter(a => a.status === "failed").length || 0;
  const totalCount = allApplications?.length || 0;

  // Calculate stats for manual queue
  const pendingCount = submissions?.filter(s => s.manual_status === "pending_review").length || 0;
  const manualInProgressCount = submissions?.filter(s => s.manual_status === "in_progress").length || 0;
  const completedCount = submissions?.filter(s => s.manual_status === "completed").length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Applications</h1>
        <p className="text-muted-foreground mt-1">
          Monitor all applications and manage manual report queue
        </p>
      </div>

      <Tabs defaultValue="all" className="space-y-6">
        <TabsList>
          <TabsTrigger value="all">All Applications ({totalCount})</TabsTrigger>
          <TabsTrigger value="manual">Manual Queue ({submissions?.length || 0})</TabsTrigger>
        </TabsList>

        {/* All Applications Tab */}
        <TabsContent value="all" className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-muted-foreground">{draftCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{inProgressCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Ready</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">{readyCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Failed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{failedCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* All Applications Table */}
          <Card>
            <CardHeader>
              <CardTitle>All Applications</CardTitle>
              <CardDescription>
                Overview of all applications across the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              {allApplications?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No applications yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Grant</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allApplications?.map((app) => {
                      const profile = Array.isArray(app.profile) 
                        ? app.profile[0] 
                        : app.profile;
                      const grantVersion = app.grant_version as unknown as { grant: { id: string; name: string } | { id: string; name: string }[] };
                      const grant = Array.isArray(grantVersion?.grant) 
                        ? grantVersion.grant[0] 
                        : grantVersion?.grant;

                      return (
                        <TableRow key={app.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{profile?.full_name || "Unknown"}</p>
                                <p className="text-sm text-muted-foreground">{profile?.email || "No email"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{grant?.name || "Unknown Grant"}</TableCell>
                          <TableCell>{app.title || "Untitled"}</TableCell>
                          <TableCell>{getApplicationStatusBadge(app.status)}</TableCell>
                          <TableCell>
                            {format(new Date(app.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            {format(new Date(app.updated_at), "MMM d, yyyy 'at' h:mm a")}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Manual Queue Tab */}
        <TabsContent value="manual" className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{manualInProgressCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{completedCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* Queue table */}
          <Card>
            <CardHeader>
              <CardTitle>Manual Submissions</CardTitle>
              <CardDescription>
                Click on a row to expand details, then start working on the report
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submissions?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No manual submissions in the queue</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Grant</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions?.map((submission) => {
                      const isExpanded = expandedId === submission.id;
                      const profile = Array.isArray(submission.profile) 
                        ? submission.profile[0] 
                        : submission.profile;
                      const grantVersion = submission.grant_version as unknown as { grant: { id: string; name: string } | { id: string; name: string }[] };
                      const grant = Array.isArray(grantVersion?.grant) 
                        ? grantVersion.grant[0] 
                        : grantVersion?.grant;

                      return (
                        <>
                          <TableRow 
                            key={submission.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedId(isExpanded ? null : submission.id)}
                          >
                            <TableCell>
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <p className="font-medium">{profile?.full_name || "Unknown"}</p>
                                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{grant?.name || "Unknown Grant"}</TableCell>
                            <TableCell>{submission.title || "Untitled"}</TableCell>
                            <TableCell>{getManualStatusBadge(submission.manual_status)}</TableCell>
                            <TableCell>
                              {submission.manual_submitted_at 
                                ? format(new Date(submission.manual_submitted_at), "MMM d, yyyy 'at' h:mm a")
                                : "-"
                              }
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {submission.manual_status === "pending_review" && (
                                <Button size="sm" onClick={() => handleStartWork(submission.id)}>
                                  Start Work
                                </Button>
                              )}
                              {submission.manual_status === "in_progress" && (
                                <Button size="sm" variant="outline" onClick={() => setEditorOpen(submission.id)}>
                                  Continue
                                </Button>
                              )}
                              {submission.manual_status === "completed" && (
                                <Button size="sm" variant="ghost" disabled>
                                  Done
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          
                          {/* Expanded details row */}
                          {isExpanded && (
                            <TableRow key={`${submission.id}-details`}>
                              <TableCell colSpan={7} className="bg-muted/30">
                                <div className="p-4 space-y-4">
                                  <h4 className="font-semibold">Submission Details</h4>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm text-muted-foreground">Article URL</p>
                                      <a 
                                        href={submission.inputs_json?.publicArticleUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline flex items-center gap-1"
                                      >
                                        {submission.inputs_json?.publicArticleUrl || "Not provided"}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">TRL Level</p>
                                      <p>{submission.inputs_json?.trl || "Not specified"}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">IP Status</p>
                                      <p>{submission.inputs_json?.ipStatus || "Not specified"}</p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-muted-foreground">User Email</p>
                                      <p>{profile?.email}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-sm text-muted-foreground">Summary / Bio</p>
                                    <p className="mt-1 whitespace-pre-wrap bg-background p-3 rounded border">
                                      {submission.inputs_json?.summary || "No summary provided"}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Report Editor Dialog */}
      {editorOpen && (
        <ManualReportEditor
          applicationId={editorOpen}
          open={!!editorOpen}
          onClose={() => {
            setEditorOpen(null);
            queryClient.invalidateQueries({ queryKey: ["manual-queue"] });
          }}
        />
      )}
    </div>
  );
}
