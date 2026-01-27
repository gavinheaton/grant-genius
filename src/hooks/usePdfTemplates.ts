import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface PdfTemplate {
  id: string;
  name: string;
  is_default: boolean;
  page_format: string;
  margins_json: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  logo_path: string | null;
  header_text: string;
  footer_text: string;
  disclaimer_text: string;
  primary_color: string;
  secondary_color: string;
  font_family: string;
  heading_sizes_json: {
    h1: number;
    h2: number;
    h3: number;
    body: number;
  };
  include_cover_page: boolean;
  include_toc: boolean;
  section_page_breaks: boolean;
  watermark_text: string;
  created_at: string;
  updated_at: string;
}

export function usePdfTemplates() {
  return useQuery({
    queryKey: ["pdf-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdf_templates")
        .select("*")
        .order("is_default", { ascending: false });

      if (error) throw error;
      return data as PdfTemplate[];
    },
  });
}

export function useDefaultPdfTemplate() {
  return useQuery({
    queryKey: ["pdf-templates", "default"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pdf_templates")
        .select("*")
        .eq("is_default", true)
        .maybeSingle();

      if (error) throw error;
      return data as PdfTemplate | null;
    },
  });
}

export function useUpdatePdfTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<PdfTemplate>;
    }) => {
      const { data, error } = await supabase
        .from("pdf_templates")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pdf-templates"] });
      toast({
        title: "Template saved",
        description: "PDF template settings have been updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    },
  });
}
