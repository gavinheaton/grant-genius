import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GuidelinesUploaderProps {
  grantId: string;
  versionId: string;
  versionNumber: number;
  currentPath?: string | null;
  onUploadComplete: (path: string, rawText: string) => void;
}

export function GuidelinesUploader({
  grantId,
  versionId,
  versionNumber,
  currentPath,
  onUploadComplete,
}: GuidelinesUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(currentPath || null);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    // For now, we'll read the file and pass it to the edge function
    // In production, you might use pdf.js or a dedicated service
    const text = await file.text().catch(() => "");
    if (text.startsWith("%PDF")) {
      // It's a binary PDF - we'll need to handle this server-side
      // Return a placeholder that indicates we need server processing
      return `[PDF file: ${file.name}, size: ${file.size} bytes]`;
    }
    return text;
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.includes("pdf") && !file.name.endsWith(".pdf")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 20MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const filePath = `${grantId}/${versionNumber}/guidelines.pdf`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("grant-guidelines")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Extract text (basic approach)
      const rawText = await extractTextFromPdf(file);

      // Update grant version with path
      const { error: updateError } = await supabase
        .from("grant_versions")
        .update({ 
          guidelines_source_path: filePath,
          guidelines_raw_text: rawText.substring(0, 100000)
        })
        .eq("id", versionId);

      if (updateError) throw updateError;

      setUploadedFile(filePath);
      onUploadComplete(filePath, rawText);
      
      toast({
        title: "Guidelines uploaded",
        description: "You can now analyze them with AI",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [grantId, versionNumber, versionId]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleRemove = async () => {
    if (!uploadedFile) return;

    try {
      await supabase.storage.from("grant-guidelines").remove([uploadedFile]);
      await supabase
        .from("grant_versions")
        .update({ 
          guidelines_source_path: null,
          guidelines_raw_text: null,
          ai_analysis_status: "pending",
          ai_suggestions_json: {}
        })
        .eq("id", versionId);

      setUploadedFile(null);
      toast({ title: "Guidelines removed" });
    } catch (error) {
      toast({
        title: "Failed to remove",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  if (uploadedFile) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">Guidelines PDF</p>
                <p className="text-sm text-muted-foreground">{uploadedFile}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleRemove}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`border-2 border-dashed transition-colors ${
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardContent className="p-8">
        <div className="flex flex-col items-center justify-center text-center">
          {isUploading ? (
            <>
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Uploading guidelines...</p>
            </>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">Upload Grant Guidelines</p>
              <p className="text-sm text-muted-foreground mb-4">
                Drag and drop a PDF, or click to browse
              </p>
              <label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileInput}
                />
                <Button variant="outline" asChild>
                  <span>Choose File</span>
                </Button>
              </label>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
