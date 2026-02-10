import { useState, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePromptBundle } from "@/hooks/usePromptBundles";
import { InlinePipelineEditor } from "@/components/admin/InlinePipelineEditor";
import { PipelineQualityCard } from "@/components/admin/PipelineQualityCard";
import { checkStructuralIssues, type StructuralCheckResult, type AIAnalysisResult, type DataFlowIssue } from "@/lib/pipelineQualityGate";
import { validatePostReorder, type PipelineStep as ValidationStep } from "@/lib/pipelineValidation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function PromptBundleEdit() {
  const { id } = useParams();
  const { data: bundle, isLoading } = usePromptBundle(id);

  const [structuralResult, setStructuralResult] = useState<StructuralCheckResult>({ issues: [], pass: true });
  const [dataFlowIssues, setDataFlowIssues] = useState<DataFlowIssue[]>([]);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isRerunning, setIsRerunning] = useState(false);

  // Auto-run structural checks when bundle loads
  useEffect(() => {
    if (bundle?.steps && bundle.steps.length > 0) {
      const structural = checkStructuralIssues(bundle.steps);
      setStructuralResult(structural);

      const validationSteps: ValidationStep[] = bundle.steps.map(step => ({
        step_number: step.step_number,
        step_name: step.step_name,
        prompt_template: step.prompt_template,
      }));
      const reorderResult = validatePostReorder(validationSteps);
      setDataFlowIssues(reorderResult.issues);
    } else {
      setStructuralResult({ issues: [], pass: true });
      setDataFlowIssues([]);
    }
    // Reset AI result when steps change
    setAiResult(null);
  }, [bundle?.steps]);

  const handleAIAnalysis = useCallback(async () => {
    if (!bundle?.steps || bundle.steps.length === 0) return;
    setIsRerunning(true);

    try {
      const { data, error } = await supabase.functions.invoke('validate-pipeline', {
        body: {
        steps: bundle.steps.map(s => ({
            step_number: s.step_number,
            step_name: s.step_name,
            step_description: s.step_description,
            prompt_template: s.prompt_template,
            step_type: s.step_type,
            step_config_json: s.step_config_json,
          })),
        },
      });

      if (error) {
        console.error('AI analysis error:', error);
        toast.error('AI analysis failed', { description: error.message });
        return;
      }

      setAiResult(data as AIAnalysisResult);
      toast.success('AI analysis complete');
    } catch (err: any) {
      console.error('AI analysis error:', err);
      toast.error('AI analysis failed', { description: err.message });
    } finally {
      setIsRerunning(false);
    }
  }, [bundle?.steps]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!bundle || !id) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link to="/admin/prompt-bundles">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Bundles
          </Link>
        </Button>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Bundle not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" asChild>
            <Link to="/admin/prompt-bundles">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{bundle.name}</h1>
              {bundle.is_active && <Badge variant="default">Active</Badge>}
            </div>
            <p className="text-muted-foreground">
              Edit prompts and settings for this bundle.
            </p>
          </div>
        </div>
      </div>

      {/* Quality Gate Card */}
      {bundle.steps && bundle.steps.length > 0 && (
        <PipelineQualityCard
          structuralResult={structuralResult}
          dataFlowIssues={dataFlowIssues}
          aiResult={aiResult}
          onRerunQA={handleAIAnalysis}
          isRerunning={isRerunning}
        />
      )}

      <InlinePipelineEditor bundleId={id} showBundleSettings={true} />
    </div>
  );
}
