import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Save, Info } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePromptBundle, useUpdatePromptBundle, useUpdatePromptStep } from "@/hooks/usePromptBundles";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { PromptStepEditor } from "@/components/admin/PromptStepEditor";

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
      { name: "{{tam}}", description: "Output from TAM calculation (Step 5)" },
      { name: "{{sam}}", description: "Output from SAM calculation (Step 6)" },
      { name: "{{som}}", description: "Output from SOM calculation (Step 7)" },
      { name: "{{economicImpact}}", description: "Output from economic impact (Step 8)" },
      { name: "{{competitorTable}}", description: "Output from competitor table (Step 9)" },
      { name: "{{partnerBusinesses}}", description: "Output from partner businesses (Step 10)" },
    ],
  },
  {
    name: "Assembly Variables (Step 11 only - JSON stringified)",
    variables: [
      { name: "{{step0}}", description: "JSON from Step 0 (Source Pack)" },
      { name: "{{step1}}", description: "JSON from Step 1 (Research Context)" },
      { name: "{{step2}}", description: "JSON from Step 2 (Competitor Research)" },
      { name: "{{step3}}", description: "JSON from Step 3 (Market Segments)" },
      { name: "{{step4}}", description: "JSON from Step 4 (Existing Competitors)" },
      { name: "{{step5}}", description: "JSON from Step 5 (TAM)" },
      { name: "{{step6}}", description: "JSON from Step 6 (SAM)" },
      { name: "{{step7}}", description: "JSON from Step 7 (SOM)" },
      { name: "{{step8}}", description: "JSON from Step 8 (Economic Impact)" },
      { name: "{{step9}}", description: "JSON from Step 9 (Competitor Table)" },
      { name: "{{step10}}", description: "JSON from Step 10 (Partner Businesses)" },
    ],
  },
];

export default function PromptBundleEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAdminAuth();
  const { data: bundle, isLoading } = usePromptBundle(id);
  const updateBundle = useUpdatePromptBundle();
  const updateStep = useUpdatePromptStep();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (bundle) {
      setName(bundle.name);
      setDescription(bundle.description || "");
      setSystemPrompt(bundle.system_prompt);
    }
  }, [bundle]);

  const handleSaveBundle = async () => {
    if (!id) return;
    await updateBundle.mutateAsync({
      id,
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
    if (!id) return;
    await updateStep.mutateAsync({
      id: stepId,
      bundleId: id,
      ...data,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!bundle) {
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

  const canEdit = isSuperAdmin;

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
        {canEdit && hasChanges && (
          <Button onClick={handleSaveBundle} disabled={updateBundle.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        )}
      </div>

      {/* Bundle Settings */}
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

      {/* System Prompt */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>System Prompt</CardTitle>
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
                  The system prompt defines the AI's role and behavior. It's sent
                  with every request to maintain consistency across all steps.
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

      {/* Variable Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Available Variables</CardTitle>
          <CardDescription>
            Use these placeholders in your prompts. They will be replaced with actual values at runtime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {VARIABLE_CATEGORIES.map((category) => (
            <div key={category.name}>
              <h4 className="text-sm font-medium mb-3 text-foreground">{category.name}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {category.variables.map((variable) => (
                  <div key={variable.name} className="flex items-start gap-2 text-sm">
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono shrink-0">
                      {variable.name}
                    </code>
                    <span className="text-muted-foreground text-xs">
                      {variable.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Step Prompts */}
      <Card>
        <CardHeader>
          <CardTitle>Step Prompts</CardTitle>
          <CardDescription>
            Configure the prompt for each of the 11 research steps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {bundle.steps.map((step) => (
              <AccordionItem key={step.id} value={step.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <Badge variant="outline" className="font-mono">
                      {step.step_number}
                    </Badge>
                    <div>
                      <p className="font-medium">{step.step_description}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {step.step_name}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <PromptStepEditor
                    step={step}
                    models={AVAILABLE_MODELS}
                    canEdit={canEdit}
                    onSave={handleStepUpdate}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
