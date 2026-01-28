import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Actual report structure from Step 11 assembly
interface AssembledReport {
  title?: string;
  report_markdown: string;
  tables?: Array<{ title: string; markdown: string; section: string }>;
  all_sources?: Array<{ id: string; mla: string; url: string }>;
  data_gaps?: Array<{ gap: string; why_missing: string; needed_source: string }>;
}

interface ReportContent {
  assembledReport?: AssembledReport;
  // Legacy fields for backwards compatibility
  researchContext?: string;
  marketSegments?: Array<{ name: string; description: string; size?: string }>;
  existingCompetitors?: Array<{ name: string; description: string; url?: string }>;
  competitorTable?: string;
  tam?: { value: string; description: string };
  sam?: { value: string; description: string };
  som?: { value: string; description: string };
  economicImpact?: string;
  partners?: Array<{ name: string; description: string; website?: string }>;
  citations?: Array<{ title: string; url: string; accessed?: string }>;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = ["January", "February", "March", "April", "May", "June", 
                  "July", "August", "September", "October", "November", "December"];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function ensureArray<T>(data: T[] | undefined): T[] {
  return Array.isArray(data) ? data : [];
}

// Clean markdown formatting to produce readable plain text for DOCX
function cleanMarkdown(text: string): string {
  if (!text) return "";
  
  return text
    // Remove heading prefixes (## 1. Title -> Title)
    .replace(/^#{1,6}\s*\d*\.?\s*/gm, '')
    // Convert bold markers to plain text (**text** -> text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    // Convert italic markers to plain text (*text* -> text)
    .replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, '$1')
    // Convert markdown links to text with URL ([text](url) -> text (url))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Convert bullet markers to bullet character (- item -> • item)
    .replace(/^[-*]\s+/gm, '• ')
    // Convert numbered lists to clean format (1. item -> 1. item) - keep as is
    // Remove inline code backticks (`code` -> code)
    .replace(/`([^`]+)`/g, '$1')
    // Remove horizontal rules (--- or ***)
    .replace(/^[-*]{3,}$/gm, '')
    // Clean up multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Trim each line
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
}

// Convert markdown table to plain text format
function cleanMarkdownTable(markdown: string): string {
  if (!markdown) return "";
  
  const lines = markdown.split('\n').filter(l => l.trim());
  const result: string[] = [];
  
  for (const line of lines) {
    // Skip separator lines (|---|---|)
    if (/^\|[-:\s|]+\|$/.test(line)) continue;
    
    // Parse table row
    const cells = line
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0);
    
    if (cells.length > 0) {
      result.push(cells.join(' | '));
    }
  }
  
  return result.join('\n');
}

// Extract a section from markdown by its title pattern (e.g., "## 1. Executive Summary")
function extractSection(markdown: string, sectionNumber: number, sectionTitle: string): string {
  if (!markdown) return "";
  
  // Match section header and content until next section or end
  const regex = new RegExp(
    `##\\s*${sectionNumber}\\.\\s*${sectionTitle}[\\s\\S]*?(?=##\\s*\\d+\\.|$)`,
    'i'
  );
  const match = markdown.match(regex);
  return match ? match[0].trim() : "";
}

// Extract all 11 sections from the report markdown and clean for DOCX
function extractAllSectionsClean(markdown: string): Record<string, string> {
  const sections = {
    executive_summary: extractSection(markdown, 1, "Executive Summary"),
    research_context: extractSection(markdown, 2, "Research Context and Innovation"),
    unmet_need: extractSection(markdown, 3, "Unmet Need and Australian Relevance"),
    commercialisation_pathways: extractSection(markdown, 4, "Commercialisation Pathways"),
    competitive_landscape: extractSection(markdown, 5, "Competitive Landscape"),
    market_sizing: extractSection(markdown, 6, "Market Sizing"),
    economic_impact: extractSection(markdown, 7, "Economic Impact|Indicative Economic Impact"),
    australian_partners: extractSection(markdown, 8, "Potential Australian Partners"),
    risks_mitigations: extractSection(markdown, 9, "Key Risks and Mitigations"),
    data_gaps_section: extractSection(markdown, 10, "Data Gaps and Validation Needs"),
    references_section: extractSection(markdown, 11, "References"),
  };
  
  // Clean each section from markdown to plain text
  const cleanSections: Record<string, string> = {};
  for (const [key, value] of Object.entries(sections)) {
    cleanSections[key] = cleanMarkdown(value);
  }
  return cleanSections;
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

    // Fetch report and verify ownership
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select(`
        id,
        version_number,
        created_at,
        content_json,
        citations_json,
        application_id,
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
      return new Response(JSON.stringify({ error: "Report not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get default DOCX template
    const { data: template, error: templateError } = await supabase
      .from("docx_templates")
      .select("*")
      .eq("is_default", true)
      .maybeSingle();

    if (templateError) {
      console.error("Template fetch error:", templateError);
      return new Response(JSON.stringify({ error: "Failed to fetch template" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!template) {
      return new Response(JSON.stringify({ error: "No default DOCX template configured. Please ask an admin to upload one." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download template from storage
    const { data: templateFile, error: downloadError } = await supabaseService.storage
      .from("docx-templates")
      .download(template.template_path);

    if (downloadError || !templateFile) {
      console.error("Template download error:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download template file" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse template with PizZip and Docxtemplater
    const templateBuffer = await templateFile.arrayBuffer();
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
    });

    // Extract grant name from nested relations
    const grantName = (report.applications as any)?.grant_versions?.grants?.name || "Research Report";
    const content = (report.content_json || {}) as ReportContent;
    const citations = (report.citations_json || []) as Array<{ title: string; url: string; accessed?: string }>;

    // Check if we have the new assembled report structure
    const assembledReport = content.assembledReport;
    
    let templateData: Record<string, any>;

    if (assembledReport?.report_markdown) {
      // New structure: use assembledReport with cleaned markdown
      const cleanSections = extractAllSectionsClean(assembledReport.report_markdown);
      
      templateData = {
        // Cover page / header info (plain text)
        grant_name: grantName,
        application_title: (report.applications as any)?.title || grantName,
        report_title: assembledReport.title || `${grantName} Research Report`,
        generated_date: formatDate(report.created_at),
        version: report.version_number,

        // Full report content (cleaned markdown)
        report_content: cleanMarkdown(assembledReport.report_markdown),

        // Individual sections (cleaned markdown)
        ...cleanSections,

        // Tables (loop) - cleaned for readability
        tables: ensureArray(assembledReport.tables).map((table, idx) => ({
          index: idx + 1,
          title: table.title,
          markdown: cleanMarkdownTable(table.markdown),
          section: table.section,
        })),
        has_tables: ensureArray(assembledReport.tables).length > 0,

        // Sources/Citations (loop)
        sources: ensureArray(assembledReport.all_sources).map((source, idx) => ({
          index: idx + 1,
          id: source.id,
          mla: source.mla,
          url: source.url,
        })),
        has_sources: ensureArray(assembledReport.all_sources).length > 0,

        // Data gaps (loop)
        data_gaps: ensureArray(assembledReport.data_gaps).map((gap, idx) => ({
          index: idx + 1,
          gap: gap.gap,
          why_missing: gap.why_missing,
          needed_source: gap.needed_source,
        })),
        has_data_gaps: ensureArray(assembledReport.data_gaps).length > 0,

        // Branding
        powered_by: "Powered by Disruptors Co",
      };
    } else {
      // Legacy structure: use old field mappings for backwards compatibility
      templateData = {
        // Cover page / header info
        grant_name: grantName,
        application_title: (report.applications as any)?.title || grantName,
        report_title: `${grantName} Research Report`,
        generated_date: formatDate(report.created_at),
        version: report.version_number,

        // Legacy content sections
        report_content: content.researchContext || "No report content available.",
        research_context: content.researchContext || "No research context available.",
        
        // Market segments (array for loops)
        market_segments: ensureArray(content.marketSegments).map((seg, idx) => ({
          index: idx + 1,
          name: seg.name,
          description: seg.description,
          size: seg.size || "Size not specified",
        })),
        has_market_segments: ensureArray(content.marketSegments).length > 0,

        // Competitors (array for loops)
        competitors: ensureArray(content.existingCompetitors).map((comp, idx) => ({
          index: idx + 1,
          name: comp.name,
          description: comp.description,
          url: comp.url || "",
        })),
        has_competitors: ensureArray(content.existingCompetitors).length > 0,
        competitor_table: content.competitorTable || "",

        // Market sizing
        tam: content.tam?.value || "N/A",
        tam_description: content.tam?.description || "",
        sam: content.sam?.value || "N/A",
        sam_description: content.sam?.description || "",
        som: content.som?.value || "N/A",
        som_description: content.som?.description || "",

        // Economic impact
        economic_impact: content.economicImpact || "Economic impact analysis not available.",

        // Partners (array for loops)
        partners: ensureArray(content.partners).map((partner, idx) => ({
          index: idx + 1,
          name: partner.name,
          description: partner.description,
          website: partner.website || "",
        })),
        has_partners: ensureArray(content.partners).length > 0,

        // Legacy citations
        sources: (citations.length > 0 ? citations : ensureArray(content.citations)).map((cit, idx) => ({
          index: idx + 1,
          id: `S${idx + 1}`,
          mla: cit.title,
          url: cit.url,
        })),
        has_sources: citations.length > 0 || ensureArray(content.citations).length > 0,

        // Empty arrays for new fields
        tables: [],
        has_tables: false,
        data_gaps: [],
        has_data_gaps: false,

        // Empty sections for legacy reports
        executive_summary: "",
        unmet_need: "",
        commercialisation_pathways: "",
        competitive_landscape: "",
        market_sizing: "",
        australian_partners: "",
        risks_mitigations: "",
        data_gaps_section: "",
        references_section: "",

        // Branding
        powered_by: "Powered by Disruptors Co",
      };
    }

    // Render the document
    doc.render(templateData);

    // Generate output
    const outputBuffer = doc.getZip().generate({
      type: "arraybuffer",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const filename = `${grantName.replace(/[^a-zA-Z0-9]/g, "_")}_Report_v${report.version_number}.docx`;

    return new Response(outputBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error("DOCX generation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate DOCX";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
