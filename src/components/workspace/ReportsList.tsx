import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Loader2, Eye } from "lucide-react";
import { format } from "date-fns";
import { ReportViewer } from "./ReportViewer";
import { type Report } from "@/hooks/useReportGeneration";

interface ReportsListProps {
  reports: Report[];
  isLoading: boolean;
  onDownload: (reportId: string, format: "pdf" | "docx") => void;
}

interface ReportsListProps {
  reports: Report[];
  isLoading: boolean;
  onDownload: (reportId: string, format: "pdf" | "docx") => void;
}

export function ReportsList({ reports, isLoading, onDownload }: ReportsListProps) {
  const [viewingReport, setViewingReport] = useState<Report | null>(null);

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
                  {/* Always show View Report button */}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setViewingReport(report)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View Report
                  </Button>
                  {report.pdf_path && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onDownload(report.id, "pdf")}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      PDF
                    </Button>
                  )}
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
    </>
  );
}
