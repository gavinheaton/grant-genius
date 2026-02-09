import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";
import type { GrantArchetype } from "@/lib/bundleGeneratorSpec";

// ============================================================================
// TYPES
// ============================================================================

export interface PromptBundle {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export type StepType = 'ai_prompt' | 'firecrawl_search' | 'firecrawl_scrape';

// Pipeline phases for organizing steps
export type PipelinePhase = 'intake' | 'research' | 'argument_build' | 'assembly' | 'qa' | 'render';

// Module metadata for step categorization
export interface StepModuleMetadata {
  module_name?: string;
  phase?: PipelinePhase;
  archetype_specific?: boolean;
  provides_outputs?: string[];
  depends_on?: string[];
}

export interface PromptBundleStep {
  id: string;
  bundle_id: string;
  step_number: number;
  step_name: string;
  step_description: string;
  prompt_template: string;
  model_override: string | null;
  timeout_seconds: number | null;
  is_heavy: boolean;
  max_expected_seconds: number | null;
  max_output_tokens: number | null;
  step_type: StepType;
  step_config_json: Record<string, unknown> | null;
  is_assembly_step?: boolean;
  created_at: string;
  updated_at: string;
}

// Separate type for database updates (compatible with Supabase Json type)
export type PromptBundleStepUpdate = {
  step_number?: number;
  step_name?: string;
  step_description?: string;
  prompt_template?: string;
  model_override?: string | null;
  timeout_seconds?: number | null;
  is_heavy?: boolean;
  max_expected_seconds?: number | null;
  max_output_tokens?: number | null;
  step_type?: StepType;
  step_config_json?: Json;
  is_assembly_step?: boolean;
};

// Extended bundle with steps and metadata
export interface PromptBundleWithSteps extends PromptBundle {
  steps: PromptBundleStep[];
}

// Grant-specific pipeline metadata
export interface GrantPipelineMetadata {
  archetype: GrantArchetype;
  archetype_confidence: 'high' | 'medium' | 'low';
  firecrawl_step_count: number;
  ai_analysis_step_count: number;
  assembly_step_count: number;
  total_step_count: number;
  modules_included: string[];
}

// Re-export GrantArchetype for convenience
export type { GrantArchetype } from "@/lib/bundleGeneratorSpec";

export function usePromptBundles() {
  return useQuery({
    queryKey: ["prompt-bundles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompt_bundles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as PromptBundle[];
    },
  });
}

export function usePromptBundle(id: string | undefined) {
  return useQuery({
    queryKey: ["prompt-bundle", id],
    queryFn: async () => {
      if (!id) return null;

      const { data: bundle, error: bundleError } = await supabase
        .from("prompt_bundles")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (bundleError) throw bundleError;
      if (!bundle) return null;

      const { data: steps, error: stepsError } = await supabase
        .from("prompt_bundle_steps")
        .select("*, is_heavy, max_expected_seconds, max_output_tokens, step_type, step_config_json")
        .eq("bundle_id", id)
        .order("step_number", { ascending: true });

      if (stepsError) throw stepsError;

      return {
        ...bundle,
        steps: steps || [],
      } as PromptBundleWithSteps;
    },
    enabled: !!id,
  });
}

export function useCreatePromptBundle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      system_prompt: string;
      cloneFromId?: string;
    }) => {
      // Insert the bundle
      const { data: bundle, error: bundleError } = await supabase
        .from("prompt_bundles")
        .insert({
          name: data.name,
          description: data.description || null,
          system_prompt: data.system_prompt,
          is_active: false,
        })
        .select()
        .single();

      if (bundleError) throw bundleError;

      // If cloning, copy steps from source bundle
      if (data.cloneFromId) {
        const { data: sourceSteps, error: sourceError } = await supabase
          .from("prompt_bundle_steps")
          .select("*")
          .eq("bundle_id", data.cloneFromId)
          .order("step_number", { ascending: true });

        if (sourceError) throw sourceError;

        if (sourceSteps && sourceSteps.length > 0) {
          const newSteps = sourceSteps.map((step) => ({
            bundle_id: bundle.id,
            step_number: step.step_number,
            step_name: step.step_name,
            step_description: step.step_description,
            prompt_template: step.prompt_template,
            model_override: step.model_override,
            timeout_seconds: step.timeout_seconds,
          }));

          const { error: stepsError } = await supabase
            .from("prompt_bundle_steps")
            .insert(newSteps);

          if (stepsError) throw stepsError;
        }
      }

      return bundle;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-bundles"] });
      toast({ title: "Bundle created successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to create bundle",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdatePromptBundle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Partial<PromptBundle> & { id: string }) => {
      const { error } = await supabase
        .from("prompt_bundles")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["prompt-bundles"] });
      queryClient.invalidateQueries({ queryKey: ["prompt-bundle", variables.id] });
      toast({ title: "Bundle updated successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update bundle",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdatePromptStep() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      bundleId,
      ...data
    }: PromptBundleStepUpdate & { id: string; bundleId: string }) => {
      const { error } = await supabase
        .from("prompt_bundle_steps")
        .update(data)
        .eq("id", id);

      if (error) throw error;
      return bundleId;
    },
    onSuccess: (bundleId) => {
      queryClient.invalidateQueries({ queryKey: ["prompt-bundle", bundleId] });
      toast({ title: "Step updated successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to update step",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useSetActiveBundle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (bundleId: string) => {
      // Deactivate all bundles first
      // Deactivate all bundles except the one we're activating
      const { error: deactivateError } = await supabase
        .from("prompt_bundles")
        .update({ is_active: false })
        .neq("id", bundleId);

      if (deactivateError) throw deactivateError;

      // Activate the selected bundle
      const { error: activateError } = await supabase
        .from("prompt_bundles")
        .update({ is_active: true })
        .eq("id", bundleId);

      if (activateError) throw activateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-bundles"] });
      toast({ title: "Active bundle updated" });
    },
    onError: (error) => {
      toast({
        title: "Failed to set active bundle",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeletePromptBundle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (bundleId: string) => {
      const { error } = await supabase
        .from("prompt_bundles")
        .delete()
        .eq("id", bundleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prompt-bundles"] });
      toast({ title: "Bundle deleted successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete bundle",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCreatePromptStep() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      bundleId: string;
      step_number: number;
      step_name: string;
      step_description: string;
      prompt_template: string;
      step_type?: StepType;
      step_config_json?: Record<string, unknown>;
    }) => {
      const { error } = await supabase
        .from("prompt_bundle_steps")
        .insert({
          bundle_id: data.bundleId,
          step_number: data.step_number,
          step_name: data.step_name,
          step_description: data.step_description,
          prompt_template: data.prompt_template,
          step_type: data.step_type || 'ai_prompt',
          step_config_json: (data.step_config_json || null) as Json,
        });
      if (error) throw error;
      return data.bundleId;
    },
    onSuccess: (bundleId) => {
      queryClient.invalidateQueries({ queryKey: ["prompt-bundle", bundleId] });
      toast({ title: "Step created successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to create step",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeletePromptStep() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ stepId, bundleId }: { stepId: string; bundleId: string }) => {
      const { error } = await supabase
        .from("prompt_bundle_steps")
        .delete()
        .eq("id", stepId);
      if (error) throw error;
      return bundleId;
    },
    onSuccess: (bundleId) => {
      queryClient.invalidateQueries({ queryKey: ["prompt-bundle", bundleId] });
      toast({ title: "Step deleted successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete step",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useRegenerateStepPrompt() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { 
      stepId: string; 
      additionalContext?: string;
    }) => {
      const response = await supabase.functions.invoke("regenerate-step-prompt", {
        body: {
          step_id: data.stepId,
          additional_context: data.additionalContext,
        },
      });
      
      if (response.error) throw response.error;
      if (response.data?.error) throw new Error(response.data.error);
      
      return response.data as {
        regenerated_prompt: string;
        original_score: { total: number; level: 'good' | 'warning' | 'poor' };
        new_score: { total: number; level: 'good' | 'warning' | 'poor' };
      };
    },
    onError: (error) => {
      toast({
        title: "Failed to regenerate prompt",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useReorderPromptSteps() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ bundleId, steps }: { 
      bundleId: string; 
      steps: { id: string; step_number: number }[] 
    }) => {
      // Batch update all step numbers
      for (const step of steps) {
        const { error } = await supabase
          .from("prompt_bundle_steps")
          .update({ step_number: step.step_number })
          .eq("id", step.id);
        if (error) throw error;
      }
      return bundleId;
    },
    onSuccess: (bundleId) => {
      queryClient.invalidateQueries({ queryKey: ["prompt-bundle", bundleId] });
      toast({ title: "Steps reordered successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to reorder steps",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
