import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Copy, Check, TrendingUp, Users, Building2, Globe, DollarSign, Handshake } from "lucide-react";
import { format } from "date-fns";
import { type Report } from "@/hooks/useReportGeneration";

interface ReportContent {
  researchContext?: string;
  marketSegments?: Array<{
    name: string;
    description: string;
    size?: string;
    opportunity?: string;
  }>;
  competitors?: Array<{
    name: string;
    description?: string;
    type?: string;
    url?: string;
  }>;
  tam?: {
    value?: string;
    methodology?: string;
    sources?: string[];
  };
  sam?: {
    value?: string;
    methodology?: string;
    sources?: string[];
  };
  som?: {
    value?: string;
    methodology?: string;
    sources?: string[];
  };
  economicImpact?: {
    summary?: string;
    jobs?: string;
    gdpContribution?: string;
    exportPotential?: string;
  };
  partners?: Array<{
    name: string;
    anzsicCode?: string;
    industry?: string;
    reason?: string;
    location?: string;
  }>;
  citations?: Array<{
    title?: string;
    url?: string;
    source?: string;
    accessedAt?: string;
  }>;
}

interface ReportViewerProps {
  report: Report | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReportViewer({ report, isOpen, onClose }: ReportViewerProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  if (!report || !report.content_json) return null;

  const content = (report.content_json || {}) as ReportContent;

  const copyToClipboard = async (text: string, sectionId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const CopyButton = ({ text, sectionId }: { text: string; sectionId: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => copyToClipboard(text, sectionId)}
      className="h-6 px-2"
    >
      {copiedSection === sectionId ? (
        <Check className="h-3 w-3 text-success" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );

  const formatCurrency = (value: string | undefined) => {
    if (!value) return "Not available";
    return value;
  };

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
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-120px)] px-6 pb-6">
          <div className="space-y-8 py-4">
            {/* Research Context / Executive Summary */}
            {content.researchContext && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" />
                    Research Context
                  </h3>
                  <CopyButton text={content.researchContext} sectionId="context" />
                </div>
                <div className="prose prose-sm max-w-none text-muted-foreground bg-muted/30 rounded-lg p-4">
                  <p className="whitespace-pre-wrap">{content.researchContext}</p>
                </div>
              </section>
            )}

            <Separator />

            {/* Market Segments */}
            {content.marketSegments && content.marketSegments.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Market Segments
                  </h3>
                </div>
                <div className="grid gap-4">
                  {content.marketSegments.map((segment, idx) => (
                    <div key={idx} className="border rounded-lg p-4 bg-card">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-medium">{segment.name}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {segment.description}
                          </p>
                        </div>
                        {segment.size && (
                          <Badge variant="secondary">{segment.size}</Badge>
                        )}
                      </div>
                      {segment.opportunity && (
                        <p className="text-sm text-primary mt-2">
                          Opportunity: {segment.opportunity}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <Separator />

            {/* Competitors */}
            {content.competitors && content.competitors.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Competitive Landscape
                  </h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company/Product</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {content.competitors.map((competitor, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {competitor.url ? (
                            <a
                              href={competitor.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {competitor.name}
                            </a>
                          ) : (
                            competitor.name
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{competitor.type || "N/A"}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {competitor.description || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            <Separator />

            {/* TAM/SAM/SOM Analysis */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  Market Size Analysis
                </h3>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                {/* TAM */}
                <div className="border rounded-lg p-4 bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-primary/10 text-primary border-primary/20">TAM</Badge>
                    <span className="text-xs text-muted-foreground">Total Addressable Market</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(content.tam?.value)}
                  </p>
                  {content.tam?.methodology && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {content.tam.methodology}
                    </p>
                  )}
                </div>

                {/* SAM */}
                <div className="border rounded-lg p-4 bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-secondary text-secondary-foreground">SAM</Badge>
                    <span className="text-xs text-muted-foreground">Serviceable Market</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(content.sam?.value)}
                  </p>
                  {content.sam?.methodology && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {content.sam.methodology}
                    </p>
                  )}
                </div>

                {/* SOM */}
                <div className="border rounded-lg p-4 bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-accent text-accent-foreground">SOM</Badge>
                    <span className="text-xs text-muted-foreground">Obtainable Market</span>
                  </div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(content.som?.value)}
                  </p>
                  {content.som?.methodology && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {content.som.methodology}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <Separator />

            {/* Australian Economic Impact */}
            {content.economicImpact && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Australian Economic Impact
                  </h3>
                </div>
                <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                  {content.economicImpact.summary && (
                    <p className="text-muted-foreground">{content.economicImpact.summary}</p>
                  )}
                  <div className="grid md:grid-cols-3 gap-4 mt-4">
                    {content.economicImpact.jobs && (
                      <div className="text-center p-3 bg-background rounded-lg">
                        <p className="text-sm text-muted-foreground">Job Creation</p>
                        <p className="text-lg font-semibold">{content.economicImpact.jobs}</p>
                      </div>
                    )}
                    {content.economicImpact.gdpContribution && (
                      <div className="text-center p-3 bg-background rounded-lg">
                        <p className="text-sm text-muted-foreground">GDP Contribution</p>
                        <p className="text-lg font-semibold">{content.economicImpact.gdpContribution}</p>
                      </div>
                    )}
                    {content.economicImpact.exportPotential && (
                      <div className="text-center p-3 bg-background rounded-lg">
                        <p className="text-sm text-muted-foreground">Export Potential</p>
                        <p className="text-lg font-semibold">{content.economicImpact.exportPotential}</p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            <Separator />

            {/* Potential Partners */}
            {content.partners && content.partners.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Handshake className="h-5 w-5 text-primary" />
                    Potential Partners
                  </h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>ANZSIC</TableHead>
                      <TableHead>Why Partner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {content.partners.map((partner, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {partner.name}
                          {partner.location && (
                            <span className="text-xs text-muted-foreground block">
                              {partner.location}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{partner.industry || "—"}</TableCell>
                        <TableCell>
                          {partner.anzsicCode && (
                            <Badge variant="outline">{partner.anzsicCode}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-xs">
                          {partner.reason || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )}

            {/* Citations */}
            {content.citations && content.citations.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-lg font-semibold mb-3">References & Citations</h3>
                  <div className="space-y-2">
                    {content.citations.map((citation, idx) => (
                      <div
                        key={idx}
                        className="text-sm text-muted-foreground p-2 bg-muted/30 rounded"
                      >
                        <span className="font-medium">[{idx + 1}]</span>{" "}
                        {citation.title || "Untitled"}.{" "}
                        {citation.source && <span>{citation.source}. </span>}
                        {citation.url && (
                          <a
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline break-all"
                          >
                            {citation.url}
                          </a>
                        )}
                        {citation.accessedAt && (
                          <span className="block text-xs mt-1">
                            Accessed: {citation.accessedAt}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
