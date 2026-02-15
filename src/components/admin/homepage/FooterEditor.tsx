import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Plus, Trash2 } from "lucide-react";
import { useHomepageSettings, useUpdateHomepageSettings } from "@/hooks/useHomepageSettings";
import type { FooterColumn } from "@/hooks/useHomepageSettings";

export function FooterEditor() {
  const { data: settings } = useHomepageSettings();
  const updateSettings = useUpdateHomepageSettings();

  const [footerBrandDescription, setFooterBrandDescription] = useState("");
  const [footerColumns, setFooterColumns] = useState<FooterColumn[]>([]);
  const [footerCopyright, setFooterCopyright] = useState("");
  const [footerSupportEmail, setFooterSupportEmail] = useState("");

  useEffect(() => {
    if (!settings) return;
    setFooterBrandDescription(settings.footer_brand_description ?? "");
    setFooterColumns(settings.footer_columns ?? []);
    setFooterCopyright(settings.footer_copyright ?? "");
    setFooterSupportEmail(settings.footer_support_email ?? "");
  }, [settings]);

  const handleSave = useCallback(async () => {
    await updateSettings.mutateAsync({
      footer_brand_description: footerBrandDescription,
      footer_columns: footerColumns,
      footer_copyright: footerCopyright,
      footer_support_email: footerSupportEmail,
    } as any);
  }, [footerBrandDescription, footerColumns, footerCopyright, footerSupportEmail, updateSettings]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending} size="sm">
          <Save className="h-4 w-4 mr-1" />
          {updateSettings.isPending ? "Saving…" : "Save Footer"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Footer Settings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Brand Description</Label><Textarea value={footerBrandDescription} onChange={(e) => setFooterBrandDescription(e.target.value)} rows={2} /></div>
          <div><Label>Copyright (use {"{year}"} for current year)</Label><Input value={footerCopyright} onChange={(e) => setFooterCopyright(e.target.value)} /></div>
          <div><Label>Support Email</Label><Input value={footerSupportEmail} onChange={(e) => setFooterSupportEmail(e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Footer Columns</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setFooterColumns([...footerColumns, { heading: "", links: [] }])}>
              <Plus className="h-4 w-4 mr-1" /> Add Column
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {footerColumns.map((col, ci) => (
            <div key={ci} className="border rounded-lg p-4 space-y-3">
              <div className="flex gap-2 items-center">
                <Input value={col.heading} onChange={(e) => { const c = [...footerColumns]; c[ci] = { ...c[ci], heading: e.target.value }; setFooterColumns(c); }} placeholder="Column Heading" className="flex-1" />
                <Button size="icon" variant="ghost" onClick={() => setFooterColumns(footerColumns.filter((_, j) => j !== ci))}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <div className="space-y-2">
                {col.links.map((link, li) => (
                  <div key={li} className="flex gap-2">
                    <Input value={link.label} onChange={(e) => { const c = [...footerColumns]; const links = [...c[ci].links]; links[li] = { ...links[li], label: e.target.value }; c[ci] = { ...c[ci], links }; setFooterColumns(c); }} placeholder="Label" className="flex-1" />
                    <Input value={link.url} onChange={(e) => { const c = [...footerColumns]; const links = [...c[ci].links]; links[li] = { ...links[li], url: e.target.value }; c[ci] = { ...c[ci], links }; setFooterColumns(c); }} placeholder="URL" className="flex-1" />
                    <Button size="icon" variant="ghost" onClick={() => { const c = [...footerColumns]; c[ci] = { ...c[ci], links: c[ci].links.filter((_, j) => j !== li) }; setFooterColumns(c); }}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => { const c = [...footerColumns]; c[ci] = { ...c[ci], links: [...c[ci].links, { label: "", url: "" }] }; setFooterColumns(c); }}>
                  <Plus className="h-3 w-3 mr-1" /> Add Link
                </Button>
              </div>
            </div>
          ))}
          {footerColumns.length === 0 && (
            <p className="text-sm text-muted-foreground">No footer columns configured.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
