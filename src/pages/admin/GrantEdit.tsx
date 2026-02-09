import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { ArrowLeft, Loader2, Plus, CheckCircle, FileText, Settings2, Workflow, ChevronDown, ChevronUp, Users } from "lucide-react";
import { format } from "date-fns";
import { GuidelinesUploader } from "@/components/admin/GuidelinesUploader";
import { AIAnalysisPanel } from "@/components/admin/AIAnalysisPanel";
import { EngineSettingsCard } from "@/components/admin/EngineSettingsCard";
import { usePromptBundles, usePromptBundle } from "@/hooks/usePromptBundles";
import { InlinePipelineEditor } from "@/components/admin/InlinePipelineEditor";
import { WorkflowTab } from "@/components/admin/WorkflowTab";

export default function GrantEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isSuperAdmin } = useAdminAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [processingMode, setProcessingMode] = useState<"automated" | "manual">("automated");
  const [adminNotificationEmail, setAdminNotificationEmail] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionInputs, setVersionInputs] = useState("");
  const [versionRubric, setVersionRubric] = useState("");
  const [versionGuidelines, setVersionGuidelines] = useState("");
  const [guidelinesPath, setGuidelinesPath] = useState<string | null>(null);
  const [guidelinesRawText, setGuidelinesRawText] = useState<string | null>(null);
  const [aiAnalysisStatus, setAiAnalysisStatus] = useState("pending");
  const [pipelineStatus, setPipelineStatus] = useState("none");
  const [promptBundleId, setPromptBundleId] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any>(null);
  const [executionEngineDefault, setExecutionEngineDefault] = useState<"cloud_run" | "edge">("cloud_run");
  const [edgeAllowed, setEdgeAllowed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pipelineExpanded, setPipelineExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");

  // Fetch all prompt bundles for the pipeline selector
  const { data: allPromptBundles, isLoading: bundlesLoading } = usePromptBundles();

  // Mutation to update which pipeline is attached to the grant version
  const updatePipelineMutation = useMutation({
    mutationFn: async (bundleId: string | null) => {
      if (!selectedVersionId) return;
      const { error } = await supabase
        .from("grant_versions")
        .update({ 
          prompt_bundle_id: bundleId,
          pipeline_generation_status: bundleId ? "draft" : "none"
        })
        .eq("id", selectedVersionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Pipeline updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
    },
    onError: () => {
      toast({ title: "Error updating pipeline", variant: "destructive" });
    },
  });

  const { data: grant, isLoading } = useQuery({
    queryKey: ["admin-grant", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grants")
        .select(`
          *,
          grant_versions (
            id,
            version_number,
            is_published,
            published_at,
            created_at,
            guidelines_json,
            required_inputs_json,
            rubric_json,
            guidelines_source_path,
            guidelines_raw_text,
            ai_analysis_status,
            ai_suggestions_json,
            execution_engine_default,
            edge_allowed,
            pipeline_generation_status,
            prompt_bundle_id
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      
      const grantData = data as any;
      
      setName(grantData.name);
      setDescription(grantData.description || "");
      setIsActive(grantData.is_active);
      setIsTesting(grantData.is_testing || false);
      setProcessingMode(grantData.processing_mode || "automated");
      setAdminNotificationEmail(grantData.admin_notification_email || "");

      if (grantData.grant_versions?.length > 0) {
        const sorted = [...grantData.grant_versions].sort(
          (a: any, b: any) => b.version_number - a.version_number
        );
        selectVersion(sorted[0]);
      }

      return grantData;
    },
    // Removed polling - using Supabase Realtime subscription instead
  });

  // Realtime subscription for instant status updates during guidelines processing
  useEffect(() => {
    if (!selectedVersionId) return;

    const channel = supabase
      .channel(`grant-version-${selectedVersionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'grant_versions',
          filter: `id=eq.${selectedVersionId}`,
        },
        (payload) => {
          const newData = payload.new as any;
          console.log('[Realtime] grant_versions update:', newData.ai_analysis_status, newData.pipeline_generation_status);
          
          // Update local state immediately
          setAiAnalysisStatus(newData.ai_analysis_status || "pending");
          setPipelineStatus(newData.pipeline_generation_status || "none");
          setPromptBundleId(newData.prompt_bundle_id || null);
          setAiSuggestions(newData.ai_suggestions_json || null);
          setGuidelinesRawText(newData.guidelines_raw_text || null);
          setGuidelinesPath(newData.guidelines_source_path || null);
          
          // Also update inputs/rubric if they changed
          if (newData.required_inputs_json) {
            setVersionInputs(JSON.stringify(newData.required_inputs_json, null, 2));
          }
          if (newData.rubric_json) {
            setVersionRubric(JSON.stringify(newData.rubric_json, null, 2));
          }
          
          // Invalidate query to sync full data
          queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedVersionId, id, queryClient]);

  // Sync local state when grant data changes or version is selected
  useEffect(() => {
    if (grant && selectedVersionId) {
      const version = grant.grant_versions?.find((v: any) => v.id === selectedVersionId);
      if (version) {
        setAiAnalysisStatus(version.ai_analysis_status || "pending");
        setPipelineStatus(version.pipeline_generation_status || "none");
        setPromptBundleId(version.prompt_bundle_id || null);
        setAiSuggestions(version.ai_suggestions_json || null);
        setVersionInputs(JSON.stringify(version.required_inputs_json || [], null, 2));
        setVersionRubric(JSON.stringify(version.rubric_json || {}, null, 2));
      }
    }
  }, [grant, selectedVersionId]);

  const selectVersion = (version: any) => {
    setSelectedVersionId(version.id);
    setVersionInputs(JSON.stringify(version.required_inputs_json || [], null, 2));
    setVersionRubric(JSON.stringify(version.rubric_json || {}, null, 2));
    setVersionGuidelines(JSON.stringify(version.guidelines_json || {}, null, 2));
    setGuidelinesPath(version.guidelines_source_path || null);
    setGuidelinesRawText(version.guidelines_raw_text || null);
    setAiAnalysisStatus(version.ai_analysis_status || "pending");
    setPipelineStatus(version.pipeline_generation_status || "none");
    setPromptBundleId(version.prompt_bundle_id || null);
    setAiSuggestions(version.ai_suggestions_json || null);
    setExecutionEngineDefault(version.execution_engine_default || "cloud_run");
    setEdgeAllowed(version.edge_allowed || false);
  };

  const handleRetryProcessing = async () => {
    if (!guidelinesRawText || !selectedVersionId) return;
    
    setIsRetrying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-grant-guidelines`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            grant_version_id: selectedVersionId,
            guidelines_text: guidelinesRawText,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Processing failed");
      }

      toast({
        title: "Processing complete",
        description: `Generated ${data.step_count}-step research pipeline`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
    } catch (error) {
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const updateGrantMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("grants")
        .update({ 
          name, 
          description, 
          is_active: isActive,
          is_testing: isTesting,
          processing_mode: processingMode,
          admin_notification_email: adminNotificationEmail || null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Grant updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
    },
    onError: () => {
      toast({ title: "Error updating grant", variant: "destructive" });
    },
  });

  const updateVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVersionId) return;

      let parsedInputs, parsedRubric, parsedGuidelines;
      try {
        parsedInputs = JSON.parse(versionInputs);
        parsedRubric = JSON.parse(versionRubric);
        parsedGuidelines = JSON.parse(versionGuidelines);
      } catch {
        throw new Error("Invalid JSON format");
      }

      const { error } = await supabase
        .from("grant_versions")
        .update({
          required_inputs_json: parsedInputs,
          rubric_json: parsedRubric,
          guidelines_json: parsedGuidelines,
        })
        .eq("id", selectedVersionId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Version updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating version",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async () => {
      const maxVersion = grant?.grant_versions?.reduce(
        (max: number, v: any) => Math.max(max, v.version_number),
        0
      ) || 0;

      const latestVersion = grant?.grant_versions?.find(
        (v: any) => v.version_number === maxVersion
      );

      const { data, error } = await supabase
        .from("grant_versions")
        .insert({
          grant_id: id,
          version_number: maxVersion + 1,
          is_published: false,
          guidelines_json: latestVersion?.guidelines_json || {},
          required_inputs_json: latestVersion?.required_inputs_json || [],
          rubric_json: latestVersion?.rubric_json || {},
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "New version created" });
      queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
      selectVersion(data);
    },
    onError: () => {
      toast({ title: "Error creating version", variant: "destructive" });
    },
  });

  const publishVersionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVersionId) return;

      const { error } = await supabase
        .from("grant_versions")
        .update({
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .eq("id", selectedVersionId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Version published successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
    },
    onError: () => {
      toast({ title: "Error publishing version", variant: "destructive" });
    },
  });

  // Fetch the prompt bundle for validation
  const { data: currentBundle } = usePromptBundle(promptBundleId || "");

  // Validate pipeline before publishing
  const validatePipelineForPublish = (): string[] => {
    if (!currentBundle?.steps) return ["No pipeline steps found"];
    
    const errors: string[] = [];
    const finalStep = currentBundle.steps.find(s => s.step_name === 'finalize_report_html');
    
    if (!finalStep) {
      errors.push("Pipeline missing finalize_report_html step");
    } else if (!finalStep.prompt_template.includes('"report_html"')) {
      errors.push("finalize_report_html step missing required 'report_html' output field");
    }
    
    // Check for step references in finalize step
    if (finalStep) {
      const stepRefMatches = finalStep.prompt_template.match(/\{\{step\d+\}\}/g) || [];
      if (stepRefMatches.length < 2) {
        errors.push("finalize_report_html missing references to previous assembly steps");
      }
    }
    
    return errors;
  };

  const publishPipelineMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVersionId) return;

      // Pre-flight validation
      const validationErrors = validatePipelineForPublish();
      if (validationErrors.length > 0) {
        throw new Error(`Pipeline validation failed:\n• ${validationErrors.join('\n• ')}`);
      }

      const { error } = await supabase
        .from("grant_versions")
        .update({
          pipeline_generation_status: "published",
        })
        .eq("id", selectedVersionId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Pipeline published successfully" });
      queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error publishing pipeline", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const selectedVersion = grant?.grant_versions?.find(
    (v: any) => v.id === selectedVersionId
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Grant not found</p>
        <Button className="mt-4" onClick={() => navigate("/admin/grants")}>
          Back to Grants
        </Button>
      </div>
    );
  }

  const sortedVersions = [...(grant.grant_versions || [])].sort(
    (a, b) => b.version_number - a.version_number
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/grants")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{grant.name}</h1>
          <p className="text-muted-foreground mt-1">
            Manage grant details and versions
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="guidelines">
            <FileText className="h-4 w-4 mr-1" />
            Guidelines
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <Workflow className="h-4 w-4 mr-1" />
            Pipeline
          </TabsTrigger>
          <TabsTrigger value="inputs">Required Inputs</TabsTrigger>
          <TabsTrigger value="rubric">Rubric</TabsTrigger>
          <TabsTrigger value="workflow">
            <Users className="h-4 w-4 mr-1" />
            Workflow
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="advanced">
              <Settings2 className="h-4 w-4 mr-1" />
              Advanced
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="details" className="mt-6">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Grant Details</CardTitle>
              <CardDescription>Basic information about this grant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
              
              {/* Processing Mode */}
              <div className="space-y-3 pt-4 border-t">
                <Label>Processing Mode</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="processingMode"
                      value="automated"
                      checked={processingMode === "automated"}
                      onChange={() => setProcessingMode("automated")}
                      className="accent-primary"
                    />
                    <span>Automated (AI Pipeline)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="processingMode"
                      value="manual"
                      checked={processingMode === "manual"}
                      onChange={() => setProcessingMode("manual")}
                      className="accent-primary"
                    />
                    <span>Manual (Admin Review)</span>
                  </label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {processingMode === "automated" 
                    ? "Reports will be generated automatically using the AI pipeline."
                    : "Submissions will be sent to an admin for manual report preparation."
                  }
                </p>
              </div>

              {/* Admin Notification Email (only for manual mode) */}
              {processingMode === "manual" && (
                <div className="space-y-2">
                  <Label htmlFor="adminEmail">Admin Notification Email</Label>
                  <Input
                    id="adminEmail"
                    type="email"
                    value={adminNotificationEmail}
                    onChange={(e) => setAdminNotificationEmail(e.target.value)}
                    placeholder="admin@example.com"
                  />
                  <p className="text-sm text-muted-foreground">
                    This email will receive notifications when users submit for manual review.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch
                  id="active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
                <Label htmlFor="active">Active</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="testing"
                  checked={isTesting}
                  onCheckedChange={setIsTesting}
                />
                <div>
                  <Label htmlFor="testing">Testing Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Only admins can see this grant in the application dropdown
                  </p>
                </div>
              </div>
              <Button
                onClick={() => updateGrantMutation.mutate()}
                disabled={updateGrantMutation.isPending}
              >
                {updateGrantMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versions" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Versions</CardTitle>
                <CardDescription>Manage grant versions</CardDescription>
              </div>
              <Button onClick={() => createVersionMutation.mutate()}>
                <Plus className="h-4 w-4 mr-2" />
                New Version
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Published</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedVersions.map((version: any) => (
                    <TableRow
                      key={version.id}
                      className={selectedVersionId === version.id ? "bg-muted/50" : ""}
                    >
                      <TableCell className="font-medium">
                        v{version.version_number}
                      </TableCell>
                      <TableCell>
                        <Badge variant={version.is_published ? "default" : "outline"}>
                          {version.is_published ? "Published" : "Draft"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            version.pipeline_generation_status === "published" ? "default" :
                            version.pipeline_generation_status === "draft" ? "secondary" :
                            "outline"
                          }
                        >
                          {version.pipeline_generation_status || "none"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(version.created_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {version.published_at
                          ? format(new Date(version.published_at), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => selectVersion(version)}
                          >
                            Edit
                          </Button>
                          {isSuperAdmin && !version.is_published && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedVersionId(version.id);
                                publishVersionMutation.mutate();
                              }}
                              disabled={publishVersionMutation.isPending}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Publish
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guidelines" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upload Guidelines</CardTitle>
                  <CardDescription>
                    Upload the grant guidelines PDF to automatically extract inputs, rubric, and generate pipeline
                    {selectedVersion && (
                      <Badge className="ml-2" variant="outline">
                        v{selectedVersion.version_number}
                      </Badge>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedVersionId && id ? (
                    <GuidelinesUploader
                      grantId={id}
                      versionId={selectedVersionId}
                      versionNumber={selectedVersion?.version_number || 1}
                      currentPath={guidelinesPath}
                      onUploadStart={() => {
                        setIsUploading(true);
                      }}
                      onUploadComplete={(path, rawText) => {
                        setIsUploading(false);
                        setGuidelinesPath(path);
                        setGuidelinesRawText(rawText);
                        setAiAnalysisStatus("pending");
                        setPipelineStatus("none");
                      }}
                      onProcessingStart={() => {
                        setAiAnalysisStatus("analyzing");
                        queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
                      }}
                    />
                  ) : (
                    <p className="text-muted-foreground text-center py-4">
                      Select a version first
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div>
              {selectedVersionId && (
                <AIAnalysisPanel
                  versionId={selectedVersionId}
                  guidelinesText={guidelinesRawText}
                  analysisStatus={aiAnalysisStatus}
                  pipelineStatus={pipelineStatus}
                  promptBundleId={promptBundleId}
                  suggestions={aiSuggestions}
                  onRetry={handleRetryProcessing}
                  isRetrying={isRetrying}
                  isUploading={isUploading}
                  onViewPipeline={() => setActiveTab("pipeline")}
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pipeline" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Research Pipeline</CardTitle>
              <CardDescription>
                Custom research pipeline generated from grant guidelines
                {selectedVersion && (
                  <Badge className="ml-2" variant="outline">
                    v{selectedVersion.version_number}
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pipeline Selector */}
              <div className="space-y-2">
                <Label htmlFor="pipeline-select">Attached Pipeline</Label>
                <Select
                  value={promptBundleId || "none"}
                  onValueChange={(value) => {
                    const newBundleId = value === "none" ? null : value;
                    setPromptBundleId(newBundleId);
                    updatePipelineMutation.mutate(newBundleId);
                  }}
                  disabled={updatePipelineMutation.isPending || bundlesLoading}
                >
                  <SelectTrigger id="pipeline-select" className="w-full max-w-md">
                    <SelectValue placeholder="Select a pipeline..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      No pipeline (use global default)
                    </SelectItem>
                    {allPromptBundles?.map((bundle) => (
                      <SelectItem key={bundle.id} value={bundle.id}>
                        {bundle.name}
                        {bundle.is_active && " (Global Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {updatePipelineMutation.isPending && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Updating pipeline...
                  </p>
                )}
              </div>

              {/* Pipeline Status & Actions */}
              {promptBundleId ? (
                <>
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                    <div>
                      <p className="font-medium">Pipeline Status</p>
                      <Badge 
                        variant={pipelineStatus === "published" ? "default" : "secondary"}
                        className="mt-1"
                      >
                        {pipelineStatus}
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        onClick={() => setPipelineExpanded(!pipelineExpanded)}
                      >
                        {pipelineExpanded ? (
                          <ChevronUp className="h-4 w-4 mr-2" />
                        ) : (
                          <ChevronDown className="h-4 w-4 mr-2" />
                        )}
                        {pipelineExpanded ? "Hide Pipeline Editor" : "View & Edit Pipeline"}
                      </Button>
                      {isSuperAdmin && pipelineStatus === "draft" && (
                        <Button 
                          onClick={() => publishPipelineMutation.mutate()}
                          disabled={publishPipelineMutation.isPending}
                        >
                          {publishPipelineMutation.isPending && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Publish Pipeline
                        </Button>
                      )}
                    </div>
                  </div>

                  {pipelineStatus === "draft" && (
                    <p className="text-sm text-amber-600">
                      ⚠️ This pipeline is in draft status. Researchers will use the global default pipeline 
                      until a Super Admin publishes this grant-specific pipeline.
                    </p>
                  )}

                  {pipelineStatus === "published" && (
                    <p className="text-sm text-green-600">
                      ✓ This pipeline is active. Researchers applying for this grant will use this 
                      custom research pipeline.
                    </p>
                  )}

                  {/* Inline Pipeline Editor */}
                  {pipelineExpanded && (
                    <InlinePipelineEditor 
                      bundleId={promptBundleId} 
                      showBundleSettings={false}
                      className="mt-4"
                      grantContext={{
                        grantName: name,
                        grantSummary: aiSuggestions?.grant_summary,
                        rubricSummary: versionRubric ? `See rubric` : undefined,
                      }}
                    />
                  )}
                </>
              ) : (
                <div className="text-center py-8 border rounded-lg bg-muted/20">
                  <Workflow className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">
                    No pipeline attached
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Select a pipeline from the dropdown above, or upload guidelines to auto-generate one.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inputs" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Required Inputs</CardTitle>
              <CardDescription>
                Define the fields researchers must complete for this grant
                {selectedVersion && (
                  <Badge className="ml-2" variant="outline">
                    Editing v{selectedVersion.version_number}
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={versionInputs}
                onChange={(e) => setVersionInputs(e.target.value)}
                rows={15}
                className="font-mono text-sm"
                placeholder='[{"key": "research_summary", "label": "Research Summary", "type": "text", "required": true}]'
              />
              <Button
                onClick={() => updateVersionMutation.mutate()}
                disabled={updateVersionMutation.isPending || !selectedVersionId}
              >
                {updateVersionMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Inputs
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rubric" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Rubric Configuration</CardTitle>
              <CardDescription>
                Define the evaluation criteria for this grant
                {selectedVersion && (
                  <Badge className="ml-2" variant="outline">
                    Editing v{selectedVersion.version_number}
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={versionRubric}
                onChange={(e) => setVersionRubric(e.target.value)}
                rows={15}
                className="font-mono text-sm"
                placeholder='{"sections": [{"key": "impact", "title": "Impact", "weight": 30}]}'
              />
              <Button
                onClick={() => updateVersionMutation.mutate()}
                disabled={updateVersionMutation.isPending || !selectedVersionId}
              >
                {updateVersionMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save Rubric
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab - Super Admin Only */}
        {isSuperAdmin && (
          <TabsContent value="advanced" className="mt-6">
            <div className="space-y-6">
              <EngineSettingsCard
                executionEngineDefault={executionEngineDefault}
                edgeAllowed={edgeAllowed}
                onEngineChange={async (engine) => {
                  if (!selectedVersionId) return;
                  setExecutionEngineDefault(engine);
                  await supabase
                    .from("grant_versions")
                    .update({ execution_engine_default: engine } as any)
                    .eq("id", selectedVersionId);
                  toast({ title: "Execution engine updated" });
                  queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
                }}
                onEdgeAllowedChange={async (allowed) => {
                  if (!selectedVersionId) return;
                  setEdgeAllowed(allowed);
                  const updates: any = { edge_allowed: allowed };
                  if (!allowed && executionEngineDefault === "edge") {
                    updates.execution_engine_default = "cloud_run";
                    setExecutionEngineDefault("cloud_run");
                  }
                  await supabase
                    .from("grant_versions")
                    .update(updates)
                    .eq("id", selectedVersionId);
                  toast({ title: allowed ? "Edge execution enabled" : "Edge execution disabled" });
                  queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
                }}
                isSuperAdmin={isSuperAdmin}
                disabled={!selectedVersionId}
              />

              {selectedVersion && (
                <Card>
                  <CardHeader>
                    <CardTitle>Version Info</CardTitle>
                    <CardDescription>
                      Current execution settings for v{selectedVersion.version_number}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Default Engine</p>
                        <p className="font-medium capitalize">{executionEngineDefault.replace("_", " ")}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Edge Allowed</p>
                        <p className="font-medium">{edgeAllowed ? "Yes (Debug)" : "No"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
