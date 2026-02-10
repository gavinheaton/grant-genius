import { useMemo } from "react";
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Wrench,
  ChevronDown,
  Shield,
  FileCheck,
  Search,
  Brain,
  Building2,
  Link2Off,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import type { PipelineQualityResult, RepairAction } from "@/lib/pipelineQualityGate";

interface PipelineQualityCardProps {
  result: PipelineQualityResult;
  onApplyRepairs?: () => void;
  isApplyingRepairs?: boolean;
  onRerunQA?: () => void;
  isRerunning?: boolean;
  className?: string;
}

const CATEGORY_INFO: Record<keyof PipelineQualityResult['category_scores'], {
  label: string;
  icon: React.ElementType;
  description: string;
}> = {
  structural_completeness: {
    label: "Structure",
    icon: FileCheck,
    description: "Core steps present and properly ordered",
  },
  traceability: {
    label: "Traceability",
    icon: Search,
    description: "Rubric coverage and inputs mapping",
  },
  evidence_auditability: {
    label: "Evidence",
    icon: Shield,
    description: "Source ID integrity and evidence-type matching",
  },
  assessor_insight: {
    label: "Assessor Insight",
    icon: Brain,
    description: "Failure modes, genericness prevention, additionality",
  },
  commercial_reality: {
    label: "Commercial Reality",
    icon: Building2,
    description: "Buyer pathway, pricing anchors, competitor framework",
  },
};

const REPAIR_ACTION_LABELS: Record<string, string> = {
  add_missing_core_step: "Add Missing Step",
  strengthen_prompt_template: "Strengthen Prompt",
  enforce_proxy_protocol: "Enforce Proxy Protocol",
  ban_forbidden_patterns: "Remove Forbidden Patterns",
  tighten_finalize_citations: "Tighten Citation Sanitizer",
  add_comparables_enforcement: "Enforce Comparables Minimum",
  add_pricing_anchors: "Add Pricing Anchors",
  enforce_grant_writer_voice: "Enforce Grant-Writer Voice",
};

export function PipelineQualityCard({
  result,
  onApplyRepairs,
  isApplyingRepairs = false,
  className,
}: PipelineQualityCardProps) {
  const verdictConfig = useMemo(() => {
    switch (result.verdict) {
      case 'pass':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50 dark:bg-green-950/30',
          borderColor: 'border-green-200 dark:border-green-800',
          label: 'Pass',
          badgeVariant: 'default' as const,
        };
      case 'conditional_pass':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          label: 'Conditional Pass',
          badgeVariant: 'secondary' as const,
        };
      case 'fail':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50 dark:bg-red-950/30',
          borderColor: 'border-red-200 dark:border-red-800',
          label: 'Fail',
          badgeVariant: 'destructive' as const,
        };
    }
  }, [result.verdict]);

  const VerdictIcon = verdictConfig.icon;

  return (
    <Card className={`${verdictConfig.bgColor} ${verdictConfig.borderColor} border ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VerdictIcon className={`h-6 w-6 ${verdictConfig.color}`} />
            <div>
              <CardTitle className="text-lg">Pipeline Quality Gate</CardTitle>
              <CardDescription>{result.notes}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={verdictConfig.badgeVariant} className="text-sm px-3 py-1">
              {verdictConfig.label}
            </Badge>
            <span className={`text-2xl font-bold ${verdictConfig.color}`}>
              {result.overall_score}/100
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Category Score Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {(Object.entries(result.category_scores) as [keyof typeof CATEGORY_INFO, number][]).map(
            ([key, score]) => {
              const info = CATEGORY_INFO[key];
              const Icon = info.icon;
              const percentage = (score / 20) * 100;
              const scoreColor = score >= 15 ? 'text-green-600' : score >= 10 ? 'text-yellow-600' : 'text-red-600';

              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <div className="bg-background rounded-lg p-3 border cursor-help">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium truncate">{info.label}</span>
                      </div>
                      <Progress value={percentage} className="h-2 mb-1" />
                      <div className={`text-right text-sm font-semibold ${scoreColor}`}>
                        {score}/20
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">{info.label}</p>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }
          )}
        </div>

        {/* Hard-Fail Reasons */}
        {result.hard_fail_reasons.length > 0 && (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700">
              <XCircle className="h-4 w-4" />
              {result.hard_fail_reasons.length} Hard-Fail Reason{result.hard_fail_reasons.length > 1 ? 's' : ''}
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-1">
                {result.hard_fail_reasons.map((reason, idx) => (
                  <div key={idx} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Red Flags */}
        {result.red_flags.length > 0 && (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-yellow-600 hover:text-yellow-700">
              <AlertTriangle className="h-4 w-4" />
              {result.red_flags.length} Red Flag{result.red_flags.length > 1 ? 's' : ''}
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 space-y-1">
                {result.red_flags.map((flag, idx) => (
                  <div key={idx} className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                    <span className="shrink-0">⚠</span>
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Data Flow Issues */}
        {result.data_flow_issues && result.data_flow_issues.length > 0 && (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700">
              <Link2Off className="h-4 w-4" />
              {result.data_flow_issues.length} Data Flow Issue{result.data_flow_issues.length > 1 ? 's' : ''}
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 rounded-lg p-3 space-y-2">
                {result.data_flow_issues.map((issue, idx) => (
                  <div key={idx} className="text-sm flex items-start gap-2">
                    <span className={`shrink-0 ${issue.severity === 'error' ? 'text-red-600' : 'text-yellow-600'}`}>
                      {issue.severity === 'error' ? '✗' : '⚠'}
                    </span>
                    <div>
                      <span className="font-medium">Step {issue.step_number} ({issue.step_name})</span>
                      <span className="text-muted-foreground"> — {issue.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Repair Actions */}
        {result.repair_actions.length > 0 && (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700">
              <Wrench className="h-4 w-4" />
              {result.repair_actions.length} Repair Action{result.repair_actions.length > 1 ? 's' : ''} Required
              <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="space-y-2">
                {result.repair_actions.map((action, idx) => (
                  <RepairActionItem key={idx} action={action} />
                ))}

                {onApplyRepairs && (
                  <Button
                    onClick={onApplyRepairs}
                    disabled={isApplyingRepairs}
                    className="w-full mt-3"
                    variant="outline"
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    {isApplyingRepairs ? 'Applying Repairs...' : 'Apply Auto-Repairs'}
                  </Button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

function RepairActionItem({ action }: { action: RepairAction }) {
  return (
    <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-xs">
          {REPAIR_ACTION_LABELS[action.action] || action.action}
        </Badge>
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
          {action.target_step_name}
        </code>
      </div>
      <p className="text-sm text-muted-foreground">{action.instructions}</p>
    </div>
  );
}
