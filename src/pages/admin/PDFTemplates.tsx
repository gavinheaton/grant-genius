import { FileText, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PDFTemplateForm } from "@/components/admin/PDFTemplateForm";
import { useDefaultPdfTemplate, useUpdatePdfTemplate } from "@/hooks/usePdfTemplates";

export default function PDFTemplates() {
  const { data: template, isLoading, error } = useDefaultPdfTemplate();
  const updateMutation = useUpdatePdfTemplate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Failed to load PDF template settings. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          PDF Templates
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure the branding, fonts, colors, and layout for generated PDF reports
        </p>
      </div>

      <PDFTemplateForm
        template={template}
        onSave={(updates) => updateMutation.mutate({ id: template.id, updates })}
        isSaving={updateMutation.isPending}
      />
    </div>
  );
}
