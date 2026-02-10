import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface TrustItem {
  icon: string;
  label: string;
}

export interface FeatureItem {
  icon: string;
  title: string;
  description: string;
}

export interface PricingPlan {
  type: "single" | "bundle";
  name: string;
  basePrice: string;
  gstNote: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

export interface FooterColumn {
  heading: string;
  links: { label: string; url: string }[];
}

export interface HomepageSettings {
  id: string;
  hero_image_url: string | null;
  hero_badge_text: string | null;
  hero_headline: string | null;
  hero_subheadline: string | null;
  hero_cta_primary_text: string | null;
  hero_cta_primary_link: string | null;
  hero_cta_secondary_text: string | null;
  hero_cta_secondary_link: string | null;
  hero_trust_items: TrustItem[] | null;
  features_heading: string | null;
  features_subheading: string | null;
  features_items: FeatureItem[] | null;
  pricing_heading: string | null;
  pricing_subheading: string | null;
  pricing_plans: PricingPlan[] | null;
  pricing_footer_note: string | null;
  footer_brand_description: string | null;
  footer_columns: FooterColumn[] | null;
  footer_copyright: string | null;
  footer_support_email: string | null;
  updated_at: string;
  updated_by: string | null;
}

export function useHomepageSettings() {
  return useQuery({
    queryKey: ["homepage-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homepage_settings")
        .select("*")
        .limit(1)
        .single();

      if (error) throw error;

      return {
        ...data,
        hero_trust_items: data.hero_trust_items as unknown as TrustItem[] | null,
        features_items: data.features_items as unknown as FeatureItem[] | null,
        pricing_plans: data.pricing_plans as unknown as PricingPlan[] | null,
        footer_columns: data.footer_columns as unknown as FooterColumn[] | null,
      } as HomepageSettings;
    },
  });
}

export function useUpdateHomepageSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (updates: Partial<Omit<HomepageSettings, "id">>) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: existing } = await supabase
        .from("homepage_settings")
        .select("id")
        .limit(1)
        .single();

      if (!existing) throw new Error("No homepage settings row found");

      const { error } = await supabase
        .from("homepage_settings")
        .update({
          ...updates,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", existing.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["homepage-settings"] });
      toast({ title: "Homepage settings saved" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}

export function useUploadHeroImage() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (file: File) => {
      const ext = file.name.split(".").pop();
      const path = `hero-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("homepage-assets")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("homepage-assets")
        .getPublicUrl(path);

      return urlData.publicUrl;
    },
    onError: (err: any) => {
      toast({
        title: "Upload failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });
}
