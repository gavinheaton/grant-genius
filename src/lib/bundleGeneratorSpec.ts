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

// ============================================================================
// ASSESSOR INSIGHT CONTRACT (for assessor-ready, commercially insightful reports)
// ============================================================================

export const ASSESSOR_INSIGHT_CONTRACT = {
  evidence_type_matching: {
    description: "Non-negotiable rule mapping claim categories to allowed source types",
    rules: {
      market_data: {
        allowed: ["Market research firms", "Industry reports", "Procurement datasets", "PBS/MBS/AIHW spending", "ABS industry accounts", "Annual reports"],
        never_use: ["Epidemiology studies", "Disease burden papers"]
      },
      disease_burden: {
        allowed: ["Government health statistics", "AIHW", "Cancer Australia", "WHO", "Peer-reviewed epidemiology"],
        never_use: ["Market reports", "Company financials"]
      },
      regulatory: {
        allowed: ["TGA/FDA/EMA guidance", "PBS/HTA documents", "Standards bodies", "Official policy docs"],
        never_use: ["General news", "Press releases"]
      },
      competitor_status: {
        allowed: ["Company filings", "Regulator databases", "Clinical trial registries", "Official product pages"],
        never_use: ["Wikipedia", "Blog posts", "Undated sources"]
      }
    }
  },
  assumption_discipline: {
    required_fields: ["confidence_label", "one_line_justification", "replicable_method"]
  },
  proxy_estimate_format: {
    required_fields: ["value", "currency", "year", "method", "inputs", "sensitivity", "confidence"]
  },
  commercial_reality_layer: [
    "Who pays / who decides / adoption pathway",
    "Pricing anchors (direct, adjacent, or proxy)",
    "Implementation friction + enabling partners",
    "Regulatory and reimbursement gating steps",
    "Measurable success outcomes"
  ],
  competitor_comparability_framework: {
    direct: "Same buyer + same use case + same modality/class",
    adjacent: "Same buyer OR same use case OR similar modality",
    enablers: "Platforms, diagnostics, manufacturing, distribution, integrators"
  }
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
    module_name: "tam_sam_som_dual_methodology",
    when_to_include: [...GRANT_ARCHETYPES], // Universal - all archetypes need market sizing
    always_include: true,
    provides_outputs: [
      "market_definition",
      "pricing_anchors",
      "top_down",
      "bottom_up",
      "reconciliation",
      "assumptions_register",
      "sensitivity_summary",
      "sanity_checks",
      "unknowns"
    ],
    depends_on: ["evidence_source_pack"],
    step_template: {
      role_name: "tam_sam_som_dual_methodology",
      role_goal: "Produce assessor-grade TAM/SAM/SOM with dual methodology, transparent assumptions, sensitivity analysis, and sanity checks",
      phase: "research",
      inputs: ["{{sources}}", "{{step0}}", "{{grantName}}"],
      outputs_schema: {
        market_definition: {
          product_category: "string",
          buyer: { payer: "string", decision_maker: "string", user: "string" },
          geographies: ["Australia", "Global"],
          time_horizon_years: "number"
        },
        pricing_anchors: [{
          anchor_name: "string",
          price: "number",
          currency: "AUD|USD",
          year: "number",
          source_id: "S0-# or ESTIMATE",
          relevance: "string"
        }],
        top_down: {
          tam: { value: "number", currency: "AUD|USD", year: "number", formula: "string", inputs: [{ label: "string", value: "number", source_id: "S0-#|ESTIMATE" }], sensitivity: { low: "number", high: "number" }, confidence: "high|medium|low" },
          sam: "same structure",
          som: "same structure"
        },
        bottom_up: {
          tam: "same structure as top_down.tam",
          sam: "same structure",
          som: "same structure"
        },
        reconciliation: {
          explanation: "string",
          preferred_method: "top_down|bottom_up|blended",
          blended_value: { tam: "number", sam: "number", som: "number", currency: "AUD|USD", year: "number" }
        },
        assumptions_register: [{
          assumption_id: "A1",
          description: "string",
          value: "number|percent",
          confidence_label: "High|Medium|Low",
          defensibility_note: "string",
          source_id: "S0-#|ESTIMATE",
          validation_source_type: "string"
        }],
        sensitivity_summary: {
          tam: { base: "number", low: "number", high: "number" },
          sam: { base: "number", low: "number", high: "number" },
          som: { base: "number", low: "number", high: "number" },
          sensitivity_drivers: ["A1", "A3", "A7"]
        },
        sanity_checks: [{
          check: "string",
          status: "pass|fail",
          note: "string",
          fix_applied: "string|none"
        }],
        unknowns: [{
          what_is_missing: "string",
          what_would_validate: "string",
          proxy_attempted: "boolean",
          method: "string"
        }]
      },
      hard_rules: [
        "MUST output BOTH top-down AND bottom-up methodologies",
        "Every assumption must have assumption_id, confidence_label, defensibility_note",
        "NEVER use placeholders: $Z, A%, B%, C%, PROXY (without method)",
        "Sensitivity analysis REQUIRED: base/low/high for TAM, SAM, SOM",
        "Sanity checks MUST pass before output (pricing, penetration, spend ceiling)",
        "Evidence-type matching: market sizing must NOT cite epidemiology papers",
        "If direct data unavailable, use proxy with methodology shown",
        "Include ≥3 pricing anchors with source_ids"
      ],
      prompt_template: `STEP N — TAM/SAM/SOM Dual Methodology (Assessor-Grade Market Sizing)

{{WRITER_STANCE_PREAMBLE}}

You are producing assessor-grade market sizing that will withstand expert scrutiny. 
Assessors expect to see: (1) method, (2) assumptions, (3) sensitivity, and (4) why assumptions are defensible.

INPUTS:
- Source pack: {{step0}}
- Grant: {{grantName}}

DUAL METHODOLOGY REQUIREMENT (Non-Negotiable):
You MUST output BOTH:
A) TOP-DOWN SIZING: Parent market × segment share
   - Start with global/regional market size from authoritative source
   - Apply filters: geography (AU = ~1.6% GDP ratio), segment, capability
   - Show formula and each input with source_id

B) BOTTOM-UP SIZING: Units × price × penetration
   - Estimate addressable units (customers, procedures, devices, etc.)
   - Apply realistic price point (from pricing anchors)
   - Apply conservative penetration rates (Year 1: 0.1-1%, Year 3: 1-5%, Year 5: 3-10%)
   - Show formula and each input with source_id

Then RECONCILE the two methods:
- If divergence >30%, explain why and state preferred method
- If within 30%, use blended average
- Always prefer conservative (lower) estimate when uncertain

ASSUMPTIONS REGISTER REQUIREMENT (Every Input Must Be Decomposed):
Each assumption in your calculations MUST include:
- assumption_id: Sequential ID (A1, A2, A3...)
- description: What this assumption represents
- value: Actual number or percentage (NEVER use "A%" or "20%" without decomposition)
- confidence_label: "High" | "Medium" | "Low"
- defensibility_note: Why this is reasonable (based on evidence or conservative proxy)
- validation_source_type: What source type would validate this best
- source_id: "S0-#" from source pack, OR "ESTIMATE" (only with defensibility_note + method)

FORBIDDEN PLACEHOLDERS (hard failure if present):
- $Z, A%, B%, C%, PROXY (without methodology)
- [Insert...], {TBD}, [Unknown]
- Any unexplained percentage without decomposition

SENSITIVITY ANALYSIS (Mandatory for Each Metric):
For each of TAM, SAM, SOM output:
- base_case: Your central estimate
- low_case: Conservative bound (~20-30% lower)
- high_case: Optimistic bound (~20-30% higher)
- sensitivity_drivers[]: Top 3 assumption_ids that move the result most
- why_low_high_bounds_are_defensible: Brief rationale

SANITY CHECKS (Must All Pass Before Output):
1. PRICING CHECK: Implied unit price consistent with pricing_anchors (within ±30%)
   - If fails: revise price assumption OR document why deviation is justified
2. PENETRATION CHECK: Implied adoption rate consistent with industry comparables
   - Typical new entrant: <1% Year 1, <5% Year 3, <10% Year 5
   - If fails: revise penetration OR document exceptional justification
3. SPEND CEILING CHECK: Implied market spend does not exceed known category budget
   - Cross-reference with government expenditure data (PBS, MBS, AIHW)
   - If fails: revise or explain why your market is a new budget category

For each sanity check, output:
- check: Description of what was validated
- status: "pass" or "fail"
- note: Details on the validation
- fix_applied: "none" if passed, or description of adjustment made

EVIDENCE-TYPE ENFORCEMENT (Critical):
Market size/growth/pricing MUST cite:
- Market research firms (IBISWorld, Frost & Sullivan, GlobalData)
- Industry reports and peak body publications
- Procurement datasets, PBS/MBS/AIHW spending data
- ABS industry accounts, company annual reports

Market sizing must NEVER cite:
- Epidemiology studies or disease burden papers
- Clinical trial data (for market claims)
- Wikipedia, blog posts, undated sources

If evidence-type mismatch detected:
- Replace claim with: "Unknown (evidence type mismatch)"
- Log to unknowns[]: what_is_missing, what_would_validate, proxy_attempted: false

PRICING ANCHORS REQUIREMENT:
Include ≥3 pricing anchors from the source pack:
- anchor_name: Competitor or comparable product name
- price: Actual price point
- currency: AUD or USD
- year: Year of price data
- source_id: Source reference
- relevance: Why this is a valid anchor (direct competitor, adjacent market, etc.)

OUTPUT JSON SCHEMA:
{
  "market_definition": {
    "product_category": "string",
    "buyer": { "payer": "string", "decision_maker": "string", "user": "string" },
    "geographies": ["Australia", "Global"],
    "time_horizon_years": 5
  },
  "pricing_anchors": [
    { "anchor_name": "Comparable A", "price": 50000, "currency": "AUD", "year": 2024,
      "source_id": "S0-3", "relevance": "Direct competitor in AU market" }
  ],
  "top_down": {
    "tam": { "value": 5000000000, "currency": "AUD", "year": 2024,
             "formula": "Global market $X × AU GDP share (1.6%)",
             "inputs": [{ "label": "Global market", "value": 312500000000, "source_id": "S0-1" }],
             "sensitivity": { "low": 4000000000, "high": 6000000000 },
             "confidence": "medium" },
    "sam": { "value": 1000000000, "currency": "AUD", "year": 2024,
             "formula": "TAM × segment filter (20%)",
             "inputs": [{ "label": "Segment share", "value": 0.2, "source_id": "ESTIMATE" }],
             "sensitivity": { "low": 800000000, "high": 1200000000 },
             "confidence": "medium" },
    "som": { "value": 50000000, "currency": "AUD", "year": 2029,
             "formula": "SAM × 5% penetration (Year 5)",
             "inputs": [{ "label": "Penetration Y5", "value": 0.05, "source_id": "ESTIMATE" }],
             "sensitivity": { "low": 30000000, "high": 70000000 },
             "confidence": "low" }
  },
  "bottom_up": {
    "tam": { "value": 4500000000, "currency": "AUD", "year": 2024,
             "formula": "Addressable units × average price",
             "inputs": [
               { "label": "Addressable units", "value": 90000, "source_id": "S0-4" },
               { "label": "Average price", "value": 50000, "source_id": "S0-3" }
             ],
             "sensitivity": { "low": 3600000000, "high": 5400000000 },
             "confidence": "medium" },
    "sam": { "... same structure ..." },
    "som": { "... same structure ..." }
  },
  "reconciliation": {
    "explanation": "Top-down yields $5B, bottom-up yields $4.5B (10% difference). Using blended average as methods converge.",
    "preferred_method": "blended",
    "blended_value": { "tam": 4750000000, "sam": 950000000, "som": 47500000, "currency": "AUD", "year": 2024 }
  },
  "assumptions_register": [
    { "assumption_id": "A1", "description": "AU represents 1.6% of global market",
      "value": "1.6%", "confidence_label": "High",
      "defensibility_note": "Based on AU GDP share in World Bank data (2023)",
      "source_id": "S0-5", "validation_source_type": "World Bank GDP statistics" },
    { "assumption_id": "A2", "description": "Year 5 penetration rate",
      "value": "5%", "confidence_label": "Low",
      "defensibility_note": "Conservative estimate below industry average of 8% for similar technologies",
      "source_id": "ESTIMATE", "validation_source_type": "Industry adoption benchmarks" }
  ],
  "sensitivity_summary": {
    "tam": { "base": 4750000000, "low": 3800000000, "high": 5700000000 },
    "sam": { "base": 950000000, "low": 760000000, "high": 1140000000 },
    "som": { "base": 47500000, "low": 28500000, "high": 66500000 },
    "sensitivity_drivers": ["A2", "A3", "A5"]
  },
  "sanity_checks": [
    { "check": "Implied unit price within ±30% of pricing anchors", "status": "pass", "note": "$50k vs anchors $45-55k range", "fix_applied": "none" },
    { "check": "Year 1 penetration below 1%", "status": "pass", "note": "0.5% assumed", "fix_applied": "none" },
    { "check": "Total spend within AU health tech category ceiling", "status": "pass", "note": "SOM < 5% of AIHW category spend", "fix_applied": "none" }
  ],
  "unknowns": [
    { "what_is_missing": "Direct AU market sizing report for this niche", "what_would_validate": "IBISWorld AU industry report", "proxy_attempted": true, "method": "Used Global × GDP ratio" }
  ]
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
    // NEW: Pre-Assembly Sanitiser - scans all outputs for forbidden tokens
    {
      step_name: "pre_assembly_sanitiser",
      step_description: "Scan all step outputs for forbidden tokens and produce clean versions for assembly",
      phase: "assembly" as const,
      model_tier: "lite" as const,
      prompt_template: `STEP ${maxAIStep + 1} — Pre-Assembly Sanitiser

${generateWriterStancePreamble()}

PURPOSE:
Scan ALL previous step outputs for forbidden tokens, internal markers, and placeholders.
Produce clean_step_outputs that report_assembly will use.

INPUTS:
- All prior step outputs: ${stepRefs}
- Source Pack: {{step0}}

FORBIDDEN TOKENS TO DETECT AND REMOVE:
1. Internal source IDs: [S0-1], [ARTICLE-1], [SEARCH-1], [SOURCE-1], [step9]
2. Naked source IDs: S0-1, S1-3 (without brackets)
3. Placeholders: {TBD}, [TBD], [Insert...], [PROJECT NAME], [COMPANY]
4. Budget placeholders: $[Amount], $[...], $Z
5. Single-letter stand-ins: A%, B%, C%, "B additional jobs", "X million"
6. Generic markers: [article], [Source1], Source 1, Source 2
7. Undefined markers: undefined [, ] undefined

FOR EACH FORBIDDEN TOKEN FOUND:
1. Log to issues_found[] with:
   - location: step name + field path (e.g., "step3.market_sizing.tam")
   - offending_text: the exact forbidden text
   - token_type: category of violation
   - sentence_context: surrounding sentence

2. Apply fix based on type:
   - Internal source ID → Look up in Source Pack, convert to (Author, Year)
   - If source not found → "Unknown (no validated source found)"
   - Number placeholder ($Z, A%) → Apply proxy protocol OR mark as "Unknown (calculation required)"
   - Evidence type mismatch → "Unknown (evidence type mismatch)"

EVIDENCE-TYPE VALIDATION:
Before passing through any claim:
- Market size/pricing claims must NOT cite epidemiology/disease burden papers
- Disease burden claims must NOT cite market reports
- If mismatch detected: replace with "Unknown (evidence type mismatch)" + log to unknowns[]

OUTPUT JSON SCHEMA:
{
  "clean_step_outputs": {
    "step0": { /* sanitized version of step0 */ },
    "step1": { /* sanitized version of step1 */ }
  },
  "issues_found": [
    {
      "location": "step3.tam.value",
      "offending_text": "$Z million",
      "token_type": "single_letter_standin",
      "sentence_context": "The TAM is estimated at $Z million based on...",
      "fix_applied": "replaced_with_unknown"
    }
  ],
  "unknowns": [
    {
      "type": "calculation_required",
      "original_token": "$Z million",
      "what_is_missing": "Actual TAM value",
      "what_would_validate": "Market research report with AU market size"
    }
  ]
}`
    },
    {
      step_name: "assemble_sections_html",
      step_description: "Generate report sections as clean HTML narrative",
      phase: "assembly" as const,
      model_tier: "balanced" as const,
      prompt_template: `STEP ${maxAIStep + 2} — Assemble Sections as HTML

${generateWriterStancePreamble()}

INPUTS (from previous steps):
- All prior step outputs: ${stepRefs}
- Pre-Assembly Sanitiser output: {{step${maxAIStep + 1}}}
- Grant: {{grantName}} ({{grantVersionLabel}})

PURPOSE:
Transform research findings into a cohesive HTML narrative report for grant assessors.
Use the clean_step_outputs from the Pre-Assembly Sanitiser step.

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
6. Market Sizing (TAM/SAM/SOM) with:
   - BOTH top-down and bottom-up methodologies presented
   - Assumptions register as a table with columns: ID, Description, Value, Confidence, Defensibility, Source
   - Sensitivity summary as a table showing base/low/high for TAM/SAM/SOM
   - Reconciliation explanation in assessor language
   - Sanity check results (passed/failed with notes)
   - Why assumptions are conservative / audit-ready
7. IP and Regulatory Pathway
8. Economic Impact
9. Stakeholders and Partners
10. Data Gaps and Validation Needs

HTML FORMATTING:
- Use <h2> for main sections, <h3> for subsections
- Use <p> for paragraphs, <ul><li> for lists
- Citation markers: <sup>[S0-1]</sup>
- Table anchors: <!-- TABLE:competitors -->, <!-- TABLE:market_sizing -->, <!-- TABLE:partners -->

FORBIDDEN (Hard Fail):
- NO [...] bracket markers with internal IDs
- NO {...} curly placeholders
- NO "undefined" anywhere
- NO $Z, A%, B%, C% single-letter stand-ins
- NO "B additional jobs" or similar single-letter quantities

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
      prompt_template: `STEP ${maxAIStep + 3} — Build Tables and Sources (HTML)

${generateWriterStancePreamble()}

INPUTS:
- All prior step outputs: ${stepRefs}
- Pre-Assembly Sanitiser output: {{step${maxAIStep + 1}}}

PURPOSE:
Compile comparison tables and consolidated citations from all research steps.

TABLES TO CREATE:
1. Competitor comparison (features, pricing, market position)
2. TAM/SAM/SOM summary with calculations (MUST include both top-down and bottom-up)
3. Assumptions register table (ID, Description, Value, Confidence, Defensibility, Source)
4. Partner capability matrix
5. Any other tabular data from research

SOURCE CONSOLIDATION:
Compile ALL citations from all steps into a single deduplicated list.
Convert all [S0-#] markers to APA format: (Author, Year)

OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - no code fences
2. First character must be {, last must be }
3. Tables must be valid HTML <table> elements
4. NO forbidden tokens in any table content

OUTPUT JSON SCHEMA:
{
  "tables": {
    "competitors": "<table class=\\"data-table\\">...</table>",
    "market_sizing": "<table class=\\"data-table\\">...</table>",
    "assumptions_register": "<table class=\\"data-table\\">...</table>",
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
      prompt_template: `STEP ${maxAIStep + 4} — Finalize Report (HTML)

${generateWriterStancePreamble()}

INPUT DATA:
- Step ${maxAIStep + 2} ({{step${maxAIStep + 2}}}): Contains "sections_html" and "data_gaps"
- Step ${maxAIStep + 3} ({{step${maxAIStep + 3}}}): Contains "tables" and "all_sources"

YOUR TASK:
1. PARSE the JSON from both steps
2. Get "sections_html" from Step ${maxAIStep + 2}
3. Replace table anchors with tables from Step ${maxAIStep + 3}:
   - <!-- TABLE:competitors --> → tables.competitors
   - <!-- TABLE:market_sizing --> → tables.market_sizing
   - <!-- TABLE:assumptions_register --> → tables.assumptions_register
   - <!-- TABLE:partners --> → tables.partners
4. Append References section with formatted APA citations
5. Combine data_gaps from both steps

CRITICAL OUTPUT REQUIREMENTS:
1. Return ONLY valid JSON - NO code fences
2. First character must be {, last must be }
3. "report_html" MUST contain complete merged HTML

FORBIDDEN (Hard Fail - Reject if present):
- [S0-1], [ARTICLE-1], [step9], [Source1] or any bracketed internal markers
- {TBD}, $[Amount] or any curly/budget placeholders
- $Z, A%, B%, C% or any single-letter stand-ins
- "B additional jobs", "X million" or single-letter quantities
- "undefined" anywhere in the output

OUTPUT JSON SCHEMA:
{
  "title": "Grant Report: [Project Title]",
  "report_html": "<h2>Executive Summary</h2>...[merged HTML with tables]...<h2>References</h2>...",
  "all_sources": [{"id": "S0-1", "mla_citation": "...", "url": "..."}],
  "data_gaps": ["gap1", "gap2"],
  "tables": {"competitors": "...", "market_sizing": "...", "partners": "..."}
}`
    },
    {
      step_name: "finalize_citations",
      step_description: "Final citation validation gate and APA normalization",
      phase: "render" as const,
      model_tier: "lite" as const,
      prompt_template: `STEP ${maxAIStep + 5} — Finalize Citations (Validation Gate)

${generateWriterStancePreamble()}

INPUT DATA:
- Step ${maxAIStep + 4} ({{step${maxAIStep + 4}}}): Contains "report_html" and "all_sources"

YOUR TASK:
Perform final citation validation and produce clean APA-formatted report.

BIDIRECTIONAL VALIDATION (Mandatory):
1. Every in-text citation MUST map to exactly one References entry
2. Every References entry MUST be cited at least once OR removed
3. No orphan citations (cited but no reference)
4. No orphan references (reference but never cited)
5. No malformed "n.d." citations unless genuinely no date (add retrieval date if so)

FINAL FORBIDDEN TOKEN SCAN:
Scan the entire report_html for ANY remaining forbidden tokens:
- [S0-1], [ARTICLE-1], [step9], [Source1] - internal markers
- {TBD}, $[Amount] - placeholders
- $Z, A%, B%, C% - single-letter stand-ins
- "undefined" adjacent to markers

If ANY forbidden token found:
- Remove it and log to violations[]
- If removal breaks sentence meaning: replace with "(citation unavailable)"

CITATION FORMAT:
All citations must be APA in-text format: (Author, Year)
Linked to references section: <a href="#ref-N">(Author, Year)</a>

OUTPUT JSON SCHEMA:
{
  "report_html": "<h2>Executive Summary</h2>...[final clean HTML]...",
  "references_html": "<section class=\\"references-section\\"><h2>References</h2><ol>...</ol></section>",
  "citation_audit": {
    "total_citations": 0,
    "citations_resolved": 0,
    "orphan_citations_removed": 0,
    "orphan_references_removed": 0,
    "malformed_dates_fixed": 0
  },
  "violations": [
    { "token": "[S0-1]", "location": "paragraph 3", "action": "removed" }
  ],
  "unknowns": []
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
    adequateLength: prompt.length >= 1500 ? 5 : Math.round((prompt.length / 1500) * 5 * 10) / 10
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
