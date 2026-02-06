/**
 * GrantBundle Architect: Universal Pipeline Generator Specification
 * 
 * This specification defines a reusable system for generating prompt bundles
 * for ANY grant type (commercialisation, R&D, infrastructure, social impact, etc.)
 * 
 * The generated bundles behave like a professional grant writer for assessors,
 * not like an academic researcher.
 */

// ============================================================================
// GRANT ARCHETYPES
// ============================================================================

export const GRANT_ARCHETYPES = [
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

export type GrantArchetype = typeof GRANT_ARCHETYPES[number];

export const ARCHETYPE_KEYWORDS: Record<GrantArchetype, string[]> = {
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
// GRANT DNA PACK SCHEMA
// ============================================================================

export interface GrantDNAPack {
  program_profile: {
    name: string;
    jurisdiction: "AU-Federal" | "AU-State" | "AU-Territory" | "International" | "Unknown";
    applicant_type: ("SME" | "Researcher" | "University" | "Consortium" | "Non-profit" | "Government" | "Unknown")[];
    funding_type: "Grant" | "Loan" | "Matched" | "Co-investment" | "Tax incentive" | "Unknown";
    assessor_type: "Panel" | "Expert" | "Peer-reviewed" | "Automated" | "Unknown";
  };
  evaluation_criteria_map: {
    criteria: {
      key: string;
      title: string;
      weight: number | null;
      pass_threshold: string;
      assessor_questions: string[];
    }[];
  };
  compliance_rules: {
    mandatory_sections: string[];
    forbidden_claims: string[];
    formatting_constraints: string[];
    attachments_required: string[];
  };
  claim_evidence_policy: {
    claim_categories: string[];
    minimum_evidence_standard: Record<string, string>;
    allowed_source_classes: string[];
  };
  narrative_strategy: {
    story_spine: string;
    additionality: string;
    jurisdiction_benefit: string;
  };
  missing_info: string[];
  detected_archetype: GrantArchetype;
  archetype_confidence: "high" | "medium" | "low";
}

// ============================================================================
// WRITER STANCE CONTRACT
// ============================================================================

export interface WriterStanceContract {
  persona: string;
  audience: string;
  tone_rules: string[];
  evidence_rules: string[];
  output_constraints: string[];
}

export const DEFAULT_WRITER_STANCE_CONTRACT: WriterStanceContract = {
  persona: "Professional grant writer with 10+ years Australian government funding experience",
  audience: "Expert grant assessors evaluating applications against published criteria",
  tone_rules: [
    "No hype or unsubstantiated superlatives—use qualified, evidence-based language",
    "Assumptions must be labeled with confidence level: (High confidence), (Medium confidence), (Low confidence)",
    "If a claim is not supported by an allowed source_id, output: 'Unknown (no validated source found)'",
    "Always address additionality: why funding is needed and what would not happen without it",
    "Always articulate jurisdiction benefit: Australian jobs, exports, sovereign capability, or other national interests"
  ],
  evidence_rules: [
    "All numeric claims MUST have a corresponding source_id",
    "Preserve source IDs exactly as provided—never renumber or modify them",
    "No placeholders like 'Source1', '[insert]', '{TBD}' or 'article' are permitted",
    "Every source_id used must exist in the consolidated sources list",
    "When specific data is unavailable, provide proxy estimates with methodology shown"
  ],
  output_constraints: [
    "Return ONLY valid JSON—no markdown code fences, no prose outside JSON",
    "First character must be {, last character must be }",
    "Do NOT include ``` anywhere in output",
    "All field names must match the specified OUTPUT SCHEMA exactly"
  ]
};

export function generateWriterStancePreamble(wsc: WriterStanceContract = DEFAULT_WRITER_STANCE_CONTRACT): string {
  return `
=== WRITER STANCE CONTRACT ===
You are ${wsc.persona}.
Your audience: ${wsc.audience}.

TONE RULES:
${wsc.tone_rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

EVIDENCE RULES:
${wsc.evidence_rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

OUTPUT CONSTRAINTS:
${wsc.output_constraints.map((r, i) => `${i + 1}. ${r}`).join('\n')}
=== END WRITER STANCE CONTRACT ===
`;
}

// ============================================================================
// MODULE LIBRARY
// ============================================================================

export interface ModuleDefinition {
  module_name: string;
  when_to_include: GrantArchetype[];
  always_include: boolean;
  provides_outputs: string[];
  depends_on: string[];
  step_template: StepRoleTemplate;
}

export interface StepRoleTemplate {
  role_name: string;
  role_goal: string;
  phase: "intake" | "research" | "argument_build" | "assembly" | "qa" | "render";
  inputs: string[];
  outputs_schema: Record<string, unknown>;
  hard_rules: string[];
  prompt_template: string;
  model_tier: "lite" | "balanced" | "pro";
}

export const MODULE_LIBRARY: ModuleDefinition[] = [
  // === UNIVERSAL MODULES (all archetypes) ===
  {
    module_name: "evidence_source_pack",
    when_to_include: [...GRANT_ARCHETYPES],
    always_include: true,
    provides_outputs: ["sources", "unknowns", "source_categories_found"],
    depends_on: [],
    step_template: {
      role_name: "build_source_pack",
      role_goal: "Curate 12-25 high-quality sources relevant to the research domain",
      phase: "intake",
      inputs: ["{{summary}}", "{{grantGuidelines}}", "{{firecrawl_results}}"],
      outputs_schema: {
        sources: [{
          source_id: "string (format: S0-N)",
          title: "string",
          publisher: "string",
          url: "string or 'URL not available'",
          date_accessed: "string (YYYY-MM-DD)",
          relevance: "string",
          confidence: "'high' | 'medium' | 'low'"
        }],
        unknowns: ["string"],
        source_categories_found: {
          authoritative_gov: "number",
          academic: "number",
          industry: "number",
          market_reports: "number"
        }
      },
      hard_rules: [
        "Prefer Australian authoritative sources first (ABS, AIHW, data.gov.au, CSIRO)",
        "Every source MUST have a valid URL or explicit 'URL not available'",
        "Do NOT invent sources—only include what you can validate",
        "Mark confidence: 'high' (verified URL), 'medium' (known publisher), 'low' (unverified)",
        "Include unknowns array listing source types you couldn't find",
        "NEVER use placeholder text like '[Source Title]' or '{URL}'"
      ],
      prompt_template: `STEP N — Build Source Pack (Australia-first, domain-agnostic)

You are a grant-commercialisation analyst. Your task is to curate a Source Pack of 12–25 high-quality sources relevant to the research domain.

{{WRITER_STANCE_PREAMBLE}}

INPUTS:
- Research summary: {{summary}}
- Grant guidelines: {{grantGuidelines}}
- Firecrawl search results: {{firecrawl_results}}

HARD RULES:
- Do NOT invent facts or numbers.
- Only include sources you can validate as real and relevant.
- Prefer Australian authoritative sources first when applicable.
- If you cannot find a source type, record it in the unknowns array.
- NEVER use placeholder text like "[Source Title]" or "{URL}".

SOURCE PACK REQUIREMENTS:
Return 12–25 sources total (max 25). Include, where relevant:
A) Australia-first authoritative sources: ABS, data.gov.au, AIHW, Productivity Commission
B) Sector/standards/peak bodies relevant to the research domain
C) Academic publications, market reports, industry statistics
D) Policy documents and regulatory guidance

FOR EACH SOURCE:
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
      "title": "string",
      "publisher": "string",
      "url": "string",
      "date_accessed": "string",
      "relevance": "string",
      "confidence": "high|medium|low"
    }
  ],
  "unknowns": ["string"],
  "source_categories_found": {
    "authoritative_gov": 0,
    "academic": 0,
    "industry": 0,
    "market_reports": 0
  }
}`,
      model_tier: "balanced"
    }
  },
  {
    module_name: "economic_impact",
    when_to_include: [...GRANT_ARCHETYPES],
    always_include: true,
    provides_outputs: ["jobs_direct", "jobs_indirect", "gdp_contribution", "exports_potential", "tax_revenue"],
    depends_on: ["evidence_source_pack"],
    step_template: {
      role_name: "calculate_economic_impact",
      role_goal: "Calculate Australian economic impact estimates with methodology transparency",
      phase: "research",
      inputs: ["{{sources}}", "{{step0}}", "{{grantName}}"],
      outputs_schema: {
        jobs_direct: { estimate: "number", methodology: "string", source_ids: ["string"], confidence: "string" },
        jobs_indirect: { estimate: "number", methodology: "string", source_ids: ["string"], confidence: "string" },
        gdp_contribution: { estimate_aud: "number", methodology: "string", source_ids: ["string"], confidence: "string" },
        exports_potential: { estimate_aud: "number", methodology: "string", source_ids: ["string"], confidence: "string" },
        tax_revenue: { estimate_aud: "number", methodology: "string", source_ids: ["string"], confidence: "string" },
        regional_impact: { description: "string", source_ids: ["string"] },
        additionality_statement: "string"
      },
      hard_rules: [
        "All numeric estimates MUST show calculation methodology",
        "Use industry multipliers from ABS or Productivity Commission where available",
        "Conservative estimates preferred—do not overstate impact",
        "Include source_ids for every multiplier or assumption used",
        "State additionality: what would NOT happen without this funding"
      ],
      prompt_template: `STEP N — Calculate Economic Impact (Australian focus)

{{WRITER_STANCE_PREAMBLE}}

INPUTS:
- Source pack: {{step0}}
- Grant: {{grantName}}

YOUR TASK:
Calculate Australian economic impact estimates using standard methodologies and citing sources for all assumptions.

HARD RULES:
- All estimates MUST show calculation methodology (e.g., "X FTE × $Y average salary = $Z")
- Use ABS or Productivity Commission multipliers where available
- Conservative estimates preferred—do not overstate
- Include source_ids for every multiplier or assumption
- State additionality: what would NOT happen without funding

REQUIRED CALCULATIONS:
1. Direct jobs: FTE positions directly created by the project
2. Indirect jobs: Using sector-appropriate multiplier
3. GDP contribution: Value added methodology
4. Export potential: Revenue from international markets (if applicable)
5. Tax revenue: Corporate + PAYG estimates

OUTPUT JSON SCHEMA:
{
  "jobs_direct": {
    "estimate": 0,
    "methodology": "X FTE positions based on...",
    "source_ids": ["S0-1"],
    "confidence": "high|medium|low"
  },
  "jobs_indirect": {
    "estimate": 0,
    "methodology": "Direct jobs × multiplier of...",
    "source_ids": ["S0-2"],
    "confidence": "high|medium|low"
  },
  "gdp_contribution": {
    "estimate_aud": 0,
    "methodology": "Value added calculation...",
    "source_ids": ["S0-3"],
    "confidence": "high|medium|low"
  },
  "exports_potential": {
    "estimate_aud": 0,
    "methodology": "X% of revenue from international...",
    "source_ids": ["S0-4"],
    "confidence": "high|medium|low"
  },
  "tax_revenue": {
    "estimate_aud": 0,
    "methodology": "Corporate tax + PAYG estimates...",
    "source_ids": [],
    "confidence": "high|medium|low"
  },
  "regional_impact": {
    "description": "string",
    "source_ids": []
  },
  "additionality_statement": "Without this funding, the project would..."
}`,
      model_tier: "balanced"
    }
  },
  {
    module_name: "stakeholder_mapping",
    when_to_include: [...GRANT_ARCHETYPES],
    always_include: true,
    provides_outputs: ["partners", "collaborators", "end_users", "supply_chain"],
    depends_on: ["evidence_source_pack"],
    step_template: {
      role_name: "map_stakeholders",
      role_goal: "Identify and categorize key stakeholders in the research ecosystem",
      phase: "research",
      inputs: ["{{sources}}", "{{step0}}", "{{summary}}"],
      outputs_schema: {
        partners: [{ name: "string", type: "string", role: "string", url: "string", source_id: "string" }],
        collaborators: [{ name: "string", type: "string", role: "string", url: "string", source_id: "string" }],
        end_users: [{ segment: "string", estimated_size: "string", needs: "string", source_id: "string" }],
        supply_chain: [{ entity: "string", role: "string", australian_content: "boolean", source_id: "string" }],
        partner_capability_gaps: ["string"]
      },
      hard_rules: [
        "Every partner/collaborator MUST have a valid URL or 'URL not available'",
        "Prefer Australian entities where capability exists",
        "Identify capability gaps that may require international partners",
        "Include source_id for each entity mentioned",
        "Do NOT invent organizations—only include verified entities"
      ],
      prompt_template: `STEP N — Map Stakeholders and Partners

{{WRITER_STANCE_PREAMBLE}}

INPUTS:
- Source pack: {{step0}}
- Research summary: {{summary}}

YOUR TASK:
Identify and categorize key stakeholders who would be involved in or benefit from this research/project.

HARD RULES:
- Every partner/collaborator MUST have a valid URL or 'URL not available'
- Prefer Australian entities where capability exists
- Identify capability gaps that may require international partners
- Include source_id for each entity
- Do NOT invent organizations

STAKEHOLDER CATEGORIES:
1. Partners: Organizations formally collaborating on the project
2. Collaborators: Research or industry collaborators
3. End Users: Market segments who will use the outputs
4. Supply Chain: Key suppliers and manufacturers

OUTPUT JSON SCHEMA:
{
  "partners": [
    {"name": "string", "type": "University|Industry|Government|Non-profit", "role": "string", "url": "string", "source_id": "S0-N"}
  ],
  "collaborators": [
    {"name": "string", "type": "string", "role": "string", "url": "string", "source_id": "S0-N"}
  ],
  "end_users": [
    {"segment": "string", "estimated_size": "string", "needs": "string", "source_id": "S0-N"}
  ],
  "supply_chain": [
    {"entity": "string", "role": "string", "australian_content": true, "source_id": "S0-N"}
  ],
  "partner_capability_gaps": ["string"]
}`,
      model_tier: "balanced"
    }
  },

  // === COMMERCIALISATION/INNOVATION MODULES ===
  {
    module_name: "market_sizing",
    when_to_include: ["Commercialisation/Innovation", "Export/Trade", "Health/Clinical Translation"],
    always_include: false,
    provides_outputs: ["tam_global", "tam_au", "sam_au", "som", "methodology"],
    depends_on: ["evidence_source_pack"],
    step_template: {
      role_name: "calculate_market_sizing",
      role_goal: "Calculate TAM/SAM/SOM with transparent methodology and Australian focus",
      phase: "research",
      inputs: ["{{sources}}", "{{step0}}"],
      outputs_schema: {
        tam_global: { value_usd: "number", year: "number", source_id: "string" },
        tam_au: { value_aud: "number", methodology: "string", source_ids: ["string"] },
        sam_au: { value_aud: "number", methodology: "string", source_ids: ["string"] },
        som: { year_1: "number", year_3: "number", year_5: "number", methodology: "string" },
        market_growth_cagr: { percentage: "number", source_id: "string" },
        market_drivers: ["string"],
        market_barriers: ["string"]
      },
      hard_rules: [
        "TAM AU must be calculated from global TAM with explicit methodology shown",
        "SAM must apply realistic segment filters with rationale",
        "SOM must use conservative adoption assumptions (3-15x growth multipliers max)",
        "All values MUST have source_ids—no unsourced numbers",
        "If specific data unavailable, use proxy calculation with methodology shown",
        "NEVER output 'Unknown'—provide conservative estimate instead"
      ],
      prompt_template: `STEP N — Calculate Market Sizing (TAM/SAM/SOM)

{{WRITER_STANCE_PREAMBLE}}

INPUTS:
- Source pack with market research: {{step0}}

YOUR TASK:
Calculate Total Addressable Market, Serviceable Addressable Market, and Serviceable Obtainable Market with full methodology transparency.

HARD RULES:
- TAM AU calculated from global TAM: show AU population/GDP ratio methodology
- SAM applies realistic segment filters (geography, capability, regulatory access)
- SOM uses conservative adoption: 3-15x growth multipliers maximum
- All values MUST have source_ids
- If specific data unavailable, use proxy: "Global TAM × AU GDP ratio (1.6%) = AU TAM"
- NEVER output "Unknown"—provide conservative estimate instead

CALCULATION APPROACH:
1. Global TAM: Find authoritative market size (prefer IBISWorld, Statista, industry reports)
2. AU TAM: Apply GDP ratio (1.6%) or population ratio (0.3%) to global
3. AU SAM: Apply segment filters (typically 15-40% of TAM)
4. SOM: Year 1 (0.1-1%), Year 3 (1-5%), Year 5 (3-10%) of SAM

OUTPUT JSON SCHEMA:
{
  "tam_global": {"value_usd": 0, "year": 2024, "source_id": "S0-N"},
  "tam_au": {"value_aud": 0, "methodology": "Global TAM × 1.6% AU GDP ratio", "source_ids": ["S0-N"]},
  "sam_au": {"value_aud": 0, "methodology": "TAM AU × segment filters...", "source_ids": ["S0-N"]},
  "som": {
    "year_1": 0,
    "year_3": 0,
    "year_5": 0,
    "methodology": "Conservative adoption curve: 0.5% → 2% → 5% of SAM"
  },
  "market_growth_cagr": {"percentage": 0, "source_id": "S0-N"},
  "market_drivers": ["string"],
  "market_barriers": ["string"]
}`,
      model_tier: "balanced"
    }
  },
  {
    module_name: "competitor_analysis",
    when_to_include: ["Commercialisation/Innovation", "R&D/Research", "Health/Clinical Translation"],
    always_include: false,
    provides_outputs: ["competitors", "differentiation", "competitive_position"],
    depends_on: ["evidence_source_pack"],
    step_template: {
      role_name: "analyze_competitors",
      role_goal: "Map competitive landscape with validated URLs and clear differentiation",
      phase: "research",
      inputs: ["{{sources}}", "{{step0}}", "{{summary}}"],
      outputs_schema: {
        competitors: [{
          name: "string",
          url: "string",
          product_description: "string",
          market_position: "string",
          funding_status: "string",
          threat_level: "'high' | 'medium' | 'low'",
          source_id: "string"
        }],
        differentiation_matrix: [{
          feature: "string",
          our_approach: "string",
          competitor_approach: "string",
          advantage: "'our' | 'competitor' | 'parity'"
        }],
        competitive_position_summary: "string",
        competitive_gaps: ["string"]
      },
      hard_rules: [
        "Every competitor MUST have a validated URL or be excluded",
        "Include 5-10 relevant competitors (Australian preferred)",
        "Threat level based on market overlap and capability",
        "Differentiation must be evidence-based, not aspirational",
        "If competitor URL cannot be verified, do NOT include them"
      ],
      prompt_template: `STEP N — Analyze Competitive Landscape

{{WRITER_STANCE_PREAMBLE}}

INPUTS:
- Source pack: {{step0}}
- Research summary: {{summary}}

YOUR TASK:
Map the competitive landscape with validated competitors and clear differentiation analysis.

HARD RULES:
- Every competitor MUST have a validated URL or be excluded
- Include 5-10 relevant competitors (prefer Australian entities)
- Threat level: "high" (direct competitor), "medium" (partial overlap), "low" (adjacent market)
- Differentiation must be evidence-based, not aspirational claims
- Do NOT include competitors whose URLs cannot be verified

OUTPUT JSON SCHEMA:
{
  "competitors": [
    {
      "name": "string",
      "url": "https://...",
      "product_description": "string",
      "market_position": "string",
      "funding_status": "string or 'Not disclosed'",
      "threat_level": "high|medium|low",
      "source_id": "S0-N"
    }
  ],
  "differentiation_matrix": [
    {
      "feature": "string",
      "our_approach": "string",
      "competitor_approach": "string",
      "advantage": "our|competitor|parity"
    }
  ],
  "competitive_position_summary": "string",
  "competitive_gaps": ["Areas where competitors have advantage"]
}`,
      model_tier: "balanced"
    }
  },
  {
    module_name: "ip_regulatory_strategy",
    when_to_include: ["Commercialisation/Innovation", "Health/Clinical Translation", "Defence/Sovereign Capability"],
    always_include: false,
    provides_outputs: ["ip_landscape", "freedom_to_operate", "regulatory_pathway"],
    depends_on: ["evidence_source_pack"],
    step_template: {
      role_name: "analyze_ip_regulatory",
      role_goal: "Assess IP landscape and regulatory pathway requirements",
      phase: "research",
      inputs: ["{{sources}}", "{{step0}}", "{{ipStatus}}"],
      outputs_schema: {
        ip_landscape: {
          existing_patents: [{ title: "string", holder: "string", relevance: "string", source_id: "string" }],
          freedom_to_operate_assessment: "string",
          ip_strategy_recommendation: "string"
        },
        regulatory_pathway: {
          primary_regulator: "string",
          pathway_description: "string",
          estimated_timeline_months: "number",
          key_requirements: ["string"],
          source_ids: ["string"]
        },
        ip_gaps: ["string"]
      },
      hard_rules: [
        "Patent landscape from IP Australia, USPTO, or EPO databases",
        "Regulatory pathway must cite specific legislation or guidance documents",
        "Timeline estimates must be conservative and sourced",
        "Freedom to operate is preliminary assessment only—not legal advice",
        "Include source_id for every patent and regulatory reference"
      ],
      prompt_template: `STEP N — Analyze IP and Regulatory Pathway

{{WRITER_STANCE_PREAMBLE}}

INPUTS:
- Source pack: {{step0}}
- Current IP status: {{ipStatus}}

YOUR TASK:
Assess the intellectual property landscape and identify regulatory pathway requirements.

HARD RULES:
- Patent landscape from IP Australia, USPTO, or EPO databases
- Regulatory pathway must cite specific legislation or guidance
- Timeline estimates must be conservative and sourced
- Freedom to operate is preliminary—not legal advice
- Include source_id for every patent and regulatory reference

OUTPUT JSON SCHEMA:
{
  "ip_landscape": {
    "existing_patents": [
      {"title": "string", "holder": "string", "relevance": "string", "source_id": "S0-N"}
    ],
    "freedom_to_operate_assessment": "Preliminary assessment suggests...",
    "ip_strategy_recommendation": "string"
  },
  "regulatory_pathway": {
    "primary_regulator": "TGA|APVMA|ACMA|etc.",
    "pathway_description": "string",
    "estimated_timeline_months": 0,
    "key_requirements": ["string"],
    "source_ids": ["S0-N"]
  },
  "ip_gaps": ["Areas requiring further investigation"]
}`,
      model_tier: "pro"
    }
  },

  // === R&D/RESEARCH MODULES ===
  {
    module_name: "technical_feasibility",
    when_to_include: ["R&D/Research", "Infrastructure/Capability", "Defence/Sovereign Capability"],
    always_include: false,
    provides_outputs: ["trl_assessment", "technical_risks", "mitigation_strategies"],
    depends_on: ["evidence_source_pack"],
    step_template: {
      role_name: "assess_technical_feasibility",
      role_goal: "Evaluate technical readiness and identify risks with mitigations",
      phase: "research",
      inputs: ["{{sources}}", "{{step0}}", "{{trl}}", "{{summary}}"],
      outputs_schema: {
        trl_assessment: {
          current_trl: "number (1-9)",
          target_trl: "number (1-9)",
          trl_justification: "string",
          key_technical_challenges: ["string"]
        },
        technical_risks: [{
          risk: "string",
          likelihood: "'high' | 'medium' | 'low'",
          impact: "'high' | 'medium' | 'low'",
          mitigation: "string"
        }],
        feasibility_assessment: "string",
        dependencies: ["string"]
      },
      hard_rules: [
        "TRL assessment must align with NASA/Horizon Europe definitions",
        "Every risk must have a corresponding mitigation strategy",
        "Feasibility assessment must be balanced—acknowledge limitations",
        "Dependencies on external factors must be identified",
        "Do NOT overstate readiness—conservative assessment preferred"
      ],
      prompt_template: `STEP N — Assess Technical Feasibility

{{WRITER_STANCE_PREAMBLE}}

INPUTS:
- Source pack: {{step0}}
- Stated TRL: {{trl}}
- Research summary: {{summary}}

YOUR TASK:
Evaluate technical readiness level and identify key risks with mitigation strategies.

HARD RULES:
- TRL assessment must align with NASA/Horizon Europe definitions
- Every risk must have a corresponding mitigation
- Be balanced—acknowledge limitations honestly
- Identify dependencies on external factors
- Conservative assessment preferred

OUTPUT JSON SCHEMA:
{
  "trl_assessment": {
    "current_trl": 0,
    "target_trl": 0,
    "trl_justification": "string",
    "key_technical_challenges": ["string"]
  },
  "technical_risks": [
    {
      "risk": "string",
      "likelihood": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "string"
    }
  ],
  "feasibility_assessment": "string",
  "dependencies": ["string"]
}`,
      model_tier: "balanced"
    }
  },

  // === CLIMATE/ENVIRONMENT MODULES ===
  {
    module_name: "emissions_impact",
    when_to_include: ["Climate/Environment"],
    always_include: false,
    provides_outputs: ["emissions_baseline", "abatement_potential", "methodology"],
    depends_on: ["evidence_source_pack"],
    step_template: {
      role_name: "calculate_emissions_impact",
      role_goal: "Calculate emissions baseline and abatement potential",
      phase: "research",
      inputs: ["{{sources}}", "{{step0}}", "{{summary}}"],
      outputs_schema: {
        emissions_baseline: {
          scope_1: { tonnes_co2e: "number", methodology: "string", source_id: "string" },
          scope_2: { tonnes_co2e: "number", methodology: "string", source_id: "string" },
          scope_3: { tonnes_co2e: "number", methodology: "string", source_id: "string" }
        },
        abatement_potential: {
          annual_tonnes_co2e: "number",
          methodology: "string",
          source_ids: ["string"]
        },
        comparison_to_alternatives: "string",
        data_gaps: ["string"]
      },
      hard_rules: [
        "Use NGER or GHG Protocol methodologies",
        "Scope 3 estimates must clearly state assumptions",
        "Abatement calculations must show baseline vs. intervention",
        "Include source_ids for all emission factors used",
        "Conservative estimates preferred"
      ],
      prompt_template: `STEP N — Calculate Emissions Impact

{{WRITER_STANCE_PREAMBLE}}

INPUTS:
- Source pack: {{step0}}
- Research summary: {{summary}}

YOUR TASK:
Calculate emissions baseline and abatement potential using recognized methodologies.

HARD RULES:
- Use NGER or GHG Protocol methodologies
- Scope 3 must clearly state assumptions
- Show baseline vs. intervention calculation
- Include source_ids for emission factors
- Conservative estimates preferred

OUTPUT JSON SCHEMA:
{
  "emissions_baseline": {
    "scope_1": {"tonnes_co2e": 0, "methodology": "string", "source_id": "S0-N"},
    "scope_2": {"tonnes_co2e": 0, "methodology": "string", "source_id": "S0-N"},
    "scope_3": {"tonnes_co2e": 0, "methodology": "string", "source_id": "S0-N"}
  },
  "abatement_potential": {
    "annual_tonnes_co2e": 0,
    "methodology": "string",
    "source_ids": ["S0-N"]
  },
  "comparison_to_alternatives": "string",
  "data_gaps": ["string"]
}`,
      model_tier: "balanced"
    }
  }
];

// ============================================================================
// QA GATES SCHEMA
// ============================================================================

export interface QAGateResult {
  gate_name: string;
  passed: boolean;
  issues: string[];
  recommendations: string[];
}

export interface QAReport {
  citation_integrity: QAGateResult;
  criteria_coverage: QAGateResult;
  assessor_readiness: QAGateResult;
  overall_pass: boolean;
  critical_issues: string[];
}

export const QA_GATE_DEFINITIONS = {
  citation_integrity: {
    checks: [
      "All source_ids exist in consolidated sources list",
      "No malformed JSON in any step output",
      "No code fences (```) in any output",
      "No placeholder text ([insert], {TBD}, Source1)",
      "All URLs are valid format or explicitly 'URL not available'"
    ]
  },
  criteria_coverage: {
    checks: [
      "Each rubric criterion has corresponding evidence",
      "Gaps are explicitly listed in data_gaps array",
      "Weight of evidence aligns with criterion weights",
      "No criterion is completely unaddressed"
    ]
  },
  assessor_readiness: {
    checks: [
      "Narrative spine is coherent (problem → solution → impact)",
      "Risks are identified with mitigations",
      "Impact is quantified with methodology",
      "Additionality is clearly stated",
      "Jurisdiction benefit is articulated"
    ]
  }
};

// ============================================================================
// BUNDLE CONSTRUCTION ALGORITHM
// ============================================================================

export interface BundleConstructionConfig {
  grant_archetype: GrantArchetype;
  include_firecrawl_steps: boolean;
  max_research_steps: number;
  enable_qa_gates: boolean;
}

export function classifyGrantArchetype(
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

export function selectModulesForArchetype(archetype: GrantArchetype): ModuleDefinition[] {
  return MODULE_LIBRARY.filter(
    module => module.always_include || module.when_to_include.includes(archetype)
  );
}

export function resolveModuleDependencies(modules: ModuleDefinition[]): ModuleDefinition[] {
  const resolved: ModuleDefinition[] = [];
  const moduleNames = new Set(modules.map(m => m.module_name));

  function addWithDeps(module: ModuleDefinition) {
    if (resolved.some(r => r.module_name === module.module_name)) return;
    
    for (const depName of module.depends_on) {
      const dep = modules.find(m => m.module_name === depName);
      if (dep) addWithDeps(dep);
    }
    resolved.push(module);
  }

  for (const module of modules) {
    addWithDeps(module);
  }

  return resolved;
}

// ============================================================================
// QA GATES STEP TEMPLATES
// ============================================================================

export interface QAGateResult {
  gate_name: string;
  passed: boolean;
  issues: string[];
  recommendations: string[];
}

export interface QAGatesOutput {
  citation_integrity: QAGateResult;
  criteria_coverage: QAGateResult;
  assessor_readiness: QAGateResult;
  overall_pass: boolean;
  blocking_issues: string[];
  quality_score: number;
}

export function createQAGatesStep(maxAIStep: number, rubricSections: { key: string; title: string }[]): {
  step_name: string;
  step_description: string;
  phase: "qa";
  model_tier: "balanced";
  prompt_template: string;
} {
  const stepRefs = Array.from({ length: maxAIStep + 1 }, (_, i) => `{{step${i}}}`).join(", ");
  const criteriaList = rubricSections.map(s => `- ${s.key}: ${s.title}`).join("\n");

  return {
    step_name: "qa_gates_validation",
    step_description: "Validate report quality across citation integrity, criteria coverage, and assessor readiness",
    phase: "qa",
    model_tier: "balanced",
    prompt_template: `STEP ${maxAIStep + 1} — QA Gates Validation

${generateWriterStancePreamble()}

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
4. Calculate overall quality_score (0-100)

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

// QA Gates Module Definition for Module Library
export const QA_GATES_MODULE: ModuleDefinition = {
  module_name: "qa_gates",
  when_to_include: [...GRANT_ARCHETYPES],
  always_include: true,
  provides_outputs: ["citation_integrity", "criteria_coverage", "assessor_readiness", "quality_score"],
  depends_on: ["evidence_source_pack", "economic_impact", "stakeholder_mapping"],
  step_template: {
    role_name: "validate_qa_gates",
    role_goal: "Perform mandatory quality validation across three gates before assembly",
    phase: "qa",
    inputs: ["{{step0}}", "{{step1}}", "{{stepN-1}}"],
    outputs_schema: {
      citation_integrity: { gate_name: "string", passed: "boolean", issues: ["string"], recommendations: ["string"] },
      criteria_coverage: { gate_name: "string", passed: "boolean", issues: ["string"], recommendations: ["string"] },
      assessor_readiness: { gate_name: "string", passed: "boolean", issues: ["string"], recommendations: ["string"] },
      overall_pass: "boolean",
      blocking_issues: ["string"],
      quality_score: "number (0-100)"
    },
    hard_rules: [
      "Do NOT modify content—only validate and report issues",
      "Every issue must be specific: cite step numbers, field names, source_ids",
      "Mark issues as 'blocking' (must fix) or 'advisory' (should fix)",
      "Blocking issues prevent overall_pass from being true",
      "Quality score reflects percentage of checks passed"
    ],
    prompt_template: "", // Dynamically generated by createQAGatesStep
    model_tier: "balanced"
  }
};

// ============================================================================
// FIRECRAWL DATA GATHERING TEMPLATES
// ============================================================================

export function createFirecrawlSteps(researchDomain: string, archetype: GrantArchetype) {
  const baseSteps = [
    {
      step_number: 0,
      step_name: "scrape_article",
      step_description: "Scrape the user's research article URL to extract content",
      step_type: "firecrawl_scrape" as const,
      step_config_json: {
        url_variable: "publicArticleUrl",
        formats: ["markdown"],
        onlyMainContent: true
      },
      prompt_template: "FIRECRAWL_SCRAPE: Extract content from the user-provided article URL ({{publicArticleUrl}}).",
      model_tier: null
    },
    {
      step_number: 1,
      step_name: "search_market_data",
      step_description: "Search for market sizing and industry data",
      step_type: "firecrawl_search" as const,
      step_config_json: {
        query_template: `${researchDomain} market size Australia 2024 site:abs.gov.au OR site:ibisworld.com OR site:statista.com`,
        limit: 8,
        scrape_results: true
      },
      prompt_template: "FIRECRAWL_SEARCH: Search for market sizing data relevant to the research domain.",
      model_tier: null
    },
    {
      step_number: 2,
      step_name: "search_competitors",
      step_description: "Search for competitors and companies in the domain",
      step_type: "firecrawl_search" as const,
      step_config_json: {
        query_template: `${researchDomain} companies startups Australia`,
        limit: 8,
        scrape_results: true
      },
      prompt_template: "FIRECRAWL_SEARCH: Search for competitors in the research domain.",
      model_tier: null
    },
    {
      step_number: 3,
      step_name: "search_policy_funding",
      step_description: "Search for government policy and funding information",
      step_type: "firecrawl_search" as const,
      step_config_json: {
        query_template: `${researchDomain} government funding policy Australia site:gov.au`,
        limit: 5,
        scrape_results: false
      },
      prompt_template: "FIRECRAWL_SEARCH: Search for policy and funding information from government sources.",
      model_tier: null
    }
  ];

  // Add archetype-specific searches
  if (archetype === "Health/Clinical Translation") {
    baseSteps.push({
      step_number: 4,
      step_name: "search_tga_regulatory",
      step_description: "Search for TGA regulatory pathway information",
      step_type: "firecrawl_search" as const,
      step_config_json: {
        query_template: `${researchDomain} TGA regulation approval pathway site:tga.gov.au`,
        limit: 5,
        scrape_results: false
      },
      prompt_template: "FIRECRAWL_SEARCH: Search for TGA regulatory pathway information.",
      model_tier: null
    });
  }

  if (archetype === "Climate/Environment") {
    baseSteps.push({
      step_number: 4,
      step_name: "search_emissions_data",
      step_description: "Search for emissions and sustainability data",
      step_type: "firecrawl_search" as const,
      step_config_json: {
        query_template: `${researchDomain} emissions carbon footprint Australia site:cleanenergyregulator.gov.au OR site:dcceew.gov.au`,
        limit: 5,
        scrape_results: false
      },
      prompt_template: "FIRECRAWL_SEARCH: Search for emissions and sustainability data.",
      model_tier: null
    });
  }

  return baseSteps;
}

// ============================================================================
// HTML ASSEMBLY STEP TEMPLATES
// ============================================================================

export function createHtmlAssemblySteps(maxAIStep: number) {
  const stepRefs = Array.from({ length: maxAIStep + 1 }, (_, i) => `{{step${i}}}`).join(", ");

  return [
    {
      step_name: "assemble_sections_html",
      step_description: "Generate report sections as clean HTML narrative",
      phase: "assembly" as const,
      model_tier: "balanced" as const,
      prompt_template: `STEP ${maxAIStep + 1} — Assemble Sections as HTML

${generateWriterStancePreamble()}

INPUTS (from previous steps):
- All prior step outputs: ${stepRefs}
- Grant: {{grantName}} ({{grantVersionLabel}})

PURPOSE:
Transform research findings into a cohesive HTML narrative report for grant assessors.

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON with a single top-level object
2. Do NOT include code fences (no \`\`\` anywhere)
3. First character must be {, last must be }
4. Include "sections_html" field containing semantic HTML

REQUIRED SECTIONS:
1. Executive Summary
2. Research Context and Innovation
3. Unmet Need and Australian Relevance
4. Commercialisation Pathways (if applicable)
5. Competitive Landscape
6. Market Sizing (TAM/SAM/SOM)
7. IP and Regulatory Pathway
8. Economic Impact
9. Stakeholders and Partners
10. Data Gaps and Validation Needs

HTML FORMATTING:
- Use <h2> for main sections, <h3> for subsections
- Use <p> for paragraphs, <ul><li> for lists
- Citation markers: <sup>[S0-1]</sup>
- Table anchors: <!-- TABLE:competitors -->, <!-- TABLE:market_sizing -->, <!-- TABLE:partners -->

OUTPUT JSON SCHEMA:
{
  "sections_html": "<h2>Executive Summary</h2><p>...</p>...",
  "data_gaps": ["gap1", "gap2"]
}`
    },
    {
      step_name: "build_tables_sources_html",
      step_description: "Build HTML tables and deduplicated source list",
      phase: "assembly" as const,
      model_tier: "balanced" as const,
      prompt_template: `STEP ${maxAIStep + 2} — Build Tables and Sources (HTML)

${generateWriterStancePreamble()}

INPUTS:
- All prior step outputs: ${stepRefs}

PURPOSE:
Compile comparison tables and consolidated citations from all research steps.

TABLES TO CREATE:
1. Competitor comparison (features, pricing, market position)
2. TAM/SAM/SOM summary with calculations
3. Partner capability matrix
4. Any other tabular data from research

SOURCE CONSOLIDATION:
Compile ALL citations from all steps into a single deduplicated list.

OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - no code fences
2. First character must be {, last must be }
3. Tables must be valid HTML <table> elements

OUTPUT JSON SCHEMA:
{
  "tables": {
    "competitors": "<table class=\\"data-table\\">...</table>",
    "market_sizing": "<table class=\\"data-table\\">...</table>",
    "partners": "<table class=\\"data-table\\">...</table>"
  },
  "all_sources": [
    {"id": "S0-1", "mla_citation": "Author. Title. Publication, Date. URL.", "url": "https://..."}
  ]
}`
    },
    {
      step_name: "finalize_report_html",
      step_description: "Merge sections, tables, and sources into final report_html",
      phase: "render" as const,
      model_tier: "balanced" as const,
      prompt_template: `STEP ${maxAIStep + 3} — Finalize Report (HTML)

${generateWriterStancePreamble()}

INPUT DATA:
- Step ${maxAIStep + 1} ({{step${maxAIStep + 1}}}): Contains "sections_html" and "data_gaps"
- Step ${maxAIStep + 2} ({{step${maxAIStep + 2}}}): Contains "tables" and "all_sources"

YOUR TASK:
1. PARSE the JSON from both steps
2. Get "sections_html" from Step ${maxAIStep + 1}
3. Replace table anchors with tables from Step ${maxAIStep + 2}:
   - <!-- TABLE:competitors --> → tables.competitors
   - <!-- TABLE:market_sizing --> → tables.market_sizing
   - <!-- TABLE:partners --> → tables.partners
4. Append References section with formatted citations
5. Combine data_gaps from both steps

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - NO code fences
2. First character must be {, last must be }
3. "report_html" MUST contain complete merged HTML

OUTPUT JSON SCHEMA:
{
  "title": "Grant Report: [Project Title]",
  "report_html": "<h2>Executive Summary</h2>...[merged HTML with tables]...<h2>References</h2>...",
  "all_sources": [{"id": "S0-1", "mla_citation": "...", "url": "..."}],
  "data_gaps": ["gap1", "gap2"],
  "tables": {"competitors": "...", "market_sizing": "...", "partners": "..."}
}`
    }
  ];
}

// ============================================================================
// QUALITY SCORING (matching existing implementation)
// ============================================================================

export function calculatePromptQualityScore(prompt: string): {
  total: number;
  level: "good" | "warning" | "poor";
  breakdown: Record<string, number>;
} {
  if (!prompt || typeof prompt !== "string") {
    return { total: 0, level: "poor", breakdown: {} };
  }

  const breakdown = {
    contextHeader: /STEP\s*\d|INPUTS?:/i.test(prompt) ? 15 : 0,
    hardRules: /HARD RULES|CRITICAL RULES|REQUIREMENTS|RULES:/i.test(prompt) ? 20 : 0,
    outputSchema: /OUTPUT.*JSON|JSON.*SCHEMA|OUTPUT.*SCHEMA|Return.*JSON/is.test(prompt) ? 20 : 0,
    urlValidation: /URL.*valid|valid.*URL|URL.*require|source.*URL/i.test(prompt) ? 15 : 0,
    unknownHandling: /unknown.*handling|if.*not.*found|unknowns.*array|Not disclosed|proxy.*estimate/i.test(prompt) ? 15 : 0,
    placeholderProhibition: /\[.*\].*forbidden|placeholder.*prohibit|NEVER.*\[|Do NOT.*\[|bracket.*forbidden/i.test(prompt) ? 10 : 0,
    adequateLength: prompt.length >= 1000 ? 5 : Math.round((prompt.length / 1000) * 5 * 10) / 10
  };

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const level = total >= 70 ? "good" : total >= 40 ? "warning" : "poor";

  return { total: Math.round(total), level, breakdown };
}

// ============================================================================
// FULL BUNDLE GENERATOR
// ============================================================================

export interface GeneratedBundle {
  name: string;
  description: string;
  system_prompt: string;
  steps: {
    step_number: number;
    step_name: string;
    step_description: string;
    step_type: "ai_prompt" | "firecrawl_search" | "firecrawl_scrape";
    step_config_json: Record<string, unknown>;
    prompt_template: string;
    model_override: string | null;
    is_heavy: boolean;
    phase: string;
  }[];
  grant_dna_pack: Partial<GrantDNAPack>;
  archetype: GrantArchetype;
  archetype_confidence: "high" | "medium" | "low";
}

export function generateBundleFromSpec(
  grantName: string,
  grantSummary: string,
  rubricSections: { key: string; title: string; description?: string; criteria?: string[]; weight?: number }[],
  config: Partial<BundleConstructionConfig> = {}
): GeneratedBundle {
  const fullConfig: BundleConstructionConfig = {
    grant_archetype: "Commercialisation/Innovation",
    include_firecrawl_steps: true,
    max_research_steps: 15,
    enable_qa_gates: true,
    ...config
  };

  // Step 1: Classify archetype
  const { archetype, confidence } = classifyGrantArchetype(grantSummary, rubricSections);
  fullConfig.grant_archetype = archetype;

  // Step 2: Select modules
  const selectedModules = selectModulesForArchetype(archetype);
  const orderedModules = resolveModuleDependencies(selectedModules);

  // Step 3: Generate Firecrawl steps
  const researchDomain = grantSummary.split(/[,.]/)[0] || grantName;
  const firecrawlSteps = fullConfig.include_firecrawl_steps
    ? createFirecrawlSteps(researchDomain, archetype)
    : [];

  // Step 4: Generate AI research steps from modules
  const firecrawlOffset = firecrawlSteps.length;
  const tierToModel: Record<string, string> = {
    lite: "google/gemini-2.5-flash-lite",
    balanced: "google/gemini-3-flash-preview",
    pro: "google/gemini-3-pro-preview"
  };

  const aiSteps = orderedModules.map((module, idx) => ({
    step_number: firecrawlOffset + idx,
    step_name: module.step_template.role_name,
    step_description: module.step_template.role_goal,
    step_type: "ai_prompt" as const,
    step_config_json: {},
    prompt_template: module.step_template.prompt_template
      .replace("{{WRITER_STANCE_PREAMBLE}}", generateWriterStancePreamble()),
    model_override: tierToModel[module.step_template.model_tier] || null,
    is_heavy: module.step_template.model_tier === "pro",
    phase: module.step_template.phase
  }));

  // Step 5: Generate QA Gates step (if enabled)
  const maxResearchStep = firecrawlOffset + aiSteps.length - 1;
  let qaGatesSteps: typeof aiSteps = [];
  
  if (fullConfig.enable_qa_gates) {
    const qaGatesTemplate = createQAGatesStep(maxResearchStep, rubricSections);
    qaGatesSteps = [{
      step_number: maxResearchStep + 1,
      step_name: qaGatesTemplate.step_name,
      step_description: qaGatesTemplate.step_description,
      step_type: "ai_prompt" as const,
      step_config_json: {},
      prompt_template: qaGatesTemplate.prompt_template,
      model_override: tierToModel[qaGatesTemplate.model_tier] || null,
      is_heavy: false,
      phase: qaGatesTemplate.phase
    }];
  }

  // Step 6: Generate HTML assembly steps (after QA gates)
  const preAssemblyStepCount = maxResearchStep + qaGatesSteps.length;
  const assemblyStepTemplates = createHtmlAssemblySteps(preAssemblyStepCount);
  const assemblySteps = assemblyStepTemplates.map((template, idx) => ({
    step_number: preAssemblyStepCount + 1 + idx,
    step_name: template.step_name,
    step_description: template.step_description,
    step_type: "ai_prompt" as const,
    step_config_json: {},
    prompt_template: template.prompt_template,
    model_override: tierToModel[template.model_tier] || null,
    is_heavy: false,
    phase: template.phase
  }));

  // Combine all steps in order: Firecrawl → AI Research → QA Gates → Assembly
  const allSteps = [
    ...firecrawlSteps.map(s => ({
      ...s,
      step_config_json: s.step_config_json || {},
      model_override: null,
      is_heavy: false,
      phase: "intake"
    })),
    ...aiSteps,
    ...qaGatesSteps,
    ...assemblySteps
  ];

  // Generate Grant DNA Pack (partial - full extraction happens in AI call)
  const grantDNAPack: Partial<GrantDNAPack> = {
    program_profile: {
      name: grantName,
      jurisdiction: "AU-Federal",
      applicant_type: ["Unknown"],
      funding_type: "Grant",
      assessor_type: "Panel"
    },
    evaluation_criteria_map: {
      criteria: rubricSections.map(s => ({
        key: s.key,
        title: s.title,
        weight: s.weight || null,
        pass_threshold: "Meets criterion",
        assessor_questions: s.criteria || []
      }))
    },
    narrative_strategy: {
      story_spine: "Problem → Solution → Impact",
      additionality: "To be determined from grant guidelines",
      jurisdiction_benefit: "Australian economic and social benefit"
    },
    detected_archetype: archetype,
    archetype_confidence: confidence,
    missing_info: []
  };

  return {
    name: `${grantName} Research Pipeline`,
    description: `Auto-generated ${archetype} pipeline for ${grantName}`,
    system_prompt: `You are an expert research analyst supporting grant applications with evidence-based analysis. Your outputs are for ${archetype} grant assessors in Australia.`,
    steps: allSteps,
    grant_dna_pack: grantDNAPack,
    archetype,
    archetype_confidence: confidence
  };
}
