import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import PizZip from "https://esm.sh/pizzip@3.1.7";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ReportContent {
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

function formatMarketSize(market: { value: string; description: string } | undefined): string {
  if (!market) return "Not available";
  return `${market.value}\n${market.description}`;
}

function ensureArray<T>(data: T[] | undefined): T[] {
  return Array.isArray(data) ? data : [];
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

    const todayFormatted = formatDate(new Date().toISOString());

    // Build template data
    const templateData = {
      // Cover page / header info
      grant_name: grantName,
      application_title: (report.applications as any)?.title || grantName,
      generated_date: formatDate(report.created_at),
      version: report.version_number,

      // Main content sections
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
      tam: content.tam ? formatMarketSize(content.tam) : "Not available",
      tam_value: content.tam?.value || "N/A",
      tam_description: content.tam?.description || "",
      
      sam: content.sam ? formatMarketSize(content.sam) : "Not available",
      sam_value: content.sam?.value || "N/A",
      sam_description: content.sam?.description || "",
      
      som: content.som ? formatMarketSize(content.som) : "Not available",
      som_value: content.som?.value || "N/A",
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

      // Citations (array for loops)
      citations: (citations.length > 0 ? citations : ensureArray(content.citations)).map((cit, idx) => ({
        index: idx + 1,
        title: cit.title,
        url: cit.url,
        accessed: cit.accessed || todayFormatted,
      })),
      has_citations: citations.length > 0 || ensureArray(content.citations).length > 0,

      // Branding
      powered_by: "Powered by Disruptors Co",
    };

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
