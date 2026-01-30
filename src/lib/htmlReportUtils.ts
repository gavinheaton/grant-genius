/**
 * Utilities for handling HTML report content
 */
import DOMPurify from "dompurify";

/**
 * Sanitize HTML content for safe rendering
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "br", "hr",
      "ul", "ol", "li",
      "table", "thead", "tbody", "tr", "th", "td",
      "strong", "b", "em", "i", "u", "s",
      "a", "span", "div",
      "blockquote", "pre", "code",
      "sup", "sub"
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "class", "style", "id",
      "colspan", "rowspan"
    ],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Extract report HTML from content_json
 * Handles both new HTML format and legacy markdown format
 */
export interface ExtractedHtmlReport {
  html: string;
  tables?: Array<{ id: string; title: string; html: string }>;
  sources?: Array<{ id: string; mla_citation: string; url?: string }>;
  dataGaps?: string[];
  isLegacy: boolean;
}

export function extractReportHtml(contentJson: unknown): ExtractedHtmlReport | null {
  if (!contentJson || typeof contentJson !== "object") {
    return null;
  }

  const content = contentJson as Record<string, unknown>;
  
  // New HTML format: content.assembledReport.report_html
  const assembledReport = content.assembledReport as Record<string, unknown> | undefined;
  
  if (assembledReport?.report_html && typeof assembledReport.report_html === "string") {
    return {
      html: assembledReport.report_html,
      tables: assembledReport.tables as ExtractedHtmlReport["tables"],
      sources: assembledReport.all_sources as ExtractedHtmlReport["sources"],
      dataGaps: assembledReport.data_gaps as string[],
      isLegacy: false,
    };
  }

  // Legacy markdown format: try to extract and convert
  if (assembledReport?.report_markdown) {
    const markdown = extractMarkdownFromNested(assembledReport.report_markdown);
    if (markdown) {
      return {
        html: convertMarkdownToHtml(markdown),
        tables: assembledReport.tables as ExtractedHtmlReport["tables"],
        sources: assembledReport.all_sources as ExtractedHtmlReport["sources"],
        dataGaps: assembledReport.data_gaps as string[],
        isLegacy: true,
      };
    }
  }

  return null;
}

/**
 * Extract markdown from potentially nested JSON wrapper
 */
function extractMarkdownFromNested(markdownContent: unknown): string | null {
  // Case 1: Plain string starting with # (markdown heading)
  if (typeof markdownContent === "string" && markdownContent.trim().startsWith("#")) {
    return markdownContent;
  }

  // Case 2: String that's actually JSON (starts with {)
  if (typeof markdownContent === "string" && markdownContent.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(markdownContent) as Record<string, unknown>;
      if (parsed.report_markdown && typeof parsed.report_markdown === "string") {
        return parsed.report_markdown;
      }
    } catch {
      // Fall through
    }
  }

  // Case 3: Code-fenced JSON (```json ... ```)
  if (typeof markdownContent === "string") {
    const match = markdownContent.match(/^```json?\s*\n([\s\S]*?)\n```\s*$/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]) as Record<string, unknown>;
        if (parsed.report_markdown && typeof parsed.report_markdown === "string") {
          return parsed.report_markdown;
        }
      } catch {
        // Fall through
      }
    }
  }

  // Case 4: Plain markdown string
  if (typeof markdownContent === "string" && markdownContent.trim()) {
    return markdownContent;
  }

  return null;
}

/**
 * Simple markdown to HTML conversion for legacy reports
 */
function convertMarkdownToHtml(markdown: string): string {
  if (!markdown) return "";

  let html = markdown;

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Lists (simple handling)
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Paragraphs (wrap non-HTML lines)
  html = html.split("\n\n").map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<")) return trimmed;
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  // Tables (simple conversion)
  html = convertMarkdownTables(html);

  return html;
}

/**
 * Convert markdown tables to HTML tables
 */
function convertMarkdownTables(html: string): string {
  const lines = html.split("\n");
  const result: string[] = [];
  let inTable = false;
  let tableLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (!inTable) {
        inTable = true;
        tableLines = [];
      }
      tableLines.push(trimmed);
    } else {
      if (inTable) {
        result.push(buildHtmlTable(tableLines));
        inTable = false;
        tableLines = [];
      }
      result.push(line);
    }
  }

  if (inTable) {
    result.push(buildHtmlTable(tableLines));
  }

  return result.join("\n");
}

function buildHtmlTable(lines: string[]): string {
  if (lines.length < 2) return lines.join("\n");

  const rows = lines.filter(line => !/^[\s|:-]+$/.test(line));
  if (rows.length === 0) return "";

  const parseRow = (row: string): string[] => 
    row.split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1).map(cell => cell.trim());

  const headerCells = parseRow(rows[0]);
  const bodyRows = rows.slice(1).map(parseRow);

  const headerHtml = headerCells.map(cell => `<th style="border: 1px solid #e5e7eb; padding: 10px; background-color: #f3f4f6; font-weight: 600;">${cell}</th>`).join("");
  const bodyHtml = bodyRows.map((row, idx) => {
    const bgColor = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
    const cells = row.map(cell => `<td style="border: 1px solid #e5e7eb; padding: 10px;">${cell}</td>`).join("");
    return `<tr style="background-color: ${bgColor};">${cells}</tr>`;
  }).join("");

  return `<table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
    <thead><tr>${headerHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>`;
}

/**
 * Default CSS styles for report HTML rendering
 */
export const REPORT_HTML_STYLES = `
  .report-html-content {
    font-family: 'Inter', system-ui, sans-serif;
    line-height: 1.7;
    color: #1a1a1a;
  }
  .report-html-content h1 {
    font-size: 1.75rem;
    font-weight: 700;
    margin: 2rem 0 1rem 0;
    color: #1e3a5f;
    border-bottom: 2px solid #d97706;
    padding-bottom: 0.5rem;
  }
  .report-html-content h2 {
    font-size: 1.375rem;
    font-weight: 600;
    margin: 1.5rem 0 0.75rem 0;
    color: #1e3a5f;
  }
  .report-html-content h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 1.25rem 0 0.5rem 0;
    color: #374151;
  }
  .report-html-content p {
    margin: 0.75rem 0;
  }
  .report-html-content ul, .report-html-content ol {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
  }
  .report-html-content li {
    margin: 0.25rem 0;
  }
  .report-html-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.875rem;
  }
  .report-html-content th {
    background-color: #1e3a5f;
    color: white;
    font-weight: 600;
    text-align: left;
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
  }
  .report-html-content td {
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
  }
  .report-html-content tr:nth-child(even) {
    background-color: #f9fafb;
  }
  .report-html-content a {
    color: #2563eb;
    text-decoration: underline;
  }
  .report-html-content blockquote {
    border-left: 4px solid #d97706;
    padding-left: 1rem;
    margin: 1rem 0;
    color: #4b5563;
    font-style: italic;
  }

  @media print {
    .report-html-content {
      font-size: 11pt;
    }
    .report-html-content h1 {
      page-break-after: avoid;
    }
    .report-html-content h2, .report-html-content h3 {
      page-break-after: avoid;
    }
    .report-html-content table {
      page-break-inside: avoid;
    }
    .no-print {
      display: none !important;
    }
  }
`;
