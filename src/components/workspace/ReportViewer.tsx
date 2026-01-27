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

// Flexible types to handle both string and structured data
interface MarketSegment {
  name: string;
  description: string;
  size?: string;
  opportunity?: string;
}

interface Competitor {
  name: string;
  description?: string;
  type?: string;
  url?: string;
}

interface MarketSize {
  value?: string;
  methodology?: string;
  sources?: string[];
}

interface EconomicImpact {
  summary?: string;
  jobs?: string;
  gdpContribution?: string;
  exportPotential?: string;
}

interface Partner {
  name: string;
  anzsicCode?: string;
  industry?: string;
  reason?: string;
  location?: string;
}

interface Citation {
  title?: string;
  url?: string;
  source?: string;
  accessedAt?: string;
}

interface ReportContent {
  researchContext?: string;
  
  // Can be structured array OR raw AI text
  marketSegments?: string | MarketSegment[];
  competitorResearch?: string;
  existingCompetitors?: string | Competitor[];
  competitors?: string | Competitor[];
  
  // Can be structured object OR raw AI text
  tam?: string | MarketSize;
  sam?: string | MarketSize;
  som?: string | MarketSize;
  economicImpact?: string | EconomicImpact;
  
  // Partner data may use different field name
  partners?: string | Partner[];
  partnerBusinesses?: string;
  
  competitorTable?: string;
  citations?: string | Citation[];
}

interface ReportViewerProps {
  report: Report | null;
  isOpen: boolean;
  onClose: () => void;
}

// Helper component for rendering text content
function TextContent({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div className={`prose prose-sm max-w-none text-muted-foreground bg-muted/30 rounded-lg p-4 ${className}`}>
      <div className="whitespace-pre-wrap">{content}</div>
    </div>
  );
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

  // Get competitors from any of the possible field names
  const getCompetitors = (): string | Competitor[] | undefined => {
    return content.competitors || content.existingCompetitors || content.competitorResearch;
  };

  // Get partners from any of the possible field names
  const getPartners = (): string | Partner[] | undefined => {
    return content.partners || content.partnerBusinesses;
  };

  // Render market size (TAM/SAM/SOM) handling both string and object
  const renderMarketSize = (
    data: string | MarketSize | undefined,
    label: string,
    badgeClass: string
  ) => {
    if (!data) {
      return (
        <div className="border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={badgeClass}>{label}</Badge>
          </div>
          <p className="text-2xl font-bold text-muted-foreground">Not available</p>
        </div>
      );
    }

    if (typeof data === "string") {
      return (
        <div className="border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Badge className={badgeClass}>{label}</Badge>
          </div>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">{data}</div>
        </div>
      );
    }

    return (
      <div className="border rounded-lg p-4 bg-card">
        <div className="flex items-center gap-2 mb-2">
          <Badge className={badgeClass}>{label}</Badge>
        </div>
        <p className="text-2xl font-bold">{formatCurrency(data.value)}</p>
        {data.methodology && (
          <p className="text-xs text-muted-foreground mt-2">{data.methodology}</p>
        )}
      </div>
    );
  };

  const competitors = getCompetitors();
  const partners = getPartners();

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
                <TextContent content={content.researchContext} />
              </section>
            )}

            <Separator />

            {/* Market Segments */}
            {content.marketSegments && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Market Segments
                  </h3>
                </div>
                {Array.isArray(content.marketSegments) ? (
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
                ) : (
                  <TextContent content={String(content.marketSegments)} />
                )}
              </section>
            )}

            <Separator />

            {/* Competitors */}
            {competitors && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Competitive Landscape
                  </h3>
                </div>
                {Array.isArray(competitors) ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company/Product</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {competitors.map((competitor, idx) => (
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
                ) : (
                  <TextContent content={String(competitors)} />
                )}
              </section>
            )}

            {/* Competitor Table (if stored separately) */}
            {content.competitorTable && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Competitor Comparison
                  </h3>
                </div>
                <TextContent content={content.competitorTable} />
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
                {renderMarketSize(
                  content.tam,
                  "TAM",
                  "bg-primary/10 text-primary border-primary/20"
                )}
                {renderMarketSize(
                  content.sam,
                  "SAM",
                  "bg-secondary text-secondary-foreground"
                )}
                {renderMarketSize(
                  content.som,
                  "SOM",
                  "bg-accent text-accent-foreground"
                )}
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
                {typeof content.economicImpact === "string" ? (
                  <TextContent content={content.economicImpact} />
                ) : (
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
                )}
              </section>
            )}

            <Separator />

            {/* Potential Partners */}
            {partners && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Handshake className="h-5 w-5 text-primary" />
                    Potential Partners
                  </h3>
                </div>
                {Array.isArray(partners) ? (
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
                      {partners.map((partner, idx) => (
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
                ) : (
                  <TextContent content={String(partners)} />
                )}
              </section>
            )}

            {/* Citations */}
            {content.citations && (
              <>
                <Separator />
                <section>
                  <h3 className="text-lg font-semibold mb-3">References & Citations</h3>
                  {Array.isArray(content.citations) ? (
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
                  ) : (
                    <TextContent content={String(content.citations)} />
                  )}
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
