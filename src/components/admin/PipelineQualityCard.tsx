import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ChevronDown,
  Link2Off,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Info,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { StructuralCheckResult, AIAnalysisResult, DataFlowIssue } from "@/lib/pipelineQualityGate";

interface PipelineQualityCardProps {
  structuralResult: StructuralCheckResult;
  dataFlowIssues?: DataFlowIssue[];
  aiResult?: AIAnalysisResult | null;
  onRerunQA?: () => void;
  isRerunning?: boolean;
  className?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  data_flow: "Data Flow",
  redundancy: "Redundancy",
  sequencing: "Sequencing",
  completeness: "Completeness",
  contract_mismatch: "Contract Mismatch",
};

export function PipelineQualityCard({
  structuralResult,
  dataFlowIssues = [],
  aiResult,
  onRerunQA,
  isRerunning = false,
  className,
}: PipelineQualityCardProps) {
  const structuralErrors = structuralResult.issues.filter(i => i.severity === 'error');
  const hasStructuralErrors = structuralErrors.length > 0;
  const hasDataFlowErrors = dataFlowIssues.some(i => i.severity === 'error');

  // Determine overall status
  const overallPass = !hasStructuralErrors && !hasDataFlowErrors && (!aiResult || aiResult.verdict === 'pass');
  const overallFail = hasStructuralErrors || hasDataFlowErrors || aiResult?.verdict === 'fail';

  const bgColor = overallFail
    ? 'bg-red-50 dark:bg-red-950/30'
    : overallPass
    ? 'bg-green-50 dark:bg-green-950/30'
    : 'bg-yellow-50 dark:bg-yellow-950/30';

  const borderColor = overallFail
    ? 'border-red-200 dark:border-red-800'
    : overallPass
    ? 'border-green-200 dark:border-green-800'
    : 'border-yellow-200 dark:border-yellow-800';

  const VerdictIcon = overallFail ? XCircle : overallPass ? CheckCircle2 : AlertTriangle;
  const verdictColor = overallFail ? 'text-red-600' : overallPass ? 'text-green-600' : 'text-yellow-600';

  return (
    <Card className={`${bgColor} ${borderColor} border ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VerdictIcon className={`h-6 w-6 ${verdictColor}`} />
            <div>
              <CardTitle className="text-lg">Pipeline Quality</CardTitle>
              <CardDescription>
                {hasStructuralErrors
                  ? `${structuralErrors.length} structural issue${structuralErrors.length > 1 ? 's' : ''} found`
                  : aiResult
                  ? aiResult.overall_notes
                  : 'Structural checks passed. Run AI analysis for deeper validation.'}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onRerunQA && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRerunQA}
                disabled={isRerunning}
                className="gap-1.5"
              >
                {isRerunning ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {isRerunning ? 'Analysing…' : 'AI Analysis'}
              </Button>
            )}
            {aiResult && (
              <Badge
                variant={aiResult.verdict === 'pass' ? 'default' : aiResult.verdict === 'fail' ? 'destructive' : 'secondary'}
                className="text-sm px-3 py-1"
              >
                {aiResult.verdict === 'pass' ? 'Pass' : aiResult.verdict === 'fail' ? 'Fail' : 'Issues Found'}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Structural Issues */}
        {structuralResult.issues.length > 0 && (
          <StructuralIssuesSection issues={structuralResult.issues} />
        )}

        {/* Data Flow Issues (from validatePostReorder) */}
        {dataFlowIssues.length > 0 && (
          <DataFlowSection issues={dataFlowIssues} />
        )}

        {/* AI Analysis Results */}
        {aiResult && (
          <AIAnalysisSection result={aiResult} />
        )}

        {/* Empty state — all good */}
        {structuralResult.issues.length === 0 && dataFlowIssues.length === 0 && !aiResult && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span>No structural issues. Click <strong>AI Analysis</strong> for a semantic review.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StructuralIssuesSection({ issues }: { issues: StructuralCheckResult['issues'] }) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700">
        <XCircle className="h-4 w-4" />
        {issues.length} Structural Issue{issues.length > 1 ? 's' : ''}
        <ChevronDown className="h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-1">
          {issues.map((issue, idx) => (
            <div key={idx} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
              <span className="shrink-0">•</span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DataFlowSection({ issues }: { issues: DataFlowIssue[] }) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-orange-600 hover:text-orange-700">
        <Link2Off className="h-4 w-4" />
        {issues.length} Data Flow Issue{issues.length > 1 ? 's' : ''}
        <ChevronDown className="h-4 w-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800 rounded-lg p-3 space-y-2">
          {issues.map((issue, idx) => (
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
  );
}

function AIAnalysisSection({ result }: { result: AIAnalysisResult }) {
  const errorCount = result.issues.filter(i => i.severity === 'error').length;
  const warningCount = result.issues.filter(i => i.severity === 'warning').length;
  const infoCount = result.issues.filter(i => i.severity === 'info').length;

  // Group issues by category
  const grouped = new Map<string, typeof result.issues>();
  for (const issue of result.issues) {
    const list = grouped.get(issue.category) || [];
    list.push(issue);
    grouped.set(issue.category, list);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        AI-Powered Analysis
        {errorCount > 0 && <Badge variant="destructive" className="text-xs">{errorCount} error{errorCount > 1 ? 's' : ''}</Badge>}
        {warningCount > 0 && <Badge variant="secondary" className="text-xs">{warningCount} warning{warningCount > 1 ? 's' : ''}</Badge>}
        {infoCount > 0 && <Badge variant="outline" className="text-xs">{infoCount} info</Badge>}
      </div>

      {/* Issues grouped by category */}
      {result.issues.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-yellow-600 hover:text-yellow-700">
            <AlertTriangle className="h-4 w-4" />
            {result.issues.length} Issue{result.issues.length > 1 ? 's' : ''} Found
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {[...grouped.entries()].map(([category, issues]) => (
              <div key={category} className="bg-background border rounded-lg p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                  {CATEGORY_LABELS[category] || category}
                </div>
                <div className="space-y-1.5">
                  {issues.map((issue, idx) => (
                    <div key={idx} className="text-sm flex items-start gap-2">
                      <span className={`shrink-0 ${
                        issue.severity === 'error' ? 'text-red-600' : 
                        issue.severity === 'warning' ? 'text-yellow-600' : 'text-blue-600'
                      }`}>
                        {issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ'}
                      </span>
                      <div>
                        <span className="font-medium">Step {issue.step_number} ({issue.step_name})</span>
                        <span className="text-muted-foreground"> — {issue.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Strengths */}
      {result.strengths.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-green-600 hover:text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            {result.strengths.length} Strength{result.strengths.length > 1 ? 's' : ''}
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-1">
              {result.strengths.map((strength, idx) => (
                <div key={idx} className="text-sm text-green-700 dark:text-green-300 flex items-start gap-2">
                  <span className="shrink-0">✓</span>
                  <span>{strength}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* All clear */}
      {result.issues.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-green-600 py-1">
          <CheckCircle2 className="h-4 w-4" />
          <span>No issues detected. Pipeline looks well-structured.</span>
        </div>
      )}
    </div>
  );
}
