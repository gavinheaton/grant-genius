import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Save, Loader2 } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import { LogoUploader } from "./LogoUploader";
import { PDFTemplatePreview } from "./PDFTemplatePreview";
import { type PdfTemplate } from "@/hooks/usePdfTemplates";
import { cn } from "@/lib/utils";

const PAGE_FORMATS = ["A4", "Letter", "Legal"];

const GOOGLE_FONTS = [
  "Inter",
  "Open Sans",
  "Roboto",
  "Lato",
  "Source Sans Pro",
  "Nunito",
  "Montserrat",
  "Merriweather",
  "Playfair Display",
];

const HEADING_SIZES = {
  h1: [24, 26, 28, 30, 32, 34, 36],
  h2: [18, 20, 22, 24, 26, 28],
  h3: [14, 16, 18, 20, 22],
  body: [10, 11, 12, 13, 14],
};

interface PDFTemplateFormProps {
  template: PdfTemplate;
  onSave: (updates: Partial<PdfTemplate>) => void;
  isSaving: boolean;
}

export function PDFTemplateForm({ template, onSave, isSaving }: PDFTemplateFormProps) {
  const [formData, setFormData] = useState<Partial<PdfTemplate>>({});
  const [openSections, setOpenSections] = useState<string[]>([
    "page-setup",
    "branding",
  ]);

  useEffect(() => {
    setFormData({
      name: template.name,
      page_format: template.page_format,
      margins_json: template.margins_json,
      logo_path: template.logo_path,
      header_text: template.header_text,
      footer_text: template.footer_text,
      disclaimer_text: template.disclaimer_text,
      primary_color: template.primary_color,
      secondary_color: template.secondary_color,
      font_family: template.font_family,
      heading_sizes_json: template.heading_sizes_json,
      include_cover_page: template.include_cover_page,
      include_toc: template.include_toc,
      section_page_breaks: template.section_page_breaks,
      watermark_text: template.watermark_text,
    });
  }, [template]);

  const toggleSection = (section: string) => {
    setOpenSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const updateField = <K extends keyof PdfTemplate>(
    field: K,
    value: PdfTemplate[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateMargin = (key: keyof PdfTemplate["margins_json"], value: number) => {
    setFormData((prev) => ({
      ...prev,
      margins_json: {
        ...((prev.margins_json as PdfTemplate["margins_json"]) || template.margins_json),
        [key]: value,
      },
    }));
  };

  const updateHeadingSize = (
    key: keyof PdfTemplate["heading_sizes_json"],
    value: number
  ) => {
    setFormData((prev) => ({
      ...prev,
      heading_sizes_json: {
        ...((prev.heading_sizes_json as PdfTemplate["heading_sizes_json"]) ||
          template.heading_sizes_json),
        [key]: value,
      },
    }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  const previewData = {
    page_format: formData.page_format || template.page_format,
    logo_path: formData.logo_path ?? template.logo_path,
    header_text: formData.header_text || template.header_text,
    footer_text: formData.footer_text || template.footer_text,
    primary_color: formData.primary_color || template.primary_color,
    secondary_color: formData.secondary_color || template.secondary_color,
    font_family: formData.font_family || template.font_family,
    heading_sizes_json:
      (formData.heading_sizes_json as PdfTemplate["heading_sizes_json"]) ||
      template.heading_sizes_json,
    include_cover_page: formData.include_cover_page ?? template.include_cover_page,
    watermark_text: formData.watermark_text || template.watermark_text,
  };

  const CollapsibleSection = ({
    id,
    title,
    children,
  }: {
    id: string;
    title: string;
    children: React.ReactNode;
  }) => (
    <Collapsible open={openSections.includes(id)}>
      <CollapsibleTrigger
        onClick={() => toggleSection(id)}
        className="flex items-center justify-between w-full py-3 text-left font-medium hover:text-primary transition-colors"
      >
        {title}
        <ChevronDown
          className={cn(
            "h-4 w-4 transition-transform",
            openSections.includes(id) && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 pb-4 space-y-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Form */}
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>PDF Template Settings</CardTitle>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </CardHeader>
          <CardContent className="divide-y">
            {/* Page Setup */}
            <CollapsibleSection id="page-setup" title="Page Setup">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Page Format</Label>
                  <Select
                    value={formData.page_format || template.page_format}
                    onValueChange={(value) => updateField("page_format", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_FORMATS.map((format) => (
                        <SelectItem key={format} value={format}>
                          {format}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Margins (mm)</Label>
                <div className="grid grid-cols-4 gap-3">
                  {(["top", "right", "bottom", "left"] as const).map((side) => (
                    <div key={side} className="space-y-1">
                      <Label className="text-xs text-muted-foreground capitalize">
                        {side}
                      </Label>
                      <Input
                        type="number"
                        min={5}
                        max={50}
                        value={
                          (formData.margins_json as PdfTemplate["margins_json"])?.[side] ||
                          template.margins_json[side]
                        }
                        onChange={(e) =>
                          updateMargin(side, parseInt(e.target.value) || 20)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CollapsibleSection>

            {/* Branding */}
            <CollapsibleSection id="branding" title="Branding">
              <LogoUploader
                value={formData.logo_path ?? template.logo_path}
                onChange={(path) => updateField("logo_path", path)}
              />

              <div className="grid grid-cols-2 gap-4">
                <ColorPicker
                  label="Primary Color"
                  value={formData.primary_color || template.primary_color}
                  onChange={(value) => updateField("primary_color", value)}
                />
                <ColorPicker
                  label="Secondary Color"
                  value={formData.secondary_color || template.secondary_color}
                  onChange={(value) => updateField("secondary_color", value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Font Family</Label>
                <Select
                  value={formData.font_family || template.font_family}
                  onValueChange={(value) => updateField("font_family", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOOGLE_FONTS.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CollapsibleSection>

            {/* Typography */}
            <CollapsibleSection id="typography" title="Typography">
              <div className="grid grid-cols-2 gap-4">
                {(["h1", "h2", "h3", "body"] as const).map((level) => (
                  <div key={level} className="space-y-2">
                    <Label className="uppercase">{level} Size</Label>
                    <Select
                      value={String(
                        (formData.heading_sizes_json as PdfTemplate["heading_sizes_json"])?.[
                          level
                        ] || template.heading_sizes_json[level]
                      )}
                      onValueChange={(value) =>
                        updateHeadingSize(level, parseInt(value))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HEADING_SIZES[level].map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size}px
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Header/Footer */}
            <CollapsibleSection id="header-footer" title="Header & Footer">
              <div className="space-y-2">
                <Label>Header Text</Label>
                <Input
                  value={formData.header_text ?? template.header_text}
                  onChange={(e) => updateField("header_text", e.target.value)}
                  placeholder="Organization name or report title"
                />
              </div>

              <div className="space-y-2">
                <Label>Footer Text</Label>
                <Input
                  value={formData.footer_text ?? template.footer_text}
                  onChange={(e) => updateField("footer_text", e.target.value)}
                  placeholder="Page {page} of {pages}"
                />
                <p className="text-xs text-muted-foreground">
                  Variables: {"{page}"}, {"{pages}"}, {"{date}"}
                </p>
              </div>
            </CollapsibleSection>

            {/* Layout Options */}
            <CollapsibleSection id="layout" title="Layout Options">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Include Cover Page</Label>
                    <p className="text-xs text-muted-foreground">
                      Show title page with logo and report metadata
                    </p>
                  </div>
                  <Switch
                    checked={formData.include_cover_page ?? template.include_cover_page}
                    onCheckedChange={(checked) =>
                      updateField("include_cover_page", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Include Table of Contents</Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-generate TOC from sections
                    </p>
                  </div>
                  <Switch
                    checked={formData.include_toc ?? template.include_toc}
                    onCheckedChange={(checked) =>
                      updateField("include_toc", checked)
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Section Page Breaks</Label>
                    <p className="text-xs text-muted-foreground">
                      Start each major section on a new page
                    </p>
                  </div>
                  <Switch
                    checked={
                      formData.section_page_breaks ?? template.section_page_breaks
                    }
                    onCheckedChange={(checked) =>
                      updateField("section_page_breaks", checked)
                    }
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Legal */}
            <CollapsibleSection id="legal" title="Legal & Watermark">
              <div className="space-y-2">
                <Label>Disclaimer Text</Label>
                <Textarea
                  value={formData.disclaimer_text ?? template.disclaimer_text}
                  onChange={(e) => updateField("disclaimer_text", e.target.value)}
                  placeholder="Legal disclaimer or compliance text for the last page..."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Watermark Text</Label>
                <Input
                  value={formData.watermark_text ?? template.watermark_text}
                  onChange={(e) => updateField("watermark_text", e.target.value)}
                  placeholder="e.g., DRAFT, CONFIDENTIAL"
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty for no watermark
                </p>
              </div>
            </CollapsibleSection>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      <div className="hidden lg:block">
        <PDFTemplatePreview template={previewData} />
      </div>
    </div>
  );
}
