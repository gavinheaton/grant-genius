import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, Eye, FileType } from "lucide-react";
import { format } from "date-fns";
import { HtmlReportViewer } from "./HtmlReportViewer";
import { type Report } from "@/hooks/useReportGeneration";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { extractReportHtml, sanitizeHtml, REPORT_HTML_STYLES } from "@/lib/htmlReportUtils";

interface ReportsListProps {
  reports: Report[];
  isLoading: boolean;
  onDownload: (reportId: string, format: "pdf" | "docx") => void;
  grantName?: string;
}

export function ReportsList({ reports, isLoading, onDownload, grantName = "Research Report" }: ReportsListProps) {
  const [viewingReport, setViewingReport] = useState<Report | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [generatingDocx, setGeneratingDocx] = useState<string | null>(null);

  // Simple print-based PDF generation
  const handleGeneratePdf = useCallback(async (report: Report) => {
    setGeneratingPdf(report.id);

    try {
      const extracted = extractReportHtml(report.content_json);
      if (!extracted) {
        throw new Error("Could not extract report content");
      }

      const sanitizedHtml = sanitizeHtml(extracted.html);
      
      // Create a printable document
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        throw new Error("Pop-up blocked. Please allow pop-ups for this site.");
      }

      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${grantName} - Report v${report.version_number}</title>
          <style>
            ${REPORT_HTML_STYLES}
            body {
              font-family: 'Inter', system-ui, sans-serif;
              margin: 40px;
              line-height: 1.6;
            }
            .cover-page {
              text-align: center;
              padding: 100px 40px;
              page-break-after: always;
            }
            .cover-title {
              font-size: 28px;
              font-weight: 700;
              color: #1e3a5f;
              margin-bottom: 20px;
            }
            .cover-subtitle {
              font-size: 18px;
              color: #d97706;
              margin-bottom: 40px;
            }
            .cover-date {
              font-size: 14px;
              color: #666;
            }
            @media print {
              body { margin: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="cover-page">
            <div class="cover-title">Commercialisation Research Report</div>
            <div class="cover-subtitle">${grantName}</div>
            <div class="cover-date">Generated on ${format(new Date(report.created_at), "MMMM d, yyyy")}</div>
            <div class="cover-date">Version ${report.version_number}</div>
          </div>
          <div class="report-html-content">
            ${sanitizedHtml}
          </div>
          ${extracted.sources && extracted.sources.length > 0 ? `
            <h1 style="margin-top: 40px; border-top: 2px solid #d97706; padding-top: 20px;">References</h1>
            ${extracted.sources.map(s => `
              <p style="margin-left: 40px; text-indent: -40px;">[${s.id}] ${s.mla_citation}</p>
            `).join('')}
          ` : ''}
        </body>
        </html>
      `;

      printWindow.document.write(printContent);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
      };

      toast({
        title: "Print Dialog Opened",
        description: "Use 'Save as PDF' in the print dialog to save your report.",
      });
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
    </>
  );
}
