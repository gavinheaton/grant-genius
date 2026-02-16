import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";
import { iconNames } from "@/lib/iconMap";
import type { HomepageSection } from "@/hooks/useHomepageSections";
import { useUploadHeroImage } from "@/hooks/useHomepageSettings";

interface Props {
  section: HomepageSection;
  onUpdate: (updates: Partial<HomepageSection>) => void;
}

export function SectionContentEditor({ section, onUpdate }: Props) {
  const [heading, setHeading] = useState(section.heading ?? "");
  const [subheading, setSubheading] = useState(section.subheading ?? "");
  const [content, setContent] = useState<Record<string, any>>(section.content_json ?? {});
  const uploadImage = useUploadHeroImage();

  useEffect(() => {
    setHeading(section.heading ?? "");
    setSubheading(section.subheading ?? "");
    setContent(section.content_json ?? {});
  }, [section.id]);

  const save = () => {
    onUpdate({ heading: heading || null, subheading: subheading || null, content_json: content });
  };

  const updateContent = (key: string, value: any) => {
    setContent((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage.mutateAsync(file);
    updateContent(key, url);
  };

  const renderFields = () => {
    switch (section.section_type) {
      case "hero":
        return (
          <div className="space-y-3">
            <div><Label>Badge Text</Label><Input value={content.badge ?? ""} onChange={(e) => updateContent("badge", e.target.value)} /></div>
            <div><Label>Headline (wrap in *asterisks* for colour)</Label><Textarea value={content.headline ?? ""} onChange={(e) => updateContent("headline", e.target.value)} rows={2} /></div>
            <div><Label>Subheadline</Label><Textarea value={content.subheadline ?? ""} onChange={(e) => updateContent("subheadline", e.target.value)} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Primary CTA Text</Label><Input value={content.cta_primary_text ?? ""} onChange={(e) => updateContent("cta_primary_text", e.target.value)} /></div>
              <div><Label>Primary CTA Link</Label><Input value={content.cta_primary_link ?? ""} onChange={(e) => updateContent("cta_primary_link", e.target.value)} /></div>
              <div><Label>Secondary CTA Text</Label><Input value={content.cta_secondary_text ?? ""} onChange={(e) => updateContent("cta_secondary_text", e.target.value)} /></div>
              <div><Label>Secondary CTA Link</Label><Input value={content.cta_secondary_link ?? ""} onChange={(e) => updateContent("cta_secondary_link", e.target.value)} /></div>
            </div>
            <div>
              <Label>Background Image</Label>
              {content.image_url && <img src={content.image_url} alt="Hero" className="max-h-32 rounded mb-2 object-cover w-full" />}
              <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "image_url")} className="max-w-xs" />
            </div>
            <ArrayEditor
              label="Trust Items"
              items={content.trust_items ?? []}
              onChange={(items) => updateContent("trust_items", items)}
              renderItem={(item, i, update) => (
                <div className="flex gap-2 items-center">
                  <Select value={item.icon ?? "Shield"} onValueChange={(v) => update({ ...item, icon: v })}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{iconNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={item.label ?? ""} onChange={(e) => update({ ...item, label: e.target.value })} placeholder="Label" className="flex-1" />
                </div>
              )}
              newItem={() => ({ icon: "Shield", label: "" })}
            />
          </div>
        );

      case "features_grid":
        return (
          <ArrayEditor
            label="Feature Cards"
            items={content.items ?? []}
            onChange={(items) => updateContent("items", items)}
            renderItem={(item, i, update) => (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <Select value={item.icon ?? "Star"} onValueChange={(v) => update({ ...item, icon: v })}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{iconNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={item.title ?? ""} onChange={(e) => update({ ...item, title: e.target.value })} placeholder="Title" className="flex-1" />
                </div>
                <Textarea value={item.description ?? ""} onChange={(e) => update({ ...item, description: e.target.value })} placeholder="Description" rows={2} />
              </div>
            )}
            newItem={() => ({ icon: "Star", title: "", description: "" })}
          />
        );

      case "pricing":
        return (
          <div className="space-y-3">
            <div><Label>Footer Note</Label><Input value={content.footer_note ?? ""} onChange={(e) => updateContent("footer_note", e.target.value)} /></div>
            <ArrayEditor
              label="Plans"
              items={content.plans ?? []}
              onChange={(items) => updateContent("plans", items)}
              renderItem={(plan, i, update) => (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Name</Label><Input value={plan.name ?? ""} onChange={(e) => update({ ...plan, name: e.target.value })} /></div>
                    <div><Label>Price</Label><Input value={plan.basePrice ?? ""} onChange={(e) => update({ ...plan, basePrice: e.target.value })} /></div>
                  </div>
                  <div><Label>Description</Label><Input value={plan.description ?? ""} onChange={(e) => update({ ...plan, description: e.target.value })} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>GST Note</Label><Input value={plan.gstNote ?? ""} onChange={(e) => update({ ...plan, gstNote: e.target.value })} /></div>
                    <div><Label>CTA Text</Label><Input value={plan.cta ?? ""} onChange={(e) => update({ ...plan, cta: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div>
                      <Label>Type</Label>
                      <Select value={plan.type ?? "single"} onValueChange={(v) => update({ ...plan, type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single Report</SelectItem>
                          <SelectItem value="bundle">Bundle (10-Pack)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pb-2">
                      <input type="checkbox" id={`highlighted-${i}`} checked={plan.highlighted ?? false} onChange={(e) => update({ ...plan, highlighted: e.target.checked })} className="rounded border-input" />
                      <Label htmlFor={`highlighted-${i}`} className="mb-0">Highlighted (Best Value)</Label>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>Features</Label>
                      <Button size="sm" variant="ghost" onClick={() => update({ ...plan, features: [...(plan.features ?? []), ""] })}>
                        <Plus className="h-3 w-3 mr-1" /> Add Feature
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {(plan.features ?? []).map((feat: string, fi: number) => (
                        <div key={fi} className="flex gap-2 items-center">
                          <Input value={feat} onChange={(e) => { const f = [...(plan.features ?? [])]; f[fi] = e.target.value; update({ ...plan, features: f }); }} placeholder="Feature text" className="flex-1" />
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => update({ ...plan, features: (plan.features ?? []).filter((_: any, j: number) => j !== fi) })}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              newItem={() => ({ name: "", basePrice: "", gstNote: "", description: "", cta: "Purchase", features: [], highlighted: false, type: "single" })}
            />
          </div>
        );

      case "text_image_left":
      case "text_image_right":
        return (
          <div className="space-y-3">
            <div><Label>Section Title</Label><Input value={content.heading ?? ""} onChange={(e) => updateContent("heading", e.target.value)} /></div>
            <div><Label>Body Text</Label><Textarea value={content.body_markdown ?? ""} onChange={(e) => updateContent("body_markdown", e.target.value)} rows={4} /></div>
            <div>
              <Label>Image</Label>
              {content.image_url && <img src={content.image_url} alt="" className="max-h-32 rounded mb-2 object-cover" />}
              <Input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "image_url")} className="max-w-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>CTA Text</Label><Input value={content.cta_text ?? ""} onChange={(e) => updateContent("cta_text", e.target.value)} /></div>
              <div><Label>CTA Link</Label><Input value={content.cta_link ?? ""} onChange={(e) => updateContent("cta_link", e.target.value)} /></div>
            </div>
          </div>
        );

      case "stats_bar":
        return (
          <ArrayEditor
            label="Stats"
            items={content.stats ?? []}
            onChange={(items) => updateContent("stats", items)}
            renderItem={(item, i, update) => (
              <div className="flex gap-2">
                <Input value={item.value ?? ""} onChange={(e) => update({ ...item, value: e.target.value })} placeholder="Value (e.g. 500+)" className="w-32" />
                <Input value={item.label ?? ""} onChange={(e) => update({ ...item, label: e.target.value })} placeholder="Label" className="flex-1" />
              </div>
            )}
            newItem={() => ({ value: "", label: "" })}
          />
        );

      case "testimonials":
        return (
          <ArrayEditor
            label="Testimonials"
            items={content.items ?? []}
            onChange={(items) => updateContent("items", items)}
            renderItem={(item, i, update) => (
              <div className="space-y-2">
                <Textarea value={item.quote ?? ""} onChange={(e) => update({ ...item, quote: e.target.value })} placeholder="Quote" rows={2} />
                <div className="flex gap-2">
                  <Input value={item.author ?? ""} onChange={(e) => update({ ...item, author: e.target.value })} placeholder="Author" className="flex-1" />
                  <Input value={item.role ?? ""} onChange={(e) => update({ ...item, role: e.target.value })} placeholder="Role" className="flex-1" />
                </div>
              </div>
            )}
            newItem={() => ({ quote: "", author: "", role: "" })}
          />
        );

      case "cta_banner":
        return (
          <div className="space-y-3">
            <div><Label>Heading</Label><Input value={content.heading ?? ""} onChange={(e) => updateContent("heading", e.target.value)} /></div>
            <div><Label>Subtext</Label><Input value={content.subtext ?? ""} onChange={(e) => updateContent("subtext", e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Button Text</Label><Input value={content.button_text ?? ""} onChange={(e) => updateContent("button_text", e.target.value)} /></div>
              <div><Label>Button Link</Label><Input value={content.button_link ?? ""} onChange={(e) => updateContent("button_link", e.target.value)} /></div>
            </div>
            <div>
              <Label>Style</Label>
              <Select value={content.style ?? "primary"} onValueChange={(v) => updateContent("style", v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary (gradient)</SelectItem>
                  <SelectItem value="muted">Muted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "logo_cloud":
        return (
          <div className="space-y-3">
            <div><Label>Cloud Heading</Label><Input value={content.heading ?? ""} onChange={(e) => updateContent("heading", e.target.value)} /></div>
            <ArrayEditor
              label="Logos"
              items={content.logos ?? []}
              onChange={(items) => updateContent("logos", items)}
              renderItem={(item, i, update) => (
                <div className="flex gap-2 items-center">
                  <Input value={item.url ?? ""} onChange={(e) => update({ ...item, url: e.target.value })} placeholder="Image URL" className="flex-1" />
                  <Input value={item.alt ?? ""} onChange={(e) => update({ ...item, alt: e.target.value })} placeholder="Alt text" className="w-32" />
                </div>
              )}
              newItem={() => ({ url: "", alt: "", link: "" })}
            />
          </div>
        );

      case "faq":
        return (
          <ArrayEditor
            label="FAQ Items"
            items={content.items ?? []}
            onChange={(items) => updateContent("items", items)}
            renderItem={(item, i, update) => (
              <div className="space-y-2">
                <Input value={item.question ?? ""} onChange={(e) => update({ ...item, question: e.target.value })} placeholder="Question" />
                <Textarea value={item.answer ?? ""} onChange={(e) => update({ ...item, answer: e.target.value })} placeholder="Answer" rows={2} />
              </div>
            )}
            newItem={() => ({ question: "", answer: "" })}
          />
        );

      case "rich_text":
        return (
          <div>
            <Label>Markdown Content</Label>
            <Textarea value={content.markdown ?? ""} onChange={(e) => updateContent("markdown", e.target.value)} rows={8} className="font-mono text-sm" />
          </div>
        );

      default:
        return <p className="text-sm text-muted-foreground">Unknown section type: {section.section_type}</p>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Section Heading</Label><Input value={heading} onChange={(e) => setHeading(e.target.value)} placeholder="Optional heading" /></div>
        <div><Label>Section Subheading</Label><Input value={subheading} onChange={(e) => setSubheading(e.target.value)} placeholder="Optional subheading" /></div>
      </div>

      {renderFields()}

      <div className="flex justify-end pt-2">
        <Button onClick={save} size="sm">
          <Save className="h-4 w-4 mr-1" /> Save Section
        </Button>
      </div>
    </div>
  );
}

// Reusable array editor for lists of items
function ArrayEditor<T>({
  label,
  items,
  onChange,
  renderItem,
  newItem,
}: {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, index: number, update: (item: T) => void) => React.ReactNode;
  newItem: () => T;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Label>{label}</Label>
        <Button size="sm" variant="ghost" onClick={() => onChange([...items, newItem()])}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="border rounded-lg p-3 relative">
            {renderItem(item, i, (updated) => {
              const c = [...items];
              c[i] = updated;
              onChange(c);
            })}
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2 h-6 w-6"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
