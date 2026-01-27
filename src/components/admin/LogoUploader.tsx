import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LogoUploaderProps {
  value: string | null;
  onChange: (path: string | null) => void;
  bucket?: string;
}

export function LogoUploader({
  value,
  onChange,
  bucket = "pdf-assets",
}: LogoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Get the public URL for the logo
  const logoUrl = value
    ? supabase.storage.from(bucket).getPublicUrl(value).data.publicUrl
    : null;

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // Validate file type
      const validTypes = ["image/png", "image/jpeg", "image/svg+xml"];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PNG, JPG, or SVG file",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Logo must be less than 2MB",
          variant: "destructive",
        });
        return;
      }

      setIsUploading(true);

      try {
        // Create a unique file name
        const ext = file.name.split(".").pop();
        const fileName = `logo-${Date.now()}.${ext}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        // Delete old logo if exists
        if (value) {
          await supabase.storage.from(bucket).remove([value]);
        }

        onChange(fileName);
        setPreviewUrl(URL.createObjectURL(file));

        toast({
          title: "Logo uploaded",
          description: "Your logo has been uploaded successfully",
        });
      } catch (error: any) {
        console.error("Upload error:", error);
        toast({
          title: "Upload failed",
          description: error.message || "Failed to upload logo",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [bucket, value, onChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/svg+xml": [".svg"],
    },
    maxFiles: 1,
    disabled: isUploading,
  });

  const handleRemove = async () => {
    if (!value) return;

    try {
      await supabase.storage.from(bucket).remove([value]);
      onChange(null);
      setPreviewUrl(null);
      toast({
        title: "Logo removed",
        description: "The logo has been removed",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to remove logo",
        variant: "destructive",
      });
    }
  };

  const displayUrl = previewUrl || logoUrl;

  return (
    <div className="space-y-2">
      <Label>Organization Logo</Label>
      
      {displayUrl ? (
        <div className="relative inline-block">
          <div className="border rounded-lg p-4 bg-muted/30">
            <img
              src={displayUrl}
              alt="Logo preview"
              className="max-h-24 max-w-48 object-contain"
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-6 w-6"
            onClick={handleRemove}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            isUploading && "opacity-50 cursor-not-allowed"
          )}
        >
          <input {...getInputProps()} />
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              {isDragActive ? (
                <>
                  <Upload className="h-8 w-8 text-primary" />
                  <p className="text-sm text-primary">Drop logo here</p>
                </>
              ) : (
                <>
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop logo, or click to select
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, or SVG (max 2MB)
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
