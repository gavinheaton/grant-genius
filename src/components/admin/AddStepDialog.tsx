import { useState } from "react";
import { Bot, Globe, FileSearch } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PromptBundleStep, StepType } from "@/hooks/usePromptBundles";

interface AddStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSteps: PromptBundleStep[];
  onAdd: (data: {
    step_name: string;
    step_description: string;
    prompt_template: string;
    insert_position: number;
    step_type: StepType;
    step_config_json: Record<string, unknown>;
  }) => void;
  isLoading?: boolean;
}

const STEP_TYPES: { value: StepType; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { 
    value: "ai_prompt", 
    label: "AI Prompt", 
    icon: Bot,
    description: "Standard AI processing step using Gemini/GPT models"
  },
  { 
    value: "firecrawl_search", 
    label: "Web Search", 
    icon: Globe,
    description: "Search the web using Firecrawl and return real results"
  },
  { 
    value: "firecrawl_scrape", 
    label: "URL Scrape", 
    icon: FileSearch,
    description: "Scrape content from a user-provided URL"
  },
];

const DEFAULT_AI_TEMPLATE = `You are a research analyst. Analyze the following information and provide insights.

## Context
{{researchContext}}

## Instructions
[Add specific instructions for this step here]

## Output Format
Respond with a structured analysis including:
- Key findings
- Supporting evidence
- Recommendations`;

const DEFAULT_SEARCH_QUERY = `{{grantName}} market size Australia 2024`;

const getDefaultConfig = (stepType: StepType): Record<string, unknown> => {
  switch (stepType) {
    case "firecrawl_search":
      return {
        query_template: DEFAULT_SEARCH_QUERY,
        limit: 8,
        scrape_results: true,
      };
    case "firecrawl_scrape":
      return {
        url_variable: "publicArticleUrl",
        formats: ["markdown"],
        onlyMainContent: true,
      };
    default:
      return {};
  }
};

export function AddStepDialog({
  open,
  onOpenChange,
  existingSteps,
  onAdd,
  isLoading,
}: AddStepDialogProps) {
  const [stepType, setStepType] = useState<StepType>("ai_prompt");
  const [stepName, setStepName] = useState("");
  const [stepDescription, setStepDescription] = useState("");
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_AI_TEMPLATE);
  const [searchQuery, setSearchQuery] = useState(DEFAULT_SEARCH_QUERY);
  const [urlVariable, setUrlVariable] = useState("publicArticleUrl");
  const [insertPosition, setInsertPosition] = useState("end");

  const handleStepTypeChange = (newType: StepType) => {
    setStepType(newType);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let position: number;
    if (insertPosition === "start") {
      position = 0;
    } else if (insertPosition === "end") {
      position = existingSteps.length;
    } else {
      position = parseInt(insertPosition) + 1;
    }

    // Build step config based on type
    let stepConfig: Record<string, unknown> = {};
    let template = promptTemplate;

    if (stepType === "firecrawl_search") {
      stepConfig = {
        query_template: searchQuery,
        limit: 8,
        scrape_results: true,
      };
      template = ""; // Firecrawl steps don't use prompt template
    } else if (stepType === "firecrawl_scrape") {
      stepConfig = {
        url_variable: urlVariable,
        formats: ["markdown"],
        onlyMainContent: true,
      };
      template = ""; // Firecrawl steps don't use prompt template
    }

    onAdd({
      step_name: stepName,
      step_description: stepDescription,
      prompt_template: template,
      insert_position: position,
      step_type: stepType,
      step_config_json: stepConfig,
    });

    // Reset form
    setStepType("ai_prompt");
    setStepName("");
    setStepDescription("");
    setPromptTemplate(DEFAULT_AI_TEMPLATE);
    setSearchQuery(DEFAULT_SEARCH_QUERY);
    setUrlVariable("publicArticleUrl");
    setInsertPosition("end");
  };

  // Validation based on step type
  const isValid = (() => {
    if (!stepName.trim() || !stepDescription.trim()) return false;
    
    if (stepType === "ai_prompt") {
      return promptTemplate.trim().length >= 50;
    } else if (stepType === "firecrawl_search") {
      return searchQuery.trim().length >= 10;
    } else if (stepType === "firecrawl_scrape") {
      return !!urlVariable;
    }
    return false;
  })();

  const selectedType = STEP_TYPES.find(t => t.value === stepType) || STEP_TYPES[0];
  const Icon = selectedType.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Step</DialogTitle>
          <DialogDescription>
            Create a new step for this pipeline. The step will be inserted at the specified position.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step Type Selection */}
          <div className="space-y-2">
            <Label>Step Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {STEP_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => handleStepTypeChange(type.value)}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                    stepType === type.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  }`}
                >
                  <type.icon className="h-5 w-5" />
                  <span className="font-medium">{type.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{selectedType.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="step-name">Step Name</Label>
              <Input
                id="step-name"
                value={stepName}
                onChange={(e) => setStepName(e.target.value)}
                placeholder={stepType === "firecrawl_search" ? "e.g., market_search" : "e.g., market_analysis"}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use snake_case for the step identifier
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="insert-position">Insert Position</Label>
              <Select value={insertPosition} onValueChange={setInsertPosition}>
                <SelectTrigger>
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">At beginning (before step 0)</SelectItem>
                  {existingSteps.map((step) => (
                    <SelectItem key={step.id} value={step.step_number.toString()}>
                      After step {step.step_number}: {step.step_name}
                    </SelectItem>
                  ))}
                  <SelectItem value="end">At end (after step {existingSteps.length - 1})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="step-description">Step Description</Label>
            <Input
              id="step-description"
              value={stepDescription}
              onChange={(e) => setStepDescription(e.target.value)}
              placeholder={
                stepType === "firecrawl_search" 
                  ? "e.g., Search for market size data and competitor information"
                  : stepType === "firecrawl_scrape"
                  ? "e.g., Extract content from the user's research article"
                  : "e.g., Analyze target market segments and opportunities"
              }
            />
          </div>

          {/* AI Prompt Template */}
          {stepType === "ai_prompt" && (
            <div className="space-y-2">
              <Label htmlFor="prompt-template">Prompt Template</Label>
              <Textarea
                id="prompt-template"
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                rows={12}
                className="font-mono text-sm"
                placeholder="Enter the prompt template for this step..."
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{variable}}"} placeholders for dynamic values. See the Available Variables reference.
              </p>
            </div>
          )}

          {/* Firecrawl Search Config */}
          {stepType === "firecrawl_search" && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Web Search Configuration</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="search-query">Search Query Template</Label>
                <Textarea
                  id="search-query"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  rows={3}
                  className="font-mono text-sm"
                  placeholder="{{grantName}} market size Australia 2024"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{variables}}"} for dynamic values. Supports site: operators for domain filtering.
                </p>
              </div>
            </div>
          )}

          {/* Firecrawl Scrape Config */}
          {stepType === "firecrawl_scrape" && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2">
                <FileSearch className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">URL Scrape Configuration</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="url-variable">URL Variable</Label>
                <Select value={urlVariable} onValueChange={setUrlVariable}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publicArticleUrl">publicArticleUrl (User's research article)</SelectItem>
                    <SelectItem value="custom">Custom URL variable</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The input variable containing the URL to scrape.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isLoading}>
              {isLoading ? "Adding..." : "Add Step"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
