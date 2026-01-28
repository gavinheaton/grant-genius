import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PromptBundleStep } from "@/hooks/usePromptBundles";

interface PromptStepEditorProps {
  step: PromptBundleStep;
  models: { value: string; label: string }[];
  canEdit: boolean;
  onSave: (
    stepId: string,
    data: { prompt_template?: string; model_override?: string | null }
  ) => Promise<void>;
}

export function PromptStepEditor({
  step,
  models,
  canEdit,
  onSave,
}: PromptStepEditorProps) {
  const [promptTemplate, setPromptTemplate] = useState(step.prompt_template);
  const [modelOverride, setModelOverride] = useState(step.model_override || "");
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setPromptTemplate(step.prompt_template);
    setModelOverride(step.model_override || "");
    setHasChanges(false);
  }, [step]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(step.id, {
        prompt_template: promptTemplate,
        model_override: modelOverride || null,
      });
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Get default model based on step number
  const getDefaultModel = (stepNumber: number) => {
    if (stepNumber <= 3) return "google/gemini-2.5-flash-lite";
    if (stepNumber <= 7) return "google/gemini-3-flash-preview";
    return "google/gemini-2.5-flash-lite";
  };

  const defaultModel = getDefaultModel(step.step_number);
  const effectiveModel = modelOverride || defaultModel;

  return (
    <div className="space-y-4 pt-4">
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

      {canEdit && hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Step"}
          </Button>
        </div>
      )}
    </div>
  );
}
