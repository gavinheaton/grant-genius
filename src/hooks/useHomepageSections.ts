import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface HomepageSection {
  id: string;
  section_type: string;
  sort_order: number;
  is_visible: boolean;
  heading: string | null;
  subheading: string | null;
  content_json: Record<string, any>;
  settings_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export const SECTION_TYPES = [
  { value: "hero", label: "Hero", description: "Badge, headline, CTAs, trust items, background image" },
  { value: "features_grid", label: "Features Grid", description: "Grid of feature cards with icons" },
  { value: "pricing", label: "Pricing", description: "Pricing plans with purchase buttons" },
  { value: "text_image_left", label: "Text Left / Image Right", description: "Two columns: text on left, image on right" },
  { value: "text_image_right", label: "Image Left / Text Right", description: "Two columns: image on left, text on right" },
  { value: "stats_bar", label: "Stats Bar", description: "Row of stat numbers with labels" },
  { value: "testimonials", label: "Testimonials", description: "Grid of quotes with author info" },
  { value: "cta_banner", label: "CTA Banner", description: "Full-width call-to-action strip" },
  { value: "logo_cloud", label: "Logo Cloud", description: "Row of partner/university logos" },
  { value: "faq", label: "FAQ", description: "Accordion of question-answer pairs" },
  { value: "rich_text", label: "Rich Text", description: "Freeform markdown content block" },
] as const;

export type SectionType = typeof SECTION_TYPES[number]["value"];

export function getDefaultContent(type: SectionType): Record<string, any> {
  switch (type) {
    case "hero":
      return { badge: "", headline: "", subheadline: "", cta_primary_text: "Get Started", cta_primary_link: "/auth", cta_secondary_text: "", cta_secondary_link: "", trust_items: [], image_url: "" };
    case "features_grid":
      return { items: [] };
    case "pricing":
      return { plans: [], footer_note: "" };
    case "text_image_left":
    case "text_image_right":
      return { heading: "", body_markdown: "", image_url: "", cta_text: "", cta_link: "" };
    case "stats_bar":
      return { stats: [{ value: "100+", label: "Stat" }] };
    case "testimonials":
      return { items: [] };
    case "cta_banner":
      return { heading: "", subtext: "", button_text: "Get Started", button_link: "/auth", style: "primary" };
    case "logo_cloud":
      return { heading: "Trusted by", logos: [] };
    case "faq":
      return { items: [] };
    case "rich_text":
      return { markdown: "" };
    default:
      return {};
  }
}

export function useHomepageSections() {
  return useQuery({
    queryKey: ["homepage-sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_sections")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as HomepageSection[];
    },
  });
}

export function useCreateSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ section_type, sort_order }: { section_type: SectionType; sort_order: number }) => {
      const { error } = await supabase
        .from("homepage_sections")
        .insert({
          section_type,
          sort_order,
          content_json: getDefaultContent(section_type),
          settings_json: {},
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homepage-sections"] });
      toast({ title: "Section added" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to add section", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<HomepageSection> & { id: string }) => {
      const { error } = await supabase
        .from("homepage_sections")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homepage-sections"] });
      toast({ title: "Section saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update section", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("homepage_sections")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homepage-sections"] });
      toast({ title: "Section deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete section", description: err.message, variant: "destructive" });
    },
  });
}

export function useReorderSections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      // Update each section's sort_order
      for (const u of updates) {
        const { error } = await supabase
          .from("homepage_sections")
          .update({ sort_order: u.sort_order } as any)
          .eq("id", u.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homepage-sections"] });
    },
  });
}
