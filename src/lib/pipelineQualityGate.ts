/**
 * Pipeline Quality Gate - Tier 1: Structural Validation (instant, deterministic)
 * 
 * Fast local checks that never produce false positives:
 * - Sequential step numbering
 * - Empty prompt templates
 * - Duplicate step names
 * 
 * Forward reference detection is handled by pipelineValidation.ts (validatePostReorder)
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StructuralIssue {
  step_number?: number;
  step_name?: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface StructuralCheckResult {
  issues: StructuralIssue[];
  pass: boolean;
}

/** AI-powered analysis result (Tier 2, from validate-pipeline edge function) */
export interface AIAnalysisIssue {
  step_number: number;
  step_name: string;
  category: 'data_flow' | 'redundancy' | 'sequencing' | 'completeness' | 'contract_mismatch';
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface AIAnalysisResult {
  verdict: 'pass' | 'issues_found' | 'fail';
  overall_notes: string;
  issues: AIAnalysisIssue[];
  strengths: string[];
}

export interface DataFlowIssue {
  step_number: number;
  step_name: string;
  severity: 'error' | 'warning';
  message: string;
  referenced_variable: string;
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
// STRUCTURAL CHECKS (Tier 1 — instant, deterministic)
// ============================================================================

/**
 * Run all structural checks on a pipeline.
 * These are fast, deterministic, and never produce false positives.
 */
export function checkStructuralIssues(steps: PipelineStep[]): StructuralCheckResult {
  const issues: StructuralIssue[] = [];

  if (steps.length === 0) {
    issues.push({ severity: 'error', message: 'Pipeline has no steps' });
    return { issues, pass: false };
  }

  // 1. Check for duplicate step names
  const nameCount = new Map<string, number>();
  for (const step of steps) {
    nameCount.set(step.step_name, (nameCount.get(step.step_name) || 0) + 1);
  }
  for (const [name, count] of nameCount) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        step_name: name,
        message: `Duplicate step name "${name}" appears ${count} times`,
      });
    }
  }

  // 2. Check step numbering (sequential from 0, no gaps)
  const sortedNumbers = [...steps.map(s => s.step_number)].sort((a, b) => a - b);
  for (let i = 0; i < sortedNumbers.length; i++) {
    if (sortedNumbers[i] !== i) {
      issues.push({
        severity: 'error',
        message: `Step numbering gap: expected step ${i} but found step ${sortedNumbers[i]}`,
      });
      break;
    }
  }

  // 3. Check for empty prompt templates
  for (const step of steps) {
    if (!step.prompt_template || step.prompt_template.trim().length === 0) {
      issues.push({
        severity: 'error',
        step_number: step.step_number,
        step_name: step.step_name,
        message: `Step "${step.step_name}" has an empty prompt template`,
      });
    }
  }

  return {
    issues,
    pass: issues.filter(i => i.severity === 'error').length === 0,
  };
}
