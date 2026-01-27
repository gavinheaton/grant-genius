import { forwardRef } from "react";
import { type Report } from "@/hooks/useReportGeneration";
import { type PdfTemplate } from "@/hooks/usePdfTemplates";
import { format } from "date-fns";

interface ReportSection {
  title: string;
  content: string;
}

interface ContentJson {
  market_segments?: string;
  competitive_landscape?: string;
  tam_sam_som?: string;
  economic_impact?: string;
  potential_partners?: string;
  industry_stakeholders?: string;
  ip_landscape?: string;
  regulatory_environment?: string;
  success_metrics?: string;
  executive_summary?: string;
  [key: string]: string | undefined;
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

    // Build sections array from content
    const sections: ReportSection[] = [];
    
    if (content.executive_summary) {
      sections.push({ title: "Executive Summary", content: content.executive_summary });
    }
    if (content.market_segments) {
      sections.push({ title: "Market Segments", content: content.market_segments });
    }
    if (content.competitive_landscape) {
      sections.push({ title: "Competitive Landscape", content: content.competitive_landscape });
    }
    if (content.tam_sam_som) {
      sections.push({ title: "TAM/SAM/SOM Analysis", content: content.tam_sam_som });
    }
    if (content.economic_impact) {
      sections.push({ title: "Economic Impact", content: content.economic_impact });
    }
    if (content.potential_partners) {
      sections.push({ title: "Potential Partners", content: content.potential_partners });
    }
    if (content.industry_stakeholders) {
      sections.push({ title: "Industry Stakeholders", content: content.industry_stakeholders });
    }
    if (content.ip_landscape) {
      sections.push({ title: "IP Landscape", content: content.ip_landscape });
    }
    if (content.regulatory_environment) {
      sections.push({ title: "Regulatory Environment", content: content.regulatory_environment });
    }
    if (content.success_metrics) {
      sections.push({ title: "Success Metrics", content: content.success_metrics });
    }

    const headingSizes = template.heading_sizes_json;

    return (
      <div
        ref={ref}
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: "800px", // Fixed width for consistent rendering
          backgroundColor: "#ffffff",
          fontFamily: template.font_family || "Arial, sans-serif",
          fontSize: `${headingSizes.body}px`,
          color: "#1a1a1a",
          lineHeight: 1.6,
        }}
      >
        {/* Cover Page */}
        {template.include_cover_page && (
          <div
            style={{
              minHeight: "1000px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              padding: "60px",
              textAlign: "center",
              borderBottom: `4px solid ${template.primary_color}`,
              marginBottom: "40px",
            }}
          >
            {template.logo_path && (
              <img
                src={template.logo_path}
                alt="Logo"
                style={{ maxWidth: "200px", marginBottom: "40px" }}
              />
            )}
            <h1
              style={{
                fontSize: `${headingSizes.h1 * 1.5}px`,
                fontWeight: 700,
                color: template.primary_color,
                marginBottom: "20px",
              }}
            >
              Commercialisation Research Report
            </h1>
            <h2
              style={{
                fontSize: `${headingSizes.h2}px`,
                fontWeight: 500,
                color: template.secondary_color,
                marginBottom: "40px",
              }}
            >
              {grantName}
            </h2>
            <p style={{ fontSize: "14px", color: "#666" }}>
              Generated on {generatedDate}
            </p>
            <p style={{ fontSize: "12px", color: "#888", marginTop: "10px" }}>
              Report Version {report.version_number}
            </p>
          </div>
        )}

        {/* Table of Contents */}
        {template.include_toc && sections.length > 0 && (
          <div
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
            style={{
              padding: "30px 60px",
              marginBottom: "20px",
              ...(template.section_page_breaks && index > 0
                ? { pageBreakBefore: "always" }
                : {}),
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
                whiteSpace: "pre-wrap",
                lineHeight: 1.8,
              }}
              dangerouslySetInnerHTML={{ __html: formatContent(section.content) }}
            />
          </div>
        ))}

        {/* Disclaimer */}
        {template.disclaimer_text && (
          <div
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

        {/* Watermark (if set) */}
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
function formatContent(content: string): string {
  if (!content) return "";
  
  return content
    // Bold text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Italic text
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Headers (### Header)
    .replace(/^### (.*?)$/gm, '<h4 style="font-weight: 600; margin: 20px 0 10px;">$1</h4>')
    .replace(/^## (.*?)$/gm, '<h3 style="font-weight: 600; margin: 25px 0 15px; font-size: 1.1em;">$1</h3>')
    // Bullet points
    .replace(/^- (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 8px;">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 8px;">$1</li>')
    // Line breaks
    .replace(/\n\n/g, "</p><p style='margin-bottom: 16px;'>")
    .replace(/\n/g, "<br />");
}
