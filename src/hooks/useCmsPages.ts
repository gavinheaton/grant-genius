import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CmsPage {
  id: string;
  title: string;
  slug: string;
  content_html: string | null;
  is_published: boolean;
  show_in_menu: boolean;
  show_in_footer: boolean;
  menu_order: number;
  requires_auth: boolean;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export type CmsPageInsert = Omit<CmsPage, "id" | "created_at" | "updated_at">;
export type CmsPageUpdate = Partial<CmsPageInsert>;

// Generate a URL-friendly slug from a title
export const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

// Fetch all pages (admin view)
export function useAllCmsPages() {
  return useQuery({
    queryKey: ["cms-pages-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cms_pages")
        .select("*")
        .order("menu_order", { ascending: true });

      if (error) throw error;
      return data as CmsPage[];
    },
  });
}

// Fetch a single page by slug
export function useCmsPage(slug: string | undefined) {
  return useQuery({
    queryKey: ["cms-page", slug],
    queryFn: async () => {
      if (!slug) return null;
      
      const { data, error } = await supabase
        .from("cms_pages")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }
      return data as CmsPage;
    },
    enabled: !!slug,
  });
}

// Fetch pages for header menu
export function useCmsMenuPages() {
  return useQuery({
    queryKey: ["cms-menu-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cms_pages")
        .select("id, title, slug, requires_auth")
        .eq("is_published", true)
        .eq("show_in_menu", true)
        .order("menu_order", { ascending: true });

      if (error) throw error;
      return data as Pick<CmsPage, "id" | "title" | "slug" | "requires_auth">[];
    },
  });
}

// Fetch pages for footer
export function useCmsFooterPages() {
  return useQuery({
    queryKey: ["cms-footer-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cms_pages")
        .select("id, title, slug, requires_auth")
        .eq("is_published", true)
        .eq("show_in_footer", true)
        .order("menu_order", { ascending: true });

      if (error) throw error;
      return data as Pick<CmsPage, "id" | "title" | "slug" | "requires_auth">[];
    },
  });
}

// Create a new page
export function useCreateCmsPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (page: CmsPageInsert) => {
      const { data, error } = await supabase
        .from("cms_pages")
        .insert(page)
        .select()
        .single();

      if (error) throw error;
      return data as CmsPage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-pages-all"] });
      queryClient.invalidateQueries({ queryKey: ["cms-menu-pages"] });
      queryClient.invalidateQueries({ queryKey: ["cms-footer-pages"] });
      toast.success("Page created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create page: " + error.message);
    },
  });
}

// Update an existing page
export function useUpdateCmsPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: CmsPageUpdate }) => {
      const { data, error } = await supabase
        .from("cms_pages")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as CmsPage;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["cms-pages-all"] });
      queryClient.invalidateQueries({ queryKey: ["cms-menu-pages"] });
      queryClient.invalidateQueries({ queryKey: ["cms-footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["cms-page", data.slug] });
      toast.success("Page updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update page: " + error.message);
    },
  });
}

// Delete a page
export function useDeleteCmsPage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cms_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cms-pages-all"] });
      queryClient.invalidateQueries({ queryKey: ["cms-menu-pages"] });
      queryClient.invalidateQueries({ queryKey: ["cms-footer-pages"] });
      toast.success("Page deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete page: " + error.message);
    },
  });
}
