import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

export interface CoverLayout {
  logo_position: "center" | "left" | "right";
  title_text: string;
  subtitle_template: string;
  show_date: boolean;
  show_version: boolean;
  background_style: "solid" | "gradient";
}

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
  // New branding fields
  show_grant_genius_branding: boolean;
  powered_by_text: string;
  cover_layout_json: CoverLayout;
  created_at: string;
  updated_at: string;
}

// Helper to convert DB row to PdfTemplate
function toTemplate(row: any): PdfTemplate {
  return {
    ...row,
    margins_json: row.margins_json as PdfTemplate["margins_json"],
    heading_sizes_json: row.heading_sizes_json as PdfTemplate["heading_sizes_json"],
    cover_layout_json: (row.cover_layout_json || {
      logo_position: "center",
      title_text: "Commercialisation Research Report",
      subtitle_template: "{project_title}",
      show_date: true,
      show_version: true,
      background_style: "solid",
    }) as CoverLayout,
    show_grant_genius_branding: row.show_grant_genius_branding ?? true,
    powered_by_text: row.powered_by_text ?? "Powered by Disruptors Co",
  };
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
      return (data || []).map(toTemplate);
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
      return data ? toTemplate(data) : null;
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
      // Convert to DB-compatible format
      const dbUpdates: Record<string, any> = { ...updates };
      if (updates.cover_layout_json) {
        dbUpdates.cover_layout_json = updates.cover_layout_json as unknown as Json;
      }
      if (updates.margins_json) {
        dbUpdates.margins_json = updates.margins_json as unknown as Json;
      }
      if (updates.heading_sizes_json) {
        dbUpdates.heading_sizes_json = updates.heading_sizes_json as unknown as Json;
      }

      const { data, error } = await supabase
        .from("pdf_templates")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return toTemplate(data);
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
