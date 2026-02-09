import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, Eye, FileType, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { HtmlReportViewer } from "./HtmlReportViewer";
import { type Report } from "@/hooks/useReportGeneration";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { extractReportHtml } from "@/lib/htmlReportUtils";
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

interface ReportsListProps {
  reports: Report[];
  isLoading: boolean;
  onDownload: (reportId: string, format: "pdf" | "docx") => void;
  onDeleteReport?: (reportId: string) => Promise<boolean>;
  grantName?: string;
}

export function ReportsList({ reports, isLoading, onDownload, onDeleteReport, grantName = "Research Report" }: ReportsListProps) {
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [generatingDocx, setGeneratingDocx] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<Report | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteReport = useCallback(async () => {
    if (!reportToDelete || !onDeleteReport) return;
    
    setIsDeleting(true);
    const success = await onDeleteReport(reportToDelete.id);
    setIsDeleting(false);
    
    if (success) {
      setReportToDelete(null);
    }
  }, [reportToDelete, onDeleteReport]);

  // Server-side PDF generation using templates
  const handleGeneratePdf = useCallback(async (report: Report) => {
    setGeneratingPdf(report.id);

    try {
      // Get current session for auth header
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Not authenticated");
      }

      // Call server-side PDF generation
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionData.session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ reportId: report.id }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate PDF");
      }

      const data = await response.json();
      
      if (data.downloadUrl) {
        // Download the PDF from the signed URL
        const pdfResponse = await fetch(data.downloadUrl);
        if (!pdfResponse.ok) {
          throw new Error("Failed to download PDF");
        }
        
        const blob = await pdfResponse.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${grantName.replace(/\s+/g, "_")}_Report_v${report.version_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast({
          title: "PDF Generated",
          description: "Your PDF report has been downloaded.",
        });
      } else {
        throw new Error("No download URL returned");
      }
    } catch (error: unknown) {
      console.error("PDF generation error:", error);
      toast({
        title: "PDF Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingPdf(null);
    }
  }, [grantName]);

  const handleGenerateDocx = useCallback(async (report: Report) => {
    setGeneratingDocx(report.id);

    try {
      // Get current session for auth header
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Not authenticated");
      }

      // Use fetch directly to get binary response as blob
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-docx`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionData.session.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ reportId: report.id }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate DOCX");
      }

      // Get response as blob
      const blob = await response.blob();

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${grantName.replace(/\s+/g, "_")}_Report_v${report.version_number}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "DOCX Generated",
        description: "Your Word document has been downloaded.",
      });
    } catch (error: any) {
      console.error("DOCX generation error:", error);
      toast({
        title: "DOCX Generation Failed",
        description: error.message || "Failed to generate DOCX. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingDocx(null);
    }
  }, [grantName]);

  if (isLoading) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (reports.length === 0) {
    return null;
  }

  return (
    <>
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generated Reports
          </CardTitle>
          <CardDescription>
            View and download your completed research reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">v{report.version_number}</Badge>
                  <span className="text-sm">
                    Generated {format(new Date(report.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Delete Report button */}
                  {onDeleteReport && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setReportToDelete(report)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {/* View Report button */}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setViewingReport(report)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                  
                  {/* Generate/Download DOCX button - always available (programmatic generation) */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleGenerateDocx(report)}
                    disabled={generatingDocx === report.id}
                  >
                    {generatingDocx === report.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <FileType className="h-4 w-4 mr-1" />
                    )}
                    DOCX
                  </Button>
                  
                  {/* Generate/Download PDF button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGeneratePdf(report)}
                    disabled={generatingPdf === report.id}
                  >
                    {generatingPdf === report.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1" />
                    )}
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Report Viewer Modal */}
      <HtmlReportViewer
        report={viewingReport}
        isOpen={!!viewingReport}
        onClose={() => setViewingReport(null)}
        onDownloadPdf={viewingReport ? () => handleGeneratePdf(viewingReport) : undefined}
        onDownloadDocx={viewingReport ? () => handleGenerateDocx(viewingReport) : undefined}
        isGeneratingPdf={generatingPdf === viewingReport?.id}
        isGeneratingDocx={generatingDocx === viewingReport?.id}
      />

      {/* Delete Report Confirmation Dialog */}
      <AlertDialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report v{reportToDelete?.version_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this report. The application and other reports will not be affected.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReport}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Report"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
