import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users } from "lucide-react";

interface WorkflowTabProps {
  grantId: string;
}

interface AdminUser {
  user_id: string;
  email: string;
  full_name: string | null;
}

export function WorkflowTab({ grantId }: WorkflowTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isEnabled, setIsEnabled] = useState(false);
  const [stepCount, setStepCount] = useState(1);
  const [reviewers, setReviewers] = useState<(string | null)[]>([null, null, null]);

  // Fetch workflow config
  const { data: workflow, isLoading: workflowLoading } = useQuery({
    queryKey: ["grant-workflow", grantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grant_review_workflows" as any)
        .select("*, grant_review_workflow_steps(*)")
        .eq("grant_id", grantId)
        .maybeSingle();

      if (error) throw error;
      return data as any;
    },
  });

  // Fetch admin users
  const { data: adminUsers, isLoading: adminsLoading } = useQuery({
    queryKey: ["admin-users-for-workflow"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const userIds = roles.map((r: any) => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;
      return (profiles || []) as AdminUser[];
    },
  });

  // Sync state from fetched workflow
  useEffect(() => {
    if (workflow) {
      setIsEnabled(workflow.is_enabled || false);
      setStepCount(workflow.step_count || 1);
      
      const steps = workflow.grant_review_workflow_steps || [];
      const newReviewers: (string | null)[] = [null, null, null];
      steps.forEach((step: any) => {
        if (step.step_number >= 1 && step.step_number <= 3) {
          newReviewers[step.step_number - 1] = step.reviewer_user_id;
        }
      });
      setReviewers(newReviewers);
    }
  }, [workflow]);

  // Save workflow mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validate reviewers for active steps
      for (let i = 0; i < stepCount; i++) {
        if (!reviewers[i]) {
          throw new Error(`Please select a reviewer for step ${i + 1}`);
        }
      }

      if (workflow?.id) {
        // Update existing workflow
        const { error: updateError } = await supabase
          .from("grant_review_workflows" as any)
          .update({ is_enabled: isEnabled, step_count: stepCount } as any)
          .eq("id", workflow.id);
        if (updateError) throw updateError;

        // Delete existing steps and re-insert
        await supabase
          .from("grant_review_workflow_steps" as any)
          .delete()
          .eq("workflow_id", workflow.id);

        const stepsToInsert = [];
        for (let i = 0; i < stepCount; i++) {
          stepsToInsert.push({
            workflow_id: workflow.id,
            step_number: i + 1,
            reviewer_user_id: reviewers[i],
          });
        }

        const { error: stepsError } = await supabase
          .from("grant_review_workflow_steps" as any)
          .insert(stepsToInsert as any);
        if (stepsError) throw stepsError;
      } else {
        // Create new workflow
        const { data: newWorkflow, error: createError } = await supabase
          .from("grant_review_workflows" as any)
          .insert({ grant_id: grantId, is_enabled: isEnabled, step_count: stepCount } as any)
          .select()
          .single();
        if (createError) throw createError;

        const stepsToInsert = [];
        for (let i = 0; i < stepCount; i++) {
          stepsToInsert.push({
            workflow_id: (newWorkflow as any).id,
            step_number: i + 1,
            reviewer_user_id: reviewers[i],
          });
        }

        const { error: stepsError } = await supabase
          .from("grant_review_workflow_steps" as any)
          .insert(stepsToInsert as any);
        if (stepsError) throw stepsError;
      }
    },
    onSuccess: () => {
      toast({ title: "Workflow saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["grant-workflow", grantId] });
    },
    onError: (error) => {
      toast({
        title: "Error saving workflow",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (workflowLoading || adminsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Review Workflow
        </CardTitle>
        <CardDescription>
          Configure a multi-step review workflow for reports before they are sent to users
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center gap-3">
          <Switch
            id="workflow-enabled"
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
          />
          <div>
            <Label htmlFor="workflow-enabled">Enable Review Workflow</Label>
            <p className="text-sm text-muted-foreground">
              When enabled, completed reports will go through reviewers before being sent to users
            </p>
          </div>
        </div>

        {isEnabled && (
          <>
            {/* Step Count */}
            <div className="space-y-2">
              <Label>Number of Review Steps</Label>
              <Select
                value={String(stepCount)}
                onValueChange={(v) => setStepCount(Number(v))}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Reviewer</SelectItem>
                  <SelectItem value="2">2 Reviewers</SelectItem>
                  <SelectItem value="3">3 Reviewers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reviewer Assignments */}
            <div className="space-y-4">
              {Array.from({ length: stepCount }, (_, i) => (
                <div key={i} className="space-y-2">
                  <Label>Step {i + 1} Reviewer</Label>
                  <Select
                    value={reviewers[i] || ""}
                    onValueChange={(v) => {
                      const updated = [...reviewers];
                      updated[i] = v || null;
                      setReviewers(updated);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a reviewer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {adminUsers?.map((admin) => (
                        <SelectItem key={admin.user_id} value={admin.user_id}>
                          {admin.email}
                          {admin.full_name && ` (${admin.full_name})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </>
        )}

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Save Workflow
        </Button>
      </CardContent>
    </Card>
  );
}
