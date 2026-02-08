/**
 * Pipeline Quality Gate - Comprehensive validation for generated prompt bundles
 * 
 * This module evaluates pipelines for:
 * - Structural completeness (core steps, sequencing)
 * - Rubric/inputs traceability
 * - Evidence discipline and auditability
 * - Assessor insight quality
 * - Commercial reality layer ("researcher gap filling")
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
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Core steps that MUST be present in every valid pipeline
 */
export const CORE_STEP_NAMES = [
  'build_source_pack',
  'market_basis_selection_and_scope',  // NEW: Determines correct parent market before TAM/SAM/SOM
  'rubric_traceability_matrix',
  'assessor_insight_layer',
  'assumptions_register',
  'tam_sam_som_dual_methodology',  // Assessor-grade market sizing with dual methodology + 3x reconciliation
  'comparables_market_signals',
  'additionality_and_benefit_case',
  'commercialisation_logic',
  'risk_register_and_governance',
  'budget_logic_and_value_for_money',
  'pre_assembly_sanitiser',  // Scans all outputs for forbidden tokens before assembly
  'report_assembly',
  'finalize_citations',
] as const;

export type CoreStepName = typeof CORE_STEP_NAMES[number];

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
  // Market sizing placeholder patterns (assessor-grade TAM/SAM/SOM requirement)
  { pattern: /\$Z\b/gi, name: '$Z placeholder' },
  { pattern: /\bA%\b/g, name: 'A% placeholder' },
  { pattern: /\bB%\b/g, name: 'B% placeholder' },
  { pattern: /\bC%\b/g, name: 'C% placeholder' },
  { pattern: /\bPROXY\b(?![_\s]*(estimate|method|calculation|protocol))/gi, name: 'PROXY placeholder (without method)' },
];

const MINIMUM_PROMPT_LENGTH = 1500;
const MINIMUM_TOTAL_STEPS = 14;  // Updated to include market_basis_selection_and_scope + pre_assembly_sanitiser

// ============================================================================
// HARD-FAIL VALIDATION
// ============================================================================

/**
 * Check for hard-fail conditions that immediately reject a pipeline
 * Returns array of failure reasons (empty = pass)
 */
export function checkHardFails(steps: PipelineStep[]): string[] {
  const failures: string[] = [];

  // 1. Check minimum step count
  if (steps.length < MINIMUM_TOTAL_STEPS) {
    failures.push(`Total steps (${steps.length}) < minimum required (${MINIMUM_TOTAL_STEPS})`);
  }

  // 2. Check for missing core steps
  const stepNames = new Set(steps.map(s => s.step_name));
  const missingCore = CORE_STEP_NAMES.filter(name => !stepNames.has(name));
  if (missingCore.length > 0) {
    failures.push(`Missing core steps: ${missingCore.join(', ')}`);
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
    // Missing prompt
    if (!step.prompt_template || step.prompt_template.trim().length === 0) {
      failures.push(`Step "${step.step_name}" is missing prompt_template`);
      continue;
    }

    // Too short
    if (step.prompt_template.length < MINIMUM_PROMPT_LENGTH) {
      failures.push(`Step "${step.step_name}" prompt_template (${step.prompt_template.length} chars) < ${MINIMUM_PROMPT_LENGTH} minimum`);
    }

    // Forbidden patterns
    for (const { pattern, name } of HARD_FAIL_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex state
      if (pattern.test(step.prompt_template)) {
        failures.push(`Step "${step.step_name}" contains forbidden pattern: ${name}`);
      }
    }
  }

  // 6. Check finalize_citations has sanitizer requirement
  const finalizeStep = steps.find(s => s.step_name === 'finalize_citations');
  if (finalizeStep) {
    const prompt = finalizeStep.prompt_template.toLowerCase();
    const hasCitationValidation = 
      prompt.includes('validate') && prompt.includes('citation') ||
      prompt.includes('strip') && prompt.includes('marker') ||
      prompt.includes('remove') && prompt.includes('bracket') ||
      prompt.includes('sanitize') ||
      prompt.includes('forbidden') && prompt.includes('pattern');
    
    if (!hasCitationValidation) {
      failures.push('finalize_citations lacks sanitizer/validation requirement for internal markers');
    }
  }

  return failures;
}

// ============================================================================
// SCORED RUBRIC CATEGORIES (0-20 each, 100 total)
// ============================================================================

/**
 * Category A: Structural Completeness (0-20)
 * A1: Core steps present and ordered (0-10)
 * A2: Archetype modules included (0-10)
 */
export function scoreStructuralCompleteness(steps: PipelineStep[]): number {
  let score = 0;

  // A1: Core steps present and ordered (0-10)
  const stepNames = steps.map(s => s.step_name);
  const allCorePresent = CORE_STEP_NAMES.every(name => stepNames.includes(name));
  
  if (allCorePresent) {
    // Check ordering: build_source_pack should be early, report_assembly/finalize_citations last
    const buildSourceIdx = stepNames.indexOf('build_source_pack');
    const reportAssemblyIdx = stepNames.indexOf('report_assembly');
    const finalizeIdx = stepNames.indexOf('finalize_citations');
    
    const properOrder = 
      buildSourceIdx <= 2 && // build_source_pack early
      reportAssemblyIdx > finalizeIdx - 3 && // report_assembly near end
      finalizeIdx === steps.length - 1; // finalize_citations last
    
    score += properOrder ? 10 : 5;
  }

  // A2: Archetype modules included (0-10)
  const archetypeKeywords = ['market', 'competitor', 'clinical', 'regulatory', 'emissions', 'defence'];
  const hasArchetypeLogic = steps.some(s => 
    archetypeKeywords.some(kw => 
      s.step_name.toLowerCase().includes(kw) || 
      s.step_description.toLowerCase().includes(kw)
    )
  );
  
  // Check if steps reference rubric mapping
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

  // B1: Rubric coverage guarantee (0-10)
  const rubricStep = steps.find(s => s.step_name === 'rubric_traceability_matrix');
  if (rubricStep) {
    const prompt = rubricStep.prompt_template.toLowerCase();
    const hasExplicitCoverage = 
      (prompt.includes('every') || prompt.includes('all')) &&
      (prompt.includes('rubric') || prompt.includes('section') || prompt.includes('criterion'));
    const hasGapHandling = 
      prompt.includes('gap') || 
      prompt.includes('missing') || 
      prompt.includes('not addressed');
    
    score += hasExplicitCoverage && hasGapHandling ? 10 : hasExplicitCoverage || hasGapHandling ? 5 : 0;
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
 * C1: Evidence-type matching (0-7)
 * C2: Source ID integrity (0-7)
 * C3: Numeric claim discipline (0-6)
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
 * D1: Assessor intent + failure modes (0-8)
 * D2: Genericness prevention gate (0-6)
 * D3: Additionality discipline (0-6)
 */
export function scoreAssessorInsight(steps: PipelineStep[]): number {
  let score = 0;

  // D1: Assessor intent + failure modes (0-8)
  const insightStep = steps.find(s => s.step_name === 'assessor_insight_layer');
  if (insightStep) {
    const prompt = insightStep.prompt_template.toLowerCase();
    const hasAssessorIntent = prompt.includes('assessor_intent') || prompt.includes('assessor intent');
    const hasFailureModes = prompt.includes('failure_mode') || prompt.includes('failure mode');
    const hasEvidencePlan = prompt.includes('evidence_plan') || prompt.includes('evidence plan');
    
    score += hasAssessorIntent && hasFailureModes && hasEvidencePlan ? 8 : 
             (hasAssessorIntent ? 3 : 0) + (hasFailureModes ? 3 : 0) + (hasEvidencePlan ? 2 : 0);
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

  // D3: Additionality discipline (0-6)
  const additionalityStep = steps.find(s => s.step_name === 'additionality_and_benefit_case');
  if (additionalityStep) {
    const prompt = additionalityStep.prompt_template.toLowerCase();
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
 * E1: Buyer pathway (0-7)
 * E2: Pricing anchors (0-7)
 * E3: Competitor comparability (0-6)
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
 * Detect red flags that warrant auto-repair even if score passes
 */
export function detectRedFlags(steps: PipelineStep[]): string[] {
  const flags: string[] = [];
  const allPrompts = steps.map(s => s.prompt_template.toLowerCase()).join(' ');

  // 1. Comparables not forced to ≥5
  const comparablesStep = steps.find(s => s.step_name === 'comparables_market_signals');
  if (comparablesStep) {
    const prompt = comparablesStep.prompt_template.toLowerCase();
    const forcesMinimum = 
      prompt.includes('≥5') || prompt.includes('>= 5') || 
      prompt.includes('at least 5') || prompt.includes('minimum 5') ||
      prompt.includes('5 or more');
    
    if (!forcesMinimum) {
      flags.push('comparables_market_signals does not require ≥5 named entities');
    }
  }

  // 2. TAM/SAM/SOM allows "Unknown" without proxy
  const marketSteps = steps.filter(s => 
    s.step_name.includes('tam') || s.step_name.includes('sam') || s.step_name.includes('som') ||
    s.step_name.includes('market') || s.step_name.includes('sizing')
  );
  
  for (const step of marketSteps) {
    const prompt = step.prompt_template.toLowerCase();
    const allowsUnknown = prompt.includes('unknown') && !prompt.includes('proxy');
    
    if (allowsUnknown) {
      flags.push(`${step.step_name} allows "Unknown" for TAM/SAM/SOM without proxy requirement`);
    }
  }
  
  // 2b. market_basis_selection_and_scope validation (NEW)
  const marketBasisStep = steps.find(s => s.step_name === 'market_basis_selection_and_scope');
  if (marketBasisStep) {
    const prompt = marketBasisStep.prompt_template.toLowerCase();
    
    // Check for buyer/payer requirement
    const hasBuyerPathway = 
      prompt.includes('buyer') && (prompt.includes('payer') || prompt.includes('decision'));
    
    // Check for modality/class requirement
    const hasModalityClass = 
      prompt.includes('modality') || prompt.includes('class') || prompt.includes('category');
    
    // Check for geography justification
    const hasGeographyJustification = 
      prompt.includes('geography') && prompt.includes('justif');
    
    // Check for exclusion of generic markets
    const banGenericMarkets = 
      (prompt.includes('generic') && prompt.includes('not')) ||
      (prompt.includes('global medtech') && prompt.includes('not'));
    
    if (!hasBuyerPathway) {
      flags.push('market_basis_selection_and_scope lacks buyer/payer pathway requirement');
    }
    if (!hasModalityClass) {
      flags.push('market_basis_selection_and_scope lacks modality/class requirement');
    }
    if (!hasGeographyJustification) {
      flags.push('market_basis_selection_and_scope lacks geography justification');
    }
    if (!banGenericMarkets) {
      flags.push('market_basis_selection_and_scope does not ban generic parent markets');
    }
  }
  
  // 2c. tam_sam_som_dual_methodology must require dual methodology + 3x reconciliation
  const dualMethodStep = steps.find(s => s.step_name === 'tam_sam_som_dual_methodology');
  if (dualMethodStep) {
    const prompt = dualMethodStep.prompt_template.toLowerCase();
    
    // Check for dual methodology requirement
    const hasTopDown = prompt.includes('top-down') || prompt.includes('top_down');
    const hasBottomUp = prompt.includes('bottom-up') || prompt.includes('bottom_up');
    
    if (!hasTopDown || !hasBottomUp) {
      flags.push('tam_sam_som_dual_methodology lacks dual methodology requirement (must have both top-down AND bottom-up)');
    }
    
    // Check for assumptions register requirement
    const hasAssumptionRegister = 
      prompt.includes('assumption_id') || 
      prompt.includes('assumptions_register') ||
      (prompt.includes('assumption') && prompt.includes('register'));
    
    if (!hasAssumptionRegister) {
      flags.push('tam_sam_som_dual_methodology lacks assumptions_register requirement');
    }
    
    // Check for sensitivity analysis requirement
    const hasSensitivity = 
      prompt.includes('sensitivity') && 
      (prompt.includes('low') && prompt.includes('high') || prompt.includes('base'));
    
    if (!hasSensitivity) {
      flags.push('tam_sam_som_dual_methodology lacks sensitivity analysis requirement (base/low/high cases)');
    }
    
    // Check for sanity checks requirement
    const hasSanityChecks = 
      prompt.includes('sanity check') || prompt.includes('sanity_check') ||
      (prompt.includes('pricing') && prompt.includes('anchor') && prompt.includes('consistent')) ||
      prompt.includes('arithmetic');
    
    if (!hasSanityChecks) {
      flags.push('tam_sam_som_dual_methodology lacks sanity checks requirement');
    }
    
    // Check for 3x reconciliation requirement (NEW - updated from 30%)
    const has3xReconciliation = 
      prompt.includes('3x') || prompt.includes('3 times') || 
      prompt.includes('300%') ||
      (prompt.includes('reconcil') && prompt.includes('converge'));
    
    if (!has3xReconciliation) {
      flags.push('tam_sam_som_dual_methodology lacks 3x convergence reconciliation rule');
    }
    
    // Check for arithmetic consistency sanity check (NEW)
    const hasArithmeticCheck = 
      prompt.includes('arithmetic') || 
      (prompt.includes('population') && prompt.includes('price') && prompt.includes('penetration') && prompt.includes('='));
    
    if (!hasArithmeticCheck) {
      flags.push('tam_sam_som_dual_methodology lacks arithmetic consistency sanity check (pop × price × penetration = SOM)');
    }
    
    // Check for scope consistency (NEW)
    const hasScopeCheck = 
      (prompt.includes('scope') && prompt.includes('consisten')) ||
      (prompt.includes('same product') && prompt.includes('same buyer')) ||
      prompt.includes('scope consistency');
    
    if (!hasScopeCheck) {
      flags.push('tam_sam_som_dual_methodology lacks scope consistency sanity check');
    }
    
    // Check for defensibility notes (NEW)
    const hasDefensibilityNotes = 
      prompt.includes('defensibility_notes') ||
      prompt.includes('defensibility notes') ||
      (prompt.includes('why') && prompt.includes('parent market') && prompt.includes('correct'));
    
    if (!hasDefensibilityNotes) {
      flags.push('tam_sam_som_dual_methodology lacks defensibility_notes section requirement');
    }
  }

  // 3. Report assembly lacks grant-writer voice
  const assemblyStep = steps.find(s => s.step_name === 'report_assembly');
  if (assemblyStep) {
    const prompt = assemblyStep.prompt_template.toLowerCase();
    const hasGrantWriterVoice = 
      prompt.includes('grant writer') || prompt.includes('grant-writer') ||
      prompt.includes('assessor') && prompt.includes('write') ||
      prompt.includes('rubric') && prompt.includes('title');
    
    if (!hasGrantWriterVoice) {
      flags.push('report_assembly lacks grant-writer voice instruction');
    }
  }

  // 4. Finalize citations lacks bracket sanitizer
  const finalizeStep = steps.find(s => s.step_name === 'finalize_citations');
  if (finalizeStep) {
    const prompt = finalizeStep.prompt_template.toLowerCase();
    const hasSanitizer = 
      prompt.includes('bracket') && (prompt.includes('strip') || prompt.includes('remove') || prompt.includes('sanitize')) ||
      prompt.includes('[') && prompt.includes('forbidden');
    
    if (!hasSanitizer) {
      flags.push('finalize_citations lacks bracket sanitizer rule');
    }
    
    // Check for bidirectional citation validation requirement
    const hasBidirectional = 
      prompt.includes('bidirectional') ||
      (prompt.includes('every') && prompt.includes('citation') && prompt.includes('reference')) ||
      (prompt.includes('orphan') && (prompt.includes('citation') || prompt.includes('reference')));
    
    if (!hasBidirectional) {
      flags.push('finalize_citations lacks bidirectional citation validation requirement');
    }
  }
  
  // 5. Pre-assembly sanitiser validation
  const sanitiserStep = steps.find(s => s.step_name === 'pre_assembly_sanitiser');
  if (sanitiserStep) {
    const prompt = sanitiserStep.prompt_template.toLowerCase();
    
    const hasForbiddenTokenScan = 
      prompt.includes('forbidden') || 
      prompt.includes('scan') ||
      prompt.includes('detect');
    const hasIssuesOutput = 
      prompt.includes('issues_found') || 
      prompt.includes('issues[]') ||
      prompt.includes('issues:');
    const hasCleanOutput = 
      prompt.includes('clean_step_outputs') || 
      prompt.includes('clean_outputs') ||
      prompt.includes('sanitized');
    
    if (!hasForbiddenTokenScan) {
      flags.push('pre_assembly_sanitiser lacks forbidden token scan requirement');
    }
    if (!hasIssuesOutput) {
      flags.push('pre_assembly_sanitiser lacks issues_found output requirement');
    }
    if (!hasCleanOutput) {
      flags.push('pre_assembly_sanitiser lacks clean_step_outputs requirement');
    }
  }

  return flags;
}

// ============================================================================
// REPAIR ACTION GENERATION
// ============================================================================

/**
 * Generate repair actions based on scores and red flags
 */
export function generateRepairActions(
  steps: PipelineStep[],
  result: Omit<PipelineQualityResult, 'repair_actions'>
): RepairAction[] {
  const actions: RepairAction[] = [];

  // Generate actions from red flags
  for (const flag of result.red_flags) {
    if (flag.includes('comparables') && flag.includes('≥5')) {
      actions.push({
        action: 'add_comparables_enforcement',
        target_step_name: 'comparables_market_signals',
        instructions: 'Require ≥5 named entities OR search strategy with 10+ queries explaining why not found'
      });
    }
    
    if (flag.includes('Unknown') && flag.includes('proxy')) {
      const stepName = flag.split(' ')[0];
      actions.push({
        action: 'enforce_proxy_protocol',
        target_step_name: stepName,
        instructions: 'Replace "Unknown allowed" with proxy estimate requirement + sensitivity range + confidence label'
      });
    }
    
    if (flag.includes('grant-writer voice')) {
      actions.push({
        action: 'enforce_grant_writer_voice',
        target_step_name: 'report_assembly',
        instructions: 'Add instruction: "Write like a grant writer for assessors" + map to rubric titles'
      });
    }
    
    if (flag.includes('bracket sanitizer')) {
      actions.push({
        action: 'tighten_finalize_citations',
        target_step_name: 'finalize_citations',
        instructions: 'Add explicit ban + sanitizer: no [...], no {...}, no "undefined", no internal IDs in final output'
      });
    }
  }

  // Generate actions from low category scores
  const { category_scores } = result;

  if (category_scores.commercial_reality < 14) {
    const comparablesStep = steps.find(s => s.step_name === 'comparables_market_signals');
    if (comparablesStep) {
      const hasPricingAnchors = comparablesStep.prompt_template.toLowerCase().includes('pricing anchor');
      if (!hasPricingAnchors) {
        actions.push({
          action: 'add_pricing_anchors',
          target_step_name: 'comparables_market_signals',
          instructions: 'Insert pricing_willingness_to_pay module OR force ≥3 pricing anchors with method + source_id'
        });
      }
    }
  }

  // Deduplicate by target_step_name + action
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

/**
 * Validate a pipeline and return comprehensive quality results
 */
export function validatePipelineQuality(steps: PipelineStep[]): PipelineQualityResult {
  // Step 1: Check hard-fails first
  const hard_fail_reasons = checkHardFails(steps);

  // Step 2: Calculate category scores
  const category_scores = {
    structural_completeness: scoreStructuralCompleteness(steps),
    traceability: scoreTraceability(steps),
    evidence_auditability: scoreEvidenceAuditability(steps),
    assessor_insight: scoreAssessorInsight(steps),
    commercial_reality: scoreCommercialReality(steps),
  };

  const overall_score = Object.values(category_scores).reduce((a, b) => a + b, 0);

  // Step 3: Detect red flags
  const red_flags = detectRedFlags(steps);

  // Step 4: Determine verdict
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

  // Step 5: Generate repair actions
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

  // Step 6: Build notes
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

/**
 * Inject comparables enforcement into a prompt template
 */
export function injectComparablesRequirement(prompt: string): string {
  const enforcement = `

COMPARABLES ENFORCEMENT (Mandatory):
- You MUST identify ≥5 named competitor/comparable entities
- If <5 found, document: search queries used (≥10), databases searched, why not found
- Each entity must have at least one measurable anchor (price/revenue/TRL/approval status)
`;

  // Insert before OUTPUT SCHEMA if present, otherwise append
  const outputSchemaIdx = prompt.toLowerCase().indexOf('output');
  if (outputSchemaIdx !== -1) {
    return prompt.slice(0, outputSchemaIdx) + enforcement + prompt.slice(outputSchemaIdx);
  }
  return prompt + enforcement;
}

/**
 * Inject proxy protocol into a prompt template
 */
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

/**
 * Inject grant-writer voice instruction
 */
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

/**
 * Inject citation sanitizer requirement
 */
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

/**
 * Inject dual methodology requirement for TAM/SAM/SOM steps
 */
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

/**
 * Inject market basis requirement into a prompt template
 */
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
