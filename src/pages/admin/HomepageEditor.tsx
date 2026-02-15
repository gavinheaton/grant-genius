import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Plus, Trash2, GripVertical, Eye, EyeOff, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import {
  useHomepageSections,
  useCreateSection,
  useUpdateSection,
  useDeleteSection,
  useReorderSections,
  SECTION_TYPES,
  type HomepageSection,
  type SectionType,
} from "@/hooks/useHomepageSections";
import { useHomepageSettings, useUpdateHomepageSettings, useUploadHeroImage } from "@/hooks/useHomepageSettings";
import type { TrustItem, FeatureItem, PricingPlan, FooterColumn } from "@/hooks/useHomepageSettings";
import { iconNames } from "@/lib/iconMap";
import { useToast } from "@/hooks/use-toast";
import { FooterEditor } from "@/components/admin/homepage/FooterEditor";
import { SectionContentEditor } from "@/components/admin/homepage/SectionContentEditor";

export default function HomepageEditor() {
  const { data: sections, isLoading } = useHomepageSections();
  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const reorderSections = useReorderSections();
  const { toast } = useToast();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const handleAddSection = (type: SectionType) => {
    const maxOrder = sections?.reduce((max, s) => Math.max(max, s.sort_order), -1) ?? -1;
    createSection.mutate({ section_type: type, sort_order: maxOrder + 1 });
    setAddDialogOpen(false);
  };

  const handleMoveUp = (index: number) => {
    if (!sections || index <= 0) return;
    const updated = sections.map((s, i) => {
      if (i === index) return { id: s.id, sort_order: sections[i - 1].sort_order };
      if (i === index - 1) return { id: s.id, sort_order: sections[index].sort_order };
      return { id: s.id, sort_order: s.sort_order };
    });
    reorderSections.mutate(updated);
  };

  const handleMoveDown = (index: number) => {
    if (!sections || index >= sections.length - 1) return;
    const updated = sections.map((s, i) => {
      if (i === index) return { id: s.id, sort_order: sections[i + 1].sort_order };
      if (i === index + 1) return { id: s.id, sort_order: sections[index].sort_order };
      return { id: s.id, sort_order: s.sort_order };
    });
    reorderSections.mutate(updated);
  };

  const sectionLabel = (type: string) =>
    SECTION_TYPES.find((t) => t.value === type)?.label ?? type;

  if (isLoading) return <div className="p-8">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Homepage Editor</h1>
          <p className="text-muted-foreground">Manage landing page sections and footer</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" /> Preview
            </a>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sections">
        <TabsList>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="footer">Footer</TabsTrigger>
        </TabsList>

        <TabsContent value="sections" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {sections?.length ? `${sections.length} section(s)` : "No sections yet — the landing page will show default Hero, Features, and Pricing."}
            </p>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1" /> Add Section
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Section</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto">
                  {SECTION_TYPES.map((t) => (
                    <button
                      key={t.value}
                      className="text-left p-3 rounded-lg border hover:bg-muted transition-colors"
                      onClick={() => handleAddSection(t.value)}
                    >
                      <div className="font-medium text-sm">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {sections?.map((section, index) => {
            const isExpanded = expandedId === section.id;
            return (
              <Card key={section.id} className="relative">
                <CardHeader
                  className="cursor-pointer select-none py-3"
                  onClick={() => setExpandedId(isExpanded ? null : section.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={(e) => { e.stopPropagation(); handleMoveUp(index); }}
                        disabled={index === 0}
                      >
                        <ChevronDown className="h-3 w-3 rotate-180" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5"
                        onClick={(e) => { e.stopPropagation(); handleMoveDown(index); }}
                        disabled={index === (sections?.length ?? 0) - 1}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </div>

                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{sectionLabel(section.section_type)}</span>
                        <span className="text-sm font-medium truncate">{section.heading || "(no heading)"}</span>
                      </div>
                    </div>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateSection.mutate({ id: section.id, is_visible: !section.is_visible } as any);
                      }}
                    >
                      {section.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    </Button>

                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("Delete this section?")) {
                          deleteSection.mutate(section.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    <SectionContentEditor
                      section={section}
                      onUpdate={(updates) => updateSection.mutate({ id: section.id, ...updates } as any)}
                    />
                  </CardContent>
                )}
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="footer">
          <FooterEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
