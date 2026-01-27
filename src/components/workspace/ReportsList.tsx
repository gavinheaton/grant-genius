import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, Eye } from "lucide-react";
import { format } from "date-fns";
import { ReportViewer } from "./ReportViewer";
import { PdfReportRenderer } from "./PdfReportRenderer";
import { type Report } from "@/hooks/useReportGeneration";
import { useDefaultPdfTemplate } from "@/hooks/usePdfTemplates";
import { generatePdfFromElement, downloadPdf } from "@/lib/generatePdfClient";
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
  const [renderingReport, setRenderingReport] = useState<Report | null>(null);
  const pdfRenderRef = useRef<HTMLDivElement>(null);
  
  const { data: template } = useDefaultPdfTemplate();

  const handleGeneratePdf = useCallback(async (report: Report) => {
    if (!template) {
      toast({
        title: "Template not loaded",
        description: "Please wait for the PDF template to load and try again.",
        variant: "destructive",
      });
      return;
    }

    setGeneratingPdf(report.id);
    setRenderingReport(report);

    // Wait for the component to render
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      if (!pdfRenderRef.current) {
        throw new Error("PDF renderer not available");
      }

      const blob = await generatePdfFromElement(pdfRenderRef.current, {
        template,
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
  }, [template, grantName]);

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
                    View Report
                  </Button>
                  
                  {/* Generate/Download PDF button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGeneratePdf(report)}
                    disabled={generatingPdf === report.id || !template}
                  >
                    {generatingPdf === report.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1" />
                    )}
                    PDF
                  </Button>
                  
                  {report.docx_path && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDownload(report.id, "docx")}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      DOCX
                    </Button>
                  )}
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
      {renderingReport && template && (
        <PdfReportRenderer
          ref={pdfRenderRef}
          report={renderingReport}
          template={template}
          grantName={grantName}
        />
      )}
    </>
  );
}
