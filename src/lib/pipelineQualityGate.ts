/**
 * Pipeline Quality Gate - Comprehensive validation for generated prompt bundles
 * 
 * This module evaluates pipelines using ROLE-BASED detection (not hardcoded step names)
 * to support dynamically generated and manually reordered pipelines.
 * 
 * Categories:
 * - Structural completeness (role coverage, sequencing)
 * - Rubric/inputs traceability
 * - Evidence discipline and auditability
 * - Assessor insight quality
 * - Commercial reality layer
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PipelineQualityResult {
  overall_score: number;
  verdict: 'pass' | 'conditional_pass' | 'fail';
  hard_fail_reasons: string[];
  category_scores: {
    structural_completeness: number;
    traceability: number;
    evidence_auditability: number;
    assessor_insight: number;
    commercial_reality: number;
  };
  red_flags: string[];
  repair_actions: RepairAction[];
  notes: string;
  data_flow_issues?: DataFlowIssue[];
}

export interface DataFlowIssue {
  step_number: number;
  step_name: string;
  severity: 'error' | 'warning';
  message: string;
  referenced_variable: string;
}

export type RepairActionType =
  | 'add_missing_core_step'
  | 'strengthen_prompt_template'
  | 'enforce_proxy_protocol'
  | 'ban_forbidden_patterns'
  | 'tighten_finalize_citations'
  | 'add_comparables_enforcement'
  | 'add_pricing_anchors'
  | 'enforce_grant_writer_voice';

export interface RepairAction {
  action: RepairActionType;
  target_step_name: string;
  instructions: string;
}

export interface PipelineStep {
  step_number: number;
  step_name: string;
  step_description: string;
  prompt_template: string;
  model_tier?: string;
  is_assembly_step?: boolean;
}

// ============================================================================
// ROLE-BASED DETECTION (replaces hardcoded CORE_STEP_NAMES)
// ============================================================================

export interface FunctionalRole {
  id: string;
  label: string;
  /** Keywords to match against step_name + step_description + prompt_template */
  keywords: string[];
  /** If true, this role MUST be filled for the pipeline to pass */
  required: boolean;
  /** Expected position: 'early' (first third), 'middle', 'late' (last third) */
  expected_position: 'early' | 'middle' | 'late';
}

export const REQUIRED_ROLES: FunctionalRole[] = [
  {
    id: 'source_gathering',
    label: 'Source Gathering',
    keywords: ['source_pack', 'source pack', 'evidence gather', 'build_source', 'scrape', 'web_search', 'search_and_extract'],
    required: true,
    expected_position: 'early',
  },
  {
    id: 'market_sizing',
    label: 'Market Sizing',
    keywords: ['tam', 'sam', 'som', 'market_siz', 'market siz', 'total addressable', 'serviceable'],
    required: true,
    expected_position: 'middle',
  },
  {
    id: 'sanitiser',
    label: 'Pre-Assembly Sanitiser',
    keywords: ['sanitiser', 'sanitizer', 'pre_assembly', 'pre assembly', 'forbidden token', 'token scan', 'quality_scan'],
    required: true,
    expected_position: 'late',
  },
  {
    id: 'citation_finalization',
    label: 'Citation Finalization',
    keywords: ['finalize_citation', 'finalize citation', 'citation_clean', 'apa', 'reference list', 'clean_citations'],
    required: true,
    expected_position: 'late',
  },
  {
    id: 'report_assembly',
    label: 'Report Assembly',
    keywords: ['report_assembly', 'report assembly', 'finalize_report', 'finalize report', 'assemble_report', 'final_report'],
    required: true,
    expected_position: 'late',
  },
  {
    id: 'rubric_traceability',
    label: 'Rubric Traceability',
    keywords: ['rubric', 'traceability', 'traceability_matrix', 'rubric_map', 'criterion_map', 'assessment_criteria'],
    required: false,
    expected_position: 'middle',
  },
  {
    id: 'risk_governance',
    label: 'Risk & Governance',
    keywords: ['risk', 'governance', 'risk_register', 'risk register', 'mitigation'],
    required: false,
    expected_position: 'middle',
  },
  {
    id: 'competitor_analysis',
    label: 'Competitor / Comparables',
    keywords: ['competitor', 'comparable', 'comparables', 'market_signal', 'landscape', 'competitive'],
    required: false,
    expected_position: 'middle',
  },
  {
    id: 'assessor_insight',
    label: 'Assessor Insight',
    keywords: ['assessor_insight', 'assessor insight', 'assessor_layer', 'failure_mode', 'failure mode'],
    required: false,
    expected_position: 'middle',
  },
  {
    id: 'additionality',
    label: 'Additionality / Impact',
    keywords: ['additionality', 'benefit_case', 'benefit case', 'counterfactual', 'impact_case', 'social_impact'],
    required: false,
    expected_position: 'middle',
  },
  {
    id: 'budget_value',
    label: 'Budget / Value for Money',
    keywords: ['budget', 'value_for_money', 'value for money', 'cost_benefit', 'cost benefit'],
    required: false,
    expected_position: 'middle',
  },
  {
    id: 'market_basis',
    label: 'Market Basis / Scope',
    keywords: ['market_basis', 'market basis', 'market_scope', 'parent_market', 'parent market'],
    required: false,
    expected_position: 'early',
  },
];

/**
 * Detect which functional role a step fulfills by scanning name + description + prompt
 */
export function detectStepRole(step: PipelineStep): FunctionalRole | null {
  const searchText = [
    step.step_name,
    step.step_description,
    step.prompt_template.slice(0, 500), // Only scan beginning of prompt for performance
  ].join(' ').toLowerCase();

  for (const role of REQUIRED_ROLES) {
    if (role.keywords.some(kw => searchText.includes(kw.toLowerCase()))) {
      return role;
    }
  }
  return null;
}

/**
 * Map all steps to their detected roles
 */
export function detectRoleCoverage(steps: PipelineStep[]): Map<string, { role: FunctionalRole; step: PipelineStep }> {
  const coverage = new Map<string, { role: FunctionalRole; step: PipelineStep }>();
  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number);

  for (const step of sortedSteps) {
    const role = detectStepRole(step);
    if (role && !coverage.has(role.id)) {
      coverage.set(role.id, { role, step });
    }
  }
  return coverage;
}

// Keep legacy export for backward compatibility in tests
export const CORE_STEP_NAMES = REQUIRED_ROLES
  .filter(r => r.required)
  .map(r => r.id);

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Forbidden patterns that trigger hard-fail if found in any prompt template
 */
export const HARD_FAIL_PATTERNS: { pattern: RegExp; name: string }[] = [
  { pattern: /\{TBD\}/gi, name: '{TBD}' },
  { pattern: /\{\.\.\.\}/g, name: '{...}' },
  { pattern: /\[Insert[^\]]*\]/gi, name: '[Insert...]' },
  { pattern: /\[PROJECT\s*NAME\]/gi, name: '[PROJECT NAME]' },
  { pattern: /\[COMPANY\]/gi, name: '[COMPANY]' },
  { pattern: /Hypothetical\s+\w+/gi, name: 'Hypothetical [Entity]' },
  { pattern: /Source\s*[12]\b/gi, name: 'Source 1/2' },
  { pattern: /Source1/gi, name: 'Source1' },
  { pattern: /\[article\]/gi, name: '[article]' },
  { pattern: /```/g, name: 'Triple backticks' },
  { pattern: /\$Z\b/gi, name: '$Z placeholder' },
  { pattern: /\bA%\b/g, name: 'A% placeholder' },
  { pattern: /\bB%\b/g, name: 'B% placeholder' },
  { pattern: /\bC%\b/g, name: 'C% placeholder' },
  { pattern: /\bPROXY\b(?![_\s]*(estimate|method|calculation|protocol))/gi, name: 'PROXY placeholder (without method)' },
];

const MINIMUM_PROMPT_LENGTH = 1500;
const MINIMUM_TOTAL_STEPS = 8; // Lowered: dynamic pipelines may have fewer steps

// ============================================================================
// HARD-FAIL VALIDATION
// ============================================================================

/**
 * Check for hard-fail conditions that immediately reject a pipeline
 * Now uses role-based detection instead of exact step name matching
 */
export function checkHardFails(steps: PipelineStep[]): string[] {
  const failures: string[] = [];

  // 1. Check minimum step count
  if (steps.length < MINIMUM_TOTAL_STEPS) {
    failures.push(`Total steps (${steps.length}) < minimum required (${MINIMUM_TOTAL_STEPS})`);
  }

  // 2. Check for missing REQUIRED roles (replaces exact name matching)
  const roleCoverage = detectRoleCoverage(steps);
  const missingRoles = REQUIRED_ROLES
    .filter(r => r.required && !roleCoverage.has(r.id));
  
  if (missingRoles.length > 0) {
    failures.push(`Missing required functional roles: ${missingRoles.map(r => r.label).join(', ')}`);
  }

  // 3. Check for duplicate step names
  const duplicates = steps
    .map(s => s.step_name)
    .filter((name, idx, arr) => arr.indexOf(name) !== idx);
  if (duplicates.length > 0) {
    failures.push(`Duplicate step names: ${[...new Set(duplicates)].join(', ')}`);
  }

  // 4. Check step numbering (sequential from 0, no gaps)
  const sortedNumbers = [...steps.map(s => s.step_number)].sort((a, b) => a - b);
  for (let i = 0; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] !== i) {
      failures.push(`Step numbering invalid: expected sequential 0-${steps.length - 1}, found gap at position ${i}`);
      break;
    }
  }

  // 5. Check prompt templates
  for (const step of steps) {
    if (!step.prompt_template || step.prompt_template.trim().length === 0) {
      failures.push(`Step "${step.step_name}" is missing prompt_template`);
      continue;
    }

    if (step.prompt_template.length < MINIMUM_PROMPT_LENGTH) {
      failures.push(`Step "${step.step_name}" prompt_template (${step.prompt_template.length} chars) < ${MINIMUM_PROMPT_LENGTH} minimum`);
    }

    for (const { pattern, name } of HARD_FAIL_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(step.prompt_template)) {
        failures.push(`Step "${step.step_name}" contains forbidden pattern: ${name}`);
      }
    }
  }

  // 6. Check citation finalization role has sanitizer requirement
  const citationEntry = roleCoverage.get('citation_finalization');
  if (citationEntry) {
    const prompt = citationEntry.step.prompt_template.toLowerCase();
    const hasCitationValidation = 
      prompt.includes('validate') && prompt.includes('citation') ||
      prompt.includes('strip') && prompt.includes('marker') ||
      prompt.includes('remove') && prompt.includes('bracket') ||
      prompt.includes('sanitize') ||
      prompt.includes('forbidden') && prompt.includes('pattern');
    
    if (!hasCitationValidation) {
      failures.push(`Citation finalization step "${citationEntry.step.step_name}" lacks sanitizer/validation requirement for internal markers`);
    }
  }

  return failures;
}

// ============================================================================
// SCORED RUBRIC CATEGORIES (0-20 each, 100 total)
// ============================================================================

/**
 * Category A: Structural Completeness (0-20)
 * A1: Required role coverage (0-10)
 * A2: Ordering sanity + archetype coverage (0-10)
 */
export function scoreStructuralCompleteness(steps: PipelineStep[]): number {
  let score = 0;
  const roleCoverage = detectRoleCoverage(steps);
  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number);
  const totalSteps = sortedSteps.length;

  // A1: Required role coverage (0-10)
  const requiredRoles = REQUIRED_ROLES.filter(r => r.required);
  const requiredFilled = requiredRoles.filter(r => roleCoverage.has(r.id)).length;
  const coverageRatio = requiredFilled / requiredRoles.length;
  
  if (coverageRatio === 1) {
    // Check ordering sanity
    let orderCorrect = true;
    for (const [roleId, entry] of roleCoverage) {
      const role = entry.role;
      const stepIdx = sortedSteps.findIndex(s => s.step_number === entry.step.step_number);
      const positionRatio = stepIdx / totalSteps;
      
      if (role.expected_position === 'early' && positionRatio > 0.4) orderCorrect = false;
      if (role.expected_position === 'late' && positionRatio < 0.5) orderCorrect = false;
    }
    score += orderCorrect ? 10 : 5;
  } else {
    score += Math.round(coverageRatio * 5);
  }

  // A2: Archetype modules + rubric mapping (0-10)
  const archetypeKeywords = ['market', 'competitor', 'clinical', 'regulatory', 'emissions', 'defence', 'social', 'beneficiary', 'infrastructure'];
  const hasArchetypeLogic = steps.some(s => 
    archetypeKeywords.some(kw => 
      s.step_name.toLowerCase().includes(kw) || 
      s.step_description.toLowerCase().includes(kw)
    )
  );
  
  const hasRubricMapping = steps.some(s => 
    s.prompt_template.toLowerCase().includes('rubric') &&
    s.prompt_template.toLowerCase().includes('map')
  );
  
  score += hasArchetypeLogic && hasRubricMapping ? 10 : hasArchetypeLogic || hasRubricMapping ? 5 : 0;

  return score;
}

/**
 * Category B: Traceability (0-20)
 * B1: Rubric coverage guarantee (0-10)
 * B2: Required inputs mapping (0-10)
 */
export function scoreTraceability(steps: PipelineStep[]): number {
  let score = 0;
  const roleCoverage = detectRoleCoverage(steps);

  // B1: Rubric coverage guarantee (0-10) - find by role, not name
  const rubricEntry = roleCoverage.get('rubric_traceability');
  if (rubricEntry) {
    const prompt = rubricEntry.step.prompt_template.toLowerCase();
    const hasExplicitCoverage = 
      (prompt.includes('every') || prompt.includes('all')) &&
      (prompt.includes('rubric') || prompt.includes('section') || prompt.includes('criterion'));
    const hasGapHandling = 
      prompt.includes('gap') || 
      prompt.includes('missing') || 
      prompt.includes('not addressed');
    
    score += hasExplicitCoverage && hasGapHandling ? 10 : hasExplicitCoverage || hasGapHandling ? 5 : 0;
  } else {
    // Even without a dedicated rubric step, check if any step handles rubric coverage
    const anyRubricCoverage = steps.some(s => {
      const p = s.prompt_template.toLowerCase();
      return p.includes('rubric') && (p.includes('every') || p.includes('all')) && p.includes('section');
    });
    score += anyRubricCoverage ? 5 : 0;
  }

  // B2: Required inputs mapping (0-10)
  const hasInputsMapping = steps.some(s => {
    const prompt = s.prompt_template.toLowerCase();
    return prompt.includes('required') && 
           prompt.includes('input') && 
           (prompt.includes('map') || prompt.includes('section'));
  });
  
  const hasOutputSchemaWithInputs = steps.some(s => 
    s.prompt_template.toLowerCase().includes('output') &&
    s.prompt_template.toLowerCase().includes('schema') &&
    s.prompt_template.includes('requiredInputs')
  );
  
  score += hasInputsMapping && hasOutputSchemaWithInputs ? 10 : hasInputsMapping || hasOutputSchemaWithInputs ? 5 : 0;

  return score;
}

/**
 * Category C: Evidence Auditability (0-20)
 * Unchanged - content-based checks don't depend on step names
 */
export function scoreEvidenceAuditability(steps: PipelineStep[]): number {
  let score = 0;
  const allPrompts = steps.map(s => s.prompt_template.toLowerCase()).join(' ');

  // C1: Evidence-type matching enforcement (0-7)
  const hasEvidenceTypeCheck = 
    allPrompts.includes('evidence-type') ||
    allPrompts.includes('evidence type') ||
    (allPrompts.includes('claim category') && allPrompts.includes('allowed source')) ||
    allPrompts.includes('invalidate') && allPrompts.includes('evidence');
  
  const hasEvidenceTable = 
    allPrompts.includes('market size') && allPrompts.includes('market research') ||
    allPrompts.includes('disease burden') && allPrompts.includes('epidemiology');
  
  score += hasEvidenceTypeCheck && hasEvidenceTable ? 7 : hasEvidenceTypeCheck || hasEvidenceTable ? 3 : 0;

  // C2: Source ID integrity (0-7)
  const hasSourceIdRules = 
    (allPrompts.includes('s#-#') || allPrompts.includes('source_id')) &&
    (allPrompts.includes('never renumber') || allPrompts.includes('preserve'));
  
  const bansBracketMarkers = 
    allPrompts.includes('bracket') && 
    (allPrompts.includes('forbidden') || allPrompts.includes('never') || allPrompts.includes('ban'));
  
  score += hasSourceIdRules && bansBracketMarkers ? 7 : hasSourceIdRules || bansBracketMarkers ? 3 : 0;

  // C3: Numeric claim discipline (0-6)
  const hasNumericDiscipline = 
    allPrompts.includes('source_id required') ||
    (allPrompts.includes('numeric') && allPrompts.includes('source'));
  
  const hasProxyMethod = 
    allPrompts.includes('proxy') && 
    (allPrompts.includes('method') || allPrompts.includes('estimate'));
  
  const hasSensitivity = 
    allPrompts.includes('sensitivity') || 
    allPrompts.includes('confidence') && allPrompts.includes('range');
  
  score += hasNumericDiscipline && hasProxyMethod && hasSensitivity ? 6 : 
           (hasNumericDiscipline ? 2 : 0) + (hasProxyMethod ? 2 : 0) + (hasSensitivity ? 2 : 0);

  return Math.min(score, 20);
}

/**
 * Category D: Assessor Insight (0-20)
 * Now uses role detection instead of exact step name matching
 */
export function scoreAssessorInsight(steps: PipelineStep[]): number {
  let score = 0;
  const roleCoverage = detectRoleCoverage(steps);

  // D1: Assessor intent + failure modes (0-8) - find by role
  const insightEntry = roleCoverage.get('assessor_insight');
  if (insightEntry) {
    const prompt = insightEntry.step.prompt_template.toLowerCase();
    const hasAssessorIntent = prompt.includes('assessor_intent') || prompt.includes('assessor intent');
    const hasFailureModes = prompt.includes('failure_mode') || prompt.includes('failure mode');
    const hasEvidencePlan = prompt.includes('evidence_plan') || prompt.includes('evidence plan');
    
    score += hasAssessorIntent && hasFailureModes && hasEvidencePlan ? 8 : 
             (hasAssessorIntent ? 3 : 0) + (hasFailureModes ? 3 : 0) + (hasEvidencePlan ? 2 : 0);
  } else {
    // Check if assessor insight is embedded in other steps
    const allPrompts = steps.map(s => s.prompt_template.toLowerCase()).join(' ');
    if (allPrompts.includes('assessor') && allPrompts.includes('failure mode')) {
      score += 4;
    }
  }

  // D2: Genericness prevention (0-6)
  const allPrompts = steps.map(s => s.prompt_template.toLowerCase()).join(' ');
  const hasGenericnessGate = 
    allPrompts.includes('rewrite if generic') ||
    (allPrompts.includes('generic') && allPrompts.includes('reject'));
  
  const hasQuantifiedRequirement = 
    allPrompts.includes('quantified') || 
    allPrompts.includes('decision implications') ||
    allPrompts.includes('decision threshold');
  
  score += hasGenericnessGate && hasQuantifiedRequirement ? 6 : hasGenericnessGate || hasQuantifiedRequirement ? 3 : 0;

  // D3: Additionality discipline (0-6) - find by role
  const additionalityEntry = roleCoverage.get('additionality');
  if (additionalityEntry) {
    const prompt = additionalityEntry.step.prompt_template.toLowerCase();
    const hasCounterfactual = 
      prompt.includes('counterfactual') || 
      prompt.includes('without funding') ||
      prompt.includes('would not happen');
    
    const hasAdditionalityProofs = 
      prompt.includes('additionality_proof') || 
      prompt.includes('additionality proof');
    
    score += hasCounterfactual && hasAdditionalityProofs ? 6 : hasCounterfactual || hasAdditionalityProofs ? 3 : 0;
  }

  return Math.min(score, 20);
}

/**
 * Category E: Commercial Reality (0-20)
 * Content-based checks - independent of step names
 */
export function scoreCommercialReality(steps: PipelineStep[]): number {
  let score = 0;
  const allPrompts = steps.map(s => s.prompt_template.toLowerCase()).join(' ');

  // E1: Buyer/payer/decision pathway (0-7)
  const hasBuyerPathway = 
    allPrompts.includes('who_pays') || allPrompts.includes('who pays') ||
    allPrompts.includes('who_decides') || allPrompts.includes('who decides') ||
    allPrompts.includes('adoption') && allPrompts.includes('pathway') ||
    allPrompts.includes('procurement') ||
    allPrompts.includes('buyer pathway');
  
  score += hasBuyerPathway ? 7 : 0;

  // E2: Pricing anchors + willingness to pay (0-7)
  const hasPricingAnchors = 
    allPrompts.includes('pricing anchor') || allPrompts.includes('pricing_anchor') ||
    (allPrompts.includes('≥3') || allPrompts.includes('>= 3') || allPrompts.includes('at least 3')) &&
    allPrompts.includes('pricing');
  
  const hasWillingnessToPay = 
    allPrompts.includes('willingness_to_pay') || allPrompts.includes('willingness to pay');
  
  score += hasPricingAnchors && hasWillingnessToPay ? 7 : hasPricingAnchors || hasWillingnessToPay ? 3 : 0;

  // E3: Competitor comparability framework (0-6)
  const hasCompetitorGrouping = 
    allPrompts.includes('direct') && allPrompts.includes('adjacent') ||
    allPrompts.includes('enabler') ||
    allPrompts.includes('competitor') && allPrompts.includes('group');
  
  const hasMeasurableAnchor = 
    (allPrompts.includes('price') || allPrompts.includes('revenue') || allPrompts.includes('trl')) &&
    (allPrompts.includes('competitor') || allPrompts.includes('comparable'));
  
  score += hasCompetitorGrouping && hasMeasurableAnchor ? 6 : hasCompetitorGrouping || hasMeasurableAnchor ? 3 : 0;

  return Math.min(score, 20);
}

// ============================================================================
// RED-FLAG DETECTION
// ============================================================================

/**
 * Detect red flags - now uses role detection for step lookup
 */
export function detectRedFlags(steps: PipelineStep[]): string[] {
  const flags: string[] = [];
  const allPrompts = steps.map(s => s.prompt_template.toLowerCase()).join(' ');
  const roleCoverage = detectRoleCoverage(steps);

  // 1. Competitor/comparables step doesn't enforce ≥5
  const comparablesEntry = roleCoverage.get('competitor_analysis');
  if (comparablesEntry) {
    const prompt = comparablesEntry.step.prompt_template.toLowerCase();
    const forcesMinimum = 
      prompt.includes('≥5') || prompt.includes('>= 5') || 
      prompt.includes('at least 5') || prompt.includes('minimum 5') ||
      prompt.includes('5 or more');
    
    if (!forcesMinimum) {
      flags.push(`"${comparablesEntry.step.step_name}" does not require ≥5 named entities`);
    }
  }

  // 2. Market sizing steps allow "Unknown" without proxy
  const marketEntry = roleCoverage.get('market_sizing');
  if (marketEntry) {
    const prompt = marketEntry.step.prompt_template.toLowerCase();
    const allowsUnknown = prompt.includes('unknown') && !prompt.includes('proxy');
    if (allowsUnknown) {
      flags.push(`"${marketEntry.step.step_name}" allows "Unknown" for TAM/SAM/SOM without proxy requirement`);
    }
    
    // Check for dual methodology
    const hasTopDown = prompt.includes('top-down') || prompt.includes('top_down');
    const hasBottomUp = prompt.includes('bottom-up') || prompt.includes('bottom_up');
    if (!hasTopDown || !hasBottomUp) {
      flags.push(`"${marketEntry.step.step_name}" lacks dual methodology requirement (must have both top-down AND bottom-up)`);
    }
    
    // Check for assumptions register
    const hasAssumptionRegister = 
      prompt.includes('assumption_id') || prompt.includes('assumptions_register') ||
      (prompt.includes('assumption') && prompt.includes('register'));
    if (!hasAssumptionRegister) {
      flags.push(`"${marketEntry.step.step_name}" lacks assumptions_register requirement`);
    }
    
    // Check for sensitivity analysis
    const hasSensitivity = 
      prompt.includes('sensitivity') && 
      (prompt.includes('low') && prompt.includes('high') || prompt.includes('base'));
    if (!hasSensitivity) {
      flags.push(`"${marketEntry.step.step_name}" lacks sensitivity analysis requirement`);
    }
  }

  // 2b. Market basis validation
  const marketBasisEntry = roleCoverage.get('market_basis');
  if (marketBasisEntry) {
    const prompt = marketBasisEntry.step.prompt_template.toLowerCase();
    if (!(prompt.includes('buyer') && (prompt.includes('payer') || prompt.includes('decision')))) {
      flags.push(`"${marketBasisEntry.step.step_name}" lacks buyer/payer pathway requirement`);
    }
    if (!(prompt.includes('modality') || prompt.includes('class') || prompt.includes('category'))) {
      flags.push(`"${marketBasisEntry.step.step_name}" lacks modality/class requirement`);
    }
  }

  // 3. Report assembly lacks grant-writer voice
  const assemblyEntry = roleCoverage.get('report_assembly');
  if (assemblyEntry) {
    const prompt = assemblyEntry.step.prompt_template.toLowerCase();
    const hasGrantWriterVoice = 
      prompt.includes('grant writer') || prompt.includes('grant-writer') ||
      prompt.includes('assessor') && prompt.includes('write') ||
      prompt.includes('rubric') && prompt.includes('title');
    
    if (!hasGrantWriterVoice) {
      flags.push(`"${assemblyEntry.step.step_name}" lacks grant-writer voice instruction`);
    }
  }

  // 4. Citation finalization lacks bracket sanitizer
  const citationEntry = roleCoverage.get('citation_finalization');
  if (citationEntry) {
    const prompt = citationEntry.step.prompt_template.toLowerCase();
    const hasSanitizer = 
      prompt.includes('bracket') && (prompt.includes('strip') || prompt.includes('remove') || prompt.includes('sanitize')) ||
      prompt.includes('[') && prompt.includes('forbidden');
    
    if (!hasSanitizer) {
      flags.push(`"${citationEntry.step.step_name}" lacks bracket sanitizer rule`);
    }
    
    const hasBidirectional = 
      prompt.includes('bidirectional') ||
      (prompt.includes('every') && prompt.includes('citation') && prompt.includes('reference')) ||
      (prompt.includes('orphan') && (prompt.includes('citation') || prompt.includes('reference')));
    
    if (!hasBidirectional) {
      flags.push(`"${citationEntry.step.step_name}" lacks bidirectional citation validation requirement`);
    }
  }
  
  // 5. Sanitiser step validation
  const sanitiserEntry = roleCoverage.get('sanitiser');
  if (sanitiserEntry) {
    const prompt = sanitiserEntry.step.prompt_template.toLowerCase();
    
    if (!(prompt.includes('forbidden') || prompt.includes('scan') || prompt.includes('detect'))) {
      flags.push(`"${sanitiserEntry.step.step_name}" lacks forbidden token scan requirement`);
    }
    if (!(prompt.includes('clean') || prompt.includes('sanitized'))) {
      flags.push(`"${sanitiserEntry.step.step_name}" lacks clean output requirement`);
    }
  }

  return flags;
}

// ============================================================================
// REPAIR ACTION GENERATION
// ============================================================================

export function generateRepairActions(
  steps: PipelineStep[],
  result: Omit<PipelineQualityResult, 'repair_actions'>
): RepairAction[] {
  const actions: RepairAction[] = [];
  const roleCoverage = detectRoleCoverage(steps);

  for (const flag of result.red_flags) {
    if (flag.includes('≥5')) {
      const entry = roleCoverage.get('competitor_analysis');
      actions.push({
        action: 'add_comparables_enforcement',
        target_step_name: entry?.step.step_name || 'comparables',
        instructions: 'Require ≥5 named entities OR search strategy with 10+ queries explaining why not found'
      });
    }
    
    if (flag.includes('Unknown') && flag.includes('proxy')) {
      const entry = roleCoverage.get('market_sizing');
      actions.push({
        action: 'enforce_proxy_protocol',
        target_step_name: entry?.step.step_name || 'market_sizing',
        instructions: 'Replace "Unknown allowed" with proxy estimate requirement + sensitivity range + confidence label'
      });
    }
    
    if (flag.includes('grant-writer voice')) {
      const entry = roleCoverage.get('report_assembly');
      actions.push({
        action: 'enforce_grant_writer_voice',
        target_step_name: entry?.step.step_name || 'report_assembly',
        instructions: 'Add instruction: "Write like a grant writer for assessors" + map to rubric titles'
      });
    }
    
    if (flag.includes('bracket sanitizer')) {
      const entry = roleCoverage.get('citation_finalization');
      actions.push({
        action: 'tighten_finalize_citations',
        target_step_name: entry?.step.step_name || 'finalize_citations',
        instructions: 'Add explicit ban + sanitizer: no [...], no {...}, no "undefined", no internal IDs in final output'
      });
    }
  }

  const { category_scores } = result;
  if (category_scores.commercial_reality < 14) {
    const entry = roleCoverage.get('competitor_analysis');
    if (entry) {
      const hasPricingAnchors = entry.step.prompt_template.toLowerCase().includes('pricing anchor');
      if (!hasPricingAnchors) {
        actions.push({
          action: 'add_pricing_anchors',
          target_step_name: entry.step.step_name,
          instructions: 'Insert pricing_willingness_to_pay module OR force ≥3 pricing anchors with method + source_id'
        });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return actions.filter(a => {
    const key = `${a.target_step_name}:${a.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================================
// MAIN VALIDATION ENTRY POINT
// ============================================================================

export function validatePipelineQuality(steps: PipelineStep[]): PipelineQualityResult {
  const hard_fail_reasons = checkHardFails(steps);

  const category_scores = {
    structural_completeness: scoreStructuralCompleteness(steps),
    traceability: scoreTraceability(steps),
    evidence_auditability: scoreEvidenceAuditability(steps),
    assessor_insight: scoreAssessorInsight(steps),
    commercial_reality: scoreCommercialReality(steps),
  };

  const overall_score = Object.values(category_scores).reduce((a, b) => a + b, 0);

  const red_flags = detectRedFlags(steps);

  let verdict: 'pass' | 'conditional_pass' | 'fail';
  if (hard_fail_reasons.length > 0) {
    verdict = 'fail';
  } else if (overall_score < 75) {
    verdict = 'fail';
  } else if (overall_score < 85 || red_flags.length > 0) {
    verdict = 'conditional_pass';
  } else {
    verdict = 'pass';
  }

  const partialResult = {
    overall_score,
    verdict,
    hard_fail_reasons,
    category_scores,
    red_flags,
    notes: '',
  };

  const repair_actions = verdict === 'conditional_pass' 
    ? generateRepairActions(steps, partialResult)
    : [];

  const notes = hard_fail_reasons.length > 0
    ? `Hard-fail: ${hard_fail_reasons.slice(0, 3).join('; ')}`
    : verdict === 'conditional_pass'
    ? `Conditional pass (${overall_score}/100). ${repair_actions.length} repairs needed.`
    : `Pass (${overall_score}/100). Pipeline meets quality standards.`;

  return {
    overall_score,
    verdict,
    hard_fail_reasons,
    category_scores,
    red_flags,
    repair_actions,
    notes,
  };
}

// ============================================================================
// AUTO-REPAIR UTILITIES
// ============================================================================

export function injectComparablesRequirement(prompt: string): string {
  const enforcement = `

COMPARABLES ENFORCEMENT (Mandatory):
- You MUST identify ≥5 named competitor/comparable entities
- If <5 found, document: search queries used (≥10), databases searched, why not found
- Each entity must have at least one measurable anchor (price/revenue/TRL/approval status)
`;
  const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
  if (outputSchemaIdx !== -1) {
    return prompt.slice(0, outputSchemaIdx) + enforcement + prompt.slice(outputSchemaIdx);
  }
  return prompt + enforcement;
}

export function injectProxyProtocol(prompt: string): string {
  const protocol = `

PROXY PROTOCOL (When direct data unavailable):
- "Unknown" is NOT acceptable for TAM/SAM/SOM values
- MUST provide proxy estimate with:
  - Calculation method shown
  - Input assumptions labeled with confidence (High/Medium/Low)
  - Sensitivity range (low/mid/high)
  - Source_ids for each input OR "ESTIMATE" label
`;
  const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
  if (outputSchemaIdx !== -1) {
    return prompt.slice(0, outputSchemaIdx) + protocol + prompt.slice(outputSchemaIdx);
  }
  return prompt + protocol;
}

export function injectGrantWriterVoice(prompt: string): string {
  const voice = `

GRANT-WRITER VOICE (Mandatory):
- Write as a professional grant writer addressing expert assessors
- Map content to rubric section titles explicitly
- Use evidence-based, qualified language—no unsubstantiated claims
- Address assessor intent: what are they looking for? what fails applications?
`;
  const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
  if (outputSchemaIdx !== -1) {
    return prompt.slice(0, outputSchemaIdx) + voice + prompt.slice(outputSchemaIdx);
  }
  return prompt + voice;
}

export function injectSanitizerRequirement(prompt: string): string {
  const sanitizer = `

CITATION SANITIZER (Final Pass - Mandatory):
FORBIDDEN in final output:
- [...] bracket markers (except linked [1], [2] references)
- {...} curly placeholders
- "undefined" adjacent to source markers
- Internal IDs like [S0-1], [ARTICLE-1], [SEARCH-1]
- $[Amount] or similar budget placeholders

If any forbidden token found:
- Remove it and add entry to "unknowns" array
- If removal breaks meaning, replace with "(citation unavailable)"
`;
  const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
  if (outputSchemaIdx !== -1) {
    return prompt.slice(0, outputSchemaIdx) + sanitizer + prompt.slice(outputSchemaIdx);
  }
  return prompt + sanitizer;
}

export function injectDualMethodologyRequirement(prompt: string): string {
  const requirement = `

DUAL METHODOLOGY (Mandatory for TAM/SAM/SOM - Assessor-Grade):
You MUST output BOTH:
A) Top-down sizing: Parent market × segment share (with formula + inputs)
B) Bottom-up sizing: Units × price × penetration (with formula + inputs)

Then reconcile the two methods:
- If divergence >3x (300%), you MUST either:
  a) Revise assumptions until methods converge within 3x, OR
  b) Explicitly explain the discrepancy and narrow/expand scope
- Document actions_taken[] with every adjustment made
- Output blended_value with currency and year

ASSUMPTIONS REGISTER (Required for every market sizing input):
Each assumption must include:
- assumption_id: "A1", "A2", etc.
- assumption_name: Short label for the assumption
- value: Number or percentage (NEVER "A%" or "$Z" placeholders)
- units: What the value represents (patients, AUD, fraction)
- confidence: "High" | "Medium" | "Low"
- one_line_defensibility: Why this is reasonable (evidence-based or conservative proxy)
- evidence_support: { source_id: "S0-#" | "ESTIMATE", rationale: "..." }

SENSITIVITY ANALYSIS (Mandatory):
For each of TAM, SAM, SOM output:
- base_case: Central estimate
- low_case: Conservative bound (typically -20% to -30%)
- high_case: Optimistic bound (typically +20% to +30%)
- sensitivity_drivers[]: Top 3 assumptions that move the result most

MANDATORY SANITY CHECKS (All Must Pass Before Output):
1. ARITHMETIC CONSISTENCY: (eligible_population × price × penetration) = bottom_up_som_value (within ±5%)
2. SCOPE CONSISTENCY: TAM/SAM/SOM all refer to the same product and buyer type
3. PRICING CONSISTENCY: Implied unit price within ±30% of pricing anchors
4. PENETRATION REALISM: Year 1 penetration < 1%, Year 5 < 10% (unless exceptional justification)
5. SPEND CEILING: SOM does not exceed known category budget

For each sanity check that fails: revise assumptions AND document fix_applied, OR downgrade confidence and explain why deviation is justified.

DEFENSIBILITY NOTES (Required):
Include a defensibility_notes object with:
- why_parent_market_correct: Explanation of market category choice
- why_segment_share_reasonable: Justification for segment assumptions
- top_3_drivers_that_would_change_numbers: ["A1: penetration rate", "A3: price", "A7: population"]

EVIDENCE-TYPE ENFORCEMENT:
- Market size/growth/pricing MUST cite: market research, industry reports, procurement data, PBS/MBS
- Market sizing must NOT cite: epidemiology papers, disease burden studies
- If mismatch detected: Replace with "Unknown (evidence type mismatch)" + log to unknowns[]
`;
  const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
  if (outputSchemaIdx !== -1) {
    return prompt.slice(0, outputSchemaIdx) + requirement + prompt.slice(outputSchemaIdx);
  }
  return prompt + requirement;
}

export function injectMarketBasisRequirement(prompt: string): string {
  const requirement = `

MARKET BASIS SELECTION (Mandatory - before TAM/SAM/SOM):
Before calculating TAM/SAM/SOM, you MUST determine the correct "parent market":

1. BUYER/PAYER PATHWAY:
   - Who pays? (government agency, private payer, enterprise, consumer)
   - Who decides? (procurement committee, clinician, IT manager, end-user)
   - What's the procurement path? (tender, PBS listing, direct purchase, SaaS subscription)

2. MODALITY/CLASS:
   - Is this a therapy, diagnostic, platform, service, or device?
   - What regulatory class? (e.g., Class II device, software as medical device)
   - What category does the buyer mentally slot this into?

3. GEOGRAPHY:
   - AU-only vs Global with AU subset?
   - If Global → AU, what is the appropriate scaling factor?
   - Justify the choice with source_id

HARD RULE: Do NOT use generic parent markets like "global medtech" or "healthcare industry" unless:
- You explicitly justify why a narrower category is unavailable
- You document exclusion_rules to scope down appropriately

Output market_basis object with:
- market_type, parent_market_name, parent_market_value_aud, parent_market_source_id
- buyer_persona: { payer, decision_maker, user }
- modality_class, geography, geography_justification
- inclusion_rules[], exclusion_rules[], justification, source_ids[]
`;
  const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
  if (outputSchemaIdx !== -1) {
    return prompt.slice(0, outputSchemaIdx) + requirement + prompt.slice(outputSchemaIdx);
  }
  return prompt + requirement;
}
