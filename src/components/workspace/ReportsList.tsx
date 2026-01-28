import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, Eye, FileType } from "lucide-react";
import { format } from "date-fns";
import { ReportViewer } from "./ReportViewer";
import { PdfReportRenderer } from "./PdfReportRenderer";
import { type Report } from "@/hooks/useReportGeneration";
import { useDefaultPdfTemplate } from "@/hooks/usePdfTemplates";
import { useDefaultDocxTemplate } from "@/hooks/useDocxTemplates";
import { generatePdfFromElement, downloadPdf } from "@/lib/generatePdfClient";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  const [renderingReport, setRenderingReport] = useState<Report | null>(null);
  const pdfRenderRef = useRef<HTMLDivElement>(null);
  
  const { data: pdfTemplate } = useDefaultPdfTemplate();
  const { data: docxTemplate } = useDefaultDocxTemplate();

  const handleGeneratePdf = useCallback(async (report: Report) => {
    if (!pdfTemplate) {
      toast({
        title: "Template not loaded",
        description: "Please wait for the PDF template to load and try again.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingPdf(report.id);
    setRenderingReport(report);

    // Wait for the component to render completely
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      if (!pdfRenderRef.current) {
        throw new Error("PDF renderer not available");
      }

      const blob = await generatePdfFromElement(pdfRenderRef.current, {
        template: pdfTemplate,
        grantName,
        reportTitle: `Report v${report.version_number}`,
        generatedDate: format(new Date(report.created_at), "yyyy-MM-dd"),
      });

      const filename = `${grantName.replace(/\s+/g, "_")}_Report_v${report.version_number}.pdf`;
      downloadPdf(blob, filename);

      toast({
        title: "PDF Generated",
        description: "Your report has been downloaded.",
      });
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast({
        title: "PDF Generation Failed",
        description: error.message || "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingPdf(null);
      setRenderingReport(null);
    }
  }, [pdfTemplate, grantName]);

  const handleGenerateDocx = useCallback(async (report: Report) => {
    if (!docxTemplate) {
      toast({
        title: "No DOCX template",
        description: "Please ask an admin to upload a DOCX template first.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingDocx(report.id);

    try {
      const response = await supabase.functions.invoke("generate-docx", {
        body: { reportId: report.id },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to generate DOCX");
      }

      // The response.data should be the binary blob
      const blob = response.data;
      
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
  }, [docxTemplate, grantName]);

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
                  
                  {/* Generate/Download DOCX button - primary when available */}
                  {docxTemplate && (
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
                  )}
                  
                  {/* Generate/Download PDF button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGeneratePdf(report)}
                    disabled={generatingPdf === report.id || !pdfTemplate}
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
      <ReportViewer
        report={viewingReport}
        isOpen={!!viewingReport}
        onClose={() => setViewingReport(null)}
      />

      {/* Hidden PDF Renderer */}
      {renderingReport && pdfTemplate && (
        <PdfReportRenderer
          ref={pdfRenderRef}
          report={renderingReport}
          template={pdfTemplate}
          grantName={grantName}
        />
      )}
    </>
  );
}
