import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface TemplateFormData {
  template_key: string;
  brevo_template_id: number;
  description: string;
}

export default function EmailTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [formData, setFormData] = useState<TemplateFormData>({
    template_key: "",
    brevo_template_id: 0,
    description: "",
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("template_key");

      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingTemplate) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            template_key: formData.template_key,
            brevo_template_id: formData.brevo_template_id,
            description: formData.description,
          })
          .eq("id", editingTemplate.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert({
          template_key: formData.template_key,
          brevo_template_id: formData.brevo_template_id,
          description: formData.description,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: editingTemplate ? "Template updated" : "Template created",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-email-templates"] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error saving template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      template_key: "",
      brevo_template_id: 0,
      description: "",
    });
    setEditingTemplate(null);
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setFormData({
      template_key: template.template_key,
      brevo_template_id: template.brevo_template_id,
      description: template.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleNewTemplate = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Email Templates</h1>
          <p className="text-muted-foreground mt-1">
            Manage email template mappings to Brevo
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNewTemplate}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Template" : "New Template"}
              </DialogTitle>
              <DialogDescription>
                Map a template key to a Brevo template ID
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="template_key">Template Key</Label>
                <Input
                  id="template_key"
                  value={formData.template_key}
                  onChange={(e) =>
                    setFormData({ ...formData, template_key: e.target.value })
                  }
                  placeholder="e.g., PAYMENT_RECEIPT"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brevo_template_id">Brevo Template ID</Label>
                <Input
                  id="brevo_template_id"
                  type="number"
                  value={formData.brevo_template_id || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      brevo_template_id: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="e.g., 1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Brief description of when this template is used"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingTemplate ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template Key</TableHead>
              <TableHead>Brevo ID</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Loading templates...
                </TableCell>
              </TableRow>
            ) : templates?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  No templates configured
                </TableCell>
              </TableRow>
            ) : (
              templates?.map((template) => (
                <TableRow key={template.id}>
                  <TableCell className="font-mono text-sm">
                    {template.template_key}
                  </TableCell>
                  <TableCell>{template.brevo_template_id}</TableCell>
                  <TableCell className="max-w-[300px] truncate">
                    {template.description || "-"}
                  </TableCell>
                  <TableCell>
                    {format(new Date(template.updated_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(template)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
