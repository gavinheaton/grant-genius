import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface DocxTemplate {
  id: string;
  name: string;
  description: string | null;
  template_path: string;
  is_default: boolean;
  placeholder_schema_json: string[];
  created_at: string;
  updated_at: string;
}

export function useDocxTemplates() {
  return useQuery({
    queryKey: ["docx-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("docx_templates")
        .select("*")
        .order("is_default", { ascending: false });

      if (error) throw error;
      return (data || []) as DocxTemplate[];
    },
  });
}

export function useDefaultDocxTemplate() {
  return useQuery({
    queryKey: ["docx-templates", "default"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("docx_templates")
        .select("*")
        .eq("is_default", true)
        .maybeSingle();

      if (error) throw error;
      return data as DocxTemplate | null;
    },
  });
}

export function useUploadDocxTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      name,
      description,
      setAsDefault,
    }: {
      file: File;
      name: string;
      description?: string;
      setAsDefault?: boolean;
    }) => {
      // Generate unique filename
      const timestamp = Date.now();
      const filename = `${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("docx-templates")
        .upload(filename, file, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

      if (uploadError) throw uploadError;

      // If setting as default, unset existing defaults first
      if (setAsDefault) {
        await supabase
          .from("docx_templates")
          .update({ is_default: false })
          .eq("is_default", true);
      }

      // Create database record
      const { data, error } = await supabase
        .from("docx_templates")
        .insert({
          name,
          description: description || null,
          template_path: filename,
          is_default: setAsDefault || false,
          placeholder_schema_json: [],
        })
        .select()
        .single();

      if (error) throw error;
      return data as DocxTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docx-templates"] });
      toast({
        title: "Template uploaded",
        description: "DOCX template has been saved successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload template",
        variant: "destructive",
      });
    },
  });
}

export function useSetDefaultDocxTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      // Unset existing defaults
      await supabase
        .from("docx_templates")
        .update({ is_default: false })
        .eq("is_default", true);

      // Set new default
      const { data, error } = await supabase
        .from("docx_templates")
        .update({ is_default: true })
        .eq("id", templateId)
        .select()
        .single();

      if (error) throw error;
      return data as DocxTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docx-templates"] });
      toast({
        title: "Default template updated",
        description: "This template will now be used for DOCX exports.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to set default",
        description: error.message || "Could not update default template",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteDocxTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: DocxTemplate) => {
      // Delete from storage first
      const { error: storageError } = await supabase.storage
        .from("docx-templates")
        .remove([template.template_path]);

      if (storageError) {
        console.warn("Storage deletion warning:", storageError);
      }

      // Delete database record
      const { error } = await supabase
        .from("docx_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docx-templates"] });
      toast({
        title: "Template deleted",
        description: "DOCX template has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });
}

export function useGenerateDocx() {
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Not authenticated");
      }

      const response = await supabase.functions.invoke("generate-docx", {
        body: { reportId },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to generate DOCX");
      }

      // The response.data should be the binary blob
      return response.data;
    },
    onError: (error: any) => {
      toast({
        title: "DOCX generation failed",
        description: error.message || "Failed to generate DOCX file",
        variant: "destructive",
      });
    },
  });
}
