import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ArrowLeft, Loader2, Save, CheckCircle, Eye, Code } from "lucide-react";
import DOMPurify from "dompurify";

export default function ReportReview() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAdminAuth();

  const [editedHtml, setEditedHtml] = useState("");
  const [notes, setNotes] = useState("");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("preview");

  // Fetch review details
  const { data: review, isLoading } = useQuery({
    queryKey: ["report-review", reviewId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_reviews" as any)
        .select("*")
        .eq("id", reviewId)
        .single();

      if (error) throw error;
      return data as any;
    },
    enabled: !!reviewId,
  });

  // Fetch the report content
  const { data: report } = useQuery({
    queryKey: ["review-report", review?.report_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(`
          id,
          content_json,
          manual_report_html,
          application:applications!inner(
            title,
            grant_version:grant_versions!inner(
              grant:grants!inner(name)
            )
          )
        `)
        .eq("id", review.report_id)
        .single();

      if (error) throw error;
      return data as any;
    },
    enabled: !!review?.report_id,
  });

  // Extract HTML from report
  useEffect(() => {
    if (!report) return;
    
    // Use edited_html from review if available, otherwise extract from report
    if (review?.edited_html) {
      setEditedHtml(review.edited_html);
      return;
    }

    const contentJson = report.content_json as any;
    let html = report.manual_report_html || "";
    
    if (!html && contentJson) {
      html = contentJson.report_html
        || contentJson.assembledReport?.report_html
        || "";
      
      if (!html) {
        const stepKeys = ["finalize_report_html", "assemble_sections_html"];
        for (const key of stepKeys) {
          const stepData = contentJson[key];
          if (stepData) {
            if (typeof stepData === "string") {
              try {
                const parsed = JSON.parse(stepData);
                if (parsed.report_html) { html = parsed.report_html; break; }
              } catch { if (stepData.includes("<")) { html = stepData; break; } }
            } else if (stepData.report_html) {
              html = stepData.report_html; break;
            }
          }
        }
      }
    }
    
    setEditedHtml(html);
  }, [report, review]);

  // Mark as in_progress when reviewer opens
  useEffect(() => {
    if (review?.status === "pending" && reviewId) {
      supabase
        .from("report_reviews" as any)
        .update({ status: "in_progress", started_at: new Date().toISOString() } as any)
        .eq("id", reviewId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["report-review", reviewId] });
        });
    }
  }, [review?.status, reviewId, queryClient]);

  // Save draft
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("report_reviews" as any)
        .update({ edited_html: editedHtml, notes } as any)
        .eq("id", reviewId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Draft saved" });
    },
    onError: (error) => {
      toast({
        title: "Error saving draft",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Approve
  const approveMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-review`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            review_id: reviewId,
            edited_html: editedHtml,
            notes,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to approve");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: data.is_final ? "Report approved and sent to user!" : "Review approved, sent to next reviewer",
      });
      queryClient.invalidateQueries({ queryKey: ["pending-reviews"] });
      navigate("/admin/reviews");
    },
    onError: (error) => {
      toast({
        title: "Error approving review",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const application = report?.application as any;
  const grantVersion = application?.grant_version as any;
  const grant = Array.isArray(grantVersion?.grant) ? grantVersion.grant[0] : grantVersion?.grant;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Review not found</p>
        <Button className="mt-4" onClick={() => navigate("/admin/reviews")}>
          Back to Reviews
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/reviews")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Review Report</h1>
          <p className="text-muted-foreground">
            {application?.title || "Untitled"} • {grant?.name || "Unknown Grant"} • Step {review.step_number}
          </p>
        </div>
        <Badge variant={review.status === "approved" ? "default" : "secondary"}>
          {review.status}
        </Badge>
      </div>

      <Card className="flex-1">
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "preview")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit">
                <Code className="h-4 w-4 mr-2" />
                Edit HTML
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="mt-4">
              <Textarea
                value={editedHtml}
                onChange={(e) => setEditedHtml(e.target.value)}
                className="min-h-[500px] font-mono text-sm"
                placeholder="Report HTML content..."
              />
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <div className="border rounded-md p-6 bg-background min-h-[500px] overflow-auto">
                {editedHtml ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(editedHtml),
                    }}
                  />
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No content yet.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes for the next reviewer or for the record..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      {review.status !== "approved" && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => saveDraftMutation.mutate()}
            disabled={saveDraftMutation.isPending}
          >
            {saveDraftMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Draft
          </Button>
          <Button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
          >
            {approveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}
