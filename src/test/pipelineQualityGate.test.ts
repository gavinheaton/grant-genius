import { describe, it, expect } from "vitest";
import {
  checkStructuralIssues,
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

function createValidPipeline(): PipelineStep[] {
  const names = [
    'build_source_pack',
    'market_basis_selection',
    'rubric_traceability_matrix',
    'assessor_insight_layer',
    'assumptions_register',
    'tam_sam_som_analysis',
    'comparables_and_competitors',
    'additionality_case',
    'commercialisation_logic',
    'risk_register_governance',
    'budget_value_analysis',
    'pre_assembly_sanitiser',
    'report_assembly',
    'finalize_citations_apa',
  ];

  return names.map((name, i) => ({
    step_number: i,
    step_name: name,
    step_description: `Description for ${name}`,
    prompt_template: `STEP — ${name}\n\nYou are a research analyst. Perform ${name} analysis.\n\nINPUTS:\n- {{summary}}\n- {{step${Math.max(0, i - 1)}}}\n\nOUTPUT SCHEMA:\n{ "result": "object" }`,
  }));
}

// ============================================================================
// STRUCTURAL CHECK TESTS
// ============================================================================

describe("checkStructuralIssues", () => {
  it("should pass a valid pipeline with no issues", () => {
    const steps = createValidPipeline();
    const result = checkStructuralIssues(steps);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("should detect duplicate step names", () => {
    const steps = createValidPipeline();
    steps[1].step_name = steps[0].step_name;
    const result = checkStructuralIssues(steps);
    expect(result.pass).toBe(false);
    expect(result.issues.some(i => i.message.includes("Duplicate"))).toBe(true);
  });

  it("should detect step numbering gaps", () => {
    const steps = createValidPipeline();
    steps[5].step_number = 20;
    const result = checkStructuralIssues(steps);
    expect(result.pass).toBe(false);
    expect(result.issues.some(i => i.message.includes("gap"))).toBe(true);
  });

  it("should detect empty prompt templates", () => {
    const steps = createValidPipeline();
    steps[3].prompt_template = "";
    const result = checkStructuralIssues(steps);
    expect(result.pass).toBe(false);
    expect(result.issues.some(i => i.message.includes("empty"))).toBe(true);
  });

  it("should detect whitespace-only prompt templates", () => {
    const steps = createValidPipeline();
    steps[2].prompt_template = "   \n\n  ";
    const result = checkStructuralIssues(steps);
    expect(result.pass).toBe(false);
    expect(result.issues.some(i => i.message.includes("empty"))).toBe(true);
  });

  it("should handle empty steps array", () => {
    const result = checkStructuralIssues([]);
    expect(result.pass).toBe(false);
    expect(result.issues.some(i => i.message.includes("no steps"))).toBe(true);
  });

  it("should pass with short prompts (no length constraint)", () => {
    const steps = createValidPipeline();
    steps[0].prompt_template = "Short prompt";
    const result = checkStructuralIssues(steps);
    // Should not fail just because of prompt length
    const lengthIssues = result.issues.filter(i => i.message.includes("length") || i.message.includes("short"));
    expect(lengthIssues).toHaveLength(0);
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
      { step_number: 0, step_name: 'step_a', prompt_template: 'Use {{step2}} output' },
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
      { step_number: 1, step_name: 'step_b', prompt_template: 'Use {{step5}} output' },
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
    const previousNames = ['market_sizing', 'risk_register'];
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
