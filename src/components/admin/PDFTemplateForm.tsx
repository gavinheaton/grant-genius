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
import { ChevronDown, Save, Loader2, Palette, Plus } from "lucide-react";
import { ColorPicker } from "./ColorPicker";
import { LogoUploader } from "./LogoUploader";
import { PDFTemplatePreview } from "./PDFTemplatePreview";
import { type PdfTemplate, type CoverLayout } from "@/hooks/usePdfTemplates";
import { useColorPalettes, useCreateColorPalette } from "@/hooks/useColorPalettes";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

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

const LOGO_POSITIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

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
  const [savePaletteOpen, setSavePaletteOpen] = useState(false);
  const [newPaletteName, setNewPaletteName] = useState("");

  const { data: palettes = [] } = useColorPalettes();
  const createPalette = useCreateColorPalette();

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
      show_grant_genius_branding: template.show_grant_genius_branding,
      powered_by_text: template.powered_by_text,
      cover_layout_json: template.cover_layout_json,
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

  const updateCoverLayout = (key: keyof CoverLayout, value: any) => {
    setFormData((prev) => ({
      ...prev,
      cover_layout_json: {
        ...((prev.cover_layout_json as CoverLayout) || template.cover_layout_json),
        [key]: value,
      },
    }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  const handleApplyPalette = (paletteId: string) => {
    const palette = palettes.find((p) => p.id === paletteId);
    if (palette) {
      setFormData((prev) => ({
        ...prev,
        primary_color: palette.primary_color,
        secondary_color: palette.secondary_color,
      }));
      toast({
        title: "Palette applied",
        description: `Applied "${palette.name}" color palette`,
      });
    }
  };

  const handleSavePalette = async () => {
    if (!newPaletteName.trim()) return;
    
    await createPalette.mutateAsync({
      name: newPaletteName,
      primary_color: formData.primary_color || template.primary_color,
      secondary_color: formData.secondary_color || template.secondary_color,
    });
    
    setNewPaletteName("");
    setSavePaletteOpen(false);
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

  const currentCoverLayout = (formData.cover_layout_json as CoverLayout) || template.cover_layout_json;

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
            <CollapsibleSection id="branding" title="Branding & Colors">
              <LogoUploader
                value={formData.logo_path ?? template.logo_path}
                onChange={(path) => updateField("logo_path", path)}
              />

              {/* Palette Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Color Palette</Label>
                  <Dialog open={savePaletteOpen} onOpenChange={setSavePaletteOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        Save Current
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Save Color Palette</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="flex gap-4 items-center">
                          <div
                            className="w-10 h-10 rounded border"
                            style={{ backgroundColor: formData.primary_color || template.primary_color }}
                          />
                          <div
                            className="w-10 h-10 rounded border"
                            style={{ backgroundColor: formData.secondary_color || template.secondary_color }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Palette Name</Label>
                          <Input
                            placeholder="e.g., My Custom Palette"
                            value={newPaletteName}
                            onChange={(e) => setNewPaletteName(e.target.value)}
                          />
                        </div>
                        <Button
                          onClick={handleSavePalette}
                          disabled={!newPaletteName.trim() || createPalette.isPending}
                          className="w-full"
                        >
                          {createPalette.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Save Palette
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <Select onValueChange={handleApplyPalette}>
                  <SelectTrigger>
                    <SelectValue placeholder="Apply a saved palette..." />
                  </SelectTrigger>
                  <SelectContent>
                    {palettes.map((palette) => (
                      <SelectItem key={palette.id} value={palette.id}>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div
                              className="w-4 h-4 rounded-sm border"
                              style={{ backgroundColor: palette.primary_color }}
                            />
                            <div
                              className="w-4 h-4 rounded-sm border"
                              style={{ backgroundColor: palette.secondary_color }}
                            />
                          </div>
                          <span>{palette.name}</span>
                          {palette.is_preset && (
                            <span className="text-xs text-muted-foreground">(preset)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

              {/* Grant Genius Branding */}
              <div className="pt-4 space-y-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Grant Genius Branding</Label>
                    <p className="text-xs text-muted-foreground">
                      Display "Grant Genius" on cover page
                    </p>
                  </div>
                  <Switch
                    checked={formData.show_grant_genius_branding ?? template.show_grant_genius_branding}
                    onCheckedChange={(checked) =>
                      updateField("show_grant_genius_branding", checked)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Powered By Text</Label>
                  <Input
                    value={formData.powered_by_text ?? template.powered_by_text}
                    onChange={(e) => updateField("powered_by_text", e.target.value)}
                    placeholder="Powered by Disruptors Co"
                  />
                  <p className="text-xs text-muted-foreground">
                    Appears in the footer of each page
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Cover Page Designer */}
            <CollapsibleSection id="cover-page" title="Cover Page Design">
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

                {(formData.include_cover_page ?? template.include_cover_page) && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Logo Position</Label>
                        <Select
                          value={currentCoverLayout.logo_position || "center"}
                          onValueChange={(value) => updateCoverLayout("logo_position", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LOGO_POSITIONS.map((pos) => (
                              <SelectItem key={pos.value} value={pos.value}>
                                {pos.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Background Style</Label>
                        <Select
                          value={currentCoverLayout.background_style || "solid"}
                          onValueChange={(value) => updateCoverLayout("background_style", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="solid">Solid White</SelectItem>
                            <SelectItem value="gradient">Subtle Gradient</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Title Text</Label>
                      <Input
                        value={currentCoverLayout.title_text || ""}
                        onChange={(e) => updateCoverLayout("title_text", e.target.value)}
                        placeholder="Commercialisation Research Report"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Subtitle Template</Label>
                      <Input
                        value={currentCoverLayout.subtitle_template || ""}
                        onChange={(e) => updateCoverLayout("subtitle_template", e.target.value)}
                        placeholder="{grant_name}"
                      />
                      <p className="text-xs text-muted-foreground">
                        Variables: {"{grant_name}"}, {"{date}"}, {"{version}"}
                      </p>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={currentCoverLayout.show_date ?? true}
                          onCheckedChange={(checked) => updateCoverLayout("show_date", checked)}
                        />
                        <Label className="text-sm">Show Date</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={currentCoverLayout.show_version ?? true}
                          onCheckedChange={(checked) => updateCoverLayout("show_version", checked)}
                        />
                        <Label className="text-sm">Show Version</Label>
                      </div>
                    </div>
                  </>
                )}
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
