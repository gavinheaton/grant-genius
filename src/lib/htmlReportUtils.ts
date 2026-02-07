/**
 * Utilities for handling HTML report content
 */
import DOMPurify from "dompurify";

/**
 * Remove any remaining bracketed internal source IDs from HTML
 * Fallback for reports generated before APA citation cleanup was added
 */
/**
 * Forbidden patterns that should never appear in final reports
 */
const REPORT_FORBIDDEN_PATTERNS = [
  // Internal source ID formats
  /<sup>\s*\[([A-Z][A-Z0-9\-_:]+)\]\s*<\/sup>/gi, // <sup>[S0-1]</sup>
  /\[([A-Z][A-Z0-9\-_:]+)\]/g,                     // [S0-1], [ARTICLE-1], [SEARCH-2]
  /\[\{TBD\}\]/gi,                                  // [{TBD}]
  /\[TBD\]/gi,                                      // [TBD]
  /\{TBD\}/gi,                                      // {TBD}
  // Placeholder patterns
  /Source\s*[12]\b/gi,                              // Source 1, Source 2
  /Hypothetical\s+\w+/gi,                           // Hypothetical Company
  /\[Insert[^\]]*\]/gi,                             // [Insert company name]
  /\[PROJECT\s*NAME\]/gi,                           // [PROJECT NAME]
  /\[COMPANY\]/gi,                                  // [COMPANY]
  /\[Your\s+[^\]]*\]/gi,                            // [Your Company]
];

export function stripBracketedSourceIds(html: string): string {
  if (!html) return "";
  
  let cleaned = html;
  
  // Apply all forbidden pattern replacements
  for (const pattern of REPORT_FORBIDDEN_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    cleaned = cleaned.replace(pattern, "");
  }
  
  // Clean up any double spaces left behind
  cleaned = cleaned.replace(/  +/g, " ");
  
  // Clean up empty parentheses left behind from removed citations
  cleaned = cleaned.replace(/\(\s*\)/g, "");
  cleaned = cleaned.replace(/\(\s*;\s*\)/g, "");
  
  return cleaned;
}

/**
 * Validate that no internal source IDs or forbidden patterns remain
 * Returns array of patterns found (empty if clean)
 */
export function validateNoInternalMarkers(html: string): string[] {
  if (!html) return [];
  
  const found: string[] = [];
  
  // Check for internal source ID patterns
  const internalIdPattern = /\[([A-Z][A-Z0-9\-_:]+)\]/g;
  let match;
  while ((match = internalIdPattern.exec(html)) !== null) {
    found.push(`[${match[1]}]`);
  }
  
  // Check for other forbidden patterns
  if (/\{TBD\}/i.test(html)) found.push("{TBD}");
  if (/Source\s*[12]\b/i.test(html)) found.push("Source 1/2");
  if (/Hypothetical\s+\w+/i.test(html)) found.push("Hypothetical [Entity]");
  if (/\[Insert/i.test(html)) found.push("[Insert...]");
  
  return [...new Set(found)]; // Deduplicate
}

/**
 * Sanitize HTML content for safe rendering
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  
  const purified = DOMPurify.sanitize(html, {
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
  
  // Clean any remaining internal source ID markers as fallback
  return stripBracketedSourceIds(purified);
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

interface SectionEntry {
  title: string;
  content: string;
}

/**
 * Extract HTML content from a section's content field
 * Handles raw HTML, markdown, or JSON-wrapped content
 */
function extractHtmlFromSectionContent(content: string): string | null {
  if (!content || typeof content !== "string") return null;
  
  let trimmed = content.trim();
  
  // Case 1: Already HTML (starts with < tag)
  if (trimmed.startsWith("<")) {
    return trimmed;
  }
  
  // Case 2: Code-fenced content - strip fences regardless of completeness
  // Handle ```json, ```JSON, ```html, ``` etc. at the start
  if (trimmed.startsWith("```")) {
    // Remove opening fence with any language tag (case-insensitive)
    trimmed = trimmed.replace(/^```[a-zA-Z]*\s*\n?/, "");
    // Remove closing fence if present (may be truncated)
    trimmed = trimmed.replace(/\n?```\s*$/, "");
    trimmed = trimmed.trim();
  }
  
  // Case 3: Try to parse as JSON (with or without fences)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      
      if (parsed.report_html && typeof parsed.report_html === "string") {
        return parsed.report_html;
      }
      if (parsed.html && typeof parsed.html === "string") {
        return parsed.html;
      }
      if (parsed.report_markdown && typeof parsed.report_markdown === "string") {
        return convertMarkdownToHtml(parsed.report_markdown);
      }
    } catch {
      // JSON parse failed - try to extract markdown field with regex
      const markdownMatch = trimmed.match(/"report_markdown"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/);
      if (markdownMatch?.[1]) {
        // Unescape JSON string escapes
        const markdown = markdownMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
        return convertMarkdownToHtml(markdown);
      }
    }
  }
  
  // Case 4: Plain markdown content - convert it
  return convertMarkdownToHtml(trimmed);
}

/**
 * Extract sources from build_source_pack section content
 */
function extractSourcesFromSection(content: string | undefined): ExtractedHtmlReport["sources"] {
  if (!content) return undefined;
  
  try {
    let jsonStr = content.trim();
    
    // Remove code fences if present (any language tag)
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```[a-zA-Z]*\s*\n?/, "");
      jsonStr = jsonStr.replace(/\n?```\s*$/, "");
      jsonStr = jsonStr.trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Handle array of sources directly
    if (Array.isArray(parsed)) {
      return parsed.map((src, idx) => ({
        id: src.id || String(idx + 1),
        mla_citation: src.mla_citation || src.citation || src.title || "",
        url: src.url || src.link,
      }));
    }
    
    // Handle object with sources array
    if (parsed.sources && Array.isArray(parsed.sources)) {
      return parsed.sources.map((src: Record<string, unknown>, idx: number) => ({
        id: (src.id as string) || String(idx + 1),
        mla_citation: (src.mla_citation || src.citation || src.title || "") as string,
        url: (src.url || src.link) as string | undefined,
      }));
    }
  } catch {
    // Failed to parse sources
  }
  
  return undefined;
}

export function extractReportHtml(contentJson: unknown): ExtractedHtmlReport | null {
  if (!contentJson || typeof contentJson !== "object") {
    return null;
  }

  const content = contentJson as Record<string, unknown>;
  
  // Case 0: Step-based format (from Cloud Run worker) - finalize_report_html, assemble_sections_html as top keys
  const stepKeys = ['finalize_report_html', 'assemble_sections_html', 'build_tables_sources_html'];
  for (const key of stepKeys) {
    if (content[key]) {
      let stepData = content[key];
      
      // Parse if it's a JSON string
      if (typeof stepData === 'string') {
        try {
          stepData = JSON.parse(stepData);
        } catch {
          continue;
        }
      }
      
      const stepObj = stepData as Record<string, unknown>;
      if (stepObj.report_html && typeof stepObj.report_html === 'string') {
        return {
          html: stepObj.report_html,
          tables: stepObj.tables as ExtractedHtmlReport["tables"],
          sources: stepObj.all_sources as ExtractedHtmlReport["sources"],
          dataGaps: stepObj.data_gaps as string[],
          isLegacy: false,
        };
      }
    }
  }
  
  // Case 1: New HTML format - content.assembledReport.report_html
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

  // Case 2: Legacy markdown format in assembledReport
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

  // Case 3: Sections array format (from Replit worker)
  if (content.sections && Array.isArray(content.sections)) {
    const sections = content.sections as SectionEntry[];
    
    // Priority order for finding the main report content
    const assemblyTitles = ["finalize_report", "assemble_sections", "build_tables_sources"];
    
    let assemblySection: SectionEntry | undefined;
    for (const title of assemblyTitles) {
      assemblySection = sections.find(s => s.title === title);
      if (assemblySection?.content) break;
    }
    
    if (assemblySection?.content) {
      const html = extractHtmlFromSectionContent(assemblySection.content);
      
      // Extract sources from build_source_pack if present
      const sourceSection = sections.find(s => s.title === "build_source_pack");
      const sources = extractSourcesFromSection(sourceSection?.content);
      
      if (html) {
        return {
          html,
          sources,
          dataGaps: [],
          isLegacy: true,
        };
      }
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

  // Case 3: Code-fenced JSON (```json, ```JSON, ```html, etc.)
  if (typeof markdownContent === "string" && markdownContent.trim().startsWith("```")) {
    // Strip any language tag and closing fence
    let stripped = markdownContent.trim();
    stripped = stripped.replace(/^```[a-zA-Z]*\s*\n?/, "");
    stripped = stripped.replace(/\n?```\s*$/, "");
    stripped = stripped.trim();
    
    if (stripped.startsWith("{")) {
      try {
        const parsed = JSON.parse(stripped) as Record<string, unknown>;
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
 * Processes tables FIRST to prevent paragraph wrapping from breaking table syntax
 */
function convertMarkdownToHtml(markdown: string): string {
  if (!markdown) return "";

  // Step 1: Unescape JSON string escapes that may be present from Replit worker output
  let html = markdown
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  // Step 2: Extract table blocks FIRST and replace with placeholders
  const tableBlocks: string[] = [];
  const tableBlockRegex = /(?:^|\n)((?:\|[^\n]+\|\n?)+)/g;
  
  html = html.replace(tableBlockRegex, (match, tableContent) => {
    const tableHtml = buildHtmlTable(tableContent.trim().split("\n"));
    const placeholder = `<!--TABLE_PLACEHOLDER_${tableBlocks.length}-->`;
    tableBlocks.push(tableHtml);
    return `\n${placeholder}\n`;
  });

  // Step 3: Process headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Step 4: Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Step 5: Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Step 6: Lists (simple handling)
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Step 7: Paragraphs (wrap non-HTML lines, skip placeholders)
  html = html.split("\n\n").map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<")) return trimmed;
    if (trimmed.startsWith("<!--TABLE_PLACEHOLDER_")) return trimmed;
    return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  // Step 8: Restore table blocks from placeholders
  for (let i = 0; i < tableBlocks.length; i++) {
    html = html.replace(`<!--TABLE_PLACEHOLDER_${i}-->`, tableBlocks[i]);
  }

  return html;
}

// Note: convertMarkdownTables was removed - tables are now processed
// BEFORE paragraph wrapping in convertMarkdownToHtml() to fix rendering issues

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
