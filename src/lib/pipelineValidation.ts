/**
 * Pipeline Variable Flow Validation
 * Validates step-to-step data dependencies to prevent runtime "stuck loops"
 * caused by unresolved template variables.
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
  unresolved_variables: string[];  // Variables not available at this step
  forward_references: string[];     // {{stepN}} where N >= current step
  warnings: string[];               // Non-blocking issues
  errors: string[];                 // Blocking issues
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
  
  // Add dynamic variables from required inputs
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
    // Check for step references
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
    
    // Check if variable is in available list
    if (!availableVariables.includes(variable)) {
      unresolved.push(variable);
      
      // Check if it might be a typo of a known required input
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
  
  // Sort steps by step_number to ensure correct ordering
  const sortedSteps = [...steps].sort((a, b) => a.step_number - b.step_number);
  
  for (const step of sortedSteps) {
    const validation = validateStepVariables(step, requiredInputs, totalSteps);
    stepValidations.push(validation);
  }
  
  // Calculate summary
  const totalErrors = stepValidations.reduce((sum, v) => sum + v.errors.length, 0);
  const totalWarnings = stepValidations.reduce((sum, v) => sum + v.warnings.length, 0);
  const blockingSteps = stepValidations
    .filter(v => v.errors.length > 0)
    .map(v => v.step_number);
  
  // Collect all unique unresolved variables
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

/**
 * Auto-fix strategy: Replace unresolved variables with instructions
 * to extract from {{requiredInputs}} or mark as unavailable
 */
export function autoFixUnresolvedVariables(
  prompt: string,
  unresolvedVars: string[],
  requiredInputs: RequiredInput[] = []
): string {
  let fixed = prompt;
  
  for (const varName of unresolvedVars) {
    // Check if this is a known required input key
    const isRequiredInput = requiredInputs.some(
      input => input.key.toLowerCase() === varName.toLowerCase()
    );
    
    if (isRequiredInput) {
      // Replace with instruction to extract from requiredInputs
      const pattern = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      fixed = fixed.replace(
        pattern,
        `[Extract "${varName}" from the requiredInputs if provided, otherwise mark as "Not specified"]`
      );
    } else {
      // Replace with a descriptive placeholder
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
