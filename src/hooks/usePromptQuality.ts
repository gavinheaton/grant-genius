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
  };
  invalidVariables: string[];   // List any invalid variables found
  recommendations: string[];
  level: 'good' | 'warning' | 'poor';
  // Assembly step validation (for finalize_report_html)
  assemblyValidation?: {
    hasReportHtmlField: boolean;
    hasPreviousStepRefs: boolean;
    errors: string[];
  };
}

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
  /^grantSummary$/,
  // Source pack
  /^sources$/,
  /^unknowns$/,
  // Step outputs (step0 through step99)
  /^step\d{1,2}$/,
];

function validateVariables(prompt: string): { score: number; invalid: string[] } {
  const variableMatches = prompt.match(/\{\{(\w+)\}\}/g) || [];
  const variables = variableMatches.map(v => v.replace(/\{\{|\}\}/g, ''));
  
  if (variables.length === 0) {
    // No variables used - that's okay for some prompts
    return { score: 10, invalid: [] };
  }
  
  const invalid = variables.filter(v => 
    !VALID_VARIABLE_PATTERNS.some(pattern => pattern.test(v))
  );
  
  // Score: 10 points if all valid, 5 if some invalid, 0 if many invalid
  const invalidRatio = invalid.length / variables.length;
  const score = invalidRatio === 0 ? 10 : invalidRatio < 0.5 ? 5 : 0;
  
  return { score, invalid: [...new Set(invalid)] };
}

function generateRecommendations(breakdown: QualityScore['breakdown'], invalidVars: string[]): string[] {
  const recommendations: string[] = [];

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
    recommendations.push('Add placeholder prohibition (forbid [brackets] and {braces} in output)');
  }
  if (breakdown.adequateLength < 5) {
    recommendations.push('Expand prompt to at least 1,500 characters with detailed instructions');
  }
  if (invalidVars.length > 0) {
    recommendations.push(
      `Invalid variables: ${invalidVars.join(', ')}. Use approved shortcodes: {{summary}}, {{step0}}, {{grantName}}, etc.`
    );
  }

  return recommendations;
}

export function calculateQualityScore(prompt: string, stepName?: string): QualityScore {
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
      },
      invalidVariables: [],
      recommendations: ['Prompt is empty or invalid'],
      level: 'poor',
    };
  }

  // Validate variables first
  const { score: validVariablesScore, invalid: invalidVariables } = validateVariables(prompt);

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
    placeholderProhibition: /\[.*\].*forbidden|placeholder.*prohibit|NEVER.*\[|Do NOT.*\[|bracket.*forbidden/i.test(prompt) ? 10 : 0,
    
    // Adequate length: at least 1000 characters (5 pts max)
    adequateLength: prompt.length >= 1000 ? 5 : Math.round((prompt.length / 1000) * 5 * 10) / 10,
    
    // Valid variables: all {{variables}} are approved shortcodes
    validVariables: validVariablesScore,
  };

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const recommendations = generateRecommendations(breakdown, invalidVariables);
  
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
