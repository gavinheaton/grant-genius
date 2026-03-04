import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface PdfTemplate {
  page_format: string;
  margins_json: { top: number; right: number; bottom: number; left: number };
  logo_path: string | null;
  header_text: string;
  footer_text: string;
  disclaimer_text: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  heading_sizes_json: { h1: number; h2: number; h3: number; body: number };
  include_cover_page: boolean;
  include_toc: boolean;
  section_page_breaks: boolean;
  watermark_text: string;
  show_grant_genius_branding?: boolean;
  powered_by_text?: string;
  cover_layout_json?: {
    logo_position?: string;
    title_text?: string;
    subtitle_template?: string;
    show_date?: boolean;
    show_version?: boolean;
    background_style?: string;
  };
}

interface ReportContent {
  // Legacy fields (fallback)
  researchContext?: string;
  marketSegments?: string | any[];
  competitors?: string | any[];
  existingCompetitors?: string | any[];
  competitorResearch?: string;
  tam?: string | { value?: string };
  sam?: string | { value?: string };
  som?: string | { value?: string };
  economicImpact?: string | { summary?: string };
  partners?: string | any[];
  partnerBusinesses?: string;
  competitorTable?: string;
  citations?: any[];
  // New HTML-first format
  report_html?: string;
  assembledReport?: {
    report_html?: string;
    all_sources?: Array<{ id: string; mla_citation?: string; url?: string }>;
    data_gaps?: string[];
  };
  manual_report_html?: string;
}

/**
 * Detect if HTML already contains a References/Citations/Bibliography section
 */
function hasReferencesInHtml(html: string | undefined): boolean {
  if (!html) return false;
  return /<h[123][^>]*>.*(?:References|Citations|Bibliography).*<\/h[123]>/i.test(html);
}

/**
 * Extract report HTML from content_json
 * Supports multiple formats: direct report_html, assembledReport wrapper, manual reports
 */
function extractReportHtml(content: ReportContent): string | null {
  // Case 1: Direct manual report HTML
  if (content.manual_report_html) {
    return content.manual_report_html;
  }
  
  // Case 2: Direct report_html
  if (content.report_html) {
    return content.report_html;
  }
  
  // Case 3: Wrapped in assembledReport
  if (content.assembledReport?.report_html) {
    return content.assembledReport.report_html;
  }
  
  // Case 4: Check step-based keys (finalize_report_html, etc.)
  const contentRecord = content as Record<string, unknown>;
  const stepKeys = ['finalize_report_html', 'assemble_sections_html', 'build_tables_sources_html'];
  for (const key of stepKeys) {
    if (contentRecord[key]) {
      let stepData = contentRecord[key];
      if (typeof stepData === 'string') {
        try {
          stepData = JSON.parse(stepData);
        } catch {
          continue;
        }
      }
      const stepObj = stepData as Record<string, unknown>;
      if (stepObj.report_html && typeof stepObj.report_html === 'string') {
        return stepObj.report_html;
      }
    }
  }
  
  return null;
}

function getFontStack(fontFamily: string): string {
  const fontStacks: Record<string, string> = {
    "Inter": "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "Roboto": "Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "Open Sans": "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    "Lato": "Lato, -apple-system, BlinkMacSystemFont, sans-serif",
    "Montserrat": "Montserrat, -apple-system, BlinkMacSystemFont, sans-serif",
    "Source Sans Pro": "'Source Sans Pro', -apple-system, sans-serif",
    "Nunito": "Nunito, -apple-system, BlinkMacSystemFont, sans-serif",
    "Merriweather": "Merriweather, Georgia, 'Times New Roman', serif",
    "Playfair Display": "'Playfair Display', Georgia, serif",
  };
  return fontStacks[fontFamily] || `'${fontFamily}', sans-serif`;
}

function buildHtml(
  report: any,
  template: PdfTemplate,
  logoUrl: string | null,
  grantName: string,
  projectTitle: string
): string {
  const content = (report.content_json || {}) as ReportContent;
  const citations = (report.citations_json || []) as any[];
  const createdAt = new Date(report.created_at).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const fontStack = getFontStack(template.font_family);
  
  // Try to extract report_html (new format)
  const reportHtml = extractReportHtml(content);
  const htmlHasReferences = hasReferencesInHtml(reportHtml || "");
  
  // Cover page - use cover_layout_json if available
  const coverLayout = template.cover_layout_json || {};
  const coverTitle = coverLayout.title_text || "Research Commercialisation Report";
  const subtitleTemplate = coverLayout.subtitle_template || "{project_title}";
  const coverSubtitle = subtitleTemplate
    .replace("{project_title}", projectTitle)
    .replace("{grant_name}", grantName)
    .replace("{date}", createdAt)
    .replace("{version}", String(report.version_number));

  const coverPageHtml = template.include_cover_page
    ? `<div class="cover-page">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="cover-logo" />` : ""}
        <h1 class="cover-title">${escapeHtml(coverTitle)}</h1>
        <h2 class="cover-subtitle">${escapeHtml(coverSubtitle)}</h2>
        ${coverLayout.show_date !== false ? `<p class="cover-date">Generated: ${createdAt}</p>` : ""}
        ${coverLayout.show_version !== false ? `<p class="cover-version">Version ${report.version_number}</p>` : ""}
      </div>
      <div class="page-break"></div>`
    : "";

  // Watermark CSS
  const watermarkCss = template.watermark_text
    ? `
      .page-content::before {
        content: "${template.watermark_text}";
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 100px;
        font-weight: bold;
        color: ${template.primary_color};
        opacity: 0.06;
        pointer-events: none;
        z-index: -1;
      }
    `
    : "";

  // If we have report_html, use it directly with template styling
  if (reportHtml) {
    console.log("Using report_html format for PDF generation");
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: ${fontStack};
      font-size: ${template.heading_sizes_json.body}px;
      line-height: 1.6;
      color: #1f2937;
    }
    
    .page-content {
      padding: ${template.margins_json.top}mm ${template.margins_json.right}mm ${template.margins_json.bottom}mm ${template.margins_json.left}mm;
    }
    
    ${watermarkCss}
    
    .page-break {
      page-break-after: always;
    }
    
    /* Cover page */
    .cover-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 40mm;
    }
    
    .cover-logo {
      max-width: 200px;
      max-height: 80px;
      margin-bottom: 40px;
    }
    
    .cover-title {
      font-size: ${template.heading_sizes_json.h1 + 8}px;
      font-weight: 700;
      color: ${template.primary_color};
      margin-bottom: 20px;
    }
    
    .cover-subtitle {
      font-size: ${template.heading_sizes_json.h2}px;
      font-weight: 500;
      color: ${template.secondary_color};
      margin-bottom: 40px;
    }
    
    .cover-date, .cover-version {
      font-size: ${template.heading_sizes_json.body}px;
      color: #6b7280;
    }
    
    /* Report content styling */
    .report-content h1 {
      font-size: ${template.heading_sizes_json.h1}px;
      font-weight: 700;
      color: ${template.primary_color};
      margin: 24px 0 16px 0;
      border-bottom: 2px solid ${template.secondary_color};
      padding-bottom: 8px;
    }
    
    .report-content h2 {
      font-size: ${template.heading_sizes_json.h2}px;
      font-weight: 600;
      color: ${template.primary_color};
      margin: 20px 0 12px 0;
    }
    
    .report-content h3 {
      font-size: ${template.heading_sizes_json.h3}px;
      font-weight: 600;
      color: ${template.secondary_color};
      margin: 16px 0 8px 0;
    }
    
    .report-content p {
      margin-bottom: 12px;
    }
    
    .report-content ul, .report-content ol {
      margin: 12px 0;
      padding-left: 24px;
    }
    
    .report-content li {
      margin-bottom: 4px;
    }
    
    .report-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    
    .report-content th, .report-content td {
      border: 1px solid #d1d5db;
      padding: 8px 12px;
      text-align: left;
    }
    
    .report-content th {
      background-color: ${template.primary_color};
      color: white;
      font-weight: 600;
    }
    
    .report-content tr:nth-child(even) {
      background-color: #f9fafb;
    }
    
    .report-content a {
      color: ${template.secondary_color};
      text-decoration: underline;
    }
    
    .report-content blockquote {
      border-left: 4px solid ${template.secondary_color};
      padding-left: 16px;
      margin: 16px 0;
      color: #4b5563;
      font-style: italic;
    }
    
    /* Page break rules to prevent content splitting */
    table { page-break-inside: avoid; }
    tr { page-break-inside: avoid; }
    blockquote { page-break-inside: avoid; }
    section { page-break-inside: avoid; }
    ul, ol { page-break-inside: avoid; }
    .report-content h1, .report-content h2, .report-content h3 {
      page-break-after: avoid;
    }
    
    /* Footer branding */
    .footer-branding {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #9ca3af;
      font-size: ${template.heading_sizes_json.body - 2}px;
    }
    
    @page {
      size: ${template.page_format};
      margin: ${template.margins_json.top}mm ${template.margins_json.right}mm ${template.margins_json.bottom}mm ${template.margins_json.left}mm;
      
      @top-center {
        content: "${template.header_text}";
        font-size: 10px;
        color: #6b7280;
      }
      
      @bottom-center {
        content: "${template.footer_text.replace("{page}", "counter(page)").replace("{pages}", "counter(pages)")}";
        font-size: 10px;
        color: #6b7280;
      }
    }
  </style>
</head>
<body>
  <div class="page-content">
    ${coverPageHtml}
    <div class="report-content">
      ${reportHtml}
    </div>
    <div class="footer-branding">
      Powered by Grant Genius
    </div>
  </div>
</body>
</html>`;
  }
  
  // Fallback to legacy format - build from individual fields
  console.log("Falling back to legacy format for PDF generation");

  // Build sections array for TOC
  const sections: { title: string; content: string }[] = [];

  // Research Context
  if (content.researchContext) {
    sections.push({
      title: "Research Context",
      content: `<p>${escapeHtml(String(content.researchContext))}</p>`,
    });
  }

  // Market Segments
  const marketData = content.marketSegments;
  if (marketData) {
    let html = "";
    if (Array.isArray(marketData)) {
      html = marketData
        .map(
          (seg: any) =>
            `<div class="segment"><h4>${escapeHtml(seg.name || "Segment")}</h4><p>${escapeHtml(
              seg.description || ""
            )}</p>${seg.size ? `<p><strong>Size:</strong> ${escapeHtml(seg.size)}</p>` : ""}</div>`
        )
        .join("");
    } else {
      html = `<div class="text-block">${formatText(String(marketData))}</div>`;
    }
    sections.push({ title: "Market Segments", content: html });
  }

  // Competitors
  const competitorData =
    content.competitors || content.existingCompetitors || content.competitorResearch;
  if (competitorData) {
    let html = "";
    if (Array.isArray(competitorData)) {
      html = competitorData
        .map(
          (comp: any) =>
            `<div class="competitor"><h4>${escapeHtml(comp.name || "Competitor")}</h4><p>${escapeHtml(
              comp.description || comp.differentiator || ""
            )}</p></div>`
        )
        .join("");
    } else {
      html = `<div class="text-block">${formatText(String(competitorData))}</div>`;
    }
    sections.push({ title: "Competitor Analysis", content: html });
  }

  // TAM/SAM/SOM
  const tam = content.tam;
  const sam = content.sam;
  const som = content.som;
  if (tam || sam || som) {
    let html = '<div class="market-size">';
    if (tam) {
      html += `<div class="size-item"><h4>TAM (Total Addressable Market)</h4><p>${
        typeof tam === "object" ? escapeHtml(tam.value || JSON.stringify(tam)) : formatText(String(tam))
      }</p></div>`;
    }
    if (sam) {
      html += `<div class="size-item"><h4>SAM (Serviceable Addressable Market)</h4><p>${
        typeof sam === "object" ? escapeHtml(sam.value || JSON.stringify(sam)) : formatText(String(sam))
      }</p></div>`;
    }
    if (som) {
      html += `<div class="size-item"><h4>SOM (Serviceable Obtainable Market)</h4><p>${
        typeof som === "object" ? escapeHtml(som.value || JSON.stringify(som)) : formatText(String(som))
      }</p></div>`;
    }
    html += "</div>";
    sections.push({ title: "Market Size Analysis", content: html });
  }

  // Economic Impact
  const ecoImpact = content.economicImpact;
  if (ecoImpact) {
    let html = "";
    if (typeof ecoImpact === "object") {
      html = `<p>${escapeHtml((ecoImpact as any).summary || JSON.stringify(ecoImpact))}</p>`;
    } else {
      html = `<div class="text-block">${formatText(String(ecoImpact))}</div>`;
    }
    sections.push({ title: "Economic Impact", content: html });
  }

  // Partners
  const partnerData = content.partners || content.partnerBusinesses;
  if (partnerData) {
    let html = "";
    if (Array.isArray(partnerData)) {
      html = partnerData
        .map(
          (p: any) =>
            `<div class="partner"><h4>${escapeHtml(p.name || "Partner")}</h4><p>${escapeHtml(
              p.description || p.rationale || ""
            )}</p></div>`
        )
        .join("");
    } else {
      html = `<div class="text-block">${formatText(String(partnerData))}</div>`;
    }
    sections.push({ title: "Potential Partners", content: html });
  }

  // Competitor Table (raw)
  if (content.competitorTable) {
    sections.push({
      title: "Competitor Comparison",
      content: `<div class="text-block">${formatText(String(content.competitorTable))}</div>`,
    });
  }

  // Build TOC HTML
  const tocHtml = template.include_toc
    ? `<div class="toc">
        <h2>Table of Contents</h2>
        <ol>
          ${sections.map((s, i) => `<li><a href="#section-${i}">${escapeHtml(s.title)}</a></li>`).join("")}
          ${citations.length > 0 ? `<li><a href="#references">References</a></li>` : ""}
        </ol>
      </div>
      <div class="page-break"></div>`
    : "";

  // Build sections HTML
  const sectionsHtml = sections
    .map(
      (s, i) =>
        `<section id="section-${i}">
          <h2>${escapeHtml(s.title)}</h2>
          ${s.content}
        </section>
        ${template.section_page_breaks ? '<div class="page-break"></div>' : ""}`
    )
    .join("");

  // Build citations HTML
  const citationsHtml =
    citations.length > 0
      ? `<section id="references" class="references">
          <h2>References</h2>
          <ol>
            ${citations
              .map(
                (c: any) =>
                  `<li>${escapeHtml(c.formatted_citation || c.title || c.url || "Unknown source")}</li>`
              )
              .join("")}
          </ol>
        </section>`
      : "";

  // Build disclaimer HTML
  const disclaimerHtml = template.disclaimer_text
    ? `<div class="page-break"></div>
       <section class="disclaimer">
         <h2>Disclaimer</h2>
         <p>${escapeHtml(template.disclaimer_text)}</p>
       </section>`
    : "";

  // Legacy watermark CSS  
  const legacyWatermarkCss = template.watermark_text
    ? `
      .page-content::before {
        content: "${template.watermark_text}";
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) rotate(-45deg);
        font-size: 100px;
        font-weight: bold;
        color: ${template.primary_color};
        opacity: 0.06;
        pointer-events: none;
        z-index: -1;
      }
    `
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: ${fontStack};
      font-size: ${template.heading_sizes_json.body}px;
      line-height: 1.6;
      color: #1f2937;
    }
    
    .page-content {
      padding: ${template.margins_json.top}mm ${template.margins_json.right}mm ${template.margins_json.bottom}mm ${template.margins_json.left}mm;
    }
    
    ${legacyWatermarkCss}
    
    .page-break {
      page-break-after: always;
    }
    
    /* Cover page */
    .cover-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 40mm;
    }
    
    .cover-logo {
      max-width: 200px;
      max-height: 80px;
      margin-bottom: 40px;
    }
    
    .cover-title {
      font-size: ${template.heading_sizes_json.h1 + 8}px;
      font-weight: 700;
      color: ${template.primary_color};
      margin-bottom: 20px;
    }
    
    .cover-subtitle {
      font-size: ${template.heading_sizes_json.h2}px;
      font-weight: 500;
      color: ${template.secondary_color};
      margin-bottom: 40px;
    }
    
    .cover-date, .cover-version {
      font-size: ${template.heading_sizes_json.body}px;
      color: #6b7280;
    }
    
    /* TOC */
    .toc {
      margin-bottom: 30px;
    }
    
    .toc h2 {
      font-size: ${template.heading_sizes_json.h1}px;
      color: ${template.primary_color};
      margin-bottom: 20px;
      border-bottom: 2px solid ${template.primary_color};
      padding-bottom: 10px;
    }
    
    .toc ol {
      list-style-position: inside;
      padding-left: 20px;
    }
    
    .toc li {
      margin-bottom: 8px;
      font-size: ${template.heading_sizes_json.body + 2}px;
    }
    
    .toc a {
      color: ${template.primary_color};
      text-decoration: none;
    }
    
    /* Sections */
    section {
      margin-bottom: 30px;
    }
    
    h1 {
      font-size: ${template.heading_sizes_json.h1}px;
      font-weight: 700;
      color: ${template.primary_color};
      margin-bottom: 16px;
    }
    
    h2 {
      font-size: ${template.heading_sizes_json.h2}px;
      font-weight: 600;
      color: ${template.primary_color};
      margin-bottom: 16px;
      border-bottom: 2px solid ${template.secondary_color};
      padding-bottom: 8px;
    }
    
    h3 {
      font-size: ${template.heading_sizes_json.h3}px;
      font-weight: 600;
      color: ${template.secondary_color};
      margin-bottom: 12px;
    }
    
    h4 {
      font-size: ${template.heading_sizes_json.h3 - 2}px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    
    p {
      margin-bottom: 12px;
    }
    
    .text-block {
      white-space: pre-wrap;
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid ${template.primary_color};
    }
    
    .segment, .competitor, .partner {
      background: #f9fafb;
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 12px;
      border-left: 4px solid ${template.secondary_color};
    }
    
    .market-size {
      display: grid;
      gap: 16px;
    }
    
    .size-item {
      background: linear-gradient(135deg, ${template.primary_color}10, ${template.secondary_color}10);
      padding: 20px;
      border-radius: 8px;
      border: 1px solid ${template.primary_color}30;
    }
    
    .size-item h4 {
      color: ${template.primary_color};
    }
    
    /* References */
    .references ol {
      padding-left: 20px;
    }
    
    .references li {
      margin-bottom: 8px;
      font-size: ${template.heading_sizes_json.body - 1}px;
    }
    
    /* Disclaimer */
    .disclaimer {
      background: #fef3c7;
      padding: 20px;
      border-radius: 8px;
      border: 1px solid #f59e0b;
    }
    
    .disclaimer h2 {
      color: #92400e;
      border-bottom-color: #f59e0b;
    }
    
    .disclaimer p {
      color: #78350f;
      font-size: ${template.heading_sizes_json.body - 1}px;
    }
    
    /* Header/Footer */
    @page {
      size: ${template.page_format};
      margin: ${template.margins_json.top}mm ${template.margins_json.right}mm ${template.margins_json.bottom}mm ${template.margins_json.left}mm;
      
      @top-center {
        content: "${template.header_text}";
        font-size: 10px;
        color: #6b7280;
      }
      
      @bottom-center {
        content: "${template.footer_text.replace("{page}", "counter(page)").replace("{pages}", "counter(pages)")}";
        font-size: 10px;
        color: #6b7280;
      }
    }
  </style>
</head>
<body>
  <div class="page-content">
    ${coverPageHtml}
    ${tocHtml}
    ${sectionsHtml}
    ${citationsHtml}
    ${disclaimerHtml}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatText(text: string): string {
  return escapeHtml(text)
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const { reportId } = await req.json();
    if (!reportId) {
      return new Response(JSON.stringify({ error: "reportId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch report with grant info
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select(`
        *,
        applications!inner(title),
        grant_versions!inner(
          grants!inner(name)
        )
      `)
      .eq("id", reportId)
      .single();

    if (reportError || !report) {
      console.error("Report fetch error:", reportError);
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const grantName = (report.grant_versions as any)?.grants?.name || "Grant Report";
    const projectTitle = (report.applications as any)?.title || grantName;

    // Fetch default template
    const { data: template, error: templateError } = await supabase
      .from("pdf_templates")
      .select("*")
      .eq("is_default", true)
      .single();

    if (templateError || !template) {
      console.error("Template fetch error:", templateError);
      return new Response(JSON.stringify({ error: "PDF template not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get logo URL if exists
    let logoUrl: string | null = null;
    if (template.logo_path) {
      const { data: urlData } = supabase.storage
        .from("pdf-assets")
        .getPublicUrl(template.logo_path);
      logoUrl = urlData.publicUrl;
    }

    // Build HTML
    const htmlContent = buildHtml(report, template as PdfTemplate, logoUrl, grantName, projectTitle);

    // Call PDFShift API
    const PDFSHIFT_API_KEY = Deno.env.get("PDFSHIFT_API_KEY");
    if (!PDFSHIFT_API_KEY) {
      return new Response(
        JSON.stringify({ error: "PDF generation service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Static render mode: disable network waiting and JS for fast, reliable conversion
    const pdfResponse = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa("api:" + PDFSHIFT_API_KEY)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: htmlContent,
        landscape: false,
        format: template.page_format,
        use_print: true,
        wait_for_network: false,      // Don't wait for network idle (static HTML)
        disable_javascript: true,     // No JS needed, prevents hanging connections
        ignore_long_polling: true,    // Ignore any long-poll requests
        timeout: 20,                  // Hard stop page loading after 20s
      }),
    });

    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      // Enhanced logging for debugging
      console.error("PDFShift error:", errorText);
      console.error("Debug context:", JSON.stringify({
        htmlByteLength: htmlContent.length,
        hasLogo: !!logoUrl,
        includeCover: template.include_cover_page,
        includeToc: template.include_toc,
        format: template.page_format,
      }));
      return new Response(
        JSON.stringify({ 
          error: "PDF generation failed", 
          provider: "pdfshift",
          providerStatus: pdfResponse.status,
        }), 
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Upload to storage
    const fileName = `${userId}/${reportId}-v${report.version_number}.pdf`;
    
    // Use service role for storage upload
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: uploadError } = await serviceClient.storage
      .from("reports")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to save PDF" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update report record with pdf_path
    await serviceClient
      .from("reports")
      .update({ pdf_path: fileName })
      .eq("id", reportId);

    // Generate signed URL for download (1 hour expiry)
    const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
      .from("reports")
      .createSignedUrl(fileName, 3600);

    if (signedUrlError) {
      console.error("Signed URL error:", signedUrlError);
      return new Response(JSON.stringify({ error: "Failed to create download URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        downloadUrl: signedUrlData.signedUrl,
        fileName: `Report-v${report.version_number}.pdf`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
