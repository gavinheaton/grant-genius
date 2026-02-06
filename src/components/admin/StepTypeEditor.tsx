import { Globe, Bot, FileSearch } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StepType } from "@/hooks/usePromptBundles";

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

interface StepConfigJson {
  query_template?: string;
  url_variable?: string;
  limit?: number;
  scrape_results?: boolean;
  formats?: string[];
  onlyMainContent?: boolean;
}

interface StepTypeEditorProps {
  stepType: StepType;
  stepConfig: StepConfigJson;
  canEdit: boolean;
  onChange: (stepType: StepType, stepConfig: StepConfigJson) => void;
}

export function StepTypeEditor({
  stepType,
  stepConfig,
  canEdit,
  onChange,
}: StepTypeEditorProps) {
  const currentType = STEP_TYPES.find(t => t.value === stepType) || STEP_TYPES[0];
  const Icon = currentType.icon;

  const handleTypeChange = (value: StepType) => {
    // Reset config when switching types
    let defaultConfig: StepConfigJson = {};
    
    if (value === "firecrawl_search") {
      defaultConfig = {
        query_template: "{{grantName}} market size Australia 2024",
        limit: 8,
        scrape_results: true,
      };
    } else if (value === "firecrawl_scrape") {
      defaultConfig = {
        url_variable: "publicArticleUrl",
        formats: ["markdown"],
        onlyMainContent: true,
      };
    }
    
    onChange(value, defaultConfig);
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <Label className="text-sm font-medium">Step Execution Type</Label>
        <Badge variant={stepType === "ai_prompt" ? "secondary" : "default"} className="text-xs">
          {stepType === "ai_prompt" ? "AI" : "Firecrawl"}
        </Badge>
      </div>

      <Select
        value={stepType}
        onValueChange={(value: StepType) => handleTypeChange(value)}
        disabled={!canEdit}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STEP_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              <div className="flex items-center gap-2">
                <type.icon className="h-4 w-4" />
                <span>{type.label}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <p className="text-xs text-muted-foreground">{currentType.description}</p>

      {/* Firecrawl Search Config */}
      {stepType === "firecrawl_search" && (
        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label htmlFor="query-template" className="text-xs">Search Query Template</Label>
            <Textarea
              id="query-template"
              value={stepConfig.query_template || ""}
              onChange={(e) => onChange(stepType, { ...stepConfig, query_template: e.target.value })}
              disabled={!canEdit}
              rows={2}
              className="font-mono text-xs"
              placeholder="{{grantName}} market size Australia 2024"
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{variables}}"} for dynamic values. Supports site: operators.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="limit" className="text-xs">Result Limit</Label>
              <Input
                id="limit"
                type="number"
                min="1"
                max="20"
                value={stepConfig.limit || 8}
                onChange={(e) => onChange(stepType, { ...stepConfig, limit: parseInt(e.target.value) || 8 })}
                disabled={!canEdit}
                className="h-8"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scrape" className="text-xs">Scrape Results</Label>
              <Select
                value={stepConfig.scrape_results ? "true" : "false"}
                onValueChange={(value) => onChange(stepType, { ...stepConfig, scrape_results: value === "true" })}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes - Get full content</SelectItem>
                  <SelectItem value="false">No - Titles/URLs only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Firecrawl Scrape Config */}
      {stepType === "firecrawl_scrape" && (
        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label htmlFor="url-variable" className="text-xs">URL Variable</Label>
            <Select
              value={stepConfig.url_variable || "publicArticleUrl"}
              onValueChange={(value) => onChange(stepType, { ...stepConfig, url_variable: value })}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="publicArticleUrl">publicArticleUrl (User's research article)</SelectItem>
                <SelectItem value="custom">Custom URL variable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="formats" className="text-xs">Output Format</Label>
            <Select
              value={stepConfig.formats?.[0] || "markdown"}
              onValueChange={(value) => onChange(stepType, { ...stepConfig, formats: [value] })}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="markdown">Markdown (recommended)</SelectItem>
                <SelectItem value="html">HTML</SelectItem>
                <SelectItem value="rawHtml">Raw HTML</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
