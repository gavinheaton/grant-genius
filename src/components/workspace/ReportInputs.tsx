import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Schema for grant-specific required inputs
export interface RequiredInput {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'url' | 'number';
  required: boolean;
  help_text?: string;
  max_length?: number;
  max_words?: number;
  options?: string[];
  placeholder?: string;
}

// Base fields that are always collected (canonical)
const BASE_FIELDS: RequiredInput[] = [
  {
    key: 'publicArticleUrl',
    label: 'Public Article URL',
    type: 'url',
    required: true,
    help_text: 'Link to a published article or preprint describing your research',
    placeholder: 'https://doi.org/...'
  },
  {
    key: 'summary',
    label: '100-Word Summary',
    type: 'textarea',
    required: true,
    max_words: 100,
    placeholder: 'Write a concise summary of your research and its commercialization potential...'
  }
];

// Optional fields that are always shown
const OPTIONAL_BASE_FIELDS: RequiredInput[] = [
  {
    key: 'trl',
    label: 'Technology Readiness Level (TRL)',
    type: 'text',
    required: false,
    placeholder: 'e.g., TRL 4'
  },
  {
    key: 'ipStatus',
    label: 'IP Status',
    type: 'text',
    required: false,
    placeholder: 'e.g., Patent pending'
  }
];

interface ReportInputsProps {
  inputs: Record<string, string>;
  onInputChange: (key: string, value: string) => void;
  disabled?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  projectName?: string;
  onProjectNameChange?: (value: string) => void;
  requiredInputs?: RequiredInput[];
}

// Filter out base fields from grant-specific inputs to avoid duplication
function getGrantSpecificFields(requiredInputs: RequiredInput[]): RequiredInput[] {
  const baseKeys = [...BASE_FIELDS, ...OPTIONAL_BASE_FIELDS].map(f => f.key);
  // Also filter out semantic equivalents of base fields
  const semanticEquivalents = [
    'project_summary', 'research_summary', 'project_description', 'executive_summary',
    'article_url', 'technology_readiness_level', 'ip_status_description', 'project_title'
  ];
  const excludeKeys = [...baseKeys, ...semanticEquivalents];
  
  return requiredInputs.filter(input => !excludeKeys.includes(input.key));
}

export function ReportInputs({ 
  inputs, 
  onInputChange, 
  disabled, 
  isCollapsed = false, 
  onToggleCollapse, 
  projectName, 
  onProjectNameChange,
  requiredInputs = []
}: ReportInputsProps) {
  const summary = inputs.summary || '';
  const wordCount = summary.trim().split(/\s+/).filter(Boolean).length;

  // Get grant-specific fields (excluding base fields)
  const grantSpecificFields = getGrantSpecificFields(requiredInputs);

  // Truncate URL for collapsed display
  const publicArticleUrl = inputs.publicArticleUrl || '';
  const truncatedUrl = publicArticleUrl.length > 40 
    ? publicArticleUrl.substring(0, 40) + "..." 
    : publicArticleUrl;
  
  // Truncate project name for collapsed display
  const truncatedProjectName = projectName && projectName.length > 30 
    ? projectName.substring(0, 30) + "..." 
    : projectName;

  // Render a dynamic field based on its type
  const renderField = (field: RequiredInput) => {
    const value = inputs[field.key] || '';
    const fieldWordCount = field.max_words ? value.trim().split(/\s+/).filter(Boolean).length : 0;
    
    return (
      <div key={field.key} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Label htmlFor={field.key}>
              {field.label} {field.required && <span className="text-destructive">*</span>}
            </Label>
            {field.help_text && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">{field.help_text}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {field.max_words && (
            <span className={`text-xs ${fieldWordCount > field.max_words ? "text-destructive" : "text-muted-foreground"}`}>
              {fieldWordCount}/{field.max_words} words
            </span>
          )}
        </div>
        
        {field.type === 'textarea' ? (
          <Textarea
            id={field.key}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onInputChange(field.key, e.target.value)}
            rows={4}
            className="resize-none"
            disabled={disabled}
            maxLength={field.max_length}
          />
        ) : field.type === 'select' && field.options ? (
          <Select
            value={value}
            onValueChange={(val) => onInputChange(field.key, val)}
            disabled={disabled}
          >
            <SelectTrigger id={field.key}>
              <SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id={field.key}
            type={field.type === 'url' ? 'url' : field.type === 'number' ? 'number' : 'text'}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onInputChange(field.key, e.target.value)}
            disabled={disabled}
            maxLength={field.max_length}
          />
        )}
        
        {field.help_text && field.type !== 'select' && (
          <p className="text-xs text-muted-foreground">{field.help_text}</p>
        )}
      </div>
    );
  };

  return (
    <Card className="shadow-card">
      <Collapsible open={!isCollapsed} onOpenChange={() => onToggleCollapse?.()}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Research Details</CardTitle>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
          {isCollapsed && (
            <p className="text-sm text-muted-foreground truncate mt-1">
              {truncatedProjectName && <span className="font-medium text-foreground">{truncatedProjectName}</span>}
              {truncatedProjectName && " • "}
              {truncatedUrl || "No URL"} • {wordCount} words
            </p>
          )}
        </CardHeader>
        <CollapsibleContent className="animate-accordion-down data-[state=closed]:animate-accordion-up">
          <CardContent className="space-y-6 pt-0">
            {/* Project Name - Always first */}
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                placeholder="e.g., My Research Project"
                value={projectName || ""}
                onChange={(e) => onProjectNameChange?.(e.target.value)}
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Give your project a memorable name for easier tracking
              </p>
            </div>

            {/* Base Required Fields */}
            {BASE_FIELDS.map(renderField)}

            {/* Grant-Specific Dynamic Fields */}
            {grantSpecificFields.length > 0 && (
              <div className="space-y-6 pt-2 border-t">
                <p className="text-sm font-medium text-muted-foreground pt-4">
                  Grant-Specific Information
                </p>
                {grantSpecificFields.map(renderField)}
              </div>
            )}

            {/* Optional Base Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {OPTIONAL_BASE_FIELDS.map(field => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <Input
                    id={field.key}
                    placeholder={field.placeholder}
                    value={inputs[field.key] || ''}
                    onChange={(e) => onInputChange(field.key, e.target.value)}
                    disabled={disabled}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
