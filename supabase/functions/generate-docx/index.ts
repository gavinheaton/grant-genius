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

// Step 11 assembled report structure
interface AssembledReport {
  title?: string;
  report_markdown: string;
  tables?: Array<{
    title: string;
    section: string;
    columns: string[];
    rows: string[][];
  }>;
  all_sources?: Array<{
    id: string;
    title?: string;
    publisher?: string;
    date?: string;
    url: string;
    accessed_date?: string;
    mla: string;
  }>;
  data_gaps?: Array<{
    gap: string;
    why_missing: string;
    needed_source: string;
  }>;
}

interface ReportContent {
  assembledReport?: AssembledReport;
}

// Extract assembled report from potentially nested JSON wrapper
// Step 11 sometimes outputs a ```json code block containing the actual data
function extractAssembledReport(content: ReportContent): AssembledReport | null {
  const assembledReport = content.assembledReport;
  if (!assembledReport) return null;

  const markdownContent = assembledReport.report_markdown;
  if (!markdownContent) return null;

  // Pattern: ```json\n{...}\n``` (the entire content is wrapped)
  const jsonBlockMatch = markdownContent.match(/^```json?\s*\n([\s\S]*?)\n```\s*$/);
  
  if (jsonBlockMatch) {
    console.log("Detected nested JSON wrapper in report_markdown, extracting...");
    try {
      const nestedJson = JSON.parse(jsonBlockMatch[1]);
      // Merge the nested structure with the outer structure
      return {
        title: nestedJson.title || assembledReport.title,
        report_markdown: nestedJson.report_markdown || "",
        tables: nestedJson.tables || assembledReport.tables || [],
        all_sources: nestedJson.all_sources || assembledReport.all_sources || [],
        data_gaps: nestedJson.data_gaps || assembledReport.data_gaps || [],
      };
    } catch (e) {
      console.error("Failed to parse nested JSON in report_markdown:", e);
      // Fall back to original structure
      return assembledReport;
    }
  }

  // No nested JSON, use as-is
  return assembledReport;
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
function buildTable(tableData: { title: string; columns: string[]; rows: string[][] }): (Paragraph | Table)[] {
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
    (gap) =>
      new Paragraph({
        children: [
          new TextRun({
            text: gap.gap,
            bold: true,
            size: STYLES.fontSize.body,
          }),
          new TextRun({
            text: ` — ${gap.why_missing}`,
            size: STYLES.fontSize.body,
          }),
          new TextRun({
            text: ` (Needed: ${gap.needed_source})`,
            italics: true,
            size: STYLES.fontSize.body,
            color: "666666",
          }),
        ],
        bullet: { level: 0 },
        spacing: { after: 80 },
      })
  );
}

// Match table section to heading (fuzzy match)
function sectionMatchesHeading(sectionName: string, headingText: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(headingText).includes(normalize(sectionName)) ||
    normalize(sectionName).includes(normalize(headingText));
}

// Main document builder
function buildDocument(
  assembledReport: AssembledReport,
  metadata: { grantName: string; reportTitle: string; generatedDate: string; version: number }
): Document {
  const sections = parseMarkdownStructure(assembledReport.report_markdown);
  const tables = assembledReport.tables || [];
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
            children.push(...buildTable(table));
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
      children.push(...buildTable(tables[i]));
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;

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
