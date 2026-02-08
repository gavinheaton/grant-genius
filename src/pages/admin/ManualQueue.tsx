import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Clock, User, FileText, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
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

export default function ManualQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState<string | null>(null);

  const { data: submissions, isLoading } = useQuery({
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

  const getStatusBadge = (status: string) => {
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

  const handleStartWork = (id: string) => {
    updateStatusMutation.mutate({ id, status: "in_progress" });
    setEditorOpen(id);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingCount = submissions?.filter(s => s.manual_status === "pending_review").length || 0;
  const inProgressCount = submissions?.filter(s => s.manual_status === "in_progress").length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Manual Report Queue</h1>
        <p className="text-muted-foreground mt-1">
          Review and complete manually processed grant applications
        </p>
      </div>

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
            <div className="text-2xl font-bold">{inProgressCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {submissions?.filter(s => s.manual_status === "completed").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue table */}
      <Card>
        <CardHeader>
          <CardTitle>Submissions</CardTitle>
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
                        <TableCell>{getStatusBadge(submission.manual_status)}</TableCell>
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
