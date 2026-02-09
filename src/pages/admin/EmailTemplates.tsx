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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Loader2, Eye, Code, Variable, Info } from "lucide-react";
import { format } from "date-fns";

interface EmailTemplate {
  id: string;
  template_key: string;
  brevo_template_id: number;
  description: string | null;
  subject: string | null;
  html_content: string | null;
  sender_name: string | null;
  sender_email: string | null;
  variables_schema: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

interface TemplateFormData {
  template_key: string;
  brevo_template_id: number;
  description: string;
  subject: string;
  html_content: string;
  sender_name: string;
  sender_email: string;
}

export default function EmailTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [formData, setFormData] = useState<TemplateFormData>({
    template_key: "",
    brevo_template_id: 0,
    description: "",
    subject: "",
    html_content: "",
    sender_name: "Grant Genius",
    sender_email: "grantgenius@disruptorsco.com",
  });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("template_key");

      if (error) throw error;
      return data as EmailTemplate[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        template_key: formData.template_key,
        brevo_template_id: formData.brevo_template_id,
        description: formData.description || null,
        subject: formData.subject || null,
        html_content: formData.html_content || null,
        sender_name: formData.sender_name || "Grant Genius",
        sender_email: formData.sender_email || "grantgenius@disruptorsco.com",
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from("email_templates")
          .update(payload)
          .eq("id", editingTemplate.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert(payload);
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
    onError: (error: Error) => {
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
      subject: "",
      html_content: "",
      sender_name: "Grant Genius",
      sender_email: "grantgenius@disruptorsco.com",
    });
    setEditingTemplate(null);
    setActiveTab("edit");
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      template_key: template.template_key,
      brevo_template_id: template.brevo_template_id,
      description: template.description || "",
      subject: template.subject || "",
      html_content: template.html_content || "",
      sender_name: template.sender_name || "Grant Genius",
      sender_email: template.sender_email || "grantgenius@disruptorsco.com",
    });
    setActiveTab("edit");
    setIsDialogOpen(true);
  };

  const insertVariable = (variable: string) => {
    setFormData((prev) => ({
      ...prev,
      html_content: prev.html_content + `{{${variable}}}`,
    }));
  };

  const getPreviewHtml = () => {
    let html = formData.html_content;
    // Replace variables with sample values for preview
    html = html.replace(/\{\{user_name\}\}/g, "John Smith");
    html = html.replace(/\{\{grant_name\}\}/g, "AEA Ignite");
    html = html.replace(/\{\{report_link\}\}/g, "https://grantgenius.disruptorsco.com/applications/123");
    html = html.replace(
      /\{\{report_summary\}\}/g,
      `<div style="border: 2px dashed #6b7280; padding: 16px; border-radius: 8px; background: #f9fafb; margin: 8px 0;">
        <p style="color: #6b7280; font-style: italic; margin: 0;">📋 Executive Summary content will appear here (~2-5KB)</p>
      </div>`
    );
    html = html.replace(
      /\{\{report_html\}\}/g,
      `<div style="border: 2px dashed #f59e0b; padding: 16px; border-radius: 8px; background: #fffbeb; margin: 8px 0;">
        <p style="color: #b45309; font-style: italic; margin: 0;">📄 Full report content will appear here (50-80KB)</p>
        <p style="color: #92400e; font-size: 12px; margin: 8px 0 0 0;">⚠️ Note: Gmail may clip emails larger than 102KB</p>
      </div>`
    );
    return html;
  };

  const variablesList = editingTemplate?.variables_schema
    ? Object.entries(editingTemplate.variables_schema)
    : [
        ["user_name", "Recipient's name"],
        ["grant_name", "Name of the grant"],
        ["report_link", "URL to view the report"],
        ["report_summary", "Executive summary section (recommended, ~2-5KB)"],
        ["report_html", "Full report content (⚠️ 50-80KB, Gmail clips >102KB)"],
      ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Email Templates</h1>
          <p className="text-muted-foreground mt-1">
            Manage email templates with custom content or Brevo integration
          </p>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "New Template"}
            </DialogTitle>
            <DialogDescription>
              Configure email content directly or use a Brevo template ID
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "edit" | "preview")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Edit
              </TabsTrigger>
              <TabsTrigger value="preview" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="template_key">Template Key</Label>
                  <Input
                    id="template_key"
                    value={formData.template_key}
                    onChange={(e) =>
                      setFormData({ ...formData, template_key: e.target.value })
                    }
                    placeholder="e.g., REPORT_READY"
                    disabled={!!editingTemplate}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brevo_template_id">
                    Brevo Template ID (optional override)
                  </Label>
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
                    placeholder="Leave 0 to use custom content"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Brief description of when this template is used"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sender_name">Sender Name</Label>
                  <Input
                    id="sender_name"
                    value={formData.sender_name}
                    onChange={(e) =>
                      setFormData({ ...formData, sender_name: e.target.value })
                    }
                    placeholder="Grant Genius"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sender_email">Sender Email</Label>
                  <Input
                    id="sender_email"
                    type="email"
                    value={formData.sender_email}
                    onChange={(e) =>
                      setFormData({ ...formData, sender_email: e.target.value })
                    }
                    placeholder="grantgenius@disruptorsco.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  placeholder="Your Grant Genius Report is Ready! 🎉"
                />
                <p className="text-xs text-muted-foreground">
                  Use variables like {"{{user_name}}"} or {"{{grant_name}}"}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="html_content">HTML Content</Label>
                  <div className="flex items-center gap-1">
                    <Variable className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mr-2">
                      Insert variable:
                    </span>
                    {variablesList.map(([key]) => (
                      <Badge
                        key={key}
                        variant="secondary"
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        onClick={() => insertVariable(key)}
                      >
                        {`{{${key}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Textarea
                  id="html_content"
                  value={formData.html_content}
                  onChange={(e) =>
                    setFormData({ ...formData, html_content: e.target.value })
                  }
                  placeholder="<!DOCTYPE html>..."
                  rows={16}
                  className="font-mono text-sm"
                />
              </div>

              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">Available Variables</p>
                    <ul className="space-y-1">
                      {variablesList.map(([key, desc]) => (
                        <li key={key}>
                          <code className="bg-background px-1 rounded">{`{{${key}}}`}</code>
                          {" — "}
                          {desc}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <div className="border rounded-lg overflow-hidden bg-white">
                <div className="bg-muted px-4 py-2 border-b flex items-center gap-4">
                  <div className="text-sm">
                    <span className="text-muted-foreground">From:</span>{" "}
                    <span className="font-medium">
                      {formData.sender_name} &lt;{formData.sender_email}&gt;
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Subject:</span>{" "}
                    <span className="font-medium">
                      {formData.subject
                        .replace(/\{\{user_name\}\}/g, "John Smith")
                        .replace(/\{\{grant_name\}\}/g, "AEA Ignite")}
                    </span>
                  </div>
                </div>
                <iframe
                  srcDoc={getPreviewHtml()}
                  className="w-full h-[500px] border-0"
                  title="Email Preview"
                />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
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

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template Key</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Source</TableHead>
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
                  <TableCell className="max-w-[200px] truncate">
                    {template.subject || "-"}
                  </TableCell>
                  <TableCell>
                    {template.html_content ? (
                      <Badge variant="default">Custom</Badge>
                    ) : template.brevo_template_id > 0 ? (
                      <Badge variant="secondary">
                        Brevo #{template.brevo_template_id}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Fallback</Badge>
                    )}
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
