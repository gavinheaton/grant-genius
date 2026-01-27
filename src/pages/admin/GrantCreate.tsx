import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function GrantCreate() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      // Create the grant
      const { data: grant, error: grantError } = await supabase
        .from("grants")
        .insert({ name, description })
        .select()
        .single();

      if (grantError) throw grantError;

      // Create initial draft version
      const { error: versionError } = await supabase
        .from("grant_versions")
        .insert({
          grant_id: grant.id,
          version_number: 1,
          is_published: false,
          guidelines_json: {},
          required_inputs_json: [],
          rubric_json: {},
        });

      if (versionError) throw versionError;

      return grant;
    },
    onSuccess: (grant) => {
      toast({
        title: "Grant created",
        description: "The grant has been created with an initial draft version.",
      });
      navigate(`/admin/grants/${grant.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create grant. Please try again.",
        variant: "destructive",
      });
      console.error("Error creating grant:", error);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({
        title: "Validation error",
        description: "Grant name is required.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/grants")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Create New Grant</h1>
          <p className="text-muted-foreground mt-1">
            Add a new grant program to the system
          </p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Grant Details</CardTitle>
          <CardDescription>
            Enter the basic information for the new grant. You can configure versions,
            required inputs, and rubric after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Grant Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., ARC Linkage Program 2026"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the grant program..."
                rows={4}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/admin/grants")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Grant
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
