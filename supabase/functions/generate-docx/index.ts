import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  PageBreak,
  BorderStyle,
  convertInchesToTwip,
  LevelFormat,
  ILevelsOptions,
  ShadingType,
} from "https://esm.sh/docx@8.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Step 14 assembled report structure (supports both HTML and markdown)
// Tables can be either array format (legacy) or object format (new HTML-first pipeline)
type TableArrayItem = {
  id?: string;
  title: string;
  section: string;
  columns?: string[];
  rows?: string[][];
  html?: string;
  markdown?: string;
};

interface AssembledReport {
  title?: string;
  report_markdown?: string;
  report_html?: string;
  tables?: TableArrayItem[] | Record<string, string>; // Object format: { tableId: htmlString }
  all_sources?: Array<{
    id: string;
    title?: string;
    publisher?: string;
    date?: string;
    url: string;
    accessed_date?: string;
    mla?: string;
    mla_citation?: string;
  }>;
  data_gaps?: Array<{
    gap: string;
    why_missing: string;
    needed_source: string;
  } | string>;
}

interface SectionEntry {
  title: string;
  content: string;
}

interface ReportContent {
  assembledReport?: AssembledReport;
  sections?: SectionEntry[];
}

// Helper to strip code fences and parse JSON from section content
function parseJsonFromSection(content: string): Record<string, unknown> | null {
  if (!content) return null;
  
  let trimmed = content.trim();
  
  // Strip code fences if present (any language tag: json, JSON, html, etc.)
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```[a-zA-Z]*\s*\n?/, "");
    trimmed = trimmed.replace(/\n?```\s*$/, "");
    trimmed = trimmed.trim();
  }
  
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Try regex extraction for truncated JSON
      const markdownMatch = trimmed.match(/"report_markdown"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/);
      if (markdownMatch?.[1]) {
        const markdown = markdownMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
        return { report_markdown: markdown };
      }
    }
  }
  
  return null;
}

// Extract sources from build_source_pack section
function extractSourcesFromSections(sections: SectionEntry[]): AssembledReport["all_sources"] {
  const sourceSection = sections.find(s => s.title === "build_source_pack");
  if (!sourceSection?.content) return [];
  
  const parsed = parseJsonFromSection(sourceSection.content);
  if (!parsed) return [];
  
  // Handle array of sources directly
  if (Array.isArray(parsed)) {
    return parsed.map((src: Record<string, unknown>, idx: number) => ({
      id: (src.id as string) || String(idx + 1),
      title: src.title as string,
      publisher: src.publisher as string,
      date: src.date as string,
      url: (src.url || src.link) as string,
      accessed_date: src.accessed_date as string,
      mla: (src.mla_citation || src.mla || src.citation) as string,
      mla_citation: (src.mla_citation || src.mla) as string,
    }));
  }
  
  // Handle object with sources array
  if (parsed.sources && Array.isArray(parsed.sources)) {
    return (parsed.sources as Record<string, unknown>[]).map((src, idx) => ({
      id: (src.id as string) || String(idx + 1),
      title: src.title as string,
      publisher: src.publisher as string,
      date: src.date as string,
      url: (src.url || src.link) as string,
      accessed_date: src.accessed_date as string,
      mla: (src.mla_citation || src.mla || src.citation) as string,
      mla_citation: (src.mla_citation || src.mla) as string,
    }));
  }
  
  return [];
}

// Extract assembled report from potentially nested JSON wrapper
// Handles both HTML (new format) and markdown (legacy format)
// Also supports sections array format from Replit worker
function extractAssembledReport(content: ReportContent): AssembledReport | null {
  // Case 1: Sections array format (Replit worker)
  if (content.sections && Array.isArray(content.sections)) {
    console.log("Detected sections array format, extracting from finalize_report...");
    
    // Priority order for finding the main report content
    const assemblyTitles = ["finalize_report", "assemble_sections", "build_tables_sources"];
    
    let assemblySection: SectionEntry | undefined;
    for (const title of assemblyTitles) {
      assemblySection = content.sections.find(s => s.title === title);
      if (assemblySection?.content) break;
    }
    
    if (assemblySection?.content) {
      const parsed = parseJsonFromSection(assemblySection.content);
      
      if (parsed) {
        const reportMarkdown = (parsed.report_markdown as string) || 
                               (parsed.report_html ? convertHtmlToSimpleText(parsed.report_html as string) : null);
        
        if (reportMarkdown) {
          console.log("Successfully extracted report from sections format, markdown length:", reportMarkdown.length);
          return {
            title: parsed.title as string,
            report_markdown: reportMarkdown,
            report_html: parsed.report_html as string,
            tables: [],
            all_sources: extractSourcesFromSections(content.sections),
            data_gaps: [],
          };
        }
      }
    }
  }
  
  // Case 2: Direct assembledReport (existing format)
  const assembledReport = content.assembledReport;
  if (!assembledReport) return null;

  // Check for HTML content first (new format)
  if (assembledReport.report_html) {
    return {
      ...assembledReport,
      // Convert HTML to markdown-like structure for the existing parser
      report_markdown: convertHtmlToSimpleText(assembledReport.report_html),
    };
  }

  const markdownContent = assembledReport.report_markdown;
  if (!markdownContent) return null;

  // Helper to merge nested JSON with original structure
  function mergeWithNested(original: AssembledReport, nested: Record<string, unknown>): AssembledReport {
    return {
      title: (nested.title as string) || original.title,
      report_markdown: (nested.report_markdown as string) || (nested.report_html ? convertHtmlToSimpleText(nested.report_html as string) : ""),
      report_html: (nested.report_html as string) || original.report_html,
      tables: (nested.tables as AssembledReport["tables"]) || original.tables || [],
      all_sources: (nested.all_sources as AssembledReport["all_sources"]) || original.all_sources || [],
      data_gaps: (nested.data_gaps as AssembledReport["data_gaps"]) || original.data_gaps || [],
    };
  }

  // Pattern 1: Code-fenced JSON (```json\n{...}\n```)
  const jsonBlockMatch = markdownContent.match(/^```json?\s*\n([\s\S]*?)\n```\s*$/);
  if (jsonBlockMatch) {
    console.log("Detected code-fenced JSON wrapper in report_markdown, extracting...");
    try {
      const nestedJson = JSON.parse(jsonBlockMatch[1]);
      return mergeWithNested(assembledReport, nestedJson);
    } catch (e) {
      console.error("Failed to parse code-fenced JSON in report_markdown:", e);
    }
  }

  // Pattern 2: Raw JSON object (starts with {)
  if (markdownContent.trim().startsWith('{')) {
    console.log("Detected raw JSON object in report_markdown, extracting...");
    try {
      const nestedJson = JSON.parse(markdownContent);
      return mergeWithNested(assembledReport, nestedJson);
    } catch (e) {
      console.error("Failed to parse raw JSON in report_markdown:", e);
      return assembledReport;
    }
  }

  // No nested JSON, use as-is
  return assembledReport;
}

// Convert HTML to simple text for the markdown parser
function convertHtmlToSimpleText(html: string): string {
  if (!html) return "";
  
  let text = html;
  
  // Convert headers
  text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "## $1\n\n");
  text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "### $1\n\n");
  text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "#### $1\n\n");
  
  // Convert paragraphs
  text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  
  // Convert lists
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  text = text.replace(/<\/?ul[^>]*>/gi, "\n");
  text = text.replace(/<\/?ol[^>]*>/gi, "\n");
  
  // Convert bold/italic
  text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  
  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");
  
  // Clean up whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  
  return text.trim();
}

// Document styling constants
const STYLES = {
  primaryColor: "1E3A5F", // Navy blue
  headerColor: "2563EB", // Bright blue for table headers
  fontFamily: "Calibri",
  fontSize: {
    body: 22, // 11pt in half-points
    h1: 36, // 18pt
    h2: 28, // 14pt
    h3: 24, // 12pt
  },
};

// Numbering configuration for bullet and numbered lists
const NUMBERING_CONFIG: ILevelsOptions[] = [
  {
    level: 0,
    format: LevelFormat.BULLET,
    text: "•",
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
      },
    },
  },
];

const NUMBERED_CONFIG: ILevelsOptions[] = [
  {
    level: 0,
    format: LevelFormat.DECIMAL,
    text: "%1.",
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
      },
    },
  },
];

// Parse inline formatting (bold, italic) into TextRuns
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let remaining = text;

  // Pattern to match bold (**text**) and italic (*text* but not **text**)
  const inlinePattern = /(\*\*(.+?)\*\*|\*(?!\*)(.+?)(?<!\*)\*|\[([^\]]+)\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;

  while ((match = inlinePattern.exec(text)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index);
      if (plainText) {
        runs.push(new TextRun({ text: plainText, size: STYLES.fontSize.body }));
      }
    }

    if (match[2]) {
      // Bold text (**text**)
      runs.push(new TextRun({ text: match[2], bold: true, size: STYLES.fontSize.body }));
    } else if (match[3]) {
      // Italic text (*text*)
      runs.push(new TextRun({ text: match[3], italics: true, size: STYLES.fontSize.body }));
    } else if (match[4]) {
      // Link [text](url) - just extract text
      runs.push(new TextRun({ text: match[4], size: STYLES.fontSize.body }));
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining plain text
  if (lastIndex < text.length) {
    const plainText = text.slice(lastIndex);
    if (plainText) {
      runs.push(new TextRun({ text: plainText, size: STYLES.fontSize.body }));
    }
  }

  // If no runs were created, return the original text
  if (runs.length === 0 && text.trim()) {
    runs.push(new TextRun({ text, size: STYLES.fontSize.body }));
  }

  return runs;
}

// Track section headings for table insertion
interface ParsedSection {
  type: "heading" | "paragraph" | "bullet" | "numbered";
  level?: number;
  text: string;
  sectionName?: string; // For headings, the section name for table matching
}

// Parse markdown into structured sections
function parseMarkdownStructure(markdown: string): ParsedSection[] {
  const lines = markdown.split("\n");
  const sections: ParsedSection[] = [];
  let inCodeBlock = false;
  let inTable = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines but mark paragraph breaks
    if (!trimmedLine) {
      continue;
    }

    // Skip code fences
    if (trimmedLine.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip markdown tables (we handle tables from structured data)
    if (trimmedLine.startsWith("|")) {
      inTable = true;
      continue;
    }
    if (inTable && !trimmedLine.startsWith("|")) {
      inTable = false;
    }
    if (inTable) continue;

    // Skip horizontal rules
    if (/^[-*_]{3,}$/.test(trimmedLine)) {
      continue;
    }

    // Parse headings (## -> H1, ### -> H2, #### -> H3)
    const h2Match = trimmedLine.match(/^##\s+(?:\d+\.\s*)?(.+)$/);
    if (h2Match) {
      sections.push({
        type: "heading",
        level: 1,
        text: h2Match[1].trim(),
        sectionName: h2Match[1].trim(),
      });
      continue;
    }

    const h3Match = trimmedLine.match(/^###\s+(?:\d+\.\s*)?(.+)$/);
    if (h3Match) {
      sections.push({
        type: "heading",
        level: 2,
        text: h3Match[1].trim(),
        sectionName: h3Match[1].trim(),
      });
      continue;
    }

    const h4Match = trimmedLine.match(/^####\s+(.+)$/);
    if (h4Match) {
      sections.push({
        type: "heading",
        level: 3,
        text: h4Match[1].trim(),
      });
      continue;
    }

    // Parse bullet lists
    const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      sections.push({
        type: "bullet",
        text: bulletMatch[1].trim(),
      });
      continue;
    }

    // Parse numbered lists
    const numberedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      sections.push({
        type: "numbered",
        text: numberedMatch[1].trim(),
      });
      continue;
    }

    // Regular paragraph
    sections.push({
      type: "paragraph",
      text: trimmedLine,
    });
  }

  return sections;
}

// Build Word table from structured data
function buildTable(tableData: { title: string; columns?: string[]; rows?: string[][] }): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  // Table title
  if (tableData.title) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: tableData.title,
            bold: true,
            size: STYLES.fontSize.h3,
          }),
        ],
        spacing: { before: 240, after: 120 },
      })
    );
  }

  // Build table rows
  const tableRows: TableRow[] = [];

  // Header row
  if (tableData.columns && tableData.columns.length > 0) {
    tableRows.push(
      new TableRow({
        tableHeader: true,
        children: tableData.columns.map(
          (col) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: col || "",
                      bold: true,
                      color: "FFFFFF",
                      size: STYLES.fontSize.body,
                    }),
                  ],
                }),
              ],
              shading: {
                type: ShadingType.SOLID,
                fill: STYLES.headerColor,
              },
              margins: {
                top: 100,
                bottom: 100,
                left: 100,
                right: 100,
              },
            })
        ),
      })
    );
  }

  // Data rows
  if (tableData.rows) {
    for (const row of tableData.rows) {
      tableRows.push(
        new TableRow({
          children: row.map(
            (cell, idx) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: parseInlineFormatting(
                      cell || "Unknown (no validated source found)"
                    ),
                  }),
                ],
                margins: {
                  top: 80,
                  bottom: 80,
                  left: 100,
                  right: 100,
                },
              })
          ),
        })
      );
    }
  }

  if (tableRows.length > 0) {
    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        },
      })
    );
  }

  // Add spacing after table
  elements.push(new Paragraph({ spacing: { after: 200 } }));

  return elements;
}

// Build references section with hanging indent
function buildReferences(sources: AssembledReport["all_sources"]): Paragraph[] {
  if (!sources || sources.length === 0) return [];

  const paragraphs: Paragraph[] = [];

  for (const source of sources) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `[${source.id}] `,
            bold: true,
            size: STYLES.fontSize.body,
          }),
          new TextRun({
            text: source.mla,
            size: STYLES.fontSize.body,
          }),
        ],
        indent: {
          left: convertInchesToTwip(0.5),
          hanging: convertInchesToTwip(0.5),
        },
        spacing: { after: 120 },
      })
    );

    // Add URL on separate line if present
    if (source.url) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: source.url,
              size: STYLES.fontSize.body - 2,
              color: "666666",
            }),
          ],
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 160 },
        })
      );
    }
  }

  return paragraphs;
}

// Build data gaps section as bullet list
function buildDataGaps(dataGaps: AssembledReport["data_gaps"]): Paragraph[] {
  if (!dataGaps || dataGaps.length === 0) return [];

  return dataGaps.map(
    (gap) => {
      // Handle both string and object formats
      const gapText = typeof gap === 'string' ? gap : gap.gap;
      const whyMissing = typeof gap === 'string' ? '' : gap.why_missing;
      const neededSource = typeof gap === 'string' ? '' : gap.needed_source;
      
      const children = [
        new TextRun({
          text: gapText,
          bold: true,
          size: STYLES.fontSize.body,
        }),
      ];
      
      if (whyMissing) {
        children.push(new TextRun({
          text: ` — ${whyMissing}`,
          size: STYLES.fontSize.body,
        }));
      }
      
      if (neededSource) {
        children.push(new TextRun({
          text: ` (Needed: ${neededSource})`,
          italics: true,
          size: STYLES.fontSize.body,
          color: "666666",
        }));
      }
      
      return new Paragraph({
        children,
        bullet: { level: 0 },
        spacing: { after: 80 },
      });
    }
  );
}

// Match table section to heading (fuzzy match)
function sectionMatchesHeading(sectionName: string, headingText: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(headingText).includes(normalize(sectionName)) ||
    normalize(sectionName).includes(normalize(headingText));
}

// Convert table ID to display title
function formatTableId(id: string): string {
  return id
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Map table ID to expected section name for insertion
function mapTableIdToSection(id: string): string {
  const sectionMap: Record<string, string> = {
    competitors: "Competitive Analysis",
    market_sizing: "Market Sizing",
    partners: "Partners",
  };
  return sectionMap[id] || formatTableId(id);
}

// Normalize tables to array format
// Handles both object { id: htmlString } and array formats
function normalizeTables(
  tables: AssembledReport["tables"]
): TableArrayItem[] {
  if (!tables) return [];
  
  // Already an array - return as-is
  if (Array.isArray(tables)) {
    return tables;
  }
  
  // Object format: convert to array
  // { "competitors": "<table>...", "market_sizing": "<table>..." }
  console.log("Converting object tables format to array:", Object.keys(tables));
  return Object.entries(tables).map(([id, html]) => ({
    id,
    title: formatTableId(id),
    section: mapTableIdToSection(id),
    html: html as string,
  }));
}

// Parse HTML table into 2D array of cell text
function parseHtmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  
  // Match all table rows
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  
  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    
    // Match all cells (th or td)
    const cellMatches = rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
    
    for (const cellMatch of cellMatches) {
      // Strip HTML tags from cell content
      const cellText = cellMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      cells.push(cellText);
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  return rows;
}

// Build Word table from HTML table string
function buildTableFromHtml(
  tableData: TableArrayItem
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  if (tableData.title) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: tableData.title,
            bold: true,
            size: STYLES.fontSize.h3,
          }),
        ],
        spacing: { before: 240, after: 120 },
      })
    );
  }

  if (!tableData.html) return elements;

  // Parse HTML table to extract rows and cells
  const rows = parseHtmlTableRows(tableData.html);
  if (rows.length === 0) {
    console.log("No rows parsed from HTML table:", tableData.id);
    return elements;
  }

  console.log(`Parsed ${rows.length} rows from HTML table: ${tableData.id}`);

  const tableRows: TableRow[] = rows.map((row, rowIndex) => {
    const isHeader = rowIndex === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: row.map(cellText =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cellText,
                  bold: isHeader,
                  size: STYLES.fontSize.body,
                  color: isHeader ? "FFFFFF" : undefined,
                }),
              ],
            }),
          ],
          shading: isHeader
            ? { fill: STYLES.headerColor, type: ShadingType.SOLID }
            : undefined,
          margins: {
            top: isHeader ? 100 : 80,
            bottom: isHeader ? 100 : 80,
            left: 100,
            right: 100,
          },
        })
      ),
    });
  });

  elements.push(
    new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      },
    })
  );

  elements.push(new Paragraph({ spacing: { after: 200 } }));

  return elements;
}

// Main document builder
function buildDocument(
  assembledReport: AssembledReport,
  metadata: { grantName: string; reportTitle: string; generatedDate: string; version: number }
): Document {
  const sections = parseMarkdownStructure(assembledReport.report_markdown || "");
  // Normalize tables to array format (handles both object and array formats)
  const normalizedTables = normalizeTables(assembledReport.tables);
  // Filter for structured tables (have columns/rows) OR HTML tables
  const tables = normalizedTables.filter(t => (t.columns && t.rows) || t.html);
  const dataGaps = assembledReport.data_gaps || [];
  const sources = assembledReport.all_sources || [];

  // Track which tables have been inserted
  const insertedTables = new Set<number>();

  // Build document children
  const children: (Paragraph | Table)[] = [];

  // Cover page
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: metadata.reportTitle,
          bold: true,
          size: 48, // 24pt
          color: STYLES.primaryColor,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Prepared for: ${metadata.grantName}`,
          size: STYLES.fontSize.h2,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Date: ${metadata.generatedDate}  |  Version ${metadata.version}`,
          size: STYLES.fontSize.body,
          color: "666666",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  // Page break after cover
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Track current section for table insertion
  let currentSectionName = "";

  // Process markdown sections
  for (const section of sections) {
    if (section.type === "heading") {
      currentSectionName = section.sectionName || section.text;

      const headingLevel =
        section.level === 1
          ? HeadingLevel.HEADING_1
          : section.level === 2
          ? HeadingLevel.HEADING_2
          : HeadingLevel.HEADING_3;

      const fontSize =
        section.level === 1
          ? STYLES.fontSize.h1
          : section.level === 2
          ? STYLES.fontSize.h2
          : STYLES.fontSize.h3;

      children.push(
        new Paragraph({
          text: section.text,
          heading: headingLevel,
          spacing: { before: 360, after: 160 },
        })
      );

      // Insert any tables that match this section
      for (let i = 0; i < tables.length; i++) {
        if (!insertedTables.has(i)) {
          const table = tables[i];
          if (sectionMatchesHeading(table.section, currentSectionName)) {
            if (table.columns && table.rows) {
              // Structured table with columns/rows
              children.push(...buildTable(table));
            } else if (table.html) {
              // HTML table - parse and build
              children.push(...buildTableFromHtml(table));
            }
            insertedTables.add(i);
          }
        }
      }
    } else if (section.type === "bullet") {
      children.push(
        new Paragraph({
          children: parseInlineFormatting(section.text),
          bullet: { level: 0 },
          spacing: { after: 80 },
        })
      );
    } else if (section.type === "numbered") {
      children.push(
        new Paragraph({
          children: parseInlineFormatting(section.text),
          numbering: { reference: "numbered-list", level: 0 },
          spacing: { after: 80 },
        })
      );
    } else if (section.type === "paragraph") {
      children.push(
        new Paragraph({
          children: parseInlineFormatting(section.text),
          spacing: { after: 120 },
        })
      );
    }
  }

  // Insert any remaining tables that weren't matched to sections
  for (let i = 0; i < tables.length; i++) {
    if (!insertedTables.has(i)) {
      const table = tables[i];
      if (table.columns && table.rows) {
        children.push(...buildTable(table));
      } else if (table.html) {
        children.push(...buildTableFromHtml(table));
      }
    }
  }

  // Add data gaps if they exist and weren't in markdown
  if (dataGaps.length > 0) {
    const hasDataGapsSection = sections.some(
      (s) => s.type === "heading" && s.text.toLowerCase().includes("data gap")
    );

    if (!hasDataGapsSection) {
      children.push(
        new Paragraph({
          text: "Data Gaps and Validation Needs",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 160 },
        })
      );
    }

    children.push(...buildDataGaps(dataGaps));
  }

  // Page break before references
  if (sources.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));

    children.push(
      new Paragraph({
        text: "References",
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 240 },
      })
    );

    children.push(...buildReferences(sources));
  }

  // Footer branding
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Powered by Disruptors Co",
          size: STYLES.fontSize.body - 2,
          color: "999999",
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
    })
  );

  return new Document({
    numbering: {
      config: [
        {
          reference: "bullet-list",
          levels: NUMBERING_CONFIG,
        },
        {
          reference: "numbered-list",
          levels: NUMBERED_CONFIG,
        },
      ],
    },
    sections: [
      {
        children,
      },
    ],
  });
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client for auth verification
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Service client for storage access
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    const { reportId } = await req.json();
    if (!reportId) {
      return new Response(JSON.stringify({ error: "reportId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch report and verify ownership (or admin access)
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select(`
        id,
        version_number,
        created_at,
        content_json,
        user_id,
        applications!inner(
          id,
          title,
          grant_version_id,
          grant_versions!inner(
            id,
            grants!inner(name)
          )
        )
      `)
      .eq("id", reportId)
      .eq("user_id", userId)
      .single();

    if (reportError || !report) {
      console.error("Report fetch error:", reportError);
      return new Response(
        JSON.stringify({ error: "Report not found or access denied" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate Step 11 JSON exists and extract from potential JSON wrapper
    const content = (report.content_json || {}) as ReportContent;
    const assembledReport = extractAssembledReport(content);

    // Diagnostic logging
    if (assembledReport) {
      console.log("Extracted report_markdown length:", assembledReport.report_markdown?.length || 0);
      console.log("report_markdown starts with:", assembledReport.report_markdown?.substring(0, 100) || "empty");
      console.log("Tables count:", assembledReport.tables?.length || 0);
      console.log("Sources count:", assembledReport.all_sources?.length || 0);
    }

    if (!assembledReport?.report_markdown) {
      console.error("Missing assembledReport in content_json after extraction");
      return new Response(
        JSON.stringify({
          error: "Report content not found. Please regenerate the report.",
          details: "The report is missing the assembled content (Step 11 output).",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract grant name from nested relations
    const grantName =
      (report.applications as any)?.grant_versions?.grants?.name || "Research Report";

    // Build document
    const doc = buildDocument(assembledReport, {
      grantName,
      reportTitle: assembledReport.title || `${grantName} Commercialisation Analysis`,
      generatedDate: formatDate(report.created_at),
      version: report.version_number,
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    // Save to storage (non-blocking)
    const storagePath = `${report.user_id}/${report.id}.docx`;
    try {
      await supabaseService.storage.from("reports").upload(storagePath, buffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

      // Update docx_path in database
      await supabaseService
        .from("reports")
        .update({ docx_path: storagePath })
        .eq("id", report.id);

      console.log("DOCX saved to storage:", storagePath);
    } catch (storageError) {
      // Non-blocking - still return the DOCX even if storage fails
      console.error("Storage upload failed (non-blocking):", storageError);
    }

    // Return DOCX for download
    const filename = `${grantName.replace(/[^a-zA-Z0-9]/g, "_")}_Report_v${report.version_number}.docx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error("DOCX generation error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate DOCX";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
