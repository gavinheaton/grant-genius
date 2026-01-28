import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface ColorPalette {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  is_preset: boolean;
  created_at: string;
}

export function useColorPalettes() {
  return useQuery({
    queryKey: ["color-palettes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("color_palettes")
        .select("*")
        .order("is_preset", { ascending: false })
        .order("name");

      if (error) throw error;
      return data as ColorPalette[];
    },
  });
}

export function useCreateColorPalette() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (palette: { name: string; primary_color: string; secondary_color: string }) => {
      const { data, error } = await supabase
        .from("color_palettes")
        .insert({
          name: palette.name,
          primary_color: palette.primary_color,
          secondary_color: palette.secondary_color,
          is_preset: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["color-palettes"] });
      toast({
        title: "Palette saved",
        description: "Your color palette has been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save palette",
        variant: "destructive",
      });
    },
  });
}

export function useDeleteColorPalette() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("color_palettes")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["color-palettes"] });
      toast({
        title: "Palette deleted",
        description: "The color palette has been removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete palette",
        variant: "destructive",
      });
    },
  });
}
