import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// GRANT ARCHETYPE DEFINITIONS
// ============================================================================

const GRANT_ARCHETYPES = [
  "Commercialisation/Innovation",
  "R&D/Research",
  "Infrastructure/Capability",
  "Social Impact/Community",
  "Export/Trade",
  "Climate/Environment",
  "Health/Clinical Translation",
  "Defence/Sovereign Capability",
  "Arts/Culture",
  "Education/Workforce"
] as const;

type GrantArchetype = typeof GRANT_ARCHETYPES[number];

const ARCHETYPE_KEYWORDS: Record<GrantArchetype, string[]> = {
  "Commercialisation/Innovation": ["commercialis", "market", "IP", "startup", "innovation", "scale-up", "venture", "product"],
  "R&D/Research": ["research", "scientific", "discovery", "PhD", "experiment", "prototype", "TRL", "proof of concept"],
  "Infrastructure/Capability": ["equipment", "facility", "capacity", "infrastructure", "capital", "upgrade", "modernise"],
  "Social Impact/Community": ["community", "social", "welfare", "inclusion", "indigenous", "disadvantaged", "nonprofit"],
  "Export/Trade": ["export", "international", "market entry", "trade", "global", "overseas"],
  "Climate/Environment": ["emissions", "sustainability", "net-zero", "climate", "environment", "renewable", "circular"],
  "Health/Clinical Translation": ["clinical", "health", "TGA", "FDA", "therapeutic", "medical", "patient", "hospital"],
  "Defence/Sovereign Capability": ["defence", "sovereign", "security", "military", "strategic", "supply chain resilience"],
  "Arts/Culture": ["arts", "cultural", "creative", "heritage", "museum", "performance", "festival"],
  "Education/Workforce": ["training", "skills", "workforce", "apprentice", "curriculum", "employment", "VET"]
};

// ============================================================================
// WRITER STANCE CONTRACT (injected into all prompts)
// ============================================================================

const WRITER_STANCE_PREAMBLE = `
=== WRITER STANCE CONTRACT ===
You are a Professional grant writer with 10+ years Australian government funding experience.
Your audience: Expert grant assessors evaluating applications against published criteria.

TONE RULES:
1. No hype or unsubstantiated superlatives—use qualified, evidence-based language
2. Assumptions must be labeled with confidence level: (High confidence), (Medium confidence), (Low confidence)
3. If a claim is not supported by an allowed source_id, output: 'Unknown (no validated source found)'
4. Always address additionality: why funding is needed and what would not happen without it
5. Always articulate jurisdiction benefit: Australian jobs, exports, sovereign capability, or other national interests

EVIDENCE RULES:
1. All numeric claims MUST have a corresponding source_id
2. Preserve source IDs exactly as provided—never renumber or modify them
3. No placeholders like 'Source1', '[insert]', '{TBD}' or 'article' are permitted
4. Every source_id used must exist in the consolidated sources list
5. When specific data is unavailable, provide proxy estimates with methodology shown

OUTPUT CONSTRAINTS:
1. Return ONLY valid JSON—no markdown code fences, no prose outside JSON
2. First character must be {, last character must be }
3. Do NOT include \`\`\` anywhere in output
4. All field names must match the specified OUTPUT SCHEMA exactly
=== END WRITER STANCE CONTRACT ===
`;

// ============================================================================
// ARCHETYPE CLASSIFIER
// ============================================================================

function classifyGrantArchetype(
  grantSummary: string,
  rubricSections: { title: string; description?: string }[]
): { archetype: GrantArchetype; confidence: "high" | "medium" | "low" } {
  const textToAnalyze = [
    grantSummary,
    ...rubricSections.map(s => `${s.title} ${s.description || ""}`)
  ].join(" ").toLowerCase();

  let bestMatch: GrantArchetype = "Commercialisation/Innovation";
  let bestScore = 0;

  for (const [archetype, keywords] of Object.entries(ARCHETYPE_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (textToAnalyze.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = archetype as GrantArchetype;
    }
  }

  const confidence = bestScore >= 4 ? "high" : bestScore >= 2 ? "medium" : "low";
  return { archetype: bestMatch, confidence };
}

// ============================================================================
// MODULE LIBRARY (archetype-specific research modules)
// ============================================================================

interface ModuleDefinition {
  module_name: string;
  when_to_include: GrantArchetype[];
  always_include: boolean;
  role_name: string;
  role_goal: string;
  phase: string;
  model_tier: "lite" | "balanced" | "pro";
}

const MODULE_LIBRARY: ModuleDefinition[] = [
  // Universal modules (all archetypes)
  {
    module_name: "evidence_source_pack",
    when_to_include: [...GRANT_ARCHETYPES],
    always_include: true,
    role_name: "build_source_pack",
    role_goal: "Curate 12-25 high-quality sources relevant to the research domain",
    phase: "intake",
    model_tier: "balanced"
  },
  {
    module_name: "economic_impact",
    when_to_include: [...GRANT_ARCHETYPES],
    always_include: true,
    role_name: "calculate_economic_impact",
    role_goal: "Calculate Australian economic impact estimates with methodology transparency",
    phase: "research",
    model_tier: "balanced"
  },
  {
    module_name: "stakeholder_mapping",
    when_to_include: [...GRANT_ARCHETYPES],
    always_include: true,
    role_name: "map_stakeholders",
    role_goal: "Identify and categorize key stakeholders in the research ecosystem",
    phase: "research",
    model_tier: "balanced"
  },
  // Commercialisation/Innovation modules
  {
    module_name: "market_sizing",
    when_to_include: ["Commercialisation/Innovation", "Export/Trade", "Health/Clinical Translation"],
    always_include: false,
    role_name: "calculate_market_sizing",
    role_goal: "Calculate TAM/SAM/SOM with transparent methodology and Australian focus",
    phase: "research",
    model_tier: "balanced"
  },
  {
    module_name: "competitor_analysis",
    when_to_include: ["Commercialisation/Innovation", "R&D/Research", "Health/Clinical Translation"],
    always_include: false,
    role_name: "analyze_competitors",
    role_goal: "Map competitive landscape with validated URLs and clear differentiation",
    phase: "research",
    model_tier: "balanced"
  },
  {
    module_name: "ip_regulatory_strategy",
    when_to_include: ["Commercialisation/Innovation", "Health/Clinical Translation", "Defence/Sovereign Capability"],
    always_include: false,
    role_name: "analyze_ip_regulatory",
    role_goal: "Assess IP landscape and regulatory pathway requirements",
    phase: "research",
    model_tier: "pro"
  },
  // R&D/Research modules
  {
    module_name: "technical_feasibility",
    when_to_include: ["R&D/Research", "Infrastructure/Capability", "Defence/Sovereign Capability"],
    always_include: false,
    role_name: "assess_technical_feasibility",
    role_goal: "Evaluate technical readiness and identify risks with mitigations",
    phase: "research",
    model_tier: "balanced"
  },
  // Climate/Environment modules
  {
    module_name: "emissions_impact",
    when_to_include: ["Climate/Environment"],
    always_include: false,
    role_name: "calculate_emissions_impact",
    role_goal: "Calculate emissions baseline and abatement potential",
    phase: "research",
    model_tier: "balanced"
  }
];

function selectModulesForArchetype(archetype: GrantArchetype): ModuleDefinition[] {
  return MODULE_LIBRARY.filter(
    module => module.always_include || module.when_to_include.includes(archetype)
  );
}

// ============================================================================
// QUALITY SCORING
// ============================================================================

function calculateQualityScore(prompt: string): { total: number; level: 'good' | 'warning' | 'poor' } {
  if (!prompt || typeof prompt !== 'string') {
    return { total: 0, level: 'poor' };
  }

  const scores = {
    contextHeader: /STEP\s*\d|INPUTS?:/i.test(prompt) ? 15 : 0,
    hardRules: /HARD RULES|CRITICAL RULES|REQUIREMENTS|RULES:/i.test(prompt) ? 20 : 0,
    outputSchema: /OUTPUT.*JSON|JSON.*SCHEMA|OUTPUT.*SCHEMA|Return.*JSON/is.test(prompt) ? 20 : 0,
    urlValidation: /URL.*valid|valid.*URL|URL.*require|source.*URL/i.test(prompt) ? 15 : 0,
    unknownHandling: /unknown.*handling|if.*not.*found|unknowns.*array|Not disclosed|proxy.*estimate/i.test(prompt) ? 15 : 0,
    placeholderProhibition: /\[.*\].*forbidden|placeholder.*prohibit|NEVER.*\[|Do NOT.*\[|bracket.*forbidden/i.test(prompt) ? 10 : 0,
    adequateLength: prompt.length >= 1000 ? 5 : Math.round((prompt.length / 1000) * 5 * 10) / 10,
  };

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const level = total >= 70 ? 'good' : total >= 40 ? 'warning' : 'poor';
  return { total: Math.round(total), level };
}

// ============================================================================
// PROMPT QUALITY TEMPLATE (for auto-enhancement)
// ============================================================================

const PROMPT_QUALITY_TEMPLATE = `
MANDATORY PROMPT STRUCTURE (every research step MUST include ALL of these):

1. CONTEXT HEADER - State the step purpose and inputs clearly
   Example: "STEP N — [Purpose]. INPUTS: {{summary}}, {{step0}}"

2. HARD RULES SECTION - Include 5+ explicit constraints like:
   - "Do NOT invent facts or numbers"
   - "Only include sources you can validate as real"
   - "If specific data unavailable, use proxy calculations with shown methodology"
   - "NEVER use placeholder tokens like [Company] or {value} - use actual values or 'Not disclosed'"
   - "Prefer Australian authoritative sources (.gov.au, .edu.au)"

3. OUTPUT SCHEMA - Define exact JSON structure with:
   - Every field name with its type
   - Constraints (required, max_length, etc.)
   - Example values

4. URL VALIDATION RULES (for steps requiring sources):
   - "Every source MUST have a valid URL or explicit 'URL not available'"
   - "Prefer government, academic, or industry body sources"
   - "If URL cannot be verified, mark confidence as 'low'"

5. UNKNOWN HANDLING PROTOCOL:
   - "If data unavailable, provide conservative proxy estimate with calculation shown"
   - "Include 'unknowns' array listing what couldn't be found"
   - "Use descriptive text like 'Not publicly disclosed' instead of 'Unknown'"

MINIMUM PROMPT LENGTH: Each research step prompt MUST be at least 1,500 characters.
`;

const PROMPT_REFERENCE_EXAMPLE = `
REFERENCE EXAMPLE (follow this exact structure for all research prompts):

STEP 0 — Build Source Pack (Australia-first, domain-agnostic)

You are a grant-commercialisation analyst. Your task is to curate a Source Pack of 12–25 high-quality sources relevant to the research domain described by the user.

INPUTS:
- {{summary}}: The user's 100-word research summary
- {{grantGuidelines}}: Assessment criteria for this grant

HARD RULES:
- Do NOT invent facts or numbers.
- Only include sources you can validate as real and relevant.
- Prefer Australian authoritative sources first when applicable.
- If you cannot find a source type, record it as an Unknown in the unknowns array.
- NEVER use placeholder text like "[Source Title]" or "{URL}" - use actual content or 'Not available'.

SOURCE PACK REQUIREMENTS:
Return 12–25 sources total (max 25). Include, where relevant:
A) Australia-first authoritative sources: ABS, data.gov.au, AIHW, Productivity Commission, NHMRC, CSIRO
B) Sector/standards/peak bodies relevant to the research domain
C) Academic publications, market reports, industry statistics
D) Policy documents and regulatory guidance

FOR EACH SOURCE, provide:
- source_id: Sequential ID like "S0-1", "S0-2"
- title: Actual title of the source (no placeholders)
- publisher: Organization that published it
- url: Valid URL or "URL not available"
- date_accessed: Today's date or "Not accessible"
- relevance: One sentence on why this source matters
- confidence: "high" (verified URL), "medium" (known publisher), "low" (unverified)

OUTPUT JSON SCHEMA:
{
  "sources": [
    {
      "source_id": "S0-1",
      "title": "Cancer in Australia 2023 Report",
      "publisher": "Australian Institute of Health and Welfare",
      "url": "https://www.aihw.gov.au/reports/cancer/cancer-in-australia-2023",
      "date_accessed": "2025-02-01",
      "relevance": "Provides national cancer incidence and survival statistics",
      "confidence": "high"
    }
  ],
  "unknowns": [
    "No accessible market sizing reports specific to this niche technology"
  ]
}
`;

// ============================================================================
// OUTPUT SCHEMA SANITIZATION
// ============================================================================

function sanitizeOutputSchemas(prompt: string): string {
  if (!prompt) return prompt;
  
  // Pattern 1: full schema blocks
  const schemaPatterns = [
    /(OUTPUT\s*JSON\s*SCHEMA|OUTPUT\s*SCHEMA|JSON\s*SCHEMA)[:\s]*(\{[\s\S]*?\n\})/gi,
  ];
  
  let sanitized = prompt;
  
  const schemaBlockMatch = sanitized.match(schemaPatterns[0]);
  if (schemaBlockMatch) {
    for (const match of schemaBlockMatch) {
      const cleaned = match.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
        const readable = varName
          .replace(/([A-Z])/g, ' $1')
          .toLowerCase()
          .trim();
        return `the ${readable} value`;
      });
      sanitized = sanitized.replace(match, cleaned);
    }
  }
  
  // Pattern 2: individual field descriptions with template vars
  sanitized = sanitized.replace(
    /("[\w_]+"\s*:\s*")(string|number|boolean|array|object)?\s*\(([^"]*)\{\{(\w+)\}\}([^"]*)\)(")/gi,
    (match, prefix, type, before, varName, after, suffix) => {
      const readable = varName
        .replace(/([A-Z])/g, ' $1')
        .toLowerCase()
        .trim();
      return `${prefix}${type || ''} (${before}the ${readable} value${after})${suffix}`;
    }
  );
  
  return sanitized;
}

// ============================================================================
// FIRECRAWL DATA GATHERING STEPS
// ============================================================================

function createDataGatheringSteps(researchDomain: string, archetype: GrantArchetype) {
  const baseSteps = [
    {
      step_number: 0,
      step_name: "scrape_article",
      step_description: "Scrape the user's research article URL to extract content",
      step_type: "firecrawl_scrape",
      step_config_json: {
        url_variable: "publicArticleUrl",
        formats: ["markdown"],
        onlyMainContent: true
      },
      prompt_template: "FIRECRAWL_SCRAPE: This step scrapes the user-provided article URL ({{publicArticleUrl}}) and extracts markdown content for subsequent analysis.",
      model_tier: null,
      phase: "intake"
    },
    {
      step_number: 1,
      step_name: "search_market_data",
      step_description: "Search for market sizing and industry data relevant to the research domain",
      step_type: "firecrawl_search",
      step_config_json: {
        query_template: `${researchDomain} market size Australia 2024 site:abs.gov.au OR site:ibisworld.com OR site:statista.com`,
        limit: 8,
        scrape_results: true
      },
      prompt_template: "FIRECRAWL_SEARCH: This step searches for market sizing data using query based on the research domain. Results are stored with source IDs for citation.",
      model_tier: null,
      phase: "intake"
    },
    {
      step_number: 2,
      step_name: "search_competitors",
      step_description: "Search for competitors and companies in the research domain",
      step_type: "firecrawl_search",
      step_config_json: {
        query_template: `${researchDomain} companies startups Australia competitors`,
        limit: 8,
        scrape_results: true
      },
      prompt_template: "FIRECRAWL_SEARCH: This step searches for competitors in the research domain. Results include company names, URLs, and scraped content.",
      model_tier: null,
      phase: "intake"
    },
    {
      step_number: 3,
      step_name: "search_policy_funding",
      step_description: "Search for government policy and funding information",
      step_type: "firecrawl_search",
      step_config_json: {
        query_template: `${researchDomain} government funding policy Australia site:gov.au`,
        limit: 5,
        scrape_results: false
      },
      prompt_template: "FIRECRAWL_SEARCH: This step searches for policy and funding information from government sources.",
      model_tier: null,
      phase: "intake"
    }
  ];

  // Add archetype-specific searches
  if (archetype === "Health/Clinical Translation") {
    baseSteps.push({
      step_number: 4,
      step_name: "search_tga_regulatory",
      step_description: "Search for TGA regulatory pathway information",
      step_type: "firecrawl_search",
      step_config_json: {
        query_template: `${researchDomain} TGA regulation approval pathway site:tga.gov.au`,
        limit: 5,
        scrape_results: false
      },
      prompt_template: "FIRECRAWL_SEARCH: This step searches for TGA regulatory pathway information.",
      model_tier: null,
      phase: "intake"
    });
  }

  if (archetype === "Climate/Environment") {
    baseSteps.push({
      step_number: 4,
      step_name: "search_emissions_data",
      step_description: "Search for emissions and sustainability data",
      step_type: "firecrawl_search",
      step_config_json: {
        query_template: `${researchDomain} emissions carbon footprint Australia site:cleanenergyregulator.gov.au OR site:dcceew.gov.au`,
        limit: 5,
        scrape_results: false
      },
      prompt_template: "FIRECRAWL_SEARCH: This step searches for emissions and sustainability data.",
      model_tier: null,
      phase: "intake"
    });
  }

  if (archetype === "Defence/Sovereign Capability") {
    baseSteps.push({
      step_number: 4,
      step_name: "search_defence_policy",
      step_description: "Search for defence industry and sovereign capability policy",
      step_type: "firecrawl_search",
      step_config_json: {
        query_template: `${researchDomain} defence industry sovereign capability Australia site:defence.gov.au OR site:business.gov.au`,
        limit: 5,
        scrape_results: false
      },
      prompt_template: "FIRECRAWL_SEARCH: This step searches for defence and sovereign capability policy information.",
      model_tier: null,
      phase: "intake"
    });
  }

  return baseSteps;
}

// ============================================================================
// QA GATES STEP
// ============================================================================

function createQAGatesStep(maxResearchStep: number, rubricSections: { key: string; title: string }[]) {
  const stepRefs = Array.from({ length: maxResearchStep + 1 }, (_, i) => `{{step${i}}}`).join(", ");
  const criteriaList = rubricSections.map(s => `- ${s.key}: ${s.title}`).join("\n");

  return {
    step_name: "qa_gates_validation",
    step_description: "Validate report quality across citation integrity, criteria coverage, and assessor readiness",
    model_tier: "balanced",
    phase: "qa",
    prompt_template: `STEP ${maxResearchStep + 1} — QA Gates Validation

${WRITER_STANCE_PREAMBLE}

INPUTS (from previous steps):
- All prior step outputs: ${stepRefs}

PURPOSE:
Perform three mandatory quality gates before final report assembly. This step does NOT modify content—it validates and flags issues.

=== GATE 1: CITATION INTEGRITY ===
Check ALL source_ids referenced in prior steps:
□ Every source_id (e.g., S0-1, S0-2) exists in a sources array
□ No malformed source_ids (no "Source1", "[insert]", "{TBD}")
□ No orphan citations (referenced but never defined)
□ No duplicate source_ids with conflicting data
□ URLs are valid format or explicitly marked "URL not available"

=== GATE 2: CRITERIA COVERAGE ===
Check coverage against the grant's evaluation criteria:
${criteriaList || "- No specific criteria provided (use general assessment)"}

For each criterion:
□ Is it explicitly addressed in the research outputs?
□ If not addressed, flag as a gap
□ If partially addressed, note what's missing

=== GATE 3: ASSESSOR READINESS ===
Evaluate from an assessor's perspective:
□ NARRATIVE SPINE: Is there a clear problem → solution → impact flow?
□ ADDITIONALITY: Is "why funding is needed" clearly stated?
□ JURISDICTION BENEFIT: Are Australian benefits (jobs, exports, sovereignty) quantified?
□ RISKS: Are key risks identified with mitigation strategies?
□ EVIDENCE QUALITY: Are claims supported by credible sources?
□ UNKNOWN HANDLING: Are unknowns explicitly marked (not hidden or invented)?

HARD RULES:
1. Do NOT fix issues—only identify and report them
2. Be specific: cite exact source_ids, step numbers, and field names
3. Mark issues as "blocking" (must fix) or "advisory" (should fix)
4. Calculate overall quality_score (0-100) based on percentage of checks passed

OUTPUT JSON SCHEMA:
{
  "citation_integrity": {
    "gate_name": "Citation Integrity",
    "passed": true,
    "issues": ["Missing source S0-5 referenced in step3.market_sizing"],
    "recommendations": ["Add source S0-5 to sources array or remove citation"]
  },
  "criteria_coverage": {
    "gate_name": "Criteria Coverage", 
    "passed": true,
    "issues": ["Criterion 'technical_feasibility' not addressed"],
    "recommendations": ["Add technical feasibility assessment based on TRL data"]
  },
  "assessor_readiness": {
    "gate_name": "Assessor Readiness",
    "passed": true,
    "issues": ["Additionality statement missing from economic impact"],
    "recommendations": ["Add explicit statement on what would NOT happen without funding"]
  },
  "overall_pass": true,
  "blocking_issues": ["List of issues that MUST be fixed before report can be finalized"],
  "quality_score": 85
}`
  };
}

// ============================================================================
// HTML ASSEMBLY STEPS
// ============================================================================

function createHtmlAssemblySteps(maxAIStep: number) {
  const stepRefs = Array.from({ length: maxAIStep + 1 }, (_, i) => `{{step${i}}}`).join(", ");
  
  return [
    {
      step_name: "assemble_sections_html",
      step_description: "Generate report sections as clean HTML narrative from evidence gathering steps",
      model_tier: "balanced",
      phase: "assembly",
      prompt_template: `STEP ${maxAIStep + 1} — Assemble Sections as HTML

${WRITER_STANCE_PREAMBLE}

INPUTS (from previous steps):
- All prior step outputs: ${stepRefs}
- Grant: {{grantName}} ({{grantVersionLabel}})

PURPOSE:
Transform the research findings from steps 0-${maxAIStep} into a cohesive HTML narrative report.

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON with a single top-level object
2. Do NOT include code fences (no \`\`\` anywhere in your response)
3. The first character of your response must be { and the last must be }
4. Include a "sections_html" field containing semantic HTML

REQUIRED SECTIONS:
1. Executive Summary - Key findings and recommendations
2. Research Context and Innovation - What the technology/research is
3. Unmet Need and Australian Relevance - Problem being solved
4. Commercialisation Pathways - Routes to market
5. Competitive Landscape - Key competitors and differentiation
6. Market Sizing (TAM/SAM/SOM) - Market opportunity with calculations
7. IP and Regulatory Pathway - Protection and compliance considerations
8. Economic Impact - Jobs, exports, GDP contribution estimates
9. Stakeholders and Partners - Key ecosystem players
10. Data Gaps and Validation Needs - What requires further investigation

HTML FORMATTING RULES:
- Use <h2> for main section headings
- Use <h3> for subsections
- Use <p> for paragraphs with proper spacing
- Use <ul><li> for bullet lists
- Use <strong> for emphasis
- Include citation markers as superscript: <sup>[S0-1]</sup>, <sup>[S3-2]</sup> etc.
- Insert table anchors: <!-- TABLE:competitors -->, <!-- TABLE:market_sizing -->, <!-- TABLE:partners -->
- Do NOT use markdown syntax inside HTML

OUTPUT JSON SCHEMA:
{
  "sections_html": "<h2>Executive Summary</h2><p>...</p><h2>Research Context</h2>...",
  "data_gaps": ["gap1", "gap2", ...]
}`
    },
    {
      step_name: "build_tables_sources_html",
      step_description: "Build HTML tables and deduplicated source list from research steps",
      model_tier: "balanced",
      phase: "assembly",
      prompt_template: `STEP ${maxAIStep + 2} — Build Tables and Sources (HTML)

${WRITER_STANCE_PREAMBLE}

Using the research data from previous steps (${stepRefs}), compile:

1. COMPARISON TABLES - Create HTML tables for:
   - Competitor comparison (features, pricing, market position)
   - TAM/SAM/SOM summary with calculations
   - Partner capability matrix
   - Any other tabular data from research

2. SOURCE CONSOLIDATION - Compile ALL citations from all steps into a single deduplicated list

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON - no code fences, no markdown
2. First character must be {, last must be }
3. Tables must be valid HTML <table> elements

OUTPUT JSON SCHEMA:
{
  "tables": {
    "competitors": "<table class=\\"data-table\\"><thead><tr><th>Company</th><th>Product</th><th>Differentiator</th></tr></thead><tbody>...</tbody></table>",
    "market_sizing": "<table class=\\"data-table\\"><thead><tr><th>Segment</th><th>Value</th><th>Source</th></tr></thead><tbody>...</tbody></table>",
    "partners": "<table class=\\"data-table\\"><thead><tr><th>Partner</th><th>Type</th><th>Capability</th></tr></thead><tbody>...</tbody></table>"
  },
  "all_sources": [
    {"id": "S0-1", "mla_citation": "Author. Title. Publication, Date. URL.", "url": "https://..."},
    {"id": "S1-1", "mla_citation": "...", "url": "..."}
  ]
}`
    },
    {
      step_name: "finalize_report_html",
      step_description: "Merge sections, tables, and sources into final report_html output",
      model_tier: "balanced",
      phase: "render",
      prompt_template: `STEP ${maxAIStep + 3} — Finalize Report (HTML)

${WRITER_STANCE_PREAMBLE}

You are merging the research narrative with data tables to produce the final report.

INPUT DATA FORMAT:
You will receive two JSON objects from previous steps:

Step ${maxAIStep + 1} data ({{step${maxAIStep + 1}}}):
- "sections_html": string - The complete narrative HTML document
- "data_gaps": array - List of data gaps identified

Step ${maxAIStep + 2} data ({{step${maxAIStep + 2}}}):
- "tables": object with keys "competitors", "market_sizing", "partners" - HTML tables
- "all_sources": array - All citations

YOUR TASK:
1. PARSE the JSON objects to extract the values
2. Get the "sections_html" value from Step ${maxAIStep + 1} - this is your base HTML
3. Find these table anchors in the HTML and replace with tables from Step ${maxAIStep + 2}:
   - Replace "<!-- TABLE:competitors -->" with tables.competitors
   - Replace "<!-- TABLE:market_sizing -->" with tables.market_sizing
   - Replace "<!-- TABLE:partners -->" with tables.partners
4. Append a References section at the end:
   <h2>References</h2>
   <div class="sources"><ul>...formatted citations...</ul></div>
5. Combine data_gaps from both steps

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - NO code fences (\`\`\`json or \`\`\`)
2. First character must be { and last must be }
3. The "report_html" field MUST contain the complete merged HTML document
4. Do NOT return the raw JSON objects - extract and combine the content

OUTPUT JSON SCHEMA:
{
  "title": "Grant Report: [Project Title]",
  "report_html": "<h2>Executive Summary</h2>...[full merged HTML with tables inserted]...<h2>References</h2>...",
  "all_sources": [{"id": "S0-1", "mla_citation": "...", "url": "..."}],
  "data_gaps": ["gap1", "gap2"],
  "tables": {"competitors": "...", "market_sizing": "...", "partners": "..."}
}`
    }
  ];
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
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

    // Verify user is admin
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin"])
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { grant_version_id, guidelines_text } = await req.json();

    if (!grant_version_id || !guidelines_text) {
      return new Response(
        JSON.stringify({ error: "grant_version_id and guidelines_text are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use service role for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Fetch grant info
    const { data: grantVersion, error: grantError } = await supabaseAdmin
      .from("grant_versions")
      .select(`
        id,
        version_number,
        grant_id,
        grant:grants (
          id,
          name,
          description
        )
      `)
      .eq("id", grant_version_id)
      .single();

    if (grantError || !grantVersion) {
      return new Response(
        JSON.stringify({ error: "Grant version not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atomic claim - only proceeds if status is 'pending' (idempotency check)
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("grant_versions")
      .update({ 
        ai_analysis_status: "analyzing",
        pipeline_generation_status: "none"
      })
      .eq("id", grant_version_id)
      .eq("ai_analysis_status", "pending")
      .select("id")
      .single();

    if (claimError || !claimed) {
      console.log("Already processing or completed - skipping duplicate call");
      return new Response(JSON.stringify({ 
        message: "Already processing or completed",
        skipped: true 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Step 1: Extracting Grant DNA Pack (rubric, inputs, compliance)...");

    // ========== AI CALL #1: Extract Grant DNA Pack ==========
    const extractionPrompt = `You are an expert at analyzing grant application guidelines and extracting structured data.
Your task is to analyze the provided grant guidelines and extract a "Grant DNA Pack":

1. REQUIRED INPUTS: What information must the applicant provide?
   - Application form sections, required fields, document uploads
   - Each input: key (snake_case), label, type (text/textarea/url/file/select/number), required, help_text, max_length, source_section

2. RUBRIC/ASSESSMENT CRITERIA: How will applications be assessed?
   - Selection criteria, scoring, evaluation weights
   - Each section: key (snake_case), title, description, criteria (array), weight (percentage if mentioned)

3. GRANT SUMMARY: Brief description of the grant's purpose

4. PROGRAM PROFILE (if identifiable):
   - Jurisdiction (Federal/State)
   - Applicant types (SME, University, etc.)
   - Funding type (Grant, Loan, Matched)

5. COMPLIANCE RULES:
   - Mandatory sections, page limits, forbidden claims

Return ONLY valid JSON matching the schema.`;

    const extractionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: `Analyze these grant guidelines and extract the Grant DNA Pack:\n\n${guidelines_text.substring(0, 80000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_grant_dna_pack",
              description: "Extract Grant DNA Pack from guidelines",
              parameters: {
                type: "object",
                properties: {
                  required_inputs: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        key: { type: "string" },
                        label: { type: "string" },
                        type: { type: "string", enum: ["text", "textarea", "url", "file", "select", "number"] },
                        required: { type: "boolean" },
                        help_text: { type: "string" },
                        max_length: { type: "number" },
                        source_section: { type: "string" }
                      },
                      required: ["key", "label", "type", "required"]
                    }
                  },
                  rubric: {
                    type: "object",
                    properties: {
                      sections: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: { type: "string" },
                            title: { type: "string" },
                            description: { type: "string" },
                            criteria: { type: "array", items: { type: "string" } },
                            weight: { type: "number" }
                          },
                          required: ["key", "title", "criteria"]
                        }
                      }
                    },
                    required: ["sections"]
                  },
                  grant_summary: { type: "string" },
                  program_profile: {
                    type: "object",
                    properties: {
                      jurisdiction: { type: "string" },
                      applicant_types: { type: "array", items: { type: "string" } },
                      funding_type: { type: "string" }
                    }
                  },
                  compliance_rules: {
                    type: "object",
                    properties: {
                      mandatory_sections: { type: "array", items: { type: "string" } },
                      forbidden_claims: { type: "array", items: { type: "string" } },
                      formatting_constraints: { type: "array", items: { type: "string" } }
                    }
                  }
                },
                required: ["required_inputs", "rubric", "grant_summary"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_grant_dna_pack" } }
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error("AI extraction error:", extractionResponse.status, errorText);
      
      await supabaseAdmin
        .from("grant_versions")
        .update({ ai_analysis_status: "failed" })
        .eq("id", grant_version_id);

      throw new Error("AI extraction failed");
    }

    const extractionResult = await extractionResponse.json();
    let suggestions;
    
    const toolCall = extractionResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      suggestions = JSON.parse(toolCall.function.arguments);
    } else {
      const content = extractionResult.choices?.[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        }
      }
    }

    if (!suggestions) {
      await supabaseAdmin
        .from("grant_versions")
        .update({ ai_analysis_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to parse extraction response");
    }

    console.log("Step 2: Classifying grant archetype...");

    // Classify archetype from extracted data
    const { archetype, confidence: archetypeConfidence } = classifyGrantArchetype(
      suggestions.grant_summary || "",
      suggestions.rubric?.sections || []
    );

    console.log(`Detected archetype: ${archetype} (${archetypeConfidence} confidence)`);

    // Select modules for this archetype
    const selectedModules = selectModulesForArchetype(archetype);
    console.log(`Selected ${selectedModules.length} modules for archetype`);

    // Save extraction results with archetype
    await supabaseAdmin
      .from("grant_versions")
      .update({
        ai_analysis_status: "completed",
        ai_suggestions_json: {
          ...suggestions,
          detected_archetype: archetype,
          archetype_confidence: archetypeConfidence,
          selected_modules: selectedModules.map(m => m.module_name)
        },
        required_inputs_json: suggestions.required_inputs || [],
        rubric_json: { sections: suggestions.rubric?.sections || [] },
        guidelines_raw_text: guidelines_text.substring(0, 100000),
        pipeline_generation_status: "generating"
      })
      .eq("id", grant_version_id);

    console.log("Step 3: Generating archetype-specific research pipeline...");

    // ========== AI CALL #2: Generate Research Pipeline ==========
    const grantName = (grantVersion as any).grant?.name || "Grant";
    const rubricSections = suggestions.rubric?.sections || [];
    
    const formattedRubric = rubricSections.map((s: any) => 
      `## ${s.title} ${s.weight ? `(${s.weight}% weight)` : ''}\n${s.description || ''}\nCriteria: ${(s.criteria || []).join('; ')}`
    ).join('\n\n');

    const modulesDescription = selectedModules.map(m => 
      `- ${m.role_name}: ${m.role_goal}`
    ).join('\n');

    const pipelinePrompt = `You are an expert at designing high-quality research pipelines for ${archetype} grant applications.

Context:
- Grant: ${grantName}
- Archetype: ${archetype}
- Summary: ${suggestions.grant_summary || 'Grant application'}

Rubric/Assessment Criteria:
${formattedRubric}

REQUIRED MODULES FOR THIS ARCHETYPE:
${modulesDescription}

${WRITER_STANCE_PREAMBLE}

${PROMPT_QUALITY_TEMPLATE}

${PROMPT_REFERENCE_EXAMPLE}

Design a research pipeline that addresses the rubric criteria. 

=== CRITICAL PROMPT QUALITY REQUIREMENTS ===
Each prompt_template you generate MUST:
1. Be at least 1,500 characters long
2. Start with "STEP N — [Purpose]" header and INPUTS section
3. Include a "HARD RULES:" section with 5+ explicit constraints including:
   - "Do NOT invent facts or numbers"
   - "NEVER use placeholder tokens like [Company] or {value}"
   - Placeholder prohibition rule
4. Include an "UNKNOWN HANDLING:" section specifying how to handle missing data
5. Include an "OUTPUT JSON SCHEMA:" section with exact field definitions
6. Include URL validation requirements where applicable

=== RESEARCH FOCUS ===
Generate steps that produce CITABLE EVIDENCE, not application writing. Each step should gather external data.

REQUIRED PIPELINE STRUCTURE:
- Step 0: build_source_pack (ALWAYS first - curates authoritative sources)
- Steps 1-N: Research steps aligned with modules and rubric sections
- Final steps: report_assembly and finalize_citations

DO NOT include HTML assembly steps - these are added automatically.

For each step:
- step_number: Sequential integer starting at 0
- step_name: snake_case identifier
- step_description: What research this step produces
- prompt_template: Full prompt with all quality sections (1,500+ chars minimum)
  APPROVED VARIABLES: {{summary}}, {{publicArticleUrl}}, {{articleContent}}, {{trl}}, {{ipStatus}}, 
  {{grantName}}, {{grantVersionLabel}}, {{grantGuidelines}}, {{grantRubric}}, {{grantSummary}},
  {{sources}}, {{unknowns}}, {{step0}}, {{step1}}, {{step2}}, etc.
- model_tier: "lite" | "balanced" | "pro"

Return JSON:
{
  "pipeline_name": "string",
  "pipeline_description": "string",
  "system_prompt": "string",
  "steps": [...]
}`;

    const pipelineResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: pipelinePrompt },
          { role: "user", content: "Generate the research pipeline based on the grant requirements above." },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_pipeline",
              description: "Create a research pipeline for the grant",
              parameters: {
                type: "object",
                properties: {
                  pipeline_name: { type: "string" },
                  pipeline_description: { type: "string" },
                  system_prompt: { type: "string" },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        step_number: { type: "number" },
                        step_name: { type: "string" },
                        step_description: { type: "string" },
                        prompt_template: { type: "string" },
                        model_tier: { type: "string", enum: ["lite", "balanced", "pro"] }
                      },
                      required: ["step_number", "step_name", "step_description", "prompt_template"]
                    }
                  }
                },
                required: ["pipeline_name", "system_prompt", "steps"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_pipeline" } }
      }),
    });

    if (!pipelineResponse.ok) {
      const errorText = await pipelineResponse.text();
      console.error("AI pipeline generation error:", pipelineResponse.status, errorText);
      
      await supabaseAdmin
        .from("grant_versions")
        .update({ pipeline_generation_status: "failed" })
        .eq("id", grant_version_id);

      throw new Error("AI pipeline generation failed");
    }

    const pipelineResult = await pipelineResponse.json();
    let pipelineData;
    
    const pipelineToolCall = pipelineResult.choices?.[0]?.message?.tool_calls?.[0];
    if (pipelineToolCall?.function?.arguments) {
      pipelineData = JSON.parse(pipelineToolCall.function.arguments);
    } else {
      const content = pipelineResult.choices?.[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          pipelineData = JSON.parse(jsonMatch[0]);
        }
      }
    }

    if (!pipelineData || !pipelineData.steps) {
      await supabaseAdmin
        .from("grant_versions")
        .update({ pipeline_generation_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to parse pipeline response");
    }

    console.log("Step 4: Validating and enhancing prompt quality...");

    // Quality validation and auto-enhancement
    const stepsNeedingEnhancement: number[] = [];
    for (const step of pipelineData.steps) {
      const score = calculateQualityScore(step.prompt_template);
      console.log(`Step ${step.step_number} (${step.step_name}): quality=${score.total}, level=${score.level}`);
      if (score.level === 'poor') {
        stepsNeedingEnhancement.push(step.step_number);
      }
    }

    // Auto-enhance low-quality prompts
    if (stepsNeedingEnhancement.length > 0) {
      console.log(`Auto-enhancing ${stepsNeedingEnhancement.length} low-quality prompts...`);

      const enhancementPrompt = `You are an expert at improving research prompts for grant applications.

The following prompts need quality improvement. For each prompt, enhance it to include:
1. A clear STEP header with purpose and INPUTS section
2. A HARD RULES section with 5+ explicit constraints
3. An OUTPUT JSON SCHEMA with exact field definitions
4. URL validation requirements
5. Unknown handling protocol
6. Placeholder prohibition

CRITICAL:
- Each enhanced prompt MUST be at least 1,500 characters
- Template variables {{...}} are ONLY for INPUTS or HARD RULES sections
- NEVER include {{variable}} inside OUTPUT SCHEMA field descriptions

Steps to enhance:
${stepsNeedingEnhancement.map(stepNum => {
  const step = pipelineData.steps.find((s: any) => s.step_number === stepNum);
  return `
---
STEP ${stepNum}: ${step.step_name}
PURPOSE: ${step.step_description}
CURRENT (${step.prompt_template.length} chars):
${step.prompt_template}
---`;
}).join('\n')}

Return JSON array: [{ "step_number": N, "enhanced_prompt": "..." }, ...]`;

      try {
        const enhanceResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: enhancementPrompt },
              { role: "user", content: "Enhance these prompts to meet quality standards." },
            ],
            response_format: { type: "json_object" }
          }),
        });

        if (enhanceResponse.ok) {
          const enhanceResult = await enhanceResponse.json();
          const content = enhanceResult.choices?.[0]?.message?.content;
          if (content) {
            try {
              const parsed = JSON.parse(content);
              const enhancements = Array.isArray(parsed) ? parsed : parsed.enhancements || parsed.steps || [];
              
              for (const enhancement of enhancements) {
                const stepIdx = pipelineData.steps.findIndex((s: any) => s.step_number === enhancement.step_number);
                if (stepIdx !== -1 && enhancement.enhanced_prompt) {
                  const newScore = calculateQualityScore(enhancement.enhanced_prompt);
                  console.log(`Enhanced step ${enhancement.step_number}: ${pipelineData.steps[stepIdx].prompt_template.length} -> ${enhancement.enhanced_prompt.length} chars, quality: ${newScore.total}`);
                  pipelineData.steps[stepIdx].prompt_template = enhancement.enhanced_prompt;
                }
              }
            } catch (parseErr) {
              console.error("Failed to parse enhancement response:", parseErr);
            }
          }
        }
      } catch (enhanceError) {
        console.warn("Enhancement error, proceeding with original prompts:", enhanceError);
      }
    }

    // Sanitize output schemas
    console.log("Step 4.5: Sanitizing output schemas...");
    for (const step of pipelineData.steps) {
      const original = step.prompt_template;
      step.prompt_template = sanitizeOutputSchemas(step.prompt_template);
      if (original !== step.prompt_template) {
        console.log(`Sanitized template variables from step ${step.step_number}`);
      }
    }

    console.log("Step 5: Creating prompt bundle with hybrid architecture...");

    // Model tier mapping
    const tierToModel: Record<string, string> = {
      lite: "google/gemini-2.5-flash-lite",
      balanced: "google/gemini-3-flash-preview",
      pro: "google/gemini-3-pro-preview"
    };

    // Create Firecrawl data-gathering steps
    const researchDomain = suggestions.grant_summary?.split(/[,.]/)[0] || grantName;
    const dataGatheringSteps = createDataGatheringSteps(researchDomain, archetype);
    
    const firecrawlSteps = dataGatheringSteps.map((step: any) => ({
      step_number: step.step_number,
      step_name: step.step_name,
      step_description: step.step_description,
      prompt_template: step.prompt_template,
      step_type: step.step_type,
      step_config_json: step.step_config_json,
      model_override: null,
      is_heavy: false,
      is_assembly_step: false
    }));
    
    console.log(`Created ${firecrawlSteps.length} Firecrawl data-gathering steps`);
    
    const firecrawlOffset = dataGatheringSteps.length;
    
    // Shift AI-generated steps
    const aiAnalysisSteps = pipelineData.steps.map((step: any) => ({
      step_number: step.step_number + firecrawlOffset,
      step_name: step.step_name,
      step_description: step.step_description,
      prompt_template: step.prompt_template,
      step_type: 'ai_prompt' as const,
      step_config_json: {},
      model_override: tierToModel[step.model_tier] || null,
      is_heavy: step.model_tier === "pro",
      is_assembly_step: false
    }));
    
    const maxResearchStep = Math.max(...aiAnalysisSteps.map((s: any) => s.step_number));

    // Generate QA Gates step (reusing rubricSections from line 918)
    console.log("Step 5.1: Adding QA Gates validation step...");
    const qaGatesTemplate = createQAGatesStep(maxResearchStep, rubricSections);
    const qaGatesStep = {
      step_number: maxResearchStep + 1,
      step_name: qaGatesTemplate.step_name,
      step_description: qaGatesTemplate.step_description,
      prompt_template: qaGatesTemplate.prompt_template,
      step_type: 'ai_prompt' as const,
      step_config_json: {},
      model_override: tierToModel[qaGatesTemplate.model_tier] || null,
      is_heavy: false,
      is_assembly_step: false
    };
    
    // Max step is now after QA gates
    const maxStepBeforeAssembly = maxResearchStep + 1; // QA gates step

    // Generate HTML assembly steps (after QA gates)
    const htmlAssemblySteps = createHtmlAssemblySteps(maxStepBeforeAssembly);
    const assemblySteps = htmlAssemblySteps.map((step, idx) => ({
      step_number: maxStepBeforeAssembly + 1 + idx,
      step_name: step.step_name,
      step_description: step.step_description,
      prompt_template: step.prompt_template,
      step_type: 'ai_prompt' as const,
      step_config_json: {},
      model_override: tierToModel[step.model_tier] || null,
      is_heavy: false,
      is_assembly_step: true
    }));

    // Create the prompt bundle
    const { data: bundle, error: bundleError } = await supabaseAdmin
      .from("prompt_bundles")
      .insert({
        name: pipelineData.pipeline_name || `${grantName} Pipeline`,
        description: pipelineData.pipeline_description || `Auto-generated ${archetype} pipeline for ${grantName}`,
        system_prompt: pipelineData.system_prompt || `You are an expert research analyst supporting ${archetype} grant applications with evidence-based analysis.`,
        is_active: false,
      })
      .select("id")
      .single();

    if (bundleError || !bundle) {
      console.error("Failed to create bundle:", bundleError);
      await supabaseAdmin
        .from("grant_versions")
        .update({ pipeline_generation_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to create prompt bundle");
    }

    // Combine all steps: Firecrawl → AI Research → QA Gates → Assembly
    const stepsToInsert = [
      ...firecrawlSteps.map(s => ({ ...s, bundle_id: bundle.id })),
      ...aiAnalysisSteps.map(s => ({ ...s, bundle_id: bundle.id })),
      { ...qaGatesStep, bundle_id: bundle.id },
      ...assemblySteps.map(s => ({ ...s, bundle_id: bundle.id }))
    ];
    
    console.log(`Inserting ${firecrawlSteps.length} Firecrawl + ${aiAnalysisSteps.length} AI analysis + 1 QA gates + ${assemblySteps.length} assembly = ${stepsToInsert.length} total`);

    // Validate finalize_report_html step
    console.log("Step 5.5: Validating assembly step consistency...");
    
    const finalizeStep = assemblySteps.find((s: any) => s.step_name === "finalize_report_html");
    if (finalizeStep) {
      const prompt = finalizeStep.prompt_template;
      // Assembly steps come after QA gates, so references should be maxStepBeforeAssembly + 1/2
      const expectedHtmlStep = `{{step${maxStepBeforeAssembly + 1}}}`;
      const expectedTablesStep = `{{step${maxStepBeforeAssembly + 2}}}`;
      
      const validationErrors: string[] = [];
      
      if (!prompt.includes(expectedHtmlStep)) {
        validationErrors.push(`Missing reference to ${expectedHtmlStep}`);
      }
      if (!prompt.includes(expectedTablesStep)) {
        validationErrors.push(`Missing reference to ${expectedTablesStep}`);
      }
      if (!prompt.includes('"report_html"')) {
        validationErrors.push("Missing 'report_html' field in OUTPUT SCHEMA");
      }
      
      if (validationErrors.length > 0) {
        console.error("Assembly validation failed:", validationErrors);
        const correctTemplate = createHtmlAssemblySteps(maxStepBeforeAssembly)[2];
        const insertIdx = stepsToInsert.findIndex((s: any) => s.step_name === "finalize_report_html");
        if (insertIdx !== -1) {
          console.log("Auto-fixing finalize_report_html step...");
          stepsToInsert[insertIdx].prompt_template = correctTemplate.prompt_template;
        }
      } else {
        console.log("Assembly step validation passed ✓");
      }
    }

    const { error: stepsError } = await supabaseAdmin
      .from("prompt_bundle_steps")
      .insert(stepsToInsert);

    if (stepsError) {
      console.error("Failed to insert steps:", stepsError);
      await supabaseAdmin.from("prompt_bundles").delete().eq("id", bundle.id);
      await supabaseAdmin
        .from("grant_versions")
        .update({ pipeline_generation_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to create pipeline steps");
    }

    console.log("Step 6: Linking bundle to grant version...");

    // Link bundle to grant version
    await supabaseAdmin
      .from("grant_versions")
      .update({
        prompt_bundle_id: bundle.id,
        pipeline_generation_status: "draft"
      })
      .eq("id", grant_version_id);

    // Audit log with archetype info
    const totalStepCount = stepsToInsert.length;
    await supabaseAdmin.from("audit_logs").insert({
      entity_type: "grant_version",
      entity_id: grant_version_id,
      action: "PIPELINE_GENERATED",
      user_id: userId,
      new_value_json: { 
        bundle_id: bundle.id, 
        archetype,
        archetype_confidence: archetypeConfidence,
        firecrawl_steps: firecrawlSteps.length,
        ai_analysis_steps: aiAnalysisSteps.length,
        qa_gates_steps: 1,
        assembly_steps: assemblySteps.length,
        total_steps: totalStepCount,
        pipeline_name: pipelineData.pipeline_name,
        modules_included: selectedModules.map(m => m.module_name),
        hybrid_architecture: true,
        qa_gates_enabled: true
      }
    });

    console.log("Processing complete!");

    return new Response(JSON.stringify({
      success: true,
      bundle_id: bundle.id,
      archetype,
      archetype_confidence: archetypeConfidence,
      step_count: totalStepCount,
      firecrawl_steps: firecrawlSteps.length,
      ai_analysis_steps: aiAnalysisSteps.length,
      qa_gates_steps: 1,
      assembly_steps: assemblySteps.length,
      qa_gates_enabled: true,
      modules_included: selectedModules.map(m => m.module_name),
      suggestions: {
        grant_summary: suggestions.grant_summary,
        input_count: (suggestions.required_inputs || []).length,
        rubric_section_count: (suggestions.rubric?.sections || []).length
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("process-grant-guidelines error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
