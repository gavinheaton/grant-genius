import { describe, it, expect } from "vitest";
import {
  validatePipelineQuality,
  checkHardFails,
  scoreStructuralCompleteness,
  scoreTraceability,
  scoreEvidenceAuditability,
  scoreAssessorInsight,
  scoreCommercialReality,
  detectRedFlags,
  generateRepairActions,
  detectStepRole,
  detectRoleCoverage,
  REQUIRED_ROLES,
  HARD_FAIL_PATTERNS,
  injectComparablesRequirement,
  injectProxyProtocol,
  injectGrantWriterVoice,
  injectSanitizerRequirement,
  type PipelineStep,
} from "../lib/pipelineQualityGate";
import {
  validatePostReorder,
  detectStaleReferences,
  type PipelineStep as ValidationStep,
} from "../lib/pipelineValidation";

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMinimalPrompt(stepName: string): string {
  const base = `
STEP — ${stepName}

You are a research analyst. Your task is to complete the ${stepName} analysis for grant applications.

INPUTS:
- {{summary}}: The user's 100-word research summary describing the project and its goals
- {{step0}}: Previous step output containing consolidated sources
- {{requiredInputs}}: Required inputs from the applicant in structured format

HARD RULES (CRITICAL - MUST FOLLOW):
1. Do NOT invent facts or numbers - every claim must be traceable
2. Only include sources you can validate as real and accessible
3. If specific data unavailable, use proxy calculations with shown methodology
4. NEVER use placeholder tokens like [Company] or {value} - use actual values or 'Not disclosed'
5. Prefer Australian authoritative sources (.gov.au, .edu.au, industry bodies)
6. All source_ids MUST match the S#-# format from step0
7. Never renumber or modify source_ids - preserve exactly as provided
8. Evidence-type must match claim category

URL VALIDATION RULES (for all sources):
- Every source MUST have a valid URL or explicit 'URL not available'
- Prefer government, academic, or industry body sources
- If URL cannot be verified, mark confidence as 'low'
- Validate URLs are accessible and not paywalled

UNKNOWN HANDLING PROTOCOL:
- If data unavailable, provide conservative proxy estimate with calculation shown
- Include 'unknowns' array listing what couldn't be found
- Use descriptive text like 'Not publicly disclosed' instead of 'Unknown'
- Document what would validate the missing data

FORBIDDEN PATTERNS (hard fail if present):
- No [Insert...] placeholders
- No {TBD} markers
- No triple backticks in output
- No Source1 or Source 1 style markers
- No [PROJECT NAME] or [COMPANY]

OUTPUT SCHEMA (strict JSON):
Return valid JSON with the following structure:
{
  "analysis": {
    "type": "object",
    "summary": "Brief overview of findings",
    "key_findings": ["finding1", "finding2"],
    "confidence": "high|medium|low"
  },
  "sources": [
    { "source_id": "S0-X", "url": "string", "title": "string", "date": "YYYY" }
  ],
  "unknowns": [
    { "what_is_missing": "string", "what_would_validate": "string", "proxy_attempted": true }
  ]
}

EVIDENCE-TYPE MATCHING RULE (CRITICAL):
- Market size claims require market research firms, industry reports, official stats
- Clinical/disease claims require peer-reviewed papers, registries, health authorities
- Regulatory claims require TGA/FDA/EMA guidance, PBS documents
- NEVER mix evidence types - market claims cannot use epidemiology

PROXY PROTOCOL (when direct data unavailable):
- Provide proxy estimate with calculation method shown
- Include sensitivity range (low/mid/high bounds)
- Label confidence (High/Medium/Low) with justification
- Source_ids required for each input OR explicit "ESTIMATE" label

ASSESSOR INSIGHT REQUIREMENTS:
- Consider what grant assessors are looking for in this section
- Address typical failure modes and how to avoid them
- Provide decision-grade specificity, not generic statements
- Include quantified outcomes where possible
`.trim();

  return base + '\n\n' + 'Additional context for analysis: This step contributes to the overall research pipeline by providing validated, evidence-based outputs that subsequent steps will build upon. Ensure all outputs are assessor-ready.';
}

/**
 * Create a valid pipeline using ROLE-BASED step names (not hardcoded names).
 * This proves the system works with dynamically named steps.
 */
function createValidPipeline(): PipelineStep[] {
  const stepDefs = [
    { name: 'build_source_pack', desc: 'Source gathering and evidence collection' },
    { name: 'market_basis_selection', desc: 'Market basis and scope determination' },
    { name: 'rubric_traceability_matrix', desc: 'Rubric traceability mapping' },
    { name: 'assessor_insight_layer', desc: 'Assessor insight and failure mode analysis' },
    { name: 'assumptions_register', desc: 'Assumptions register compilation' },
    { name: 'tam_sam_som_analysis', desc: 'TAM/SAM/SOM dual methodology market sizing' },
    { name: 'comparables_and_competitors', desc: 'Comparables and competitor landscape' },
    { name: 'additionality_case', desc: 'Additionality and benefit case with counterfactual' },
    { name: 'commercialisation_logic', desc: 'Commercialisation pathway logic' },
    { name: 'risk_register_governance', desc: 'Risk register and governance framework' },
    { name: 'budget_value_analysis', desc: 'Budget logic and value for money' },
    { name: 'pre_assembly_sanitiser', desc: 'Pre-assembly sanitiser scan for forbidden tokens' },
    { name: 'report_assembly', desc: 'Final report assembly' },
    { name: 'finalize_citations_apa', desc: 'Citation finalization and APA reference list' },
  ];

  return stepDefs.map((def, i) => {
    let prompt = createMinimalPrompt(def.name);
    
    if (def.name.includes('rubric')) {
      prompt += `\n\nMANDATORY: Ensure EVERY rubric section is addressed. Handle gaps and missing sections explicitly. Map all required inputs to report sections.`;
    }
    if (def.name.includes('assessor')) {
      prompt += `\n\nOutput must include: assessor_intent, failure_modes (5+ items), evidence_plan.`;
    }
    if (def.name.includes('additionality')) {
      prompt += `\n\nInclude counterfactual analysis: what would NOT happen without funding. Must output additionality_proofs[] array.`;
    }
    if (def.name.includes('comparable') || def.name.includes('competitor')) {
      prompt += `\n\nMUST identify ≥5 named entities. Include buyer pathway, who_pays, who_decides, pricing_anchor, willingness_to_pay. Group as direct/adjacent/enabler with measurable anchors.`;
    }
    if (def.name.includes('citation') || def.name.includes('apa')) {
      prompt += `\n\nCITATION SANITIZER REQUIRED: Validate every citation maps to reference. Strip all bracket markers. Remove forbidden patterns. Sanitize output. BIDIRECTIONAL: every in-text citation must map to reference, orphan references removed.`;
    }
    if (def.name.includes('report_assembly')) {
      prompt += `\n\nGRANT-WRITER VOICE: Write like a professional grant writer for expert assessors. Map content to rubric titles explicitly.`;
    }
    if (def.name.includes('tam') || def.name.includes('som')) {
      prompt += `\n\nDUAL METHODOLOGY REQUIRED: Output BOTH top-down AND bottom-up. 3x RECONCILIATION RULE. ARITHMETIC SANITY CHECK. Include assumptions_register with assumption_id, confidence, one_line_defensibility. Sensitivity analysis: base/low/high.`;
    }
    if (def.name.includes('sanitiser')) {
      prompt += `\n\nScan all outputs for forbidden tokens. Detect and clean any remaining placeholders. Output issues_found[] and clean_step_outputs.`;
    }
    
    return {
      step_number: i,
      step_name: def.name,
      step_description: def.desc,
      prompt_template: prompt,
    };
  });
}

// ============================================================================
// ROLE DETECTION TESTS
// ============================================================================

describe("Role Detection", () => {
  it("should detect source_gathering role from step name", () => {
    const step: PipelineStep = {
      step_number: 0,
      step_name: 'build_source_pack',
      step_description: 'Gather sources',
      prompt_template: createMinimalPrompt('build_source_pack'),
    };
    const role = detectStepRole(step);
    expect(role?.id).toBe('source_gathering');
  });

  it("should detect market_sizing role from TAM/SAM/SOM keywords", () => {
    const step: PipelineStep = {
      step_number: 5,
      step_name: 'market_opportunity_analysis',
      step_description: 'TAM SAM SOM calculation',
      prompt_template: createMinimalPrompt('market_opportunity'),
    };
    const role = detectStepRole(step);
    expect(role?.id).toBe('market_sizing');
  });

  it("should detect sanitiser role from keyword", () => {
    const step: PipelineStep = {
      step_number: 10,
      step_name: 'quality_scan',
      step_description: 'Pre-assembly sanitiser check',
      prompt_template: createMinimalPrompt('quality_scan'),
    };
    const role = detectStepRole(step);
    expect(role?.id).toBe('sanitiser');
  });

  it("should return null for unrecognized step", () => {
    const step: PipelineStep = {
      step_number: 3,
      step_name: 'custom_analysis',
      step_description: 'Custom analysis step',
      prompt_template: createMinimalPrompt('custom_analysis'),
    };
    const role = detectStepRole(step);
    expect(role).toBeNull();
  });

  it("should detect full role coverage for valid pipeline", () => {
    const steps = createValidPipeline();
    const coverage = detectRoleCoverage(steps);
    const requiredRoles = REQUIRED_ROLES.filter(r => r.required);
    for (const role of requiredRoles) {
      expect(coverage.has(role.id)).toBe(true);
    }
  });
});

// ============================================================================
// HARD-FAIL TESTS
// ============================================================================

describe("checkHardFails", () => {
  it("should pass valid pipeline with all required roles filled", () => {
    const steps = createValidPipeline();
    const failures = checkHardFails(steps);
    const structuralFailures = failures.filter(f => 
      f.includes('Missing required') || 
      f.includes('numbering') || 
      f.includes('Total steps') ||
      f.includes('< 1500')
    );
    expect(structuralFailures).toHaveLength(0);
  });

  it("should fail if source gathering role is missing", () => {
    const steps = createValidPipeline().filter(s => !s.step_name.includes('source'));
    // Renumber
    steps.forEach((s, i) => s.step_number = i);
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('Source Gathering'))).toBe(true);
  });

  it("should fail if step numbers have gaps", () => {
    const steps = createValidPipeline();
    steps[5].step_number = 20;
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('Step numbering invalid'))).toBe(true);
  });

  it("should fail if total steps < minimum", () => {
    const steps = createValidPipeline().slice(0, 4);
    steps.forEach((s, i) => s.step_number = i);
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('Total steps') && f.includes('< minimum required'))).toBe(true);
  });

  it("should fail if any prompt_template < 1500 chars", () => {
    const steps = createValidPipeline();
    steps[0].prompt_template = "Too short";
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('prompt_template') && f.includes('< 1500'))).toBe(true);
  });

  it("should fail if {TBD} appears in template", () => {
    const steps = createValidPipeline();
    steps[0].prompt_template += " {TBD} placeholder here";
    const failures = checkHardFails(steps);
    expect(failures.some(f => f.includes('{TBD}'))).toBe(true);
  });
});

// ============================================================================
// SCORING TESTS
// ============================================================================

describe("scoreStructuralCompleteness", () => {
  it("should score high for complete role coverage", () => {
    const steps = createValidPipeline();
    const score = scoreStructuralCompleteness(steps);
    expect(score).toBeGreaterThanOrEqual(10);
  });

  it("should score lower if required roles missing", () => {
    // Only keep a few steps (missing required roles)
    const steps = createValidPipeline().slice(4, 8);
    steps.forEach((s, i) => s.step_number = i);
    const score = scoreStructuralCompleteness(steps);
    expect(score).toBeLessThan(15);
  });
});

describe("scoreTraceability", () => {
  it("should score higher with rubric coverage", () => {
    const steps = createValidPipeline();
    const score = scoreTraceability(steps);
    expect(score).toBeGreaterThanOrEqual(5);
  });
});

describe("scoreEvidenceAuditability", () => {
  it("should score high for full evidence discipline", () => {
    const steps = createValidPipeline();
    const score = scoreEvidenceAuditability(steps);
    expect(score).toBeGreaterThanOrEqual(5);
  });
});

describe("scoreAssessorInsight", () => {
  it("should score when assessor role is detected", () => {
    const steps = createValidPipeline();
    const score = scoreAssessorInsight(steps);
    expect(score).toBeGreaterThanOrEqual(3);
  });
});

describe("scoreCommercialReality", () => {
  it("should score high for buyer pathway + pricing anchors", () => {
    const steps = createValidPipeline();
    const score = scoreCommercialReality(steps);
    expect(score).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================================
// RED-FLAG DETECTION TESTS
// ============================================================================

describe("detectRedFlags", () => {
  it("should flag if comparables not forced to ≥5", () => {
    const steps = createValidPipeline();
    const comp = steps.find(s => s.step_name.includes('comparable'));
    if (comp) {
      comp.prompt_template = createMinimalPrompt('comparables');
    }
    const flags = detectRedFlags(steps);
    expect(flags.some(f => f.includes('≥5'))).toBe(true);
  });

  it("should flag if report assembly lacks grant-writer voice", () => {
    const steps = createValidPipeline();
    const assembly = steps.find(s => s.step_name === 'report_assembly');
    if (assembly) {
      assembly.prompt_template = "STEP — report_assembly\n\nAssemble the report sections.\n\n" + "x".repeat(1400);
    }
    const flags = detectRedFlags(steps);
    expect(flags.some(f => f.includes('grant-writer voice'))).toBe(true);
  });
});

// ============================================================================
// POST-REORDER VALIDATION TESTS
// ============================================================================

describe("validatePostReorder", () => {
  it("should pass if no forward references exist", () => {
    const steps: ValidationStep[] = [
      { step_number: 0, step_name: 'step_a', prompt_template: 'Do analysis of {{summary}}' },
      { step_number: 1, step_name: 'step_b', prompt_template: 'Use {{step0}} output' },
      { step_number: 2, step_name: 'step_c', prompt_template: 'Combine {{step0}} and {{step1}}' },
    ];
    const result = validatePostReorder(steps);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("should detect forward references after reorder", () => {
    const steps: ValidationStep[] = [
      { step_number: 0, step_name: 'step_a', prompt_template: 'Use {{step2}} output' }, // forward ref!
      { step_number: 1, step_name: 'step_b', prompt_template: 'Use {{step0}} output' },
      { step_number: 2, step_name: 'step_c', prompt_template: 'Do analysis' },
    ];
    const result = validatePostReorder(steps);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.severity === 'error' && i.referenced_variable === 'step2')).toBe(true);
  });

  it("should detect references to non-existent steps", () => {
    const steps: ValidationStep[] = [
      { step_number: 0, step_name: 'step_a', prompt_template: 'Do analysis' },
      { step_number: 1, step_name: 'step_b', prompt_template: 'Use {{step5}} output' }, // doesn't exist
    ];
    const result = validatePostReorder(steps);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.message.includes('does not exist'))).toBe(true);
  });
});

describe("detectStaleReferences", () => {
  it("should detect when step reference now points to different step", () => {
    const currentSteps: ValidationStep[] = [
      { step_number: 0, step_name: 'risk_register', prompt_template: 'Do risk analysis' },
      { step_number: 1, step_name: 'market_sizing', prompt_template: 'Use {{step0}} for market' },
    ];
    const previousNames = ['market_sizing', 'risk_register']; // was swapped
    const issues = detectStaleReferences(currentSteps, previousNames);
    expect(issues.some(i => i.severity === 'warning' && i.message.includes('previously pointed to'))).toBe(true);
  });

  it("should return empty if no previous names provided", () => {
    const steps: ValidationStep[] = [
      { step_number: 0, step_name: 'step_a', prompt_template: '{{step0}}' },
    ];
    expect(detectStaleReferences(steps)).toHaveLength(0);
    expect(detectStaleReferences(steps, [])).toHaveLength(0);
  });
});

// ============================================================================
// VALIDATE PIPELINE QUALITY TESTS
// ============================================================================

describe("validatePipelineQuality", () => {
  it("should score reasonably for a valid dynamic pipeline", () => {
    const steps = createValidPipeline();
    const result = validatePipelineQuality(steps);
    expect(result.overall_score).toBeGreaterThanOrEqual(30);
    expect(result.category_scores.structural_completeness).toBeGreaterThanOrEqual(5);
  });

  it("should return 'fail' if any hard-fail triggers", () => {
    const steps = createValidPipeline();
    steps[0].prompt_template = "Too short";
    const result = validatePipelineQuality(steps);
    expect(result.verdict).toBe('fail');
    expect(result.hard_fail_reasons.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// AUTO-REPAIR INJECTION TESTS
// ============================================================================

describe("Auto-repair injections", () => {
  it("should inject comparables requirement", () => {
    const prompt = "Basic prompt\n\nOUTPUT SCHEMA:\n{}";
    const result = injectComparablesRequirement(prompt);
    expect(result).toContain('≥5');
  });

  it("should inject proxy protocol", () => {
    const prompt = "Basic prompt\n\nOUTPUT SCHEMA:\n{}";
    const result = injectProxyProtocol(prompt);
    expect(result).toContain('PROXY PROTOCOL');
  });

  it("should inject grant-writer voice", () => {
    const prompt = "Basic prompt\n\nOUTPUT SCHEMA:\n{}";
    const result = injectGrantWriterVoice(prompt);
    expect(result).toContain('grant writer');
  });

  it("should inject sanitizer requirement", () => {
    const prompt = "Basic prompt\n\nOUTPUT SCHEMA:\n{}";
    const result = injectSanitizerRequirement(prompt);
    expect(result).toContain('CITATION SANITIZER');
  });
});
