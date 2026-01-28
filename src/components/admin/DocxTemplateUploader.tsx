import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  FileText, 
  Upload, 
  Trash2, 
  Check, 
  Loader2, 
  Download,
  Star,
  StarOff
} from "lucide-react";
import {
  useDocxTemplates,
  useUploadDocxTemplate,
  useSetDefaultDocxTemplate,
  useDeleteDocxTemplate,
  type DocxTemplate,
} from "@/hooks/useDocxTemplates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";

const PLACEHOLDER_DOCS = `
## Supported Placeholders

### Simple Values
- \`{grant_name}\` - Name of the grant
- \`{application_title}\` - Application title
- \`{generated_date}\` - Report generation date
- \`{version}\` - Report version number
- \`{research_context}\` - Executive summary/research context
- \`{tam}\` / \`{tam_value}\` / \`{tam_description}\` - Total Addressable Market
- \`{sam}\` / \`{sam_value}\` / \`{sam_description}\` - Serviceable Addressable Market
- \`{som}\` / \`{som_value}\` / \`{som_description}\` - Serviceable Obtainable Market
- \`{economic_impact}\` - Economic impact analysis
- \`{competitor_table}\` - Pre-formatted competitor comparison
- \`{powered_by}\` - Branding text

### Loop Structures
#### Market Segments
\`\`\`
{#market_segments}
{index}. {name}
{description}
Size: {size}
{/market_segments}
\`\`\`

#### Competitors
\`\`\`
{#competitors}
{index}. {name} - {url}
{description}
{/competitors}
\`\`\`

#### Partners
\`\`\`
{#partners}
{index}. {name}
{description}
Website: {website}
{/partners}
\`\`\`

#### Citations
\`\`\`
{#citations}
[{index}] {title}
{url}
Accessed: {accessed}
{/citations}
\`\`\`

### Conditional Blocks
- \`{#has_market_segments}...{/has_market_segments}\`
- \`{#has_competitors}...{/has_competitors}\`
- \`{#has_partners}...{/has_partners}\`
- \`{#has_citations}...{/has_citations}\`
`;

export function DocxTemplateUploader() {
  const { data: templates, isLoading } = useDocxTemplates();
  const uploadMutation = useUploadDocxTemplate();
  const setDefaultMutation = useSetDefaultDocxTemplate();
  const deleteMutation = useDeleteDocxTemplate();

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(true);
  const [showDocs, setShowDocs] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setUploadFile(file);
      if (!templateName) {
        setTemplateName(file.name.replace(/\.docx$/i, ""));
      }
    }
  }, [templateName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!uploadFile || !templateName.trim()) return;

    await uploadMutation.mutateAsync({
      file: uploadFile,
      name: templateName.trim(),
      description: templateDescription.trim() || undefined,
      setAsDefault,
    });

    // Reset form
    setUploadFile(null);
    setTemplateName("");
    setTemplateDescription("");
    setSetAsDefault(true);
  };

  const handleDelete = async (template: DocxTemplate) => {
    await deleteMutation.mutateAsync(template);
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload DOCX Template
          </CardTitle>
          <CardDescription>
            Upload a Word document with placeholders that will be filled with report data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors
              ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"}
              ${uploadFile ? "bg-muted/30" : ""}
            `}
          >
            <input {...getInputProps()} />
            {uploadFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-10 w-10 text-primary" />
                <p className="font-medium">{uploadFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(uploadFile.size / 1024).toFixed(1)} KB
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploadFile(null);
                  }}
                >
                  Choose different file
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="font-medium">
                  {isDragActive ? "Drop your template here" : "Drag & drop your DOCX template"}
                </p>
                <p className="text-sm text-muted-foreground">or click to browse</p>
              </div>
            )}
          </div>

          {uploadFile && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="templateName">Template Name</Label>
                <Input
                  id="templateName"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Professional Report Template"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="templateDescription">Description (optional)</Label>
                <Textarea
                  id="templateDescription"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Describe this template's style or purpose..."
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="setDefault"
                  checked={setAsDefault}
                  onCheckedChange={setSetAsDefault}
                />
                <Label htmlFor="setDefault">Set as default template</Label>
              </div>

              <Button
                onClick={handleUpload}
                disabled={!templateName.trim() || uploadMutation.isPending}
                className="w-full"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Upload Template
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Placeholder Documentation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Placeholder Reference</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDocs(!showDocs)}
            >
              {showDocs ? "Hide" : "Show"} Documentation
            </Button>
          </CardTitle>
          <CardDescription>
            Learn which placeholders to use in your DOCX template
          </CardDescription>
        </CardHeader>
        {showDocs && (
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs whitespace-pre-wrap">
                {PLACEHOLDER_DOCS}
              </pre>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Existing Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Uploaded Templates
          </CardTitle>
          <CardDescription>
            Manage your DOCX templates. The default template will be used for all exports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{template.name}</p>
                        {template.is_default && (
                          <Badge variant="secondary" className="text-xs">
                            <Star className="h-3 w-3 mr-1" />
                            Default
                          </Badge>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Uploaded {format(new Date(template.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!template.is_default && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDefaultMutation.mutate(template.id)}
                        disabled={setDefaultMutation.isPending}
                      >
                        {setDefaultMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Star className="h-4 w-4" />
                        )}
                        <span className="ml-1 hidden sm:inline">Set Default</span>
                      </Button>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Template?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{template.name}". This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(template)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No templates uploaded yet</p>
              <p className="text-sm">Upload a DOCX template to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
