import { useState, useEffect } from "react";
import { Save, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PromptBundleStep, useRegenerateStepPrompt, StepType } from "@/hooks/usePromptBundles";
import { RegeneratePromptDialog } from "./RegeneratePromptDialog";
import { StepTypeEditor } from "./StepTypeEditor";

// Processing window options in seconds
const TIMEOUT_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "30", label: "30 seconds" },
  { value: "45", label: "45 seconds" },
  { value: "60", label: "60 seconds" },
  { value: "90", label: "90 seconds" },
  { value: "120", label: "120 seconds" },
  { value: "150", label: "150 seconds" },
  { value: "180", label: "180 seconds" },
];

// Max output tokens options for AI responses
const OUTPUT_TOKEN_OPTIONS = [
  { value: "default", label: "Default (8K)" },
  { value: "8192", label: "8K tokens" },
  { value: "16384", label: "16K tokens" },
  { value: "20000", label: "20K tokens (Competitor Research)" },
  { value: "24000", label: "24K tokens (Market Sizing)" },
  { value: "32000", label: "32K tokens (Assembly)" },
  { value: "65536", label: "64K tokens (Max)" },
];

export interface GrantContext {
  grantName?: string;
  grantSummary?: string;
  rubricSummary?: string;
}

interface PromptStepEditorProps {
  step: PromptBundleStep;
  models: { value: string; label: string }[];
  canEdit: boolean;
  isSuperAdmin?: boolean;
  grantContext?: GrantContext;
  onSave: (
    stepId: string,
    data: { 
      prompt_template?: string; 
      model_override?: string | null; 
      timeout_seconds?: number | null;
      is_heavy?: boolean;
      max_expected_seconds?: number | null;
      max_output_tokens?: number | null;
      step_type?: StepType;
      step_config_json?: Record<string, unknown>;
    }
  ) => Promise<void>;
}

export function PromptStepEditor({
  step,
  models,
  canEdit,
  isSuperAdmin = false,
  grantContext,
  onSave,
}: PromptStepEditorProps) {
  const [promptTemplate, setPromptTemplate] = useState(step.prompt_template);
  const [modelOverride, setModelOverride] = useState(step.model_override || "");
  const [timeoutSeconds, setTimeoutSeconds] = useState<string>(
    step.timeout_seconds ? String(step.timeout_seconds) : "default"
  );
  const [isHeavy, setIsHeavy] = useState(step.is_heavy ?? false);
  const [maxExpectedSeconds, setMaxExpectedSeconds] = useState<string>(
    step.max_expected_seconds ? String(step.max_expected_seconds) : ""
  );
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>(
    step.max_output_tokens ? String(step.max_output_tokens) : "default"
  );
  const [stepType, setStepType] = useState<StepType>(step.step_type || "ai_prompt");
  const [stepConfig, setStepConfig] = useState<Record<string, unknown>>(
    (step.step_config_json as Record<string, unknown>) || {}
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Regeneration state
  const regeneratePrompt = useRegenerateStepPrompt();
  const [showPreview, setShowPreview] = useState(false);
  const [regeneratedData, setRegeneratedData] = useState<{
    regenerated_prompt: string;
    original_score: { total: number; level: 'good' | 'warning' | 'poor' };
    new_score: { total: number; level: 'good' | 'warning' | 'poor' };
  } | null>(null);

  // Validation helpers
  const SUSPICIOUS_PATTERNS = [
    /prompt:\s*empty/i,
    /model:\s*none/i,
    /step_name:\s*\w+\s*\nmodel:/i,
    /expects:\s*JSON\s*object/i,
  ];

  // Step-type-aware validation
  const validateStep = (): { valid: boolean; warning: string | null } => {
    // For Firecrawl search steps, validate the query template instead
    if (stepType === "firecrawl_search") {
      const query = (stepConfig.query_template as string) || "";
      if (query.length < 10) {
        return { valid: false, warning: "Search query is too short (minimum 10 characters)" };
      }
      return { valid: true, warning: null };
    }
    
    // For Firecrawl scrape steps, validate URL variable is set
    if (stepType === "firecrawl_scrape") {
      const urlVar = stepConfig.url_variable as string;
      if (!urlVar) {
        return { valid: false, warning: "URL variable must be specified" };
      }
      return { valid: true, warning: null };
    }
    
    // For AI steps, use existing prompt validation
    if (promptTemplate.length < 50) {
      return { valid: false, warning: "Prompt is too short (minimum 50 characters)" };
    }
    
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(promptTemplate)) {
        return { valid: false, warning: "Prompt contains suspicious schema-like content instead of instructions" };
      }
    }
    
    return { valid: true, warning: null };
  };

  const stepValidation = validateStep();

  useEffect(() => {
    setPromptTemplate(step.prompt_template);
    setModelOverride(step.model_override || "");
    setTimeoutSeconds(step.timeout_seconds ? String(step.timeout_seconds) : "default");
    setIsHeavy(step.is_heavy ?? false);
    setMaxExpectedSeconds(step.max_expected_seconds ? String(step.max_expected_seconds) : "");
    setMaxOutputTokens(step.max_output_tokens ? String(step.max_output_tokens) : "default");
    setStepType(step.step_type || "ai_prompt");
    setStepConfig((step.step_config_json as Record<string, unknown>) || {});
    setHasChanges(false);
  }, [step]);

  const handleStepTypeChange = (newType: StepType, newConfig: Record<string, unknown>) => {
    setStepType(newType);
    setStepConfig(newConfig);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(step.id, {
        prompt_template: promptTemplate,
        model_override: modelOverride || null,
        timeout_seconds: timeoutSeconds === "default" ? null : parseInt(timeoutSeconds, 10),
        is_heavy: isHeavy,
        max_expected_seconds: maxExpectedSeconds ? parseInt(maxExpectedSeconds, 10) : null,
        max_output_tokens: maxOutputTokens !== "default" ? parseInt(maxOutputTokens, 10) : null,
        step_type: stepType,
        step_config_json: stepConfig,
      });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    const result = await regeneratePrompt.mutateAsync({
      stepId: step.id,
      additionalContext: grantContext 
        ? `Grant: ${grantContext.grantName || 'Unknown'}. Summary: ${grantContext.grantSummary || 'N/A'}`
        : undefined,
    });
    
    setRegeneratedData(result);
    setShowPreview(true);
  };

  const handleApplyRegenerated = async () => {
    if (!regeneratedData) return;
    
    setPromptTemplate(regeneratedData.regenerated_prompt);
    setHasChanges(true);
    setShowPreview(false);
    
    // Auto-save after applying
    setIsSaving(true);
    try {
      await onSave(step.id, {
        prompt_template: regeneratedData.regenerated_prompt,
        model_override: modelOverride || null,
        timeout_seconds: timeoutSeconds === "default" ? null : parseInt(timeoutSeconds, 10),
        is_heavy: isHeavy,
        max_expected_seconds: maxExpectedSeconds ? parseInt(maxExpectedSeconds, 10) : null,
        max_output_tokens: maxOutputTokens !== "default" ? parseInt(maxOutputTokens, 10) : null,
      });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditFirst = () => {
    if (!regeneratedData) return;
    
    setPromptTemplate(regeneratedData.regenerated_prompt);
    setHasChanges(true);
    setShowPreview(false);
  };

  // Get default model based on step number
  // Heavy steps (2, 6-8, 11+) use Pro; others use Flash
  const getDefaultModel = (stepNumber: number) => {
    // Step 2: Competitor Research - benefits from Pro reasoning
    if (stepNumber === 2) return "google/gemini-3-pro-preview";
    // Steps 6-8: TAM/SAM/SOM - complex market calculations
    if (stepNumber >= 6 && stepNumber <= 8) return "google/gemini-3-pro-preview";
    // Steps 11+: Assembly and finalization
    if (stepNumber >= 11) return "google/gemini-3-pro-preview";
    // Early steps: use balanced Flash
    if (stepNumber <= 5) return "google/gemini-3-flash-preview";
    // Default fallback
    return "google/gemini-3-flash-preview";
  };

  // Get default timeout based on step number
  const getDefaultTimeout = (stepNumber: number) => {
    if (stepNumber === 0) return 90;
    if (stepNumber === 12) return 120;
    return 45;
  };

  const defaultModel = getDefaultModel(step.step_number);
  const effectiveModel = modelOverride || defaultModel;
  const defaultTimeout = getDefaultTimeout(step.step_number);

  // Determine if this is a Firecrawl step (hide AI-specific options)
  const isFirecrawlStep = stepType !== "ai_prompt";

  return (
    <div className="space-y-4 pt-4">
      {/* Step Type Editor - Super Admin only */}
      {isSuperAdmin && (
        <StepTypeEditor
          stepType={stepType}
          stepConfig={stepConfig}
          canEdit={canEdit}
          onChange={handleStepTypeChange}
        />
      )}

      {/* AI-specific options - only show for ai_prompt steps */}
      {!isFirecrawlStep && (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Processing Window</Label>
              <span className="text-xs text-muted-foreground">
                Default: {defaultTimeout}s
              </span>
            </div>
            <Select
              value={timeoutSeconds}
              onValueChange={(value) => {
                setTimeoutSeconds(value);
                setHasChanges(true);
              }}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEOUT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.value === "default" 
                      ? `Default (${defaultTimeout}s)` 
                      : option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Controls how long the AI request can run before timing out.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Model</Label>
              <span className="text-xs text-muted-foreground">
                Default: {models.find((m) => m.value === defaultModel)?.label || defaultModel}
              </span>
            </div>
            <Select
              value={effectiveModel}
              onValueChange={(value) => {
                setModelOverride(value === defaultModel ? "" : value);
                setHasChanges(true);
              }}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.label}
                    {model.value === defaultModel && " (Default)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Max Output Tokens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Max Output Tokens</Label>
              <span className="text-xs text-muted-foreground">
                Prevents output truncation
              </span>
            </div>
            <Select
              value={maxOutputTokens}
              onValueChange={(value) => {
                setMaxOutputTokens(value);
                setHasChanges(true);
              }}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Default (8K)" />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_TOKEN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Higher limits prevent truncation but increase cost. Use 20-24K for research steps.
            </p>
          </div>

          {/* Heavy Step Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor={`heavy-${step.id}`} className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Heavy Step
              </Label>
              <p className="text-xs text-muted-foreground">
                Mark this step as too heavy for Edge execution (typically &gt;45s)
              </p>
            </div>
            <Switch
              id={`heavy-${step.id}`}
              checked={isHeavy}
              onCheckedChange={(checked) => {
                setIsHeavy(checked);
                setHasChanges(true);
              }}
              disabled={!canEdit}
            />
          </div>

          {/* Max Expected Seconds */}
          <div className="space-y-2">
            <Label htmlFor={`max-seconds-${step.id}`}>Max Expected Seconds (optional)</Label>
            <Input
              id={`max-seconds-${step.id}`}
              type="number"
              min="1"
              max="300"
              value={maxExpectedSeconds}
              onChange={(e) => {
                setMaxExpectedSeconds(e.target.value);
                setHasChanges(true);
              }}
              disabled={!canEdit}
              placeholder="e.g., 45"
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Expected runtime for monitoring and alerts. Leave empty if unknown.
            </p>
          </div>
        </>
      )}

      {/* Prompt Template - only show for AI steps */}
      {!isFirecrawlStep && (
        <div className="space-y-2">
          <Label>Prompt Template</Label>
          <Textarea
            value={promptTemplate}
            onChange={(e) => {
              setPromptTemplate(e.target.value);
              setHasChanges(true);
            }}
            disabled={!canEdit}
            rows={12}
            className="font-mono text-sm"
            placeholder="Enter the prompt template..."
          />
          <p className="text-xs text-muted-foreground">
            Use {"{{variableName}}"} syntax for dynamic values. Variables are replaced at runtime.
          </p>
        </div>
      )}

      {/* Validation warning */}
      {!stepValidation.valid && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{stepValidation.warning}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        {/* Regenerate button - Super Admin only */}
        {isSuperAdmin && (
          <Button
            variant="outline"
            onClick={handleRegenerate}
            disabled={regeneratePrompt.isPending}
            size="sm"
          >
            {regeneratePrompt.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {regeneratePrompt.isPending ? "Regenerating..." : "Regenerate with AI"}
          </Button>
        )}
        
        {/* Save button */}
        {canEdit && hasChanges && (
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !stepValidation.valid} 
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Step"}
          </Button>
        )}
      </div>

      {/* Preview Dialog */}
      {regeneratedData && (
        <RegeneratePromptDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          originalPrompt={step.prompt_template}
          regeneratedPrompt={regeneratedData.regenerated_prompt}
          originalScore={regeneratedData.original_score}
          newScore={regeneratedData.new_score}
          onApply={handleApplyRegenerated}
          onEditFirst={handleEditFirst}
        />
      )}
    </div>
  );
}
