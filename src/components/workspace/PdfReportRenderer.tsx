import { forwardRef, useMemo } from "react";
import { type Report } from "@/hooks/useReportGeneration";
import { type PdfTemplate } from "@/hooks/usePdfTemplates";
import { format } from "date-fns";
import { parseMarkdownTablesForPdf } from "@/lib/markdownUtils";
import { supabase } from "@/integrations/supabase/client";

interface ReportSection {
  title: string;
  content: string;
}

interface MarketSegment {
  name: string;
  description?: string;
}

interface Competitor {
  name: string;
  type?: string;
  description?: string;
}

interface MarketSize {
  value?: string;
  methodology?: string;
}

interface EconomicImpact {
  summary?: string;
  [key: string]: any;
}

interface Partner {
  name: string;
  industry?: string;
  reason?: string;
}

interface Citation {
  title?: string;
  url?: string;
  source?: string;
}

interface ContentJson {
  researchContext?: string;
  marketSegments?: string | MarketSegment[];
  competitorResearch?: string;
  existingCompetitors?: string | Competitor[];
  competitorTable?: string;
  tam?: string | MarketSize;
  sam?: string | MarketSize;
  som?: string | MarketSize;
  economicImpact?: string | EconomicImpact;
  partners?: string | Partner[];
  partnerBusinesses?: string;
  citations?: string | Citation[];
  [key: string]: any;
}

interface CoverLayout {
  logo_position?: "center" | "left" | "right";
  title_text?: string;
  subtitle_template?: string;
  show_date?: boolean;
  show_version?: boolean;
  background_style?: "solid" | "gradient";
}

interface PdfReportRendererProps {
  report: Report;
  template: PdfTemplate;
  grantName: string;
}

export const PdfReportRenderer = forwardRef<HTMLDivElement, PdfReportRendererProps>(
  ({ report, template, grantName }, ref) => {
    const content = report.content_json as ContentJson;
    const generatedDate = format(new Date(report.created_at), "MMMM d, yyyy");

    // Resolve logo URL from storage path
    const logoUrl = useMemo(() => {
      if (!template.logo_path) return null;
      
      // If already a full URL, use it
      if (template.logo_path.startsWith("http")) {
        return template.logo_path;
      }
      
      // Get public URL from storage
      const { data } = supabase.storage
        .from("pdf-assets")
        .getPublicUrl(template.logo_path);
      
      return data?.publicUrl || null;
    }, [template.logo_path]);

    // Get cover layout settings
    const coverLayout: CoverLayout = (template as any).cover_layout_json || {
      logo_position: "center",
      title_text: "Commercialisation Research Report",
      subtitle_template: "{grant_name}",
      show_date: true,
      show_version: true,
      background_style: "solid",
    };

    // Check branding settings
    const showBranding = (template as any).show_grant_genius_branding ?? true;

    // Build sections array from content
    const sections: ReportSection[] = useMemo(() => {
      const result: ReportSection[] = [];
      
      // Research Context / Executive Summary
      if (content.researchContext) {
        result.push({ title: "Research Context", content: String(content.researchContext) });
      }

      // Market Segments
      if (content.marketSegments) {
        const marketContent = Array.isArray(content.marketSegments)
          ? content.marketSegments.map((s: MarketSegment) => `**${s.name}**\n${s.description || ''}`).join('\n\n')
          : String(content.marketSegments);
        result.push({ title: "Market Segments", content: marketContent });
      }

      // Competitive Landscape
      const competitors = content.existingCompetitors || content.competitorResearch;
      if (competitors) {
        const compContent = Array.isArray(competitors)
          ? (competitors as Competitor[]).map((c: Competitor) => `**${c.name}**${c.type ? ` (${c.type})` : ''}\n${c.description || ''}`).join('\n\n')
          : String(competitors);
        result.push({ title: "Competitive Landscape", content: compContent });
      }

      // Competitor Table
      if (content.competitorTable) {
        result.push({ title: "Competitor Comparison", content: String(content.competitorTable) });
      }

      // TAM/SAM/SOM - Combined
      if (content.tam || content.sam || content.som) {
        let marketSizeContent = '';
        if (content.tam) {
          const tamValue = typeof content.tam === 'string' ? content.tam : (content.tam as MarketSize).value || 'N/A';
          marketSizeContent += `**Total Addressable Market (TAM)**\n${tamValue}\n\n`;
        }
        if (content.sam) {
          const samValue = typeof content.sam === 'string' ? content.sam : (content.sam as MarketSize).value || 'N/A';
          marketSizeContent += `**Serviceable Addressable Market (SAM)**\n${samValue}\n\n`;
        }
        if (content.som) {
          const somValue = typeof content.som === 'string' ? content.som : (content.som as MarketSize).value || 'N/A';
          marketSizeContent += `**Serviceable Obtainable Market (SOM)**\n${somValue}`;
        }
        result.push({ title: "Market Size Analysis", content: marketSizeContent });
      }

      // Economic Impact
      if (content.economicImpact) {
        const impactContent = typeof content.economicImpact === 'string'
          ? content.economicImpact
          : (content.economicImpact as EconomicImpact).summary || JSON.stringify(content.economicImpact, null, 2);
        result.push({ title: "Economic Impact", content: impactContent });
      }

      // Partners
      const partners = content.partners || content.partnerBusinesses;
      if (partners) {
        const partnerContent = Array.isArray(partners)
          ? (partners as Partner[]).map((p: Partner) => `**${p.name}**${p.industry ? ` - ${p.industry}` : ''}\n${p.reason || ''}`).join('\n\n')
          : String(partners);
        result.push({ title: "Potential Partners", content: partnerContent });
      }

      // Citations
      if (content.citations) {
        const citationsContent = Array.isArray(content.citations)
          ? (content.citations as Citation[]).map((c: Citation, i: number) => `[${i + 1}] ${c.title || 'Untitled'}. ${c.url || c.source || ''}`).join('\n')
          : String(content.citations);
        result.push({ title: "References", content: citationsContent });
      }

      return result;
    }, [content]);

    const headingSizes = template.heading_sizes_json;

    // Replace template variables in cover subtitle
    const subtitle = coverLayout.subtitle_template
      ?.replace("{grant_name}", grantName)
      .replace("{date}", generatedDate)
      .replace("{version}", String(report.version_number)) || grantName;

    const logoAlignment = coverLayout.logo_position === "left" ? "flex-start" 
      : coverLayout.logo_position === "right" ? "flex-end" 
      : "center";

    return (
      <div
        ref={ref}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "800px",
          backgroundColor: "#ffffff",
          fontFamily: `"${template.font_family}", sans-serif`,
          fontSize: `${headingSizes.body}px`,
          color: "#1a1a1a",
          lineHeight: 1.6,
        }}
      >
        {/* Cover Page */}
        {template.include_cover_page && (
          <div
            data-page-break="true"
            style={{
              minHeight: "1000px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: logoAlignment,
              padding: "60px",
              textAlign: coverLayout.logo_position === "left" ? "left" : coverLayout.logo_position === "right" ? "right" : "center",
              borderBottom: `4px solid ${template.primary_color}`,
              marginBottom: "40px",
              background: coverLayout.background_style === "gradient" 
                ? `linear-gradient(135deg, ${template.primary_color}10 0%, ${template.secondary_color}10 100%)`
                : undefined,
            }}
          >
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                crossOrigin="anonymous"
                style={{ 
                  maxWidth: "200px", 
                  maxHeight: "100px",
                  marginBottom: "40px",
                  objectFit: "contain",
                }}
              />
            )}
            
            {showBranding && (
              <div style={{
                fontSize: "14px",
                fontWeight: 500,
                color: template.secondary_color,
                marginBottom: "20px",
                letterSpacing: "2px",
                textTransform: "uppercase",
              }}>
                Grant Genius
              </div>
            )}
            
            <h1
              style={{
                fontSize: `${headingSizes.h1 * 1.5}px`,
                fontWeight: 700,
                color: template.primary_color,
                marginBottom: "20px",
              }}
            >
              {coverLayout.title_text || "Commercialisation Research Report"}
            </h1>
            
            <h2
              style={{
                fontSize: `${headingSizes.h2}px`,
                fontWeight: 500,
                color: template.secondary_color,
                marginBottom: "40px",
              }}
            >
              {subtitle}
            </h2>
            
            {coverLayout.show_date && (
              <p style={{ fontSize: "14px", color: "#666" }}>
                Generated on {generatedDate}
              </p>
            )}
            
            {coverLayout.show_version && (
              <p style={{ fontSize: "12px", color: "#888", marginTop: "10px" }}>
                Report Version {report.version_number}
              </p>
            )}
          </div>
        )}

        {/* Table of Contents */}
        {template.include_toc && sections.length > 0 && (
          <div
            data-page-break="true"
            style={{
              padding: "40px 60px",
              marginBottom: "40px",
              borderBottom: `1px solid ${template.primary_color}20`,
            }}
          >
            <h2
              style={{
                fontSize: `${headingSizes.h1}px`,
                fontWeight: 700,
                color: template.primary_color,
                marginBottom: "30px",
              }}
            >
              Table of Contents
            </h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {sections.map((section, index) => (
                <li
                  key={index}
                  style={{
                    fontSize: `${headingSizes.body}px`,
                    padding: "10px 0",
                    borderBottom: "1px dotted #ddd",
                  }}
                >
                  <span style={{ color: template.secondary_color, marginRight: "10px" }}>
                    {index + 1}.
                  </span>
                  {section.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Report Sections */}
        {sections.map((section, index) => (
          <div
            key={index}
            data-page-break={template.section_page_breaks ? "true" : undefined}
            style={{
              padding: "30px 60px",
              marginBottom: "20px",
            }}
          >
            <h2
              style={{
                fontSize: `${headingSizes.h1}px`,
                fontWeight: 700,
                color: template.primary_color,
                marginBottom: "20px",
                paddingBottom: "10px",
                borderBottom: `2px solid ${template.secondary_color}`,
              }}
            >
              {section.title}
            </h2>
            <div
              style={{
                fontSize: `${headingSizes.body}px`,
                lineHeight: 1.8,
              }}
              dangerouslySetInnerHTML={{ __html: formatContent(section.content, template.primary_color) }}
            />
          </div>
        ))}

        {/* Disclaimer */}
        {template.disclaimer_text && (
          <div
            data-page-break="true"
            style={{
              padding: "30px 60px",
              marginTop: "40px",
              backgroundColor: "#f8f8f8",
              borderTop: `2px solid ${template.primary_color}20`,
            }}
          >
            <h3
              style={{
                fontSize: `${headingSizes.h3}px`,
                fontWeight: 600,
                color: "#666",
                marginBottom: "15px",
              }}
            >
              Disclaimer
            </h3>
            <p
              style={{
                fontSize: "12px",
                color: "#888",
                lineHeight: 1.6,
              }}
            >
              {template.disclaimer_text}
            </p>
          </div>
        )}

        {/* Watermark */}
        {template.watermark_text && (
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%) rotate(-45deg)",
              fontSize: "80px",
              fontWeight: 700,
              color: `${template.primary_color}10`,
              pointerEvents: "none",
              zIndex: 1000,
            }}
          >
            {template.watermark_text}
          </div>
        )}
      </div>
    );
  }
);

PdfReportRenderer.displayName = "PdfReportRenderer";

// Helper function to format markdown-like content to HTML
function formatContent(content: string, primaryColor: string = '#2563eb'): string {
  if (!content) return "";
  
  // First, parse markdown tables
  let result = parseMarkdownTablesForPdf(content, primaryColor);
  
  // Then apply other markdown formatting
  return result
    // Bold text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Italic text
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // H3 headers
    .replace(/^### (.*?)$/gm, '<h4 style="font-weight: 600; margin: 24px 0 12px; font-size: 1.1em;">$1</h4>')
    // H2 headers
    .replace(/^## (.*?)$/gm, '<h3 style="font-weight: 600; margin: 28px 0 14px; font-size: 1.2em;">$1</h3>')
    // Bullet points
    .replace(/^- (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 8px; list-style-type: disc;">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 8px; list-style-type: decimal;">$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #2563eb; text-decoration: underline;">$1</a>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;" />')
    // Paragraphs
    .replace(/\n\n/g, '</p><p style="margin-bottom: 16px;">')
    // Line breaks
    .replace(/\n/g, "<br />");
}
