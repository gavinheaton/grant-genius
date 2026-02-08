import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
2. Assumptions MUST be labeled with confidence: (High confidence), (Medium confidence), (Low confidence)
3. If a claim is not supported by an allowed source_id, output: 'Unknown (no validated source found)'
4. Always address additionality: why funding is needed and what would not happen without it
5. Always articulate jurisdiction benefit (AU grants): jobs, exports, sovereign capability, productivity, equity, emissions, etc.—tied to evidence

EVIDENCE RULES:
1. All numeric claims MUST have a corresponding source_id
2. Preserve source IDs exactly as provided—never renumber or modify them
3. No placeholders like 'Source1', '[insert]', '{TBD}' or 'article' are permitted
4. Every source_id used must exist in the consolidated sources list
5. When specific data is unavailable, provide proxy estimates with methodology shown and confidence labeled

OUTPUT CONSTRAINTS:
1. Return ONLY valid JSON—no markdown code fences, no prose outside JSON
2. First character must be {, last character must be }
3. Do NOT include \`\`\` anywhere in output
4. All field names must match the specified OUTPUT SCHEMA exactly
=== END WRITER STANCE CONTRACT ===
`;

// ============================================================================
// ASSESSOR INSIGHT CONTRACT (injected into all prompts for quality assurance)
// ============================================================================

const ASSESSOR_INSIGHT_CONTRACT = `
=== ASSESSOR INSIGHT CONTRACT ===

EVIDENCE-TYPE MATCHING RULE (Non-Negotiable):

| Claim Category | ALLOWED Sources | NEVER Use |
|----------------|-----------------|-----------|
| Market size / market growth / revenue / pricing | Market research firms, industry reports, procurement datasets, official spending stats (PBS/MBS/AIHW), ABS industry accounts, company annual reports, regulator price lists | Epidemiology studies, disease burden papers |
| Disease burden / incidence / mortality / prevalence | Government health statistics, AIHW, Cancer Australia, WHO, peer-reviewed epidemiology, clinical registries | Market reports, company financials |
| Regulatory pathway / approval / reimbursement | TGA/FDA/EMA guidance, PBS/HTA documents, standards bodies, official policy docs | General news, press releases |
| Competitor status / product claims | Company filings, regulator databases (ARTG, FDA 510k), clinical trial registries (ANZCTR, ClinicalTrials.gov), official product pages, peer-reviewed publications | Wikipedia, blog posts, undated sources |

If no valid evidence exists for a claim, output exactly:
"Unknown (no validated source found)" + add to unknowns array with:
- what_is_missing: description of the data gap
- what_would_validate: specific source types that would provide validation
- proxy_attempted: true/false + method if attempted

ASSUMPTION DISCIPLINE (all assumptions must be readable + checkable):
- confidence_label: "High" | "Medium" | "Low"
- one_line_justification: Brief explanation of why this confidence level
- replicable_method: Equation or steps that can be verified

PROXY ESTIMATE REQUIREMENTS (when direct data unavailable):
{
  "value": number,
  "currency": "AUD|USD",
  "year": 2024,
  "method": "Description of calculation approach",
  "inputs": [
    {"description": "Input 1", "value": X, "source_id": "S0-X"},
    {"description": "Input 2", "value": Y, "source_id": "S0-Y|ESTIMATE"}
  ],
  "sensitivity": {"low": number, "high": number},
  "confidence": "high|medium|low"
}

COMMERCIAL REALITY LAYER (fill the "researcher gap"):
Every pipeline must produce evidence for:
- Who pays / who decides / adoption pathway
- Pricing anchors (direct, adjacent, or proxy with methodology)
- Implementation friction + enabling partners
- Regulatory and reimbursement gating steps (where applicable)
- Measurable success outcomes (assessor lens)

COMPETITOR COMPARABILITY FRAMEWORK:
Group competitors as:
- Direct: Same buyer + same use case + same modality/class
- Adjacent: Same buyer OR same use case OR similar modality
- Enablers: Platforms, diagnostics, manufacturing, distribution, integrators

Each competitor entry must include at least ONE of:
- price/pricing_anchor, revenue, TRL/stage, trial_stage, approval_status, reimbursement_status
If not available: mark "Unknown" + list validation sources needed.

ADDITIONALITY + JURISDICTION BENEFIT (universal):
Every report must state:
- Why funding is needed (counterfactual: what will NOT happen otherwise)
- Benefit to jurisdiction (AU jobs, sovereign capability, exports, equity outcomes)
Both must be evidence-supported OR clearly labeled as assumption.

=== END ASSESSOR INSIGHT CONTRACT ===
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
// QUALITY SCORING + FORBIDDEN PATTERN DETECTION
// ============================================================================

// Forbidden patterns that must NEVER appear in prompt outputs or final reports
const FORBIDDEN_PATTERNS = [
  { regex: /\{TBD\}/gi, name: "{TBD}" },
  { regex: /\[Insert[^\]]*\]/gi, name: "[Insert...]" },
  { regex: /Hypothetical\s+\w+/gi, name: "Hypothetical [Entity]" },
  { regex: /\[PROJECT\s*NAME\]/gi, name: "[PROJECT NAME]" },
  { regex: /\[COMPANY\]/gi, name: "[COMPANY]" },
  { regex: /\{value\}/gi, name: "{value}" },
  { regex: /Source\s*[12]\b/gi, name: "Source 1/2" },
  { regex: /\[Your\s+/gi, name: "[Your..." },
  { regex: /\{\s*\}/g, name: "{}" },
  { regex: /\[TBD\]/gi, name: "[TBD]" },
];

function detectForbiddenPatterns(text: string): string[] {
  if (!text) return [];
  return FORBIDDEN_PATTERNS.filter(p => p.regex.test(text)).map(p => p.name);
}

function calculateQualityScore(prompt: string): { 
  total: number; 
  level: 'good' | 'warning' | 'poor'; 
  forbiddenPatterns: string[];
  hasProxyProtocol: boolean;
  hasEvidenceTypeCheck: boolean;
  hasAssessorInsight: boolean;
  hasSensitivityRange: boolean;
} {
  if (!prompt || typeof prompt !== 'string') {
    return { 
      total: 0, 
      level: 'poor', 
      forbiddenPatterns: [], 
      hasProxyProtocol: false,
      hasEvidenceTypeCheck: false,
      hasAssessorInsight: false,
      hasSensitivityRange: false
    };
  }

  // Detect forbidden patterns
  const forbiddenPatterns = detectForbiddenPatterns(prompt);
  const forbiddenPenalty = forbiddenPatterns.length * 5; // -5 points per pattern

  // Check for proxy protocol language (good practice)
  const hasProxyProtocol = /proxy.*estimate|proxy.*calculation|if.*unavailable.*calculate|conservative.*proxy|PROXY PROTOCOL/i.test(prompt);
  const proxyBonus = hasProxyProtocol ? 10 : 0;

  // NEW: Evidence-type compliance check
  const hasEvidenceTypeCheck = /EVIDENCE.TYPE.*MATCHING|EVIDENCE.TYPE.*CHECK|claim.*uses.*correct.*evidence|ALLOWED.*Sources/i.test(prompt);
  const evidenceTypeBonus = hasEvidenceTypeCheck ? 10 : 0;

  // NEW: Assessor insight check
  const hasAssessorInsight = /ASSESSOR.*INSIGHT|COMMERCIAL.*REALITY|decision.*pathway|buyer.*persona|pricing.*anchor|ASSESSOR INSIGHT CONTRACT/i.test(prompt);
  const assessorInsightBonus = hasAssessorInsight ? 10 : 0;

  // NEW: Sensitivity range check
  const hasSensitivityRange = /sensitivity.*range|sensitivity.*\{.*low.*high|confidence.*label|low.*mid.*high/i.test(prompt);
  const sensitivityBonus = hasSensitivityRange ? 5 : 0;

  const scores = {
    contextHeader: /STEP\s*\d|INPUTS?:/i.test(prompt) ? 15 : 0,
    hardRules: /HARD RULES|CRITICAL RULES|REQUIREMENTS|RULES:/i.test(prompt) ? 20 : 0,
    outputSchema: /OUTPUT.*JSON|JSON.*SCHEMA|OUTPUT.*SCHEMA|Return.*JSON/is.test(prompt) ? 20 : 0,
    urlValidation: /URL.*valid|valid.*URL|URL.*require|source.*URL/i.test(prompt) ? 15 : 0,
    unknownHandling: /unknown.*handling|if.*not.*found|unknowns.*array|Not disclosed|proxy.*estimate/i.test(prompt) ? 15 : 0,
    placeholderProhibition: /\[.*\].*forbidden|placeholder.*prohibit|NEVER.*\[|Do NOT.*\[|bracket.*forbidden|FORBIDDEN.*PATTERN/i.test(prompt) ? 10 : 0,
    adequateLength: prompt.length >= 1500 ? 5 : Math.round((prompt.length / 1500) * 5 * 10) / 10,
  };

  const baseTotal = Object.values(scores).reduce((a, b) => a + b, 0);
  const total = Math.max(0, baseTotal - forbiddenPenalty + proxyBonus + evidenceTypeBonus + assessorInsightBonus + sensitivityBonus);
  
  // Raise threshold for 'good' to 75 (from 70) to enforce higher standards
  const level = total >= 75 ? 'good' : total >= 45 ? 'warning' : 'poor';
  
  return { 
    total: Math.round(total), 
    level, 
    forbiddenPatterns, 
    hasProxyProtocol,
    hasEvidenceTypeCheck,
    hasAssessorInsight,
    hasSensitivityRange
  };
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
// GRANT WRITER CORE STEP DEFAULTS
// ============================================================================

function createDefaultCoreStep(stepName: string, stepNumber: number, description: string) {
  const stepTemplates: Record<string, string> = {
    build_source_pack: `STEP 0 — Build Source Pack (Australia-first, domain-agnostic)

${WRITER_STANCE_PREAMBLE}

You are a grant-commercialisation analyst. Your task is to curate a Source Pack of 12–25 high-quality sources relevant to the research domain described by the user.

INPUTS:
- {{summary}}: The user's 100-word research summary
- {{grantGuidelines}}: Assessment criteria for this grant
- {{publicArticleUrl}}: Optional article URL provided by the user

HARD RULES:
1. Do NOT invent facts or numbers.
2. Only include sources you can validate as real and relevant.
3. Prefer Australian authoritative sources first when applicable.
4. If you cannot find a source type, record it as an Unknown in the unknowns array.
5. NEVER use placeholder text like "[Source Title]" or "{URL}" - use actual content or 'Not available'.
6. All source_ids must be sequential (S0-1, S0-2, etc.)
7. Every source must have a valid URL or explicit "URL not available"

SOURCE PACK REQUIREMENTS:
Return 12–25 sources total (max 25). Include, where relevant:
A) Australia-first authoritative sources: ABS, data.gov.au, AIHW, Productivity Commission, NHMRC, CSIRO
B) Sector/standards/peak bodies relevant to the research domain
C) Academic publications, market reports, industry statistics
D) Policy documents and regulatory guidance

UNKNOWN HANDLING:
- If a source type cannot be found, add to unknowns array with what would resolve it
- Mark confidence as "low" for sources that cannot be verified

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
}`,

    rubric_mapping_matrix: `STEP 1 — Rubric Mapping Matrix

${WRITER_STANCE_PREAMBLE}

INPUTS:
- {{grantRubric}}: The grant assessment criteria/rubric JSON
- {{grantGuidelines}}: Full grant guidelines text
- {{step0}}: Source pack from previous step

PURPOSE:
Produce a table mapping each rubric criterion → required evidence types → where it will be addressed in the report.

HARD RULES:
1. Do NOT invent facts or numbers
2. Do NOT add criteria that are not in the rubric
3. Each criterion must have specific, measurable evidence requirements
4. Map evidence requirements to source types (academic, government, industry, etc.)
5. Identify which criteria have highest weights and need deepest evidence
6. NEVER use placeholder tokens like [Company] or {value}
7. All assessment language must be objective and assessor-focused
8. Preserve exact criterion wording from rubric

UNKNOWN HANDLING:
- If weight not specified, estimate based on rubric section length and emphasis
- If criteria are vague, infer specific measurable requirements
- Include unknowns array for evidence that cannot be determined from rubric

OUTPUT JSON SCHEMA:
{
  "rubric_sections": [
    {
      "key": "innovation",
      "title": "Innovation and Technical Merit",
      "weight": 30,
      "criteria": ["Novelty of approach", "Technical feasibility"],
      "evidence_required": [
        {"type": "Prior art search", "sources": ["Patents", "Academic papers"], "priority": "high"},
        {"type": "TRL assessment", "sources": ["Technical documentation"], "priority": "high"}
      ],
      "report_location": "Section 2: Research Context and Innovation",
      "scoring_intent": "Assessors looking for differentiated approach with validated feasibility"
    }
  ],
  "total_criteria_count": 12,
  "high_weight_sections": ["innovation", "impact"],
  "evidence_gaps": ["Competitor patent analysis not available"]
}`,

    required_inputs_coverage_map: `STEP 2 — Required Inputs Coverage Map

${WRITER_STANCE_PREAMBLE}

INPUTS:
- {{requiredInputs}}: Required application inputs JSON
- {{grantGuidelines}}: Full grant guidelines text
- {{summary}}: User's research summary
- {{step1}}: Rubric mapping matrix from previous step

PURPOSE:
Produce a checklist ensuring every required_inputs.key is addressed and where it appears in the report.

HARD RULES:
1. Do NOT invent or assume applicant data
2. Only flag as missing what is genuinely not provided
3. Every required input key must be mapped to a report section
4. NEVER use placeholder tokens like [Company] or {value}
5. Questions for applicant must be specific and actionable
6. Include source_section from required inputs for traceability
7. All input keys must be explicitly addressed—none can be skipped
8. Mark optional vs required inputs clearly

UNKNOWN HANDLING:
- If input status unclear, mark as "needs_clarification"
- Include unknowns array for inputs that cannot be validated

OUTPUT JSON SCHEMA:
{
  "input_coverage": [
    {
      "key": "summary",
      "label": "Project Summary",
      "status": "provided",
      "report_section": "Executive Summary",
      "source_section": "Application Form Section 1"
    },
    {
      "key": "budget_breakdown",
      "label": "Budget Breakdown",
      "status": "missing",
      "report_section": "Budget and Value for Money",
      "question_for_applicant": "Please provide itemized budget with justification"
    }
  ],
  "coverage_summary": {
    "total_required": 10,
    "provided": 7,
    "missing": 3,
    "coverage_percentage": 70
  },
  "unknowns": ["Budget template format not specified in guidelines"]
}`,

    assumptions_register: `STEP 3 — Assumptions Register

${WRITER_STANCE_PREAMBLE}

INPUTS:
- {{step0}}: Source pack
- {{step1}}: Rubric mapping matrix
- {{step2}}: Required inputs coverage map
- {{summary}}: User's research summary

PURPOSE:
Produce a structured list of assumptions + confidence + sensitivity notes for the grant application.

HARD RULES:
1. Every assumption must be labeled: (High confidence) / (Medium confidence) / (Low confidence)
2. Do NOT present assumptions as facts
3. Show sensitivity: what happens if assumption is wrong?
4. Link assumptions to source_ids where possible
5. NEVER use placeholder tokens like [Company] or {value}
6. Assumptions must be specific, not generic
7. Include both technical and commercial assumptions
8. Flag assumptions that are critical to the application's success

UNKNOWN HANDLING:
- If assumption cannot be validated, mark as Low confidence with validation path
- Include unknowns array for data needed to convert assumption to fact

OUTPUT JSON SCHEMA:
{
  "assumptions": [
    {
      "id": "A1",
      "category": "market",
      "statement": "Australian market represents 2% of global TAM",
      "confidence": "medium",
      "source_id": "S0-3",
      "sensitivity": "If AU market share is 1%, SOM reduces by 50%",
      "validation_path": "Validate with ABS industry data"
    }
  ],
  "critical_assumptions": ["A1", "A3"],
  "unknowns": ["No validated data on competitor pricing in AU market"]
}`,

    additionality_and_benefit_case: `STEP 4 — Additionality and Benefit Case

${WRITER_STANCE_PREAMBLE}

INPUTS:
- {{step0}}: Source pack
- {{step1}}: Rubric mapping matrix  
- {{step3}}: Assumptions register
- {{grantRubric}}: Assessment criteria

PURPOSE:
Produce the counterfactual, need for funding, and jurisdiction benefit logic aligned to rubric weighting.

HARD RULES:
1. Always address additionality: what happens WITHOUT funding vs WITH funding
2. Jurisdiction benefits must be specific to Australia: jobs, exports, productivity, sovereign capability, regional impact, health outcomes, emissions reduction
3. All numeric claims must have source_id
4. NEVER use placeholder tokens like [Company] or {value}
5. Counterfactual must be realistic, not exaggerated
6. Benefits must be quantified where possible, with methodology shown
7. Link benefits to rubric criteria weights
8. Conservative estimates preferred over optimistic projections

UNKNOWN HANDLING:
- If benefit cannot be quantified, provide qualitative assessment with confidence level
- Use proxy estimates with methodology shown for missing data
- Include unknowns array for benefits that need validation

OUTPUT JSON SCHEMA:
{
  "counterfactual": {
    "without_funding": "Project delayed 2-3 years; may not proceed due to capital constraints",
    "with_funding": "Accelerated development enabling market entry within 18 months",
    "additionality_clear": true
  },
  "jurisdiction_benefits": [
    {
      "benefit_type": "jobs",
      "estimate": "15-25 direct FTEs by Year 3",
      "methodology": "Based on similar commercialisation projects (source: S0-5)",
      "source_id": "S0-5",
      "confidence": "medium"
    }
  ],
  "rubric_alignment": {
    "impact": {"weight": 35, "benefits_addressed": ["jobs", "exports", "productivity"]},
    "innovation": {"weight": 30, "benefits_addressed": ["sovereign_capability"]}
  },
  "unknowns": ["Regional job distribution not determined"]
}`,

    delivery_plan_and_milestones: `STEP 5 — Delivery Plan and Milestones

${WRITER_STANCE_PREAMBLE}

INPUTS:
- {{step0}}: Source pack
- {{step4}}: Additionality and benefit case
- {{trl}}: Current TRL level
- {{grantGuidelines}}: Grant guidelines

PURPOSE:
Produce milestones, timeline, dependencies, and (if relevant) TRL progression and validation approach.

HARD RULES:
1. Milestones must be specific, measurable, and achievable
2. Include dependencies between milestones
3. NEVER use placeholder tokens like [Company] or {value}
4. Timeline must align with grant funding period
5. TRL progression must be realistic (typically 1-2 levels per milestone)
6. Include validation/go-no-go gates at key decision points
7. Risk contingencies must be included for critical path items
8. Resource requirements linked to milestones

UNKNOWN HANDLING:
- If specific dates unclear, use relative timeframes (Month 1-6, etc.)
- Include unknowns array for dependencies that cannot be confirmed

OUTPUT JSON SCHEMA:
{
  "milestones": [
    {
      "id": "M1",
      "title": "Prototype Development Complete",
      "description": "Functional prototype validated in lab conditions",
      "timeframe": "Month 1-6",
      "trl_start": 4,
      "trl_end": 5,
      "deliverables": ["Technical report", "Prototype demonstration"],
      "go_no_go_criteria": ["Performance meets specifications", "No critical defects"],
      "dependencies": []
    }
  ],
  "critical_path": ["M1", "M3", "M5"],
  "validation_approach": "Stage-gate process with independent review at M2 and M4",
  "unknowns": ["Equipment lead times not confirmed"]
}`,

    risk_register_and_governance: `STEP 6 — Risk Register and Governance

${WRITER_STANCE_PREAMBLE}

INPUTS:
- {{step5}}: Delivery plan and milestones
- {{step3}}: Assumptions register
- {{grantGuidelines}}: Grant guidelines

PURPOSE:
Produce key risks, mitigations, owners, governance approach, compliance constraints.

HARD RULES:
1. Risks must be specific and actionable
2. Include likelihood and impact ratings
3. NEVER use placeholder tokens like [Company] or {value}
4. Every risk must have a mitigation strategy
5. Compliance constraints must be verbatim or accurately paraphrased from guidelines
6. Governance structure must show clear accountability
7. Include both technical and commercial risks
8. Link risks to assumptions where relevant

UNKNOWN HANDLING:
- If risk owner unclear, mark as TBD with suggested role
- Include unknowns array for compliance rules that need clarification

OUTPUT JSON SCHEMA:
{
  "risks": [
    {
      "id": "R1",
      "category": "technical",
      "description": "Prototype performance below specifications",
      "likelihood": "medium",
      "impact": "high",
      "mitigation": "Parallel development of backup technical approach",
      "owner": "Technical Lead",
      "linked_assumption": "A2"
    }
  ],
  "governance": {
    "steering_committee": "Quarterly review with industry and academic partners",
    "reporting": "Monthly progress reports to funding body",
    "escalation_path": "Project Manager → Steering Committee → Institution"
  },
  "compliance_constraints": ["Quarterly financial reporting required", "Ethics approval for human trials"],
  "unknowns": ["IP commercialisation policy not confirmed"]
}`,

    budget_logic_and_value_for_money: `STEP 7 — Budget Logic and Value for Money

${WRITER_STANCE_PREAMBLE}

INPUTS:
- {{step5}}: Delivery plan and milestones
- {{step4}}: Additionality and benefit case
- {{grantGuidelines}}: Grant guidelines

PURPOSE:
Produce budget narrative logic: cost categories, co-contribution logic, value-for-money rationale (no invented numbers unless sourced).

HARD RULES:
1. Do NOT invent specific dollar amounts unless from validated sources
2. Budget categories must align with grant guidelines
3. NEVER use placeholder tokens like [Company] or {value}
4. Co-contribution must show cash vs in-kind breakdown
5. Value-for-money must link costs to outcomes/benefits
6. Include cost per outcome metrics where possible
7. Justify major cost items with market benchmarks or quotes
8. Show how budget aligns with milestone delivery

UNKNOWN HANDLING:
- If specific costs unknown, provide typical ranges from similar projects
- Include unknowns array for costs that need quotes/validation

OUTPUT JSON SCHEMA:
{
  "budget_categories": [
    {
      "category": "personnel",
      "description": "Research staff and project management",
      "percentage_of_total": 45,
      "justification": "Standard ratio for R&D projects (source: ARC guidelines)"
    }
  ],
  "co_contribution": {
    "grant_request_percentage": 50,
    "cash_contribution_percentage": 30,
    "in_kind_contribution_percentage": 20,
    "sources": ["Industry partner", "University in-kind"]
  },
  "value_for_money": {
    "cost_per_job_created": "Estimated $50-80k per FTE based on similar programs",
    "leverage_ratio": "1:1 grant to co-investment",
    "benchmarks": "Comparable to successful Accelerating Commercialisation projects"
  },
  "unknowns": ["Equipment quotes pending", "Contractor rates not finalised"]
}`
  };

  return {
    step_number: stepNumber,
    step_name: stepName,
    step_description: description,
    prompt_template: stepTemplates[stepName] || `STEP ${stepNumber} — ${stepName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}

${WRITER_STANCE_PREAMBLE}

INPUTS:
- Prior step outputs as needed

PURPOSE:
${description}

HARD RULES:
1. Do NOT invent facts or numbers
2. NEVER use placeholder tokens like [Company] or {value}
3. All numeric claims must have source_id
4. Use "Unknown (no validated source found)" when data unavailable
5. Output valid JSON only

OUTPUT JSON SCHEMA:
{
  "result": {},
  "unknowns": []
}`,
    model_tier: "balanced"
  };
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
      step_name: "clean_citations_apa",
      step_description: "Transform internal source IDs to APA author-year citations and build References section",
      model_tier: "balanced",
      phase: "assembly",
      prompt_template: `STEP ${maxAIStep + 3} — Clean Citations (APA Transformation)

${WRITER_STANCE_PREAMBLE}

You are a citation formatting specialist. Transform all internal source ID markers 
into proper APA author-year citations and produce a clean References section.

INPUTS:
- {{step${maxAIStep + 1}}}: sections_html containing internal citation markers
- {{step${maxAIStep + 2}}}: tables and all_sources array

INTERNAL MARKER PATTERNS TO REMOVE (strengthened):
The following patterns must NEVER appear in sections_html_cleaned or tables_cleaned:
- [S0-1], [S0-A1], [S1-2] (step-source format)
- [ARTICLE-1], [SEARCH-2], [SOURCE-12] (type-number format)  
- [TBD], [{TBD}], [Insert...], {value}
- <sup>[S0-1]</sup> (superscript-wrapped markers)
- Source 1, Source 2 (numeric source placeholders)

HARD RULES:
1. NEVER output any bracketed internal source IDs in the cleaned HTML
2. Do NOT replace internal IDs with new placeholders like [1] or [Author]
3. Do NOT cite sources not present in all_sources
4. If a claim cannot be supported by a validated source, keep the claim but 
   remove the marker completely OR label as "Unknown (no validated source)"
5. No malformed or duplicate references
6. Hyperlink citations and reference URLs where available

If a claim has an internal marker that cannot be resolved to an APA citation:
- Remove the marker completely (leave no trace)
- If the claim is numeric, add note: "(Estimate - requires validation)"
- Add to unknowns with what_would_validate guidance

TRANSFORMATION PROCESS:

A) Build source lookup map:
   Parse all_sources from Step ${maxAIStep + 2} to create a dictionary keyed by "id" (e.g., "S0-1")
   Extract for each source: author/publisher, year, title, url

B) Clean the report body (sections_html from Step ${maxAIStep + 1}):
   Scan for bracketed internal ID tokens (including <sup>-wrapped)
   
   IF resolvable to a source with usable metadata:
   - Replace with APA in-text citation: <a href="URL">(Author, Year)</a>
   - Consolidate adjacent markers into single citation: "(Author, 2023; Author2, 2024)"
   - Use organisation/publisher name if no author available
   - Use (n.d.) if no date available
   
   IF NOT resolvable:
   - Remove the bracket token completely (leave no trace)
   - Add to unknowns array: { "marker": "...", "location": "section name", "needed": "source metadata", "what_would_validate": "..." }

C) Clean tables (from Step ${maxAIStep + 2}):
   Apply same replacement rules inside every table cell
   Preserve table structure and styling

D) Build APA References section:
   - Include ONLY sources that are actually cited in the cleaned report
   - Format each reference: Author/Org. (Year). Title. Publisher. <a href="URL">URL</a>
   - If author unknown, use organisation/publisher as author
   - If date unknown, use (n.d.)
   - Each entry must be hyperlinked to its URL
   - NO internal IDs in the References list
   - Sort alphabetically by author/organisation name

CITATION AUDIT REQUIREMENT (new):
Your output must include a "citations_audit" object:
{
  "citations_audit": {
    "total_citations_found": number,
    "citations_resolved": number,
    "citations_removed": number,
    "evidence_type_compliant": [
      { "source_id": "S0-1", "claim_category": "market_size", "source_type": "market_report", "compliant": true }
    ],
    "non_compliant_citations": [
      { "source_id": "S0-5", "claim_category": "market_size", "source_type": "epidemiology", "issue": "Wrong evidence type" }
    ],
    "references_list_complete": true/false
  }
}

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON - no code fences, no markdown
2. First character must be {, last must be }
3. All HTML must be properly escaped in JSON strings

OUTPUT JSON SCHEMA:
{
  "sections_html_cleaned": "FULL cleaned HTML with APA citations (no internal IDs)",
  "tables_cleaned": {
    "competitors": "cleaned table HTML",
    "market_sizing": "cleaned table HTML", 
    "partners": "cleaned table HTML"
  },
  "references_html": "<h2>References</h2><div class='references'><ul><li><a href='URL'>Author. (Year). Title. Publisher.</a></li>...</ul></div>",
  "citations_audit": {
    "total_citations_found": 0,
    "citations_resolved": 0,
    "citations_removed": 0,
    "evidence_type_compliant": [],
    "non_compliant_citations": [],
    "references_list_complete": true
  },
  "metadata": {
    "cited_source_ids": ["S0-1", "S0-2"],
    "unresolved_markers_count": 0,
    "removed_internal_markers_count": 5
  },
  "unknowns": [
    { "marker": "[ARTICLE-99]", "location": "Section 3", "needed": "source metadata", "what_would_validate": "..." }
  ]
}

VALIDATION CHECKS (must pass before outputting):
- sections_html_cleaned must NOT contain any [S, [ARTICLE, [SEARCH, {TBD} patterns
- tables_cleaned must NOT contain any internal ID patterns
- Every in-text citation must have a corresponding References entry
- Every References entry must correspond to at least one in-text citation
- No duplicate references`
    },
    {
      step_name: "finalize_report_html",
      step_description: "Merge cleaned sections, tables, and references into final report_html output",
      model_tier: "balanced",
      phase: "render",
      prompt_template: `STEP ${maxAIStep + 4} — Finalize Report (HTML)

${WRITER_STANCE_PREAMBLE}

You are merging the cleaned research narrative with data tables to produce the final report.

INPUT DATA FORMAT:
You will receive data from previous steps:

Step ${maxAIStep + 1} data ({{step${maxAIStep + 1}}}):
- "data_gaps": array - List of data gaps identified during assembly

Step ${maxAIStep + 3} data ({{step${maxAIStep + 3}}}):
- "sections_html_cleaned": The complete narrative HTML with APA citations (NO internal IDs)
- "tables_cleaned": object with keys "competitors", "market_sizing", "partners" - cleaned HTML tables
- "references_html": Pre-built APA References section with hyperlinks
- "citations_audit": Citation transformation audit object
- "metadata": Citation transformation statistics
- "unknowns": Unresolved markers array

YOUR TASK:
1. Get "sections_html_cleaned" from Step ${maxAIStep + 3} - this is your base HTML (already has APA citations)
2. Find these table anchors in the HTML and replace with cleaned tables from Step ${maxAIStep + 3}:
   - Replace "<!-- TABLE:competitors -->" with tables_cleaned.competitors
   - Replace "<!-- TABLE:market_sizing -->" with tables_cleaned.market_sizing
   - Replace "<!-- TABLE:partners -->" with tables_cleaned.partners
3. Append the references_html from Step ${maxAIStep + 3} at the end of the document
4. Combine data_gaps from Step ${maxAIStep + 1} with unknowns from Step ${maxAIStep + 3}

DATA GAP PRESENTATION (new):
If any unknowns exist from previous steps, include a "Data Gaps & Validation Needs" 
section before References with format:
- Gap description
- What would validate it
- Current proxy estimate (if any)

FINAL VALIDATION LINT (strengthened):
Before outputting, scan report_html for these patterns and REMOVE if found:
- Regex: /\\[S\\d+-\\w*\\d*\\]/g (internal source markers)
- Regex: /\\[ARTICLE-\\d+\\]/g
- Regex: /\\[SEARCH-\\d+\\]/g
- Regex: /\\{TBD\\}|\\[TBD\\]|\\[Insert[^\\]]*\\]/gi
- Regex: /Source\\s+[12]\\b/gi

If removal leaves orphan parentheses or broken sentences, clean them up.

VALIDATION (CRITICAL - must pass before output):
The final report_html must NOT contain any of these patterns:
- [S0-1], [S1-2], [S0-A1] or any [S followed by numbers/letters
- [ARTICLE-1], [ARTICLE-2] or any [ARTICLE-*
- [SEARCH-1], [SEARCH-2] or any [SEARCH-*
- [TBD], [{TBD}], or any bracketed placeholder tokens
- <sup>[S0-1]</sup> or similar superscript-wrapped internal IDs
- Source 1, Source 2 (numeric source placeholders)

If ANY of these patterns remain, you MUST remove them before outputting.

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - NO code fences
2. First character must be { and last must be }
3. The "report_html" field MUST contain the complete merged HTML document with NO internal IDs
4. Include citations_audit from Step ${maxAIStep + 3} in output

OUTPUT JSON SCHEMA:
{
  "title": "Grant Report: [Project Title]",
  "report_html": "<h2>Executive Summary</h2>...[full merged HTML with APA citations and tables]...<h2>Data Gaps & Validation Needs</h2>...<h2>References</h2>...",
  "all_sources": [{"id": "S0-1", "apa_citation": "Author. (Year). Title. Publisher. URL", "url": "..."}],
  "citations_audit": { ...from Step ${maxAIStep + 3}... },
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
    
    // Log response structure for debugging
    console.log("Extraction response structure:", JSON.stringify({
      hasChoices: !!extractionResult.choices,
      choiceCount: extractionResult.choices?.length,
      hasMessage: !!extractionResult.choices?.[0]?.message,
      hasToolCalls: !!extractionResult.choices?.[0]?.message?.tool_calls,
      toolCallCount: extractionResult.choices?.[0]?.message?.tool_calls?.length,
      hasFunctionCall: !!extractionResult.choices?.[0]?.message?.function_call,
      contentLength: extractionResult.choices?.[0]?.message?.content?.length,
      finishReason: extractionResult.choices?.[0]?.finish_reason,
    }, null, 2));
    
    const message = extractionResult.choices?.[0]?.message;
    
    // Try standard OpenAI format (tool_calls[0].function.arguments)
    if (message?.tool_calls?.[0]?.function?.arguments) {
      try {
        suggestions = JSON.parse(message.tool_calls[0].function.arguments);
        console.log("Successfully parsed tool call arguments");
      } catch (parseError) {
        console.error("Failed to parse tool call arguments:", parseError);
        console.error("Raw arguments (first 1000 chars):", message.tool_calls[0].function.arguments.substring(0, 1000));
      }
    }
    
    // Try legacy function_call format
    if (!suggestions && message?.function_call?.arguments) {
      try {
        suggestions = JSON.parse(message.function_call.arguments);
        console.log("Successfully parsed function_call arguments");
      } catch (parseError) {
        console.error("Failed to parse function_call arguments:", parseError);
        console.error("Raw function_call (first 1000 chars):", message.function_call.arguments.substring(0, 1000));
      }
    }
    
    // Try Gemini's direct args format (not stringified)
    if (!suggestions && message?.tool_calls?.[0]?.args) {
      suggestions = message.tool_calls[0].args;
      console.log("Used direct args from tool_calls (Gemini format)");
    }
    
    // Fallback: try to extract JSON from content
    if (!suggestions) {
      const content = message?.content;
      if (content) {
        console.log("Attempting content fallback, content length:", content.length);
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            suggestions = JSON.parse(jsonMatch[0]);
            console.log("Successfully parsed from content fallback");
          } catch (parseError) {
            console.error("Failed to parse content JSON:", parseError);
            console.error("Raw match (first 1000 chars):", jsonMatch[0].substring(0, 1000));
          }
        } else {
          console.error("No JSON object found in content");
          console.error("Content preview (first 500 chars):", content.substring(0, 500));
        }
      } else {
        console.error("No content in response message");
      }
    }
    
    // Retry with stable model if initial parse failed
    if (!suggestions) {
      console.log("Initial extraction failed, retrying with gemini-2.5-flash...");
      
      const retryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: extractionPrompt },
            { role: "user", content: `Analyze these grant guidelines and extract the Grant DNA Pack. Return ONLY valid JSON:\n\n${guidelines_text.substring(0, 60000)}` },
          ],
        }),
      });
      
      if (retryResponse.ok) {
        const retryResult = await retryResponse.json();
        console.log("Retry response structure:", JSON.stringify({
          hasChoices: !!retryResult.choices,
          hasContent: !!retryResult.choices?.[0]?.message?.content,
          contentLength: retryResult.choices?.[0]?.message?.content?.length,
        }, null, 2));
        
        const retryContent = retryResult.choices?.[0]?.message?.content;
        if (retryContent) {
          const jsonMatch = retryContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              suggestions = JSON.parse(jsonMatch[0]);
              console.log("Successfully parsed from retry response");
            } catch (parseError) {
              console.error("Failed to parse retry JSON:", parseError);
              console.error("Retry raw match (first 1000 chars):", jsonMatch[0].substring(0, 1000));
            }
          }
        }
      } else {
        console.error("Retry request failed:", retryResponse.status);
      }
    }

    if (!suggestions) {
      await supabaseAdmin
        .from("grant_versions")
        .update({ ai_analysis_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to parse extraction response after all attempts");
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

    console.log("Step 3: Generating rubric + required inputs driven research pipeline...");

    // ========== AI CALL #2: Generate Research Pipeline ==========
    const grantName = (grantVersion as any).grant?.name || "Grant";
    const rubricSections = suggestions.rubric?.sections || [];
    
    // Format rubric and required inputs as JSON for authoritative inputs
    const formattedRequiredInputs = JSON.stringify(suggestions.required_inputs || [], null, 2);
    const formattedRubricJson = JSON.stringify(suggestions.rubric || { sections: [] }, null, 2);
    
    const formattedRubric = rubricSections.map((s: any) => 
      `## ${s.title} ${s.weight ? `(${s.weight}% weight)` : ''}\n${s.description || ''}\nCriteria: ${(s.criteria || []).join('; ')}`
    ).join('\n\n');

    const modulesDescription = selectedModules.map(m => 
      `- ${m.role_name}: ${m.role_goal}`
    ).join('\n');

    const pipelinePrompt = `You are an expert at designing high-quality, assessor-ready grant research + grant-writing pipelines for Australian grant applications.

You will be given:

Grant Name: ${grantName}

Archetype: ${archetype}

Grant Summary: ${suggestions.grant_summary || 'Grant application'}

Required Inputs JSON: ${formattedRequiredInputs}

Rubric JSON: ${formattedRubricJson}

Grant Guidelines (raw text): ${guidelines_text.substring(0, 15000)}

Selected Archetype Modules:
${modulesDescription}

========== OBJECTIVE ==========

Generate a pipeline that produces:

1. Auditable external evidence (sources + calculations), AND
2. Grant-writer artefacts that map directly to rubric + required inputs, AND
3. A final assembled report that reads like a professional grant submission support document (not a research memo).

This pipeline must generalise to ANY grant archetype by including a mandatory "Grant Writer Core" plus archetype-specific modules.

========== WRITER STANCE CONTRACT ==========

You are a professional grant writer (10+ years Australian government funding experience) and a commercialisation analyst. Your audience is expert assessors scoring against published criteria.

TONE RULES:
1. No hype or unsubstantiated superlatives—use qualified, evidence-based language.
2. Every assumption must be labelled: (High confidence) / (Medium confidence) / (Low confidence).
3. Always address additionality and counterfactual: what happens without funding vs with funding.
4. Always articulate jurisdiction benefit relevant to the grant: Australian jobs, exports, productivity, sovereign capability, regional impact, health outcomes, emissions reduction, etc.

EVIDENCE RULES:
1. All numeric claims must have a source_id.
2. Preserve source IDs exactly as provided in Step 0 source pack—never renumber or invent IDs.
3. Every source_id used must exist in the consolidated sources list.

OUTPUT RULES:
1. Return ONLY valid JSON (no code fences, no prose outside JSON).
2. First character must be { and last character must be }.
3. Do not include \`\`\` anywhere.

========== ASSESSOR INSIGHT CONTRACT (MANDATORY FOR ALL STEPS) ==========

EVIDENCE-TYPE MATCHING RULE (Non-Negotiable):

| Claim Category | ALLOWED Sources | NEVER Use |
|----------------|-----------------|-----------|
| Market size / market growth / revenue / pricing | Market research firms, industry reports, procurement datasets, official spending stats (PBS/MBS/AIHW), ABS industry accounts, company annual reports, regulator price lists | Epidemiology studies, disease burden papers |
| Disease burden / incidence / mortality / prevalence | Government health statistics, AIHW, Cancer Australia, WHO, peer-reviewed epidemiology, clinical registries | Market reports, company financials |
| Regulatory pathway / approval / reimbursement | TGA/FDA/EMA guidance, PBS/HTA documents, standards bodies, official policy docs | General news, press releases |
| Competitor status / product claims | Company filings, regulator databases (ARTG, FDA 510k), clinical trial registries (ANZCTR, ClinicalTrials.gov), official product pages, peer-reviewed publications | Wikipedia, blog posts, undated sources |

If no valid evidence exists for a claim, output exactly:
"Unknown (no validated source found)" + add to unknowns array with:
- what_is_missing: description of the data gap
- what_would_validate: specific source types that would provide validation
- proxy_attempted: true/false + method if attempted

ASSUMPTION DISCIPLINE (all assumptions must be readable + checkable):
- confidence_label: "High" | "Medium" | "Low"
- one_line_justification: Brief explanation of why this confidence level
- replicable_method: Equation or steps that can be verified

COMMERCIAL REALITY LAYER (fill the "researcher gap"):
Every pipeline must produce evidence for:
- Who pays / who decides / adoption pathway (buyer persona)
- Pricing anchors (direct, adjacent, or proxy with methodology)
- Implementation friction + enabling partners
- Regulatory and reimbursement gating steps (where applicable)
- Measurable success outcomes (assessor lens)

COMPETITOR COMPARABILITY FRAMEWORK:
Group competitors as:
- Direct: Same buyer + same use case + same modality/class
- Adjacent: Same buyer OR same use case OR similar modality
- Enablers: Platforms, diagnostics, manufacturing, distribution, integrators

Each competitor entry must include at least ONE of:
- price/pricing_anchor, revenue, TRL/stage, trial_stage, approval_status, reimbursement_status
If not available: mark "Unknown" + list validation sources needed.

ADDITIONALITY + JURISDICTION BENEFIT (universal):
Every report must state:
- Why funding is needed (counterfactual: what will NOT happen otherwise)
- Benefit to jurisdiction (AU jobs, sovereign capability, exports, equity outcomes)
Both must be evidence-supported OR clearly labeled as assumption.

========== FORBIDDEN OUTPUT PATTERNS (HARD BAN) ==========

The following patterns must NEVER appear in ANY step's outputs:
- {TBD} or any {bracketed_placeholder}
- [Insert ...], [Your Company], [PROJECT NAME], [COMPANY]
- "Hypothetical" + any entity name (e.g., "Hypothetical Competitor")
- "Source 1", "Source 2" (use actual source names or source_ids)
- "Unknown..." without proxy attempt OR proxy failure rule compliance
- Empty values like "{}" or "[]" for required numeric fields

REPLACEMENT PROTOCOL (when data is unavailable):
- If entity unknown: output "Not publicly disclosed" or "No named entity identified in available sources"
- If number unknown: Provide a PROXY ESTIMATE with method shown, inputs cited, sensitivity range, and confidence label
- If source unavailable: Add to unknowns[] with "next_best_source" guidance for the applicant
- Never invent hypothetical companies, products, or statistics

========== MANDATORY PROXY PROTOCOL FOR TAM/SAM/SOM ==========

When market sizing data is not directly available, steps MUST use this structure:

{
  "tam_global": {
    "value": number,
    "currency": "USD|AUD",
    "year": 2024,
    "method": "Top-down: [Parent Market] × [Segment Share]",
    "inputs": [
      {"description": "Parent market size", "value": number, "source_id": "S0-X"},
      {"description": "Segment share assumption", "value": 0.XX, "source_id": "S0-Y|ESTIMATE"}
    ],
    "sensitivity": {"low": number, "high": number},
    "confidence": "high|medium|low",
    "source_ids": ["S0-X", "S0-Y"]
  }
}

NEVER output "Unknown" for TAM/SAM/SOM without attempting a proxy calculation using available data.

PROXY FAILURE RULE (Allowed Only After Attempts):
If no valid anchors exist to compute a proxy estimate without violating the Evidence-Type Matching Rule, you may output:
"Proxy not possible (insufficient validated anchors)"

BUT ONLY if you also include in unknowns[]:
- proxy_attempts[]: at least 2 attempted proxy methods with why each fails
- anchors_missing[]: what exact anchors are missing
- next_best_sources[]: what would validate (e.g., HTA submission, procurement listings, PBS item pricing, tender award data, annual report segment revenue)
- recommended_user_inputs[]: what the applicant could supply to unlock a proxy (e.g., expected per-unit cost, target price band, treatable population assumptions)

========== ASSESSOR-GRADE EVIDENCE MODULES (include where relevant) ==========

In addition to the Grant Writer Core steps, include these assessor-grade modules
when the archetype/rubric demands them:

1. market_definition_buyer_pathway
   - buyer_persona: payer / decision-maker / user
   - buying_triggers: what events trigger purchase consideration
   - procurement_path: public tender / direct purchase / reimbursement
   - adoption_constraints: clinical evidence, training, integration
   - implementation_friction: barriers to adoption

2. pricing_willingness_to_pay
   - price_anchors[]: At least 3 (direct, adjacent, or proxy)
   - each anchor: { product/service, price, currency, year, source_id, relevance }
   - proxy_method (if no direct pricing): reimbursement schedules, procurement listings, adjacent categories
   - willingness_to_pay_signals: value-based evidence

3. regulatory_reimbursement_gates (for Health/Clinical/Defence archetypes)
   - pathway_table: stage → evidence_required → typical_time_range → typical_cost_range → source_id
   - adoption_evidence_required: what clinicians/buyers need to see
   - standards_compliance: applicable standards (ISO, TGA, FDA)

4. competitive_landscape_comparability
   - direct_competitors[]: Same buyer + use case + modality
   - adjacent_competitors[]: Overlapping markets
   - enablers[]: Platforms, diagnostics, manufacturing partners
   - each entry must include: { name, url, one_measurable (price/revenue/TRL/trial_stage/approval_status), source_id, differentiator }
   - differentiators must be measurable outcomes (not adjectives)

5. tam_sam_som_dual_methodology
   - top_down: { value, method: "Parent market × segment share", inputs[], source_ids[] }
   - bottom_up: { value, method: "Incidence × treatable pop × price × penetration", inputs[], source_ids[] }
   - reconciliation: explanation of differences if methods diverge
   - sensitivity: { low, mid, high } with confidence labels

6. delivery_risk_mitigations
   - risk_register[]: { risk, likelihood, impact, mitigation, owner, evidence_of_precedent }
   - align risks to rubric sections
   - mitigations must reference partners, standards, or precedent pathways

7. partner_mapping_with_evidence
   - partners[]: { name, role_in_delivery, url, validating_source_id, capability_gap_filled }
   - each partner must have at least one validating source OR be marked "Unknown (validation needed)"
   - capability_gaps: what partners are missing

========== MANDATORY PIPELINE DESIGN (applies to ALL grants) ==========

You MUST include the following "GRANT WRITER CORE" steps in every pipeline, in this order (after Step 0):

Step 0: build_source_pack (always first)
  - Curate 12-25 high-quality evidence sources relevant to the research domain.

Core Steps (must always exist, names must match exactly):

Step 1: rubric_traceability_matrix
  - Map each rubric criterion → required evidence types → where it will be addressed in the report.
  - Output: rubric_mapping[], required_inputs_mapping[], gaps[], mitigations[]

Step 2: assessor_insight_layer
  - For each rubric section, generate deep assessor intelligence
  - OUTPUT MUST INCLUDE:
    - assessor_intent: 1-2 sentences on what the assessor is really testing for
    - typical_failure_modes[]: at least 5 concrete failure patterns (not generic)
    - what_good_looks_like[]: measurable success indicators
    - evidence_plan[]: criterion → evidence type → likely sources mapping
    - applicant_requests[]: questions to ask applicant to de-risk unknowns
    - red_flags[]: what triggers scoring penalties

Step 3: assumptions_register
  - Produces a structured list of assumptions + confidence + sensitivity notes.

Step 4: comparables_market_signals
  - Identify comparables classified as: direct | adjacent | enabler
  - Minimum direct comparables = min(3, available_in_market), NOT always 5
  - If fewer than 3 direct exist, require:
    - why_direct_is_limited: explanation of market constraints
    - adjacent_compensations: how adjacent/enabler comparables support assessor evaluation
  - Include 2+ market_signals (investment rounds, regulatory approvals, procurement, revenue) with source_id
  - Output: comparables[], why_direct_is_limited (if applicable), adjacent_compensations[], search_strategy_if_limited, market_signals[], unknowns[]

  EVIDENCE-TYPE RULE FOR COMPARABLES:
  | Signal Type | ALLOWED Sources |
  |-------------|-----------------|
  | Investment rounds | Credible databases (Crunchbase, PitchBook), SEC/ASIC filings, reputable business press (AFR, WSJ, Reuters) |
  | Regulatory approvals | Regulator databases (ARTG, FDA 510k, TGA, EMA) |
  | Procurement | Tender databases (AusTender, state procurement portals, BuySMARTer), contract award notices |
  | Revenue/pricing | Annual reports, SEC filings, official price lists, PBS schedules |

Step 5: additionality_and_benefit_case
  - Produces the counterfactual, need for funding, and jurisdiction benefit logic aligned to rubric weighting.
  - OUTPUT MUST INCLUDE:
    - counterfactual_story: { without_funding: narrative, with_funding: narrative, causal_chain: string[] }
    - additionality_proofs[]: evidence that would prove additionality (letters, co-funding commitments, procurement pathway constraints, etc.)
    - jurisdiction_benefit_metrics[]: measurable metrics aligned to grant (jobs, exports, health outcomes, emissions, etc.) with target ranges
    - time_to_impact: { min_years, max_years, sources_or_assumptions[] }

Step 6: commercialisation_logic
  - TRL pathway + milestones + dependencies (regulatory, manufacturing, standards)
  - Output: trl_pathway[], milestones[], dependency_risks[], additionality_case, australia_benefit_case{}

Step 7: risk_register_and_governance
  - Key risks, mitigations, owners, governance approach, compliance constraints.

Step 8: budget_logic_and_value_for_money
  - Budget narrative logic: cost categories, co-contribution logic, value-for-money rationale (no invented numbers unless sourced).

After the core steps, include archetype-specific research modules chosen from the selected modules above, such as:
- market_need_quantification (with PROXY PROTOCOL for TAM/SAM/SOM)
- competitor_and_alternatives (real named entities only, no hypotheticals)
- tam_sam_som_analysis (mandatory proxy estimates if direct data unavailable)
- regulatory_and_pathway (for health/clinical/defence)
- partner_stakeholder_mapping
- impact_model (economic, social, climate)
- workforce_and_capability
- infrastructure_and_procurement

Final Steps (must exist):

N-1: report_assembly
  - Assembles an assessor-ready markdown report that explicitly follows rubric + required inputs coverage.
  - Must instruct the model to write like a grant writer and to explicitly reference rubric sections by title.

N: finalize_citations
  - Inputs: {{step0}} (source pack), {{stepN-1}} (assembled report markdown), all prior step_outputs
  - Must produce JSON with:
    - report_markdown_clean: same report content with in-text citations converted to APA-style hyperlinks and NO bracketed internal source IDs
    - references_apa[]: complete validated reference list, no malformed entries
    - citation_audit[]: array where each item includes:
      - in_text_marker: original marker found (e.g., [S0-1])
      - source_id: mapped source ID
      - evidence_type_category: market|clinical|regulatory|competitor|other
      - appears_in_references: true/false
      - compliant_with_evidence_type_rule: true/false

  TRANSFORMATION RULES:
  1. Replace any [S0-1] style tokens with (Author, Year) hyperlinked to the source URL
  2. If author/year missing, use (Publisher, n.d.)
  3. If URL missing, hyperlink omitted and note in references as "URL not available"
  4. If a bracketed token references a non-existent source_id, replace with (Source not validated) and log in audit

  HARD BAN: No [ ] bracketed source tokens may remain anywhere in report_markdown_clean.
  Final validation: regex scan for /\[S\d+-\d+\]/ or /\[ARTICLE-\d+\]/ must return zero matches.

IMPORTANT: Do NOT include HTML assembly steps in this pipeline—those are added automatically downstream.

========== MANDATORY PROMPT TEMPLATE STRUCTURE (for EVERY step) ==========

Each step's prompt_template MUST be at least 1,500 characters and include ALL of:

1. Start with: "STEP N — [Purpose]"

2. Include an INPUTS section listing required variables (e.g., {{summary}}, {{grantRubric}}, {{requiredInputs}}, {{step0}}, etc.)

3. Include HARD RULES (5+ explicit constraints):
   - Do NOT invent facts or numbers.
   - NEVER use placeholder tokens like {TBD}, [Insert...], [Company], Hypothetical [X].
   - If entity cannot be found, output "Not publicly disclosed" or "No named entity identified".
   - Show methods for calculations and proxy estimates with sensitivity ranges.
   - All numeric claims must have source_id.
   - Output valid JSON only.

4. Include FORBIDDEN PATTERNS section:
   - {TBD}, [Insert...], [PROJECT NAME], [COMPANY], Hypothetical [Entity]
   - Source 1, Source 2 (use actual names)
   - "Unknown" without proxy attempt for numeric fields

5. Include PROXY PROTOCOL section (for steps with numeric outputs):
   - If direct data unavailable: state "Direct data not publicly available"
   - Provide 1-3 conservative proxy methods with formulas
   - Cite proxy inputs with source_id
   - Label confidence + sensitivity range

6. Include UNKNOWN HANDLING protocol (unknowns array + what's needed to validate).

7. Include OUTPUT JSON SCHEMA with exact fields, types, and constraints.

8. EVIDENCE-TYPE CHECK (add before OUTPUT SCHEMA):
   "Before writing, verify each claim uses the correct evidence type per the 
    Evidence-Type Matching Rule. If evidence type mismatch is detected 
    (e.g., using epidemiology for market sizing), replace the claim with 
    'Unknown (evidence type mismatch)' and log it to unknowns[]."

9. ASSESSOR INSIGHT OUTPUT CHECK (add at end):
   "Before finalizing output, verify it does NOT read like a generic summary. 
    If output is generic, rewrite to include:
    - Decision implications (who decides, why, when)
    - Quantified constraints (not vague qualifiers)
    - Validated anchors with source_ids
    - Explicit unknowns with proxy methods where attempted"

10. DECISION-GRADE SPECIFICITY RULE:
   "For any recommendation or strategic claim, include at least ONE of:
    - A decision threshold (e.g., 'adoption requires X evidence', 'reimbursement requires Y outcome data')
    - A quantified range (low/high) with method documented
    - A gating dependency (regulatory milestone, procurement stage, clinical evidence level, standards certification)
    
    If none can be provided, label it as 'Unknown (decision criteria not established)' and add to unknowns[] with what_would_validate.
    
    REJECT generic phrases like 'significant market opportunity', 'strong competitive position', 'considerable potential' unless accompanied by quantified thresholds."

10. SOURCE ID RULES (strengthen existing):
   "Internal placeholders like [article], [Source1], {TBD}, [ARTICLE-1], or 
    bracketed source markers are FORBIDDEN in outputs.
    Only use source IDs from the Source Pack format S#-# (e.g., S0-1, S0-2).
    NEVER invent source IDs. If a source_id cannot be found, use 'Unknown (no source)' 
    and add to unknowns[]."

========== APPROVED VARIABLES ==========
Only these variables may appear in prompt_template INPUTS/HARD RULES:
{{summary}}, {{publicArticleUrl}}, {{articleContent}}, {{trl}}, {{ipStatus}},
{{grantName}}, {{grantVersionLabel}}, {{grantGuidelines}}, {{grantRubric}}, {{grantSummary}},
{{requiredInputs}}, {{sources}}, {{unknowns}}, {{step0}}, {{step1}}, {{step2}}, etc.

========== QUALITY GATES (must satisfy) ==========
1. Every rubric section and criterion must be addressed by at least one step (explicitly).
2. Every required input key must be mapped to a report section in rubric_traceability_matrix.
3. assessor_insight_layer must exist and cover all rubric sections.
4. comparables_market_signals must identify 5+ named entities or document search strategy.
5. commercialisation_logic must include TRL pathway and additionality case.
6. TAM/SAM/SOM analysis must use PROXY PROTOCOL if direct data unavailable.
7. No forbidden patterns may appear in any prompt template.
8. report_assembly must instruct the model to write like a grant writer.
9. finalize_citations must ensure no placeholder tokens remain.

Output integrity rules:
- step_number sequential from 0 with no gaps
- step_name snake_case unique
- include at least 12 total steps (9 core + archetype modules + 2 final)
- include all Grant Writer Core steps
- include final report_assembly and finalize_citations steps

Return JSON:
{
  "pipeline_name": "string",
  "pipeline_description": "string",
  "system_prompt": "string",
  "steps": [
    {
      "step_number": 0,
      "step_name": "build_source_pack",
      "step_description": "string",
      "prompt_template": "string (1,500+ chars with PROXY PROTOCOL and FORBIDDEN PATTERNS)",
      "model_tier": "lite" | "balanced" | "pro"
    }
  ]
}

Now generate the pipeline steps using the Grant Writer Core structure, adding archetype-specific modules where relevant.`;

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

    // ========== Validate mandatory Grant Writer Core steps exist ==========
    console.log("Step 3.5: Validating mandatory Grant Writer Core steps...");
    const stepNames = pipelineData.steps.map((s: any) => s.step_name);
    
    // Define the mandatory Grant Writer Core steps (updated with assessor-grade requirements)
    const GRANT_WRITER_CORE_STEPS = [
      { name: 'build_source_pack', step: 0, description: 'Curate 12-25 high-quality evidence sources' },
      { name: 'rubric_traceability_matrix', step: 1, description: 'Map rubric criteria → evidence types → report location' },
      { name: 'assessor_insight_layer', step: 2, description: 'Generate assessor intent, failure modes, evidence plan per rubric section' },
      { name: 'assumptions_register', step: 3, description: 'Structured assumptions + confidence + sensitivity' },
      { name: 'comparables_market_signals', step: 4, description: 'Identify 5+ named comparables + 2+ market signals with source_ids' },
      { name: 'additionality_and_benefit_case', step: 5, description: 'Counterfactual, funding need, jurisdiction benefit' },
      { name: 'commercialisation_logic', step: 6, description: 'TRL pathway, milestones, dependencies, additionality template' },
      { name: 'risk_register_and_governance', step: 7, description: 'Risks, mitigations, governance, compliance' },
      { name: 'budget_logic_and_value_for_money', step: 8, description: 'Budget narrative, co-contribution, VFM rationale' }
    ];
    
    // Check for each mandatory core step
    for (const coreStep of GRANT_WRITER_CORE_STEPS) {
      if (!stepNames.includes(coreStep.name)) {
        console.warn(`Missing ${coreStep.name} step - adding default`);
        pipelineData.steps.splice(coreStep.step, 0, createDefaultCoreStep(coreStep.name, coreStep.step, coreStep.description));
      }
    }
    
    // Check for final mandatory steps
    if (!stepNames.includes('report_assembly')) {
      console.warn("Missing report_assembly step - will be added at end");
    }
    if (!stepNames.includes('finalize_citations')) {
      console.warn("Missing finalize_citations step - will be added at end");
    }

    // Re-number steps to ensure sequential ordering
    pipelineData.steps.sort((a: any, b: any) => a.step_number - b.step_number);
    pipelineData.steps.forEach((step: any, index: number) => {
      step.step_number = index;
    });

    // Check minimum step count (updated for new core structure)
    if (pipelineData.steps.length < 10) {
      console.warn(`Only ${pipelineData.steps.length} steps generated - pipeline may need enhancement`);
    }

    console.log("Step 4: Validating and enhancing prompt quality...");

    // Quality validation and auto-enhancement
    const stepsNeedingEnhancement: number[] = [];
    for (const step of pipelineData.steps) {
      const score = calculateQualityScore(step.prompt_template);
      const hasForbidden = score.forbiddenPatterns.length > 0;
      console.log(`Step ${step.step_number} (${step.step_name}): quality=${score.total}, level=${score.level}, length=${step.prompt_template.length}, forbidden=${hasForbidden ? score.forbiddenPatterns.join(',') : 'none'}`);
      // Enhance any step that isn't 'good' (score < 70), is under 1500 chars, or has forbidden patterns
      if (score.level !== 'good' || step.prompt_template.length < 1500 || hasForbidden) {
        stepsNeedingEnhancement.push(step.step_number);
      }
    }

    // Auto-enhance low-quality prompts
    if (stepsNeedingEnhancement.length > 0) {
      console.log(`Auto-enhancing ${stepsNeedingEnhancement.length} prompts that don't meet quality standards...`);

      const enhancementPrompt = `You are an expert at improving research prompts for grant applications.

${PROMPT_QUALITY_TEMPLATE}

${PROMPT_REFERENCE_EXAMPLE}

The following prompts need quality improvement. For each prompt, enhance it to include ALL of these:
1. A "STEP N — [Purpose]" header with INPUTS section
2. A "HARD RULES:" section with 5+ explicit constraints
3. A "FORBIDDEN PATTERNS:" section explicitly banning: {TBD}, [Insert...], [PROJECT NAME], Hypothetical [X], Source 1/2
4. A "PROXY PROTOCOL:" section for numeric fields (TAM/SAM/SOM, market sizes, economic impact):
   - If direct data unavailable, provide conservative proxy estimate
   - Show calculation method and inputs with source_ids
   - Include sensitivity range and confidence label
5. An "UNKNOWN HANDLING:" section (unknowns array + next_best_source guidance)
6. An "OUTPUT JSON SCHEMA:" with exact field definitions

CRITICAL REQUIREMENTS:
- Each enhanced prompt MUST be at least 1,500 characters (this is mandatory)
- Template variables {{...}} are ONLY for INPUTS or HARD RULES sections
- NEVER include {{variable}} inside OUTPUT SCHEMA field descriptions
- Follow the exact structure from the REFERENCE EXAMPLE

========== ENHANCED QUALITY SCORING (must pass before output is considered 'good') ==========

1. EVIDENCE-TYPE COMPLIANCE SCORE (new):
   - Detect if market sizing references contain epidemiology paper citations (penalty: -15)
   - Detect if numeric claims lack source_ids (penalty: -5 per missing)
   - Detect if competitor entries lack measurable data points (penalty: -3 per entry)
   Formula: 100 - sum(penalties), minimum 0

2. ASSESSOR INSIGHT SCORE (new):
   Requires at least:
   - 1 decision-pathway artifact (buyer persona, procurement path, regulatory gate)
   - 1 sensitivity range for numeric estimates
   - 1 explicit unknown with "what_would_validate" guidance
   
   If missing any, auto-enhancement MUST rewrite the prompt to force:
   - Add DECISION PATHWAY section requiring buyer/procurement artifacts
   - Add SENSITIVITY ANALYSIS section for numeric outputs
   - Add VALIDATION GAPS section for unknowns with next steps

3. GENERICNESS PENALTY (new):
   Detect these generic patterns and penalize:
   - "significant market opportunity" without numbers (-5)
   - "growing demand" without CAGR/source (-5)
   - "competitive advantage" without measurable differentiator (-5)
   - Adjective-only competitor descriptions (-3 per entry)

4. FORBIDDEN PATTERN CHECK (existing, strengthened):
   - {TBD}, [Insert...], [PROJECT NAME], Hypothetical [Entity] → -10 each
   - [S0-1], [ARTICLE-1] in final OUTPUT SCHEMA descriptions → -10 each
   - "Source 1", "Source 2" → -10 each
   - Evidence type mismatch (epi → market) → -15 each

ENHANCEMENT INSTRUCTIONS (if score < 70):

For prompts failing EVIDENCE-TYPE COMPLIANCE:
- Add explicit "EVIDENCE-TYPE MATCHING" section with the claim-source mapping table
- Add instruction: "Cross-check every market/revenue claim against source type before output"

For prompts failing ASSESSOR INSIGHT SCORE:
- Add "COMMERCIAL REALITY REQUIREMENTS" section mandating buyer pathway and pricing anchors
- Add "SENSITIVITY RANGE REQUIREMENT" for all numeric estimates
- Add "UNKNOWN DOCUMENTATION" section with what_is_missing + what_would_validate format

For prompts failing GENERICNESS check:
- Add "ANTI-GENERICNESS RULES" section:
  * Replace "significant" with specific numbers or ranges
  * Replace "growing" with CAGR % and source
  * Replace adjective-based differentiators with measurable outcomes

FORBIDDEN OUTPUT PATTERNS (these must be explicitly banned in HARD RULES):
- {TBD} or any {bracketed_placeholder}
- [Insert ...], [Your Company], [PROJECT NAME], [COMPANY]
- "Hypothetical" + any entity name
- "Source 1", "Source 2" (use actual source names)
- "Unknown (no validated source found)" without proxy attempt

REPLACEMENT PROTOCOL (include in enhanced prompts):
- If entity unknown: "Not publicly disclosed" or "No named entity identified"
- If number unknown: Provide proxy estimate with method shown
- If source unavailable: Add to unknowns[] with "next_best_source" guidance

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

Return JSON: {"enhancements": [{ "step_number": N, "enhanced_prompt": "..." }, ...]}`;

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

    // Validate finalize_report_html step for 4-step assembly architecture
    // Assembly steps: +1 = assemble_sections, +2 = build_tables, +3 = clean_citations_apa, +4 = finalize
    console.log("Step 5.5: Validating assembly step consistency (4-step architecture)...");
    
    const finalizeStep = assemblySteps.find((s: any) => s.step_name === "finalize_report_html");
    const cleanCitationsStep = assemblySteps.find((s: any) => s.step_name === "clean_citations_apa");
    
    const validationErrors: string[] = [];
    
    // Validate clean_citations_apa step exists
    if (!cleanCitationsStep) {
      validationErrors.push("Missing clean_citations_apa step (required for APA citation transformation)");
    }
    
    if (finalizeStep) {
      const prompt = finalizeStep.prompt_template;
      // Finalize should reference +1 (for data_gaps from assemble) and +3 (for cleaned HTML from clean_citations_apa)
      const expectedHtmlStep = `{{step${maxStepBeforeAssembly + 1}}}`;
      const expectedCleanedStep = `{{step${maxStepBeforeAssembly + 3}}}`;
      
      if (!prompt.includes(expectedHtmlStep)) {
        validationErrors.push(`Missing reference to ${expectedHtmlStep} (assemble_sections_html)`);
      }
      if (!prompt.includes(expectedCleanedStep)) {
        validationErrors.push(`Missing reference to ${expectedCleanedStep} (clean_citations_apa output)`);
      }
      if (!prompt.includes('"report_html"')) {
        validationErrors.push("Missing 'report_html' field in OUTPUT SCHEMA");
      }
    } else {
      validationErrors.push("Missing finalize_report_html step");
    }
    
    if (validationErrors.length > 0) {
      console.error("Assembly validation failed:", validationErrors);
      // finalize_report_html is now at index 3 (4-step assembly)
      const correctTemplate = createHtmlAssemblySteps(maxStepBeforeAssembly)[3];
      const insertIdx = stepsToInsert.findIndex((s: any) => s.step_name === "finalize_report_html");
      if (insertIdx !== -1 && correctTemplate) {
        console.log("Auto-fixing finalize_report_html step...");
        stepsToInsert[insertIdx].prompt_template = correctTemplate.prompt_template;
      }
    } else {
      console.log("Assembly step validation passed ✓ (4-step architecture with APA citations)");
    }

    // ========== Variable Flow Validation ==========
    console.log("Step 5.6: Validating variable flow consistency...");
    
    // Build required inputs list from grant version
    const requiredInputsList: { key: string; label: string }[] = suggestions.required_inputs || [];
    
    // Create validation-compatible step format
    const stepsForValidation = stepsToInsert.map((s: any) => ({
      step_number: s.step_number,
      step_name: s.step_name,
      prompt_template: s.prompt_template,
      step_type: s.step_type
    }));
    
    // Extract dynamic input keys from required inputs
    const dynamicInputKeys = new Set(requiredInputsList.map(r => r.key));
    
    // Base variables always available
    const baseVariables = [
      'summary', 'publicArticleUrl', 'articleContent', 'trl', 'ipStatus',
      'grantName', 'grantVersionLabel', 'grantGuidelines', 'grantRubric', 
      'grantRubricJson', 'grantSummary', 'requiredInputs', 'sources', 'unknowns'
    ];
    
    const variableFlowErrors: { step: number; name: string; errors: string[] }[] = [];
    const totalStepsCount = stepsForValidation.length;
    
    for (const step of stepsForValidation) {
      // Skip Firecrawl steps (they don't use template variables the same way)
      if (step.step_type === 'firecrawl_scrape' || step.step_type === 'firecrawl_search') {
        continue;
      }
      
      // Extract variables from prompt
      const variableMatches = step.prompt_template.match(/\{\{(\w+)\}\}/g) || [];
      const usedVariables = [...new Set(variableMatches.map((m: string) => m.replace(/\{\{|\}\}/g, '')))];
      
      // Build available variables for this step
      const available = new Set([...baseVariables, ...dynamicInputKeys]);
      for (let i = 0; i < step.step_number; i++) {
        available.add(`step${i}`);
      }
      
      const stepErrors: string[] = [];
      
      for (const varName of usedVariables) {
        // Check for step references
        const stepMatch = varName.match(/^step(\d+)$/);
        if (stepMatch) {
          const refStepNum = parseInt(stepMatch[1], 10);
          if (refStepNum >= step.step_number) {
            stepErrors.push(`Forward reference: {{${varName}}} (step ${step.step_number} cannot reference step ${refStepNum})`);
          } else if (refStepNum >= totalStepsCount) {
            stepErrors.push(`Invalid reference: {{${varName}}} (step ${refStepNum} does not exist)`);
          }
          continue;
        }
        
        // Check if variable is available
        if (!available.has(varName)) {
          stepErrors.push(`Unresolved variable: {{${varName}}} not in base variables or required inputs`);
        }
      }
      
      if (stepErrors.length > 0) {
        variableFlowErrors.push({
          step: step.step_number,
          name: step.step_name,
          errors: stepErrors
        });
      }
    }
    
    if (variableFlowErrors.length > 0) {
      console.warn(`Variable flow validation found ${variableFlowErrors.length} steps with issues:`);
      for (const v of variableFlowErrors) {
        console.warn(`  Step ${v.step} (${v.name}): ${v.errors.join('; ')}`);
      }
      
      // Auto-fix: Replace unresolved variables with extraction instructions
      for (const issue of variableFlowErrors) {
        const stepIdx = stepsToInsert.findIndex((s: any) => s.step_number === issue.step);
        if (stepIdx !== -1) {
          let prompt = stepsToInsert[stepIdx].prompt_template;
          
          for (const error of issue.errors) {
            const varMatch = error.match(/\{\{(\w+)\}\}/);
            if (varMatch) {
              const varName = varMatch[1];
              const isRequiredInput = dynamicInputKeys.has(varName.toLowerCase());
              
              if (isRequiredInput) {
                // Replace with extraction instruction
                const pattern = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
                prompt = prompt.replace(
                  pattern,
                  `[Extract "${varName}" from requiredInputs if provided, otherwise use "Not specified"]`
                );
              } else if (!error.includes('Forward reference')) {
                // Replace with generic instruction
                const pattern = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
                const readable = varName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
                prompt = prompt.replace(
                  pattern,
                  `[The ${readable} - derive from available context or mark as "Not available"]`
                );
              }
            }
          }
          
          stepsToInsert[stepIdx].prompt_template = prompt;
          console.log(`Auto-fixed unresolved variables in step ${issue.step}`);
        }
      }
    } else {
      console.log("Variable flow validation passed ✓ (all variables resolve correctly)");
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
