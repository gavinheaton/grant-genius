import { FileText } from "lucide-react";
import { DocxTemplateUploader } from "@/components/admin/DocxTemplateUploader";

export default function DocxTemplates() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          DOCX Templates
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload and manage Word document templates for report exports
        </p>
      </div>

      <DocxTemplateUploader />
    </div>
  );
}
