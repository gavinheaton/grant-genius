import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Download, FileType, Printer, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { format } from "date-fns";
import { type Report } from "@/hooks/useReportGeneration";
import { extractReportHtml, sanitizeHtml, REPORT_HTML_STYLES } from "@/lib/htmlReportUtils";

interface HtmlReportViewerProps {
  report: Report | null;
  isOpen: boolean;
  onClose: () => void;
  onDownloadPdf?: () => void;
  onDownloadDocx?: () => void;
  isGeneratingPdf?: boolean;
  isGeneratingDocx?: boolean;
}

export function HtmlReportViewer({ 
  report, 
  isOpen, 
  onClose,
  onDownloadPdf,
  onDownloadDocx,
  isGeneratingPdf,
  isGeneratingDocx,
}: HtmlReportViewerProps) {
  const extractedReport = useMemo(() => {
    if (!report?.content_json) return null;
    return extractReportHtml(report.content_json);
  }, [report?.content_json]);

  if (!report || !extractedReport) return null;

  const handlePrint = () => {
    window.print();
  };

  const sanitizedHtml = sanitizeHtml(extractedReport.html);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-xl font-semibold">
                Research Report
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Version {report.version_number} • Generated {format(new Date(report.created_at), "MMM d, yyyy 'at' h:mm a")}
                {extractedReport.isLegacy && (
                  <span className="ml-2 text-xs text-amber-600">(Legacy format)</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 no-print">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
              {onDownloadDocx && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onDownloadDocx}
                  disabled={isGeneratingDocx}
                >
                  <FileType className="h-4 w-4 mr-1" />
                  {isGeneratingDocx ? "..." : "DOCX"}
                </Button>
              )}
              {onDownloadPdf && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={onDownloadPdf}
                  disabled={isGeneratingPdf}
                >
                  <Download className="h-4 w-4 mr-1" />
                  {isGeneratingPdf ? "..." : "PDF"}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-120px)] px-6 pb-6">
          <style>{REPORT_HTML_STYLES}</style>
          
          {/* Main Report Content */}
          <div 
            className="report-html-content py-4"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />

          {/* Data Gaps Section */}
          {extractedReport.dataGaps && extractedReport.dataGaps.length > 0 && (
            <>
              <Separator className="my-6" />
              <div className="py-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Data Gaps & Limitations
                </h2>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    {extractedReport.dataGaps.map((gap, idx) => (
                      <li key={idx}>{gap}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* Sources Section */}
          {extractedReport.sources && extractedReport.sources.length > 0 && (
            <>
              <Separator className="my-6" />
              <div className="py-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
                  <LinkIcon className="h-5 w-5 text-primary" />
                  References & Citations
                </h2>
                <div className="space-y-2">
                  {extractedReport.sources.map((source, idx) => (
                    <div
                      key={source.id || idx}
                      className="text-sm text-muted-foreground p-3 bg-muted/30 rounded flex items-start gap-2"
                    >
                      <span className="font-medium text-foreground shrink-0">[{source.id}]</span>
                      <span className="flex-1">{source.mla_citation}</span>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline shrink-0"
                        >
                          View
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
