import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Info, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  usePromptBundle,
  useUpdatePromptBundle,
  useUpdatePromptStep,
  useCreatePromptStep,
  useDeletePromptStep,
  useReorderPromptSteps,
  PromptBundleStep,
} from "@/hooks/usePromptBundles";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { PromptStepEditor, GrantContext } from "@/components/admin/PromptStepEditor";
import { AddStepDialog } from "@/components/admin/AddStepDialog";
import { PromptQualityBadge } from "@/components/admin/PromptQualityBadge";

const AVAILABLE_MODELS = [
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (Fast)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (Balanced)" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash Preview (Smart)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (Advanced)" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro Preview (Best)" },
];

const VARIABLE_CATEGORIES = [
  {
    name: "User Inputs",
    variables: [
      { name: "{{summary}}", description: "User's 100-word research summary" },
      { name: "{{publicArticleUrl}}", description: "URL of the research article" },
      { name: "{{articleContent}}", description: "Scraped content from the article (up to 8000 chars)" },
      { name: "{{trl}}", description: "Technology Readiness Level (if provided)" },
      { name: "{{ipStatus}}", description: "IP Status (if provided)" },
    ],
  },
  {
    name: "Grant Context",
    variables: [
      { name: "{{grantName}}", description: "Name of the grant being applied for" },
      { name: "{{grantVersionLabel}}", description: "Version label (e.g., 'v1')" },
      { name: "{{grantGuidelines}}", description: "Excerpt from grant guidelines (up to 10,000 chars)" },
      { name: "{{grantRubric}}", description: "Formatted assessment criteria from AI analysis" },
      { name: "{{grantSummary}}", description: "AI-generated summary of the grant" },
    ],
  },
  {
    name: "Source Pack (from Step 0)",
    variables: [
      { name: "{{sources}}", description: "JSON array of curated sources from Step 0" },
      { name: "{{unknowns}}", description: "JSON array of missing source categories from Step 0" },
    ],
  },
  {
    name: "Step Outputs (available in later steps)",
    variables: [
      { name: "{{researchContext}}", description: "Output from context extraction (Step 1)" },
      { name: "{{competitorResearch}}", description: "Output from competitor research (Step 2)" },
      { name: "{{marketSegments}}", description: "Output from market segments step (Step 3)" },
      { name: "{{existingCompetitors}}", description: "Output from competitors step (Step 4)" },
      { name: "{{marketSizingSourcePack}}", description: "Output from market sizing source pack (Step 5)" },
      { name: "{{tam}}", description: "Output from TAM calculation (Step 6)" },
      { name: "{{sam}}", description: "Output from SAM calculation (Step 7)" },
      { name: "{{som}}", description: "Output from SOM calculation (Step 8)" },
      { name: "{{economicImpact}}", description: "Output from economic impact (Step 9)" },
      { name: "{{competitorTable}}", description: "Output from competitor table (Step 10)" },
      { name: "{{partnerBusinesses}}", description: "Output from partner businesses (Step 11)" },
    ],
  },
  {
    name: "Assembly Variables (Step 12 only - JSON stringified)",
    variables: [
      { name: "{{step0}}", description: "JSON from Step 0 (Source Pack)" },
      { name: "{{step1}}", description: "JSON from Step 1 (Research Context)" },
      { name: "{{step2}}", description: "JSON from Step 2 (Competitor Research)" },
      { name: "{{step3}}", description: "JSON from Step 3 (Market Segments)" },
      { name: "{{step4}}", description: "JSON from Step 4 (Existing Competitors)" },
      { name: "{{step5}}", description: "JSON from Step 5 (Market Sizing Source Pack)" },
      { name: "{{step6}}", description: "JSON from Step 6 (TAM)" },
      { name: "{{step7}}", description: "JSON from Step 7 (SAM)" },
      { name: "{{step8}}", description: "JSON from Step 8 (SOM)" },
      { name: "{{step9}}", description: "JSON from Step 9 (Economic Impact)" },
      { name: "{{step10}}", description: "JSON from Step 10 (Competitor Table)" },
      { name: "{{step11}}", description: "JSON from Step 11 (Partner Businesses)" },
    ],
  },
];

interface InlinePipelineEditorProps {
  bundleId: string;
  showBundleSettings?: boolean;
  className?: string;
  grantContext?: GrantContext;
}

export function InlinePipelineEditor({
  bundleId,
  showBundleSettings = false,
  className,
  grantContext,
}: InlinePipelineEditorProps) {
  const { isSuperAdmin } = useAdminAuth();
  const { data: bundle, isLoading } = usePromptBundle(bundleId);
  const updateBundle = useUpdatePromptBundle();
  const updateStep = useUpdatePromptStep();
  const createStep = useCreatePromptStep();
  const deleteStep = useDeletePromptStep();
  const reorderSteps = useReorderPromptSteps();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [stepToDelete, setStepToDelete] = useState<PromptBundleStep | null>(null);
  const [variablesOpen, setVariablesOpen] = useState(false);

  useEffect(() => {
    if (bundle) {
      setName(bundle.name);
      setDescription(bundle.description || "");
      setSystemPrompt(bundle.system_prompt);
    }
  }, [bundle]);

  const handleSaveBundle = async () => {
    await updateBundle.mutateAsync({
      id: bundleId,
      name,
      description: description || null,
      system_prompt: systemPrompt,
    });
    setHasChanges(false);
  };

  const handleStepUpdate = async (
    stepId: string,
    data: { prompt_template?: string; model_override?: string | null }
  ) => {
    await updateStep.mutateAsync({
      id: stepId,
      bundleId,
      ...data,
    });
  };

  const handleAddStep = async (data: {
    step_name: string;
    step_description: string;
    prompt_template: string;
    insert_position: number;
  }) => {
    if (!bundle) return;

    const steps = bundle.steps;
    const insertAt = data.insert_position;

    // First, shift all steps at or after insert position up by 1
    const stepsToShift = steps.filter((s) => s.step_number >= insertAt);
    if (stepsToShift.length > 0) {
      await reorderSteps.mutateAsync({
        bundleId,
        steps: stepsToShift.map((s) => ({ id: s.id, step_number: s.step_number + 1 })),
      });
    }

    // Then create the new step
    await createStep.mutateAsync({
      bundleId,
      step_number: insertAt,
      step_name: data.step_name,
      step_description: data.step_description,
      prompt_template: data.prompt_template,
    });

    setAddDialogOpen(false);
  };

  const handleDeleteStep = async () => {
    if (!bundle || !stepToDelete) return;

    const deletedNumber = stepToDelete.step_number;

    // Delete the step
    await deleteStep.mutateAsync({ stepId: stepToDelete.id, bundleId });

    // Shift all steps after the deleted one down by 1
    const stepsToShift = bundle.steps.filter((s) => s.step_number > deletedNumber);
    if (stepsToShift.length > 0) {
      await reorderSteps.mutateAsync({
        bundleId,
        steps: stepsToShift.map((s) => ({ id: s.id, step_number: s.step_number - 1 })),
      });
    }

    setDeleteDialogOpen(false);
    setStepToDelete(null);
  };

  const handleMoveStep = async (step: PromptBundleStep, direction: "up" | "down") => {
    if (!bundle) return;

    const steps = [...bundle.steps].sort((a, b) => a.step_number - b.step_number);
    const currentIndex = steps.findIndex((s) => s.id === step.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= steps.length) return;

    const currentStep = steps[currentIndex];
    const targetStep = steps[targetIndex];

    // Swap step numbers
    await reorderSteps.mutateAsync({
      bundleId,
      steps: [
        { id: currentStep.id, step_number: targetStep.step_number },
        { id: targetStep.id, step_number: currentStep.step_number },
      ],
    });
  };

  const confirmDeleteStep = (step: PromptBundleStep) => {
    setStepToDelete(step);
    setDeleteDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!bundle) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center text-muted-foreground">
          Pipeline not found.
        </CardContent>
      </Card>
    );
  }

  const canEdit = isSuperAdmin;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Save Button - shown when there are changes */}
      {canEdit && hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSaveBundle} disabled={updateBundle.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      )}

      {/* Bundle Settings - conditionally shown */}
      {showBundleSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Bundle Settings</CardTitle>
            <CardDescription>
              Configure the name and description for this prompt bundle.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setHasChanges(true);
                  }}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setHasChanges(true);
                  }}
                  disabled={!canEdit}
                  placeholder="Optional description..."
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Prompt */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">System Prompt</CardTitle>
              <CardDescription>
                This prompt is included with every AI request across all steps.
              </CardDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p>
                  The system prompt defines the AI's role and behavior. It's sent with every request
                  to maintain consistency across all steps.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={systemPrompt}
            onChange={(e) => {
              setSystemPrompt(e.target.value);
              setHasChanges(true);
            }}
            disabled={!canEdit}
            rows={4}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* Variable Reference - Collapsible */}
      <Collapsible open={variablesOpen} onOpenChange={setVariablesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Available Variables</CardTitle>
                  <CardDescription>
                    Click to {variablesOpen ? "hide" : "show"} variable reference
                  </CardDescription>
                </div>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${variablesOpen ? "rotate-180" : ""}`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6 pt-0">
              {VARIABLE_CATEGORIES.map((category) => (
                <div key={category.name}>
                  <h4 className="text-sm font-medium mb-3 text-foreground">{category.name}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {category.variables.map((variable) => (
                      <div key={variable.name} className="flex items-start gap-2 text-sm">
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono shrink-0">
                          {variable.name}
                        </code>
                        <span className="text-muted-foreground text-xs">{variable.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Step Prompts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Step Prompts</CardTitle>
              <CardDescription>Configure the prompt for each research step.</CardDescription>
            </div>
            {canEdit && (
              <Button onClick={() => setAddDialogOpen(true)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {bundle.steps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No steps in this pipeline. Click "Add Step" to create one.
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {[...bundle.steps]
                .sort((a, b) => a.step_number - b.step_number)
                .map((step, index, sortedSteps) => (
                  <AccordionItem key={step.id} value={step.id}>
                    <div className="flex items-center gap-2">
                      {canEdit && (
                        <div className="flex flex-col gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveStep(step, "up");
                            }}
                            disabled={index === 0 || reorderSteps.isPending}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveStep(step, "down");
                            }}
                            disabled={index === sortedSteps.length - 1 || reorderSteps.isPending}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <div className="flex-1">
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3 text-left flex-1">
                            <Badge variant="outline" className="font-mono">
                              {step.step_number}
                            </Badge>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{step.step_description}</p>
                                <PromptQualityBadge prompt={step.prompt_template} />
                              </div>
                              <p className="text-xs text-muted-foreground font-mono">
                                {step.step_name}
                              </p>
                            </div>
                          </div>
                        </AccordionTrigger>
                      </div>
                      {canEdit && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeleteStep(step);
                              }}
                              disabled={deleteStep.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete step</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <AccordionContent>
                      <PromptStepEditor
                        step={step}
                        models={AVAILABLE_MODELS}
                        canEdit={canEdit}
                        isSuperAdmin={isSuperAdmin}
                        grantContext={grantContext}
                        onSave={handleStepUpdate}
                      />
                    </AccordionContent>
                  </AccordionItem>
                ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Add Step Dialog */}
      <AddStepDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        existingSteps={bundle.steps}
        onAdd={handleAddStep}
        isLoading={createStep.isPending || reorderSteps.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Step?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete step {stepToDelete?.step_number}: "
              {stepToDelete?.step_name}"? This action cannot be undone. Subsequent steps will be
              renumbered automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStep}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
