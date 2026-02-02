import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, AlertCircle, AlertTriangle } from "lucide-react";
import { calculateQualityScore, getQualityBadgeVariant, type QualityScore } from "@/hooks/usePromptQuality";
import { cn } from "@/lib/utils";

interface PromptQualityBadgeProps {
  prompt: string;
  showDetails?: boolean;
  className?: string;
}

export function PromptQualityBadge({ prompt, showDetails = false, className }: PromptQualityBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const score = calculateQualityScore(prompt);

  const Icon = score.level === 'good' 
    ? CheckCircle2 
    : score.level === 'warning' 
      ? AlertCircle 
      : XCircle;

  const badgeContent = (
    <Badge 
      variant={getQualityBadgeVariant(score.level)} 
      className={cn("cursor-help", className)}
    >
      <Icon className="h-3 w-3 mr-1" />
      {score.total}/100
    </Badge>
  );

  if (!showDetails) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {badgeContent}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-medium mb-1">Prompt Quality: {score.level}</p>
          {score.invalidVariables.length > 0 && (
            <p className="text-xs text-destructive mb-1">
              ⚠️ Invalid variables: {score.invalidVariables.join(', ')}
            </p>
          )}
          {score.recommendations.length > 0 && (
            <ul className="text-xs space-y-0.5">
              {score.recommendations.slice(0, 3).map((rec, i) => (
                <li key={i}>• {rec}</li>
              ))}
              {score.recommendations.length > 3 && (
                <li className="text-muted-foreground">
                  +{score.recommendations.length - 3} more...
                </li>
              )}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2">
        {badgeContent}
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-3">
        <QualityBreakdown score={score} promptLength={prompt.length} />
      </CollapsibleContent>
    </Collapsible>
  );
}

interface QualityBreakdownProps {
  score: QualityScore;
  promptLength: number;
}

function QualityBreakdown({ score, promptLength }: QualityBreakdownProps) {
  const criteria = [
    { key: 'contextHeader', label: 'Context Header (STEP N, INPUTS)', max: 15 },
    { key: 'hardRules', label: 'Hard Rules Section', max: 15 },
    { key: 'outputSchema', label: 'Output JSON Schema', max: 20 },
    { key: 'urlValidation', label: 'URL Validation Rules', max: 15 },
    { key: 'unknownHandling', label: 'Unknown Handling Protocol', max: 10 },
    { key: 'placeholderProhibition', label: 'Placeholder Prohibition', max: 10 },
    { key: 'adequateLength', label: `Length (${promptLength.toLocaleString()} chars)`, max: 5 },
    { key: 'validVariables', label: 'Valid Variable References', max: 10 },
  ] as const;

  return (
    <div className="space-y-3 p-3 bg-muted/50 rounded-lg border text-sm">
      <div className="grid gap-2">
        {criteria.map(({ key, label, max }) => {
          const value = score.breakdown[key];
          const passed = value === max;
          const partial = value > 0 && value < max;
          
          return (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {passed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : partial ? (
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className={cn(
                  passed ? "text-foreground" : "text-muted-foreground"
                )}>
                  {label}
                </span>
              </div>
              <span className={cn(
                "font-mono text-xs",
                passed ? "text-green-600" : partial ? "text-yellow-600" : "text-red-600"
              )}>
                {Math.round(value)}/{max}
              </span>
            </div>
          );
        })}
      </div>
      
      {/* Invalid Variables Warning */}
      {score.invalidVariables.length > 0 && (
        <div className="pt-2 border-t">
          <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded border border-destructive/20">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-destructive">Invalid Variables Detected:</p>
              <p className="text-muted-foreground mt-0.5">
                {score.invalidVariables.map(v => `{{${v}}}`).join(', ')}
              </p>
              <p className="text-muted-foreground mt-1">
                Approved: <code className="text-[10px] bg-muted px-1 rounded">{'{{summary}}'}</code>, <code className="text-[10px] bg-muted px-1 rounded">{'{{step0}}'}</code>, <code className="text-[10px] bg-muted px-1 rounded">{'{{grantName}}'}</code>, etc.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {score.recommendations.length > 0 && (
        <div className="pt-2 border-t">
          <p className="font-medium text-xs text-muted-foreground mb-1.5">Recommendations:</p>
          <ul className="text-xs space-y-1 text-muted-foreground">
            {score.recommendations.map((rec, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-primary">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
