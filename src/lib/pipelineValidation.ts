/**
 * Pipeline Variable Flow Validation
 * Validates step-to-step data dependencies to prevent runtime "stuck loops"
 * caused by unresolved template variables.
 * 
 * Also includes post-reorder validation to detect broken/stale references
 * after manual step resequencing.
 */

// Base variables always available (from runtime hydration)
export const BASE_VARIABLES = [
  // User inputs
  'summary',
  'publicArticleUrl',
  'articleContent',
  'trl',
  'ipStatus',
  // Grant context
  'grantName',
  'grantVersionLabel',
  'grantGuidelines',
  'grantRubric',
  'grantRubricJson',
  'grantSummary',
  'requiredInputs',
  // Source pack (from step 0)
  'sources',
  'unknowns',
] as const;

export type BaseVariable = typeof BASE_VARIABLES[number];

export interface RequiredInput {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
}

export interface VariableFlowValidation {
  step_number: number;
  step_name: string;
  variables_used: string[];
  unresolved_variables: string[];
  forward_references: string[];
  warnings: string[];
  errors: string[];
}

export interface PipelineValidationResult {
  valid: boolean;
  stepValidations: VariableFlowValidation[];
  summary: {
    total_errors: number;
    total_warnings: number;
    blocking_steps: number[];
    unresolved_variables_all: string[];
  };
}

export interface PipelineStep {
  step_number: number;
  step_name: string;
  prompt_template: string;
  step_type?: string;
}

// ============================================================================
// POST-REORDER DATA FLOW TYPES
// ============================================================================

export interface DataFlowIssue {
  step_number: number;
  step_name: string;
  severity: 'error' | 'warning';
  message: string;
  referenced_variable: string;
}

export interface PostReorderResult {
  valid: boolean;
  issues: DataFlowIssue[];
}

// ============================================================================
// CORE VALIDATION FUNCTIONS
// ============================================================================

/**
 * Extract all {{variableName}} patterns from a prompt template
 */
export function extractVariablesFromPrompt(prompt: string): string[] {
  if (!prompt) return [];
  const matches = prompt.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

/**
 * Build a list of valid variables for a given step number
 */
export function buildAvailableVariables(
  stepNumber: number,
  requiredInputs: RequiredInput[] = [],
  totalSteps: number = stepNumber + 1
): string[] {
  const available: string[] = [...BASE_VARIABLES];
  
  for (const input of requiredInputs) {
    if (input.key && !available.includes(input.key)) {
      available.push(input.key);
    }
  }
  
  // Add previous step outputs ({{step0}} through {{stepN-1}})
  for (let i = 0; i < stepNumber; i++) {
    available.push(`step${i}`);
  }
  
  return available;
}

/**
 * Validate a single step's variables
 */
export function validateStepVariables(
  step: PipelineStep,
  requiredInputs: RequiredInput[] = [],
  totalSteps: number
): VariableFlowValidation {
  const variablesUsed = extractVariablesFromPrompt(step.prompt_template);
  const availableVariables = buildAvailableVariables(step.step_number, requiredInputs, totalSteps);
  
  const unresolved: string[] = [];
  const forwardRefs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const variable of variablesUsed) {
    const stepMatch = variable.match(/^step(\d+)$/);
    if (stepMatch) {
      const refStepNum = parseInt(stepMatch[1], 10);
      if (refStepNum >= step.step_number) {
        forwardRefs.push(variable);
        errors.push(`Forward reference: {{${variable}}} references step ${refStepNum} but current step is ${step.step_number}`);
      } else if (refStepNum >= totalSteps) {
        errors.push(`Invalid reference: {{${variable}}} references step ${refStepNum} but pipeline only has ${totalSteps} steps`);
        unresolved.push(variable);
      }
      continue;
    }
    
    if (!availableVariables.includes(variable)) {
      unresolved.push(variable);
      
      const possibleMatch = requiredInputs.find(
        input => input.key.toLowerCase() === variable.toLowerCase() && input.key !== variable
      );
      
      if (possibleMatch) {
        errors.push(`Variable {{${variable}}} not found. Did you mean {{${possibleMatch.key}}}?`);
      } else {
        errors.push(`Variable {{${variable}}} is not in approved list or requiredInputs keys`);
      }
    }
  }
  
  return {
    step_number: step.step_number,
    step_name: step.step_name,
    variables_used: variablesUsed,
    unresolved_variables: unresolved,
    forward_references: forwardRefs,
    warnings,
    errors,
  };
}

/**
 * Validate the entire pipeline for variable flow consistency
 */
export function validatePipelineDataFlow(
  steps: PipelineStep[],
  requiredInputs: RequiredInput[] = []
): PipelineValidationResult {
  const totalSteps = steps.length;
  const stepValidations: VariableFlowValidation[] = [];
  
  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number);
  
  for (const step of sortedSteps) {
    const validation = validateStepVariables(step, requiredInputs, totalSteps);
    stepValidations.push(validation);
  }
  
  const totalErrors = stepValidations.reduce((sum, v) => sum + v.errors.length, 0);
  const totalWarnings = stepValidations.reduce((sum, v) => sum + v.warnings.length, 0);
  const blockingSteps = stepValidations
    .filter(v => v.errors.length > 0)
    .map(v => v.step_number);
  
  const unresolvedSet = new Set<string>();
  for (const v of stepValidations) {
    for (const uv of v.unresolved_variables) {
      unresolvedSet.add(uv);
    }
  }
  
  return {
    valid: totalErrors === 0,
    stepValidations,
    summary: {
      total_errors: totalErrors,
      total_warnings: totalWarnings,
      blocking_steps: blockingSteps,
      unresolved_variables_all: [...unresolvedSet],
    },
  };
}

// ============================================================================
// POST-REORDER VALIDATION
// ============================================================================

/**
 * Validate data flow after a reorder operation.
 * 
 * This checks that {{stepN}} references in each step's prompt still point
 * to steps that execute BEFORE the current step in the new ordering.
 * 
 * It also detects "stale" references where {{stepN}} now points to a 
 * semantically different step than originally intended.
 */
export function validatePostReorder(steps: PipelineStep[]): PostReorderResult {
  const issues: DataFlowIssue[] = [];
  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number);
  
  // Build a map: step_number -> step for quick lookup
  const stepMap = new Map<number, PipelineStep>();
  for (const step of sortedSteps) {
    stepMap.set(step.step_number, step);
  }
  
  // Build position map: step_number -> sorted position index
  const positionMap = new Map<number, number>();
  sortedSteps.forEach((step, idx) => {
    positionMap.set(step.step_number, idx);
  });

  for (const step of sortedSteps) {
    const variables = extractVariablesFromPrompt(step.prompt_template);
    const currentPosition = positionMap.get(step.step_number) ?? step.step_number;
    
    for (const variable of variables) {
      const stepMatch = variable.match(/^step(\d+)$/);
      if (!stepMatch) continue;
      
      const refStepNum = parseInt(stepMatch[1], 10);
      
      // Check 1: Does the referenced step exist?
      if (!stepMap.has(refStepNum)) {
        issues.push({
          step_number: step.step_number,
          step_name: step.step_name,
          severity: 'error',
          message: `References {{step${refStepNum}}} which does not exist in the pipeline (only ${sortedSteps.length} steps: 0-${sortedSteps.length - 1})`,
          referenced_variable: variable,
        });
        continue;
      }
      
      // Check 2: Is it a forward reference? (references a step at same or later position)
      const refPosition = positionMap.get(refStepNum) ?? refStepNum;
      if (refPosition >= currentPosition) {
        const refStep = stepMap.get(refStepNum)!;
        issues.push({
          step_number: step.step_number,
          step_name: step.step_name,
          severity: 'error',
          message: `Forward reference: {{step${refStepNum}}} ("${refStep.step_name}") is at position ${refPosition} but "${step.step_name}" is at position ${currentPosition}`,
          referenced_variable: variable,
        });
      }
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  };
}

/**
 * Detect stale references after reorder.
 * 
 * A "stale" reference is when step A references {{stepN}} but step N's
 * semantic meaning has changed because steps were reordered. We detect this
 * by checking if the step name at position N has changed relative to what
 * the referencing prompt might expect.
 * 
 * @param currentSteps - Steps in their current order
 * @param previousStepNames - Optional: ordered list of step names from before reorder
 */
export function detectStaleReferences(
  currentSteps: PipelineStep[],
  previousStepNames?: string[]
): DataFlowIssue[] {
  if (!previousStepNames || previousStepNames.length === 0) return [];
  
  const issues: DataFlowIssue[] = [];
  const sortedSteps = [...currentSteps].sort((a, b) => a.step_number - b.step_number);
  
  for (const step of sortedSteps) {
    const variables = extractVariablesFromPrompt(step.prompt_template);
    
    for (const variable of variables) {
      const stepMatch = variable.match(/^step(\d+)$/);
      if (!stepMatch) continue;
      
      const refStepNum = parseInt(stepMatch[1], 10);
      
      // Check if previous name at this position differs from current
      if (refStepNum < previousStepNames.length && refStepNum < sortedSteps.length) {
        const previousName = previousStepNames[refStepNum];
        const currentName = sortedSteps[refStepNum]?.step_name;
        
        if (previousName && currentName && previousName !== currentName) {
          issues.push({
            step_number: step.step_number,
            step_name: step.step_name,
            severity: 'warning',
            message: `{{step${refStepNum}}} previously pointed to "${previousName}" but now points to "${currentName}" after reorder`,
            referenced_variable: variable,
          });
        }
      }
    }
  }
  
  return issues;
}

// ============================================================================
// AUTO-FIX UTILITIES
// ============================================================================

/**
 * Auto-fix strategy: Replace unresolved variables with instructions
 */
export function autoFixUnresolvedVariables(
  prompt: string,
  unresolvedVars: string[],
  requiredInputs: RequiredInput[] = []
): string {
  let fixed = prompt;
  
  for (const varName of unresolvedVars) {
    const isRequiredInput = requiredInputs.some(
      input => input.key.toLowerCase() === varName.toLowerCase()
    );
    
    if (isRequiredInput) {
      const pattern = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      fixed = fixed.replace(
        pattern,
        `[Extract "${varName}" from the requiredInputs if provided, otherwise mark as "Not specified"]`
      );
    } else {
      const pattern = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      const readable = varName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
      fixed = fixed.replace(
        pattern,
        `[The ${readable} value - derive from available context or mark as "Not available"]`
      );
    }
  }
  
  return fixed;
}

/**
 * Format validation results for display
 */
export function formatValidationSummary(result: PipelineValidationResult): string {
  if (result.valid) {
    return '✓ All variables resolve correctly';
  }
  
  const lines: string[] = [];
  lines.push(`✗ ${result.summary.total_errors} error(s), ${result.summary.total_warnings} warning(s)`);
  
  if (result.summary.unresolved_variables_all.length > 0) {
    lines.push(`Unresolved: ${result.summary.unresolved_variables_all.map(v => `{{${v}}}`).join(', ')}`);
  }
  
  if (result.summary.blocking_steps.length > 0) {
    lines.push(`Blocking steps: ${result.summary.blocking_steps.join(', ')}`);
  }
  
  return lines.join('\n');
}
