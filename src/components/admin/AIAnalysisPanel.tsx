import { useEffect } from "react";
import { Sparkles, CheckCircle, XCircle, AlertCircle, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ProcessingProgress } from "./ProcessingProgress";
import { Link } from "react-router-dom";

interface RequiredInput {
  key: string;
  label: string;
  type: string;
  required: boolean;
  help_text?: string;
  max_length?: number;
  source_section?: string;
}

interface RubricSection {
  key: string;
  title: string;
  description?: string;
  criteria: string[];
  weight?: number;
}

interface Suggestions {
  required_inputs: RequiredInput[];
  rubric: { sections: RubricSection[] };
  grant_summary: string;
}

interface AIAnalysisPanelProps {
  versionId: string;
  guidelinesText: string | null;
  analysisStatus: string;
  pipelineStatus: string;
  promptBundleId: string | null;
  suggestions: Suggestions | null;
  onRetry: () => void;
  isRetrying?: boolean;
  isUploading?: boolean;
}

export function AIAnalysisPanel({
  versionId,
  guidelinesText,
  analysisStatus,
  pipelineStatus,
  promptBundleId,
  suggestions,
  onRetry,
  isRetrying = false,
  isUploading = false,
}: AIAnalysisPanelProps) {
  const isProcessing = analysisStatus === "analyzing" || pipelineStatus === "generating";
  const hasFailed = analysisStatus === "failed" || pipelineStatus === "failed";
  const isComplete = analysisStatus === "completed" && (pipelineStatus === "draft" || pipelineStatus === "published");

  const statusIcon = {
    pending: <AlertCircle className="h-4 w-4 text-muted-foreground" />,
    analyzing: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
    processing: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
    completed: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-destructive" />,
  };

  // Show processing progress if actively processing or uploading
  if (isProcessing || isUploading) {
    return (
      <div className="space-y-6">
        <ProcessingProgress 
          aiStatus={analysisStatus} 
          pipelineStatus={pipelineStatus}
          isUploading={isUploading}
        />
      </div>
    );
  }

  // No guidelines uploaded yet
  if (!guidelinesText) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            AI Analysis
          </CardTitle>
          <CardDescription>
            Upload guidelines PDF to automatically extract rubric, inputs, and generate a research pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Upload a guidelines PDF to get started
          </p>
        </CardContent>
      </Card>
    );
  }

  // Failed state
  if (hasFailed) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            Processing Failed
          </CardTitle>
          <CardDescription>
            {analysisStatus === "failed" 
              ? "Failed to extract rubric and inputs from guidelines" 
              : "Failed to generate research pipeline"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Retry Processing
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Complete state - show summary
  if (isComplete && suggestions) {
    const inputCount = suggestions.required_inputs?.length || 0;
    const sectionCount = suggestions.rubric?.sections?.length || 0;

    return (
      <div className="space-y-6">
        <Card className="border-green-500/30 bg-green-500/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Processing Complete
                </CardTitle>
                <CardDescription>
                  Guidelines analyzed and pipeline generated
                </CardDescription>
              </div>
              <Badge variant={pipelineStatus === "published" ? "default" : "outline"}>
                {pipelineStatus === "published" ? "Published" : "Draft"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {suggestions.grant_summary && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Grant Summary</p>
                <p className="text-sm">{suggestions.grant_summary}</p>
              </div>
            )}

            <Separator />

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{inputCount}</p>
                <p className="text-xs text-muted-foreground">Required Inputs</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{sectionCount}</p>
                <p className="text-xs text-muted-foreground">Rubric Sections</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {promptBundleId ? "✓" : "-"}
                </p>
                <p className="text-xs text-muted-foreground">Pipeline Created</p>
              </div>
            </div>

            <Separator />

            <div className="flex gap-2">
              {promptBundleId && (
                <Button variant="outline" asChild>
                  <Link to={`/admin/prompt-bundles/${promptBundleId}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Pipeline
                  </Link>
                </Button>
              )}
              <Button variant="ghost" onClick={onRetry} disabled={isRetrying}>
                {isRetrying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Regenerate
              </Button>
            </div>

            {pipelineStatus === "draft" && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Draft pipeline must be published by Super Admin before researchers can use it
              </p>
            )}
          </CardContent>
        </Card>

        {/* Rubric Preview */}
        {suggestions.rubric?.sections && suggestions.rubric.sections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Extracted Rubric</CardTitle>
              <CardDescription>
                Assessment criteria extracted from guidelines
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px] pr-4">
                <div className="space-y-3">
                  {suggestions.rubric.sections.map((section) => (
                    <div key={section.key} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{section.title}</span>
                        {section.weight && (
                          <Badge variant="outline" className="text-xs">
                            {section.weight}%
                          </Badge>
                        )}
                      </div>
                      {section.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {section.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Pending state - waiting for upload or processing to start
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Analysis
            </CardTitle>
            <CardDescription>
              Extract rubric, inputs, and generate pipeline from guidelines
            </CardDescription>
          </div>
          <Badge variant="outline" className="flex items-center gap-1">
            {statusIcon[analysisStatus as keyof typeof statusIcon] || statusIcon.pending}
            {analysisStatus || "pending"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground text-center py-4">
          Guidelines uploaded. Processing should start automatically.
        </p>
        <Button onClick={onRetry} disabled={isRetrying} className="w-full">
          {isRetrying ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-2" />
          )}
          Start Processing
        </Button>
      </CardContent>
    </Card>
  );
}
