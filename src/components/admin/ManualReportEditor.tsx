import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Loader2, Save, Send, Eye, Code } from "lucide-react";
import DOMPurify from "dompurify";

interface ManualReportEditorProps {
  applicationId: string;
  open: boolean;
  onClose: () => void;
}

export function ManualReportEditor({ applicationId, open, onClose }: ManualReportEditorProps) {
  const { toast } = useToast();
  const [reportHtml, setReportHtml] = useState("");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [isSending, setIsSending] = useState(false);

  // Fetch application details
  const { data: application, isLoading } = useQuery({
    queryKey: ["manual-application", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select(`
          id,
          title,
          inputs_json,
          user_id,
          grant_version_id,
          grant_version:grant_versions!inner(
            id,
            grant:grants!inner(id, name)
          ),
          profile:profiles!applications_user_id_profiles_fkey(email, full_name)
        `)
        .eq("id", applicationId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Check for existing draft
  const { data: existingReport } = useQuery({
    queryKey: ["manual-report-draft", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("manual_report_html")
        .eq("application_id", applicationId)
        .eq("is_manual", true)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  useEffect(() => {
    if (existingReport?.manual_report_html) {
      setReportHtml(existingReport.manual_report_html);
    }
  }, [existingReport]);

  // Save draft mutation
  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Check if draft already exists
      const { data: existing } = await supabase
        .from("reports")
        .select("id")
        .eq("application_id", applicationId)
        .eq("is_manual", true)
        .maybeSingle();

      if (existing) {
        // Update existing draft
        const { error } = await supabase
          .from("reports")
          .update({ manual_report_html: reportHtml })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // We can't insert directly due to RLS, will be handled by edge function
        toast({
          title: "Draft will be saved when you complete",
          description: "Use 'Complete & Send' to save and deliver the report",
        });
      }
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

  // Complete and send mutation
  const completeAndSendMutation = useMutation({
    mutationFn: async () => {
      setIsSending(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/complete-manual-report`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            application_id: applicationId,
            report_html: reportHtml,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to complete report");
      }

      return data;
    },
    onSuccess: () => {
      toast({
        title: "Report completed and sent!",
        description: "The user has been notified via email with the report attached.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Error completing report",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSending(false);
    },
  });

  const profile = Array.isArray(application?.profile) 
    ? application.profile[0] 
    : application?.profile;
  
  const grantVersion = application?.grant_version as unknown as { grant: { id: string; name: string } | { id: string; name: string }[] };
  const grant = Array.isArray(grantVersion?.grant) 
    ? grantVersion.grant[0] 
    : grantVersion?.grant;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Complete Manual Report</DialogTitle>
          <DialogDescription>
            {application?.title || "Untitled"} • {grant?.name || "Unknown Grant"} • {profile?.email}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "preview")} className="flex-1 flex flex-col min-h-0">
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

              <TabsContent value="edit" className="flex-1 min-h-0 mt-4">
                <div className="h-full flex flex-col">
                  <Label htmlFor="report-html" className="mb-2">
                    Report HTML Content
                  </Label>
                  <Textarea
                    id="report-html"
                    value={reportHtml}
                    onChange={(e) => setReportHtml(e.target.value)}
                    placeholder="<h1>Report Title</h1>
<p>Enter your report content here using HTML...</p>

<h2>Executive Summary</h2>
<p>...</p>

<h2>Market Analysis</h2>
<p>...</p>"
                    className="flex-1 min-h-[300px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Use HTML tags like &lt;h1&gt;, &lt;h2&gt;, &lt;p&gt;, &lt;ul&gt;, &lt;table&gt; for formatting.
                    Content will be sanitized before display.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 min-h-0 mt-4">
                <div className="h-full overflow-auto border rounded-md p-4 bg-background">
                  {reportHtml ? (
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(reportHtml),
                      }}
                    />
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No content yet. Switch to Edit tab to add report content.
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => saveDraftMutation.mutate()}
            disabled={saveDraftMutation.isPending || !reportHtml}
          >
            {saveDraftMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Draft
          </Button>
          <Button
            onClick={() => completeAndSendMutation.mutate()}
            disabled={isSending || !reportHtml}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Complete & Send to User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
