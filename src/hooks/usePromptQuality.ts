/**
 * Hook for calculating and managing prompt quality scores
 * Used to analyze AI-generated prompts and identify improvement opportunities
 */

export interface QualityScore {
  total: number; // 0-100
  breakdown: {
    contextHeader: number;      // 15 pts - Contains STEP N and input descriptions
    hardRules: number;          // 15 pts - Has HARD RULES or CRITICAL RULES section
    outputSchema: number;       // 20 pts - Has OUTPUT JSON SCHEMA defined
    urlValidation: number;      // 15 pts - Has URL validation requirements
    unknownHandling: number;    // 10 pts - Has unknown/fallback handling
    placeholderProhibition: number; // 10 pts - Prohibits [brackets] or {braces}
    adequateLength: number;     // 5 pts - At least 1000 characters
    validVariables: number;     // 10 pts - All {{variables}} are valid shortcodes
    proxyProtocol: number;      // 10 pts - Has proxy protocol for unavailable data
  };
  invalidVariables: string[];   // List any invalid variables found
  forwardReferences: string[];  // List forward step references ({{stepN}} where N >= current)
  hasVariablesInSchema: boolean; // True if {{variables}} found in OUTPUT SCHEMA (bad)
  forbiddenPatterns: string[];  // Detected forbidden patterns like {TBD}, [Insert...]
  recommendations: string[];
  level: 'good' | 'warning' | 'poor';
  // Assembly step validation (for finalize_report_html)
  assemblyValidation?: {
    hasReportHtmlField: boolean;
    hasPreviousStepRefs: boolean;
    errors: string[];
  };
}

import { BASE_VARIABLES, type RequiredInput } from '@/lib/pipelineValidation';

// Approved variable patterns (from shortcode specification)
const VALID_VARIABLE_PATTERNS = [
  // User inputs
  /^summary$/,
  /^publicArticleUrl$/,
  /^articleContent$/,
  /^trl$/,
  /^ipStatus$/,
  // Grant context
  /^grantName$/,
  /^grantVersionLabel$/,
  /^grantGuidelines$/,
  /^grantRubric$/,
  /^grantRubricJson$/,
  /^grantSummary$/,
  /^requiredInputs$/,
  // Source pack
  /^sources$/,
  /^unknowns$/,
  // Step outputs (step0 through step99)
  /^step\d{1,2}$/,
];

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

/**
 * Detect forbidden patterns in text
 * Returns list of pattern names found
 */
export function detectForbiddenPatterns(text: string): string[] {
  if (!text) return [];
  return FORBIDDEN_PATTERNS.filter(p => p.regex.test(text)).map(p => p.name);
}

// Check for template variables in OUTPUT SCHEMA sections (bad practice)
function hasVariablesInOutputSchema(prompt: string): boolean {
  // Find output schema sections and check for {{variables}} in them
  const schemaMatch = prompt.match(/(OUTPUT\s*JSON\s*SCHEMA|OUTPUT\s*SCHEMA|JSON\s*SCHEMA)[:\s]*(\{[\s\S]*?\n\})/gi);
  if (!schemaMatch) return false;
  
  for (const match of schemaMatch) {
    if (/\{\{(\w+)\}\}/.test(match)) {
      return true;
    }
  }
  return false;
}

/**
 * Validate variables in a prompt against approved patterns and optional dynamic inputs
 * @param prompt The prompt template to validate
 * @param requiredInputs Optional array of dynamic required input definitions from the grant
 * @param stepNumber Optional step number to validate step references
 * @param totalSteps Optional total steps in pipeline for forward reference detection
 */
function validateVariables(
  prompt: string, 
  requiredInputs: RequiredInput[] = [],
  stepNumber?: number,
  totalSteps?: number
): { 
  score: number; 
  invalid: string[]; 
  hasSchemaVars: boolean;
  forwardRefs: string[];
} {
  const variableMatches = prompt.match(/\{\{(\w+)\}\}/g) || [];
  const variables = variableMatches.map(v => v.replace(/\{\{|\}\}/g, ''));
  
  const hasSchemaVars = hasVariablesInOutputSchema(prompt);
  
  if (variables.length === 0) {
    // No variables used - that's okay for some prompts
    return { score: 10, invalid: [], hasSchemaVars, forwardRefs: [] };
  }
  
  // Build dynamic validation set from required inputs
  const dynamicInputKeys = new Set(requiredInputs.map(r => r.key));
  
  const invalid: string[] = [];
  const forwardRefs: string[] = [];
  
  for (const v of variables) {
    // Check for step references
    const stepMatch = v.match(/^step(\d+)$/);
    if (stepMatch) {
      const refStepNum = parseInt(stepMatch[1], 10);
      // If we know the step number, check for forward references
      if (stepNumber !== undefined && refStepNum >= stepNumber) {
        forwardRefs.push(v);
      }
      // If we know total steps, check for out of bounds
      if (totalSteps !== undefined && refStepNum >= totalSteps) {
        invalid.push(v);
      }
      continue;
    }
    
    // Check static patterns first
    const matchesStatic = VALID_VARIABLE_PATTERNS.some(pattern => pattern.test(v));
    if (matchesStatic) continue;
    
    // Check dynamic inputs (exact key match)
    if (dynamicInputKeys.has(v)) continue;
    
    // Variable is invalid
    invalid.push(v);
  }
  
  // Score calculation
  let score = 10;
  if (invalid.length > 0) {
    const invalidRatio = invalid.length / variables.length;
    score = invalidRatio === 0 ? 10 : invalidRatio < 0.5 ? 5 : 0;
  }
  // Penalty for forward references
  if (forwardRefs.length > 0) {
    score = Math.max(0, score - 3);
  }
  // Penalty for having template vars in output schema
  if (hasSchemaVars) {
    score = Math.max(0, score - 5);
  }
  
  return { score, invalid: [...new Set(invalid)], hasSchemaVars, forwardRefs };
}

function generateRecommendations(
  breakdown: QualityScore['breakdown'], 
  invalidVars: string[], 
  hasSchemaVars: boolean,
  forbiddenPatterns: string[],
  forwardRefs: string[] = []
): string[] {
  const recommendations: string[] = [];

  // Priority: forbidden patterns first
  if (forbiddenPatterns.length > 0) {
    recommendations.push(
      `CRITICAL: Remove forbidden patterns from prompt: ${forbiddenPatterns.join(', ')}. Use "Not publicly disclosed" or proxy estimates instead.`
    );
  }

  if (breakdown.contextHeader === 0) {
    recommendations.push('Add a STEP header with purpose and INPUTS section listing variables used');
  }
  if (breakdown.hardRules === 0) {
    recommendations.push('Add a HARD RULES or REQUIREMENTS section with 5+ explicit constraints');
  }
  if (breakdown.outputSchema === 0) {
    recommendations.push('Define an OUTPUT JSON SCHEMA with exact field structure and types');
  }
  if (breakdown.urlValidation === 0) {
    recommendations.push('Add URL validation rules (require valid URLs or explicit fallback text)');
  }
  if (breakdown.unknownHandling === 0) {
    recommendations.push('Add unknown handling protocol (proxy estimates, "unknowns" array, descriptive fallbacks)');
  }
  if (breakdown.placeholderProhibition === 0) {
    recommendations.push('Add FORBIDDEN PATTERNS section banning {TBD}, [Insert...], Hypothetical [X], Source 1/2');
  }
  if (breakdown.proxyProtocol === 0) {
    recommendations.push('Add PROXY PROTOCOL section: if data unavailable, provide conservative proxy estimate with method, inputs, sensitivity, and confidence');
  }
  if (breakdown.adequateLength < 5) {
    recommendations.push('Expand prompt to at least 1,500 characters with detailed instructions');
  }
  if (invalidVars.length > 0) {
    recommendations.push(
      `Invalid variables: ${invalidVars.join(', ')}. Use approved shortcodes: {{summary}}, {{step0}}, {{grantName}}, etc.`
    );
  }
  if (hasSchemaVars) {
    recommendations.push(
      'CRITICAL: Remove {{variable}} placeholders from OUTPUT SCHEMA section. Use descriptive text like "the IP status value" instead.'
    );
  }
  if (forwardRefs.length > 0) {
    recommendations.push(
      `Forward references detected: ${forwardRefs.map(v => `{{${v}}}`).join(', ')}. Steps cannot reference future step outputs.`
    );
  }

  return recommendations;
}

export interface CalculateQualityScoreOptions {
  requiredInputs?: RequiredInput[];
  stepNumber?: number;
  totalSteps?: number;
}

export function calculateQualityScore(
  prompt: string, 
  stepName?: string,
  options: CalculateQualityScoreOptions = {}
): QualityScore {
  if (!prompt || typeof prompt !== 'string') {
    return {
      total: 0,
      breakdown: {
        contextHeader: 0,
        hardRules: 0,
        outputSchema: 0,
        urlValidation: 0,
        unknownHandling: 0,
        placeholderProhibition: 0,
        adequateLength: 0,
        validVariables: 0,
        proxyProtocol: 0,
      },
      invalidVariables: [],
      forwardReferences: [],
      hasVariablesInSchema: false,
      forbiddenPatterns: [],
      recommendations: ['Prompt is empty or invalid'],
      level: 'poor',
    };
  }

  const { requiredInputs = [], stepNumber, totalSteps } = options;

  // Validate variables with dynamic inputs and step context
  const { 
    score: validVariablesScore, 
    invalid: invalidVariables, 
    hasSchemaVars,
    forwardRefs 
  } = validateVariables(prompt, requiredInputs, stepNumber, totalSteps);
  
  // Detect forbidden patterns
  const forbiddenPatterns = detectForbiddenPatterns(prompt);
  const forbiddenPenalty = forbiddenPatterns.length * 5; // -5 points per pattern

  // Check for proxy protocol language (good practice)
  const hasProxyProtocol = /proxy.*estimate|proxy.*calculation|if.*unavailable.*calculate|conservative.*proxy|PROXY PROTOCOL|sensitivity.*range/i.test(prompt);

  const breakdown = {
    // Context header: STEP N with purpose or INPUTS section
    contextHeader: /STEP\s*\d|INPUTS?:/i.test(prompt) ? 15 : 0,
    
    // Hard rules: explicit constraints section
    hardRules: /HARD RULES|CRITICAL RULES|REQUIREMENTS|RULES:/i.test(prompt) ? 15 : 0,
    
    // Output schema: JSON structure definition
    outputSchema: /OUTPUT.*JSON|JSON.*SCHEMA|OUTPUT.*SCHEMA|Return.*JSON/is.test(prompt) ? 20 : 0,
    
    // URL validation: requires valid URLs
    urlValidation: /URL.*valid|valid.*URL|URL.*require|source.*URL/i.test(prompt) ? 15 : 0,
    
    // Unknown handling: fallback instructions
    unknownHandling: /unknown.*handling|if.*not.*found|unknowns.*array|Not disclosed|proxy.*estimate/i.test(prompt) ? 10 : 0,
    
    // Placeholder prohibition: no brackets/braces in output
    placeholderProhibition: /\[.*\].*forbidden|placeholder.*prohibit|NEVER.*\[|Do NOT.*\[|bracket.*forbidden|FORBIDDEN.*PATTERN/i.test(prompt) ? 10 : 0,
    
    // Adequate length: at least 1000 characters (5 pts max)
    adequateLength: prompt.length >= 1500 ? 5 : Math.round((prompt.length / 1500) * 5 * 10) / 10,
    
    // Valid variables: all {{variables}} are approved shortcodes
    validVariables: validVariablesScore,
    
    // Proxy protocol: has proxy estimation protocol for unavailable data
    proxyProtocol: hasProxyProtocol ? 10 : 0,
  };

  // Calculate total with forbidden pattern penalty
  const baseTotal = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const total = Math.max(0, baseTotal - forbiddenPenalty);
  
  const recommendations = generateRecommendations(breakdown, invalidVariables, hasSchemaVars, forbiddenPatterns, forwardRefs);
  
  let level: QualityScore['level'];
  if (total >= 70) {
    level = 'good';
  } else if (total >= 40) {
    level = 'warning';
  } else {
    level = 'poor';
  }

  // Assembly step validation for finalize_report_html
  let assemblyValidation: QualityScore['assemblyValidation'];
  if (stepName === 'finalize_report_html') {
    const hasReportHtmlField = prompt.includes('"report_html"');
    // Check for step references like {{step7}}, {{step8}}, etc.
    const stepRefMatches = prompt.match(/\{\{step\d+\}\}/g) || [];
    const hasPreviousStepRefs = stepRefMatches.length >= 2;
    
    const errors: string[] = [];
    if (!hasReportHtmlField) {
      errors.push('Missing required "report_html" field in OUTPUT SCHEMA');
      recommendations.push('Add "report_html" field to OUTPUT JSON SCHEMA - this is required for report finalization');
    }
    if (!hasPreviousStepRefs) {
      errors.push('Missing references to previous assembly steps (need at least {{stepN}} and {{stepN+1}})');
      recommendations.push('Add references to previous assembly step outputs using {{stepN}} syntax');
    }
    
    assemblyValidation = {
      hasReportHtmlField,
      hasPreviousStepRefs,
      errors,
    };
  }

  return {
    total: Math.round(total),
    breakdown,
    invalidVariables,
    forwardReferences: forwardRefs,
    hasVariablesInSchema: hasSchemaVars,
    forbiddenPatterns,
    recommendations,
    level,
    assemblyValidation,
  };
}

export function getQualityColor(level: QualityScore['level']): string {
  switch (level) {
    case 'good':
      return 'text-green-600 bg-green-50 border-green-200';
    case 'warning':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'poor':
      return 'text-red-600 bg-red-50 border-red-200';
  }
}

export function getQualityBadgeVariant(level: QualityScore['level']): 'default' | 'secondary' | 'destructive' {
  switch (level) {
    case 'good':
      return 'default';
    case 'warning':
      return 'secondary';
    case 'poor':
      return 'destructive';
  }
}
