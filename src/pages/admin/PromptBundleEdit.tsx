import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePromptBundle } from "@/hooks/usePromptBundles";
import { InlinePipelineEditor } from "@/components/admin/InlinePipelineEditor";
import { PipelineQualityCard } from "@/components/admin/PipelineQualityCard";
import { validatePipelineQuality, type PipelineStep as QualityStep } from "@/lib/pipelineQualityGate";
import { validatePostReorder, type PipelineStep as ValidationStep } from "@/lib/pipelineValidation";

export default function PromptBundleEdit() {
  const { id } = useParams();
  const { data: bundle, isLoading } = usePromptBundle(id);

  // Calculate quality gate + data flow results when bundle loads
  const { qualityResult, dataFlowIssues } = useMemo(() => {
    if (!bundle?.steps || bundle.steps.length === 0) return { qualityResult: null, dataFlowIssues: [] };

    const qualitySteps: QualityStep[] = bundle.steps.map(step => ({
      step_number: step.step_number,
      step_name: step.step_name,
      step_description: step.step_description,
      prompt_template: step.prompt_template,
      model_tier: step.model_override || undefined,
    }));

    const validationSteps: ValidationStep[] = bundle.steps.map(step => ({
      step_number: step.step_number,
      step_name: step.step_name,
      prompt_template: step.prompt_template,
    }));

    const qr = validatePipelineQuality(qualitySteps);
    const reorderResult = validatePostReorder(validationSteps);
    
    // Merge data flow issues into quality result
    if (reorderResult.issues.length > 0) {
      qr.data_flow_issues = reorderResult.issues;
    }

    return { qualityResult: qr, dataFlowIssues: reorderResult.issues };
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

      {/* Quality Gate Card - shown when steps exist */}
      {qualityResult && (
        <PipelineQualityCard result={qualityResult} />
      )}

      <InlinePipelineEditor bundleId={id} showBundleSettings={true} />
    </div>
  );
}