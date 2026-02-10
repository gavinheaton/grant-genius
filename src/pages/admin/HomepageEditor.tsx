import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus, Trash2, Upload, ExternalLink, GripVertical } from "lucide-react";
import { useHomepageSettings, useUpdateHomepageSettings, useUploadHeroImage } from "@/hooks/useHomepageSettings";
import type { TrustItem, FeatureItem, PricingPlan, FooterColumn, HomepageSettings } from "@/hooks/useHomepageSettings";
import { iconNames } from "@/lib/iconMap";
import { useToast } from "@/hooks/use-toast";

export default function HomepageEditor() {
  const { data: settings, isLoading } = useHomepageSettings();
  const updateSettings = useUpdateHomepageSettings();
  const uploadImage = useUploadHeroImage();
  const { toast } = useToast();

  // Local state mirrors DB
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroBadge, setHeroBadge] = useState("");
  const [heroHeadline, setHeroHeadline] = useState("");
  const [heroSubheadline, setHeroSubheadline] = useState("");
  const [ctaPrimaryText, setCtaPrimaryText] = useState("");
  const [ctaPrimaryLink, setCtaPrimaryLink] = useState("");
  const [ctaSecondaryText, setCtaSecondaryText] = useState("");
  const [ctaSecondaryLink, setCtaSecondaryLink] = useState("");
  const [trustItems, setTrustItems] = useState<TrustItem[]>([]);

  const [featuresHeading, setFeaturesHeading] = useState("");
  const [featuresSubheading, setFeaturesSubheading] = useState("");
  const [featuresItems, setFeaturesItems] = useState<FeatureItem[]>([]);

  const [pricingHeading, setPricingHeading] = useState("");
  const [pricingSubheading, setPricingSubheading] = useState("");
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([]);
  const [pricingFooterNote, setPricingFooterNote] = useState("");

  const [footerBrandDescription, setFooterBrandDescription] = useState("");
  const [footerColumns, setFooterColumns] = useState<FooterColumn[]>([]);
  const [footerCopyright, setFooterCopyright] = useState("");
  const [footerSupportEmail, setFooterSupportEmail] = useState("");

  // Populate from DB
  useEffect(() => {
    if (!settings) return;
    setHeroImageUrl(settings.hero_image_url ?? "");
    setHeroBadge(settings.hero_badge_text ?? "");
    setHeroHeadline(settings.hero_headline ?? "");
    setHeroSubheadline(settings.hero_subheadline ?? "");
    setCtaPrimaryText(settings.hero_cta_primary_text ?? "");
    setCtaPrimaryLink(settings.hero_cta_primary_link ?? "");
    setCtaSecondaryText(settings.hero_cta_secondary_text ?? "");
    setCtaSecondaryLink(settings.hero_cta_secondary_link ?? "");
    setTrustItems(settings.hero_trust_items ?? []);
    setFeaturesHeading(settings.features_heading ?? "");
    setFeaturesSubheading(settings.features_subheading ?? "");
    setFeaturesItems(settings.features_items ?? []);
    setPricingHeading(settings.pricing_heading ?? "");
    setPricingSubheading(settings.pricing_subheading ?? "");
    setPricingPlans(settings.pricing_plans ?? []);
    setPricingFooterNote(settings.pricing_footer_note ?? "");
    setFooterBrandDescription(settings.footer_brand_description ?? "");
    setFooterColumns(settings.footer_columns ?? []);
    setFooterCopyright(settings.footer_copyright ?? "");
    setFooterSupportEmail(settings.footer_support_email ?? "");
  }, [settings]);

  const handleSave = useCallback(async () => {
    await updateSettings.mutateAsync({
      hero_image_url: heroImageUrl || null,
      hero_badge_text: heroBadge,
      hero_headline: heroHeadline,
      hero_subheadline: heroSubheadline,
      hero_cta_primary_text: ctaPrimaryText,
      hero_cta_primary_link: ctaPrimaryLink,
      hero_cta_secondary_text: ctaSecondaryText,
      hero_cta_secondary_link: ctaSecondaryLink,
      hero_trust_items: trustItems,
      features_heading: featuresHeading,
      features_subheading: featuresSubheading,
      features_items: featuresItems,
      pricing_heading: pricingHeading,
      pricing_subheading: pricingSubheading,
      pricing_plans: pricingPlans,
      pricing_footer_note: pricingFooterNote,
      footer_brand_description: footerBrandDescription,
      footer_columns: footerColumns,
      footer_copyright: footerCopyright,
      footer_support_email: footerSupportEmail,
    } as any);
  }, [heroImageUrl, heroBadge, heroHeadline, heroSubheadline, ctaPrimaryText, ctaPrimaryLink, ctaSecondaryText, ctaSecondaryLink, trustItems, featuresHeading, featuresSubheading, featuresItems, pricingHeading, pricingSubheading, pricingPlans, pricingFooterNote, footerBrandDescription, footerColumns, footerCopyright, footerSupportEmail, updateSettings]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await uploadImage.mutateAsync(file);
    setHeroImageUrl(url);
  };

  if (isLoading) return <div className="p-8">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Homepage Editor</h1>
          <p className="text-muted-foreground">Manage all landing page content</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1" /> Preview
            </a>
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending} size="sm">
            <Save className="h-4 w-4 mr-1" />
            {updateSettings.isPending ? "Saving…" : "Save All"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="hero">
        <TabsList>
          <TabsTrigger value="hero">Hero</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="footer">Footer</TabsTrigger>
        </TabsList>

        {/* HERO TAB */}
        <TabsContent value="hero" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Hero Image</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {heroImageUrl && (
                <img src={heroImageUrl} alt="Hero preview" className="max-h-48 rounded-lg object-cover w-full" />
              )}
              <div className="flex gap-2 items-center">
                <Input type="file" accept="image/*" onChange={handleImageUpload} className="max-w-xs" />
                {heroImageUrl && <Button variant="ghost" size="sm" onClick={() => setHeroImageUrl("")}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Text Content</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Badge Text</Label>
                <Input value={heroBadge} onChange={(e) => setHeroBadge(e.target.value)} />
              </div>
              <div>
                <Label>Headline (wrap text in *asterisks* for primary colour)</Label>
                <Textarea value={heroHeadline} onChange={(e) => setHeroHeadline(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Subheadline</Label>
                <Textarea value={heroSubheadline} onChange={(e) => setHeroSubheadline(e.target.value)} rows={3} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Call-to-Action Buttons</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Primary Button Text</Label>
                <Input value={ctaPrimaryText} onChange={(e) => setCtaPrimaryText(e.target.value)} />
                <Label>Primary Button Link</Label>
                <Input value={ctaPrimaryLink} onChange={(e) => setCtaPrimaryLink(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Secondary Button Text</Label>
                <Input value={ctaSecondaryText} onChange={(e) => setCtaSecondaryText(e.target.value)} />
                <Label>Secondary Button Link</Label>
                <Input value={ctaSecondaryLink} onChange={(e) => setCtaSecondaryLink(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Trust Indicators</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setTrustItems([...trustItems, { icon: "Shield", label: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {trustItems.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select value={item.icon} onValueChange={(v) => { const c = [...trustItems]; c[i] = { ...c[i], icon: v }; setTrustItems(c); }}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{iconNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={item.label} onChange={(e) => { const c = [...trustItems]; c[i] = { ...c[i], label: e.target.value }; setTrustItems(c); }} placeholder="Label" className="flex-1" />
                  <Button size="icon" variant="ghost" onClick={() => setTrustItems(trustItems.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FEATURES TAB */}
        <TabsContent value="features" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Section Text</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Heading</Label><Input value={featuresHeading} onChange={(e) => setFeaturesHeading(e.target.value)} /></div>
              <div><Label>Subheading</Label><Textarea value={featuresSubheading} onChange={(e) => setFeaturesSubheading(e.target.value)} rows={2} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Feature Cards</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setFeaturesItems([...featuresItems, { icon: "Star", title: "", description: "" }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Card
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {featuresItems.map((item, i) => (
                <div key={i} className="border rounded-lg p-4 space-y-2">
                  <div className="flex gap-2 items-center">
                    <Select value={item.icon} onValueChange={(v) => { const c = [...featuresItems]; c[i] = { ...c[i], icon: v }; setFeaturesItems(c); }}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>{iconNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={item.title} onChange={(e) => { const c = [...featuresItems]; c[i] = { ...c[i], title: e.target.value }; setFeaturesItems(c); }} placeholder="Title" className="flex-1" />
                    <Button size="icon" variant="ghost" onClick={() => setFeaturesItems(featuresItems.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Textarea value={item.description} onChange={(e) => { const c = [...featuresItems]; c[i] = { ...c[i], description: e.target.value }; setFeaturesItems(c); }} placeholder="Description" rows={2} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PRICING TAB */}
        <TabsContent value="pricing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Section Text</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Heading</Label><Input value={pricingHeading} onChange={(e) => setPricingHeading(e.target.value)} /></div>
              <div><Label>Subheading</Label><Textarea value={pricingSubheading} onChange={(e) => setPricingSubheading(e.target.value)} rows={2} /></div>
              <div><Label>Footer Note</Label><Textarea value={pricingFooterNote} onChange={(e) => setPricingFooterNote(e.target.value)} rows={2} /></div>
            </CardContent>
          </Card>

          {pricingPlans.map((plan, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{plan.name || `Plan ${i + 1}`}</CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Stripe type:</span>
                    <code className="bg-muted px-2 py-0.5 rounded text-xs">{plan.type}</code>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Plan Name</Label><Input value={plan.name} onChange={(e) => { const c = [...pricingPlans]; c[i] = { ...c[i], name: e.target.value }; setPricingPlans(c); }} /></div>
                  <div><Label>Base Price</Label><Input value={plan.basePrice} onChange={(e) => { const c = [...pricingPlans]; c[i] = { ...c[i], basePrice: e.target.value }; setPricingPlans(c); }} /></div>
                </div>
                <div><Label>GST Note</Label><Input value={plan.gstNote} onChange={(e) => { const c = [...pricingPlans]; c[i] = { ...c[i], gstNote: e.target.value }; setPricingPlans(c); }} /></div>
                <div><Label>Description</Label><Input value={plan.description} onChange={(e) => { const c = [...pricingPlans]; c[i] = { ...c[i], description: e.target.value }; setPricingPlans(c); }} /></div>
                <div><Label>CTA Button Text</Label><Input value={plan.cta} onChange={(e) => { const c = [...pricingPlans]; c[i] = { ...c[i], cta: e.target.value }; setPricingPlans(c); }} /></div>
                <div className="flex items-center gap-2">
                  <Switch checked={plan.highlighted} onCheckedChange={(v) => { const c = [...pricingPlans]; c[i] = { ...c[i], highlighted: v }; setPricingPlans(c); }} />
                  <Label>Highlighted (primary background)</Label>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Feature Bullets</Label>
                    <Button size="sm" variant="ghost" onClick={() => { const c = [...pricingPlans]; c[i] = { ...c[i], features: [...c[i].features, ""] }; setPricingPlans(c); }}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  {plan.features.map((f, fi) => (
                    <div key={fi} className="flex gap-2 mb-1">
                      <Input value={f} onChange={(e) => { const c = [...pricingPlans]; const feats = [...c[i].features]; feats[fi] = e.target.value; c[i] = { ...c[i], features: feats }; setPricingPlans(c); }} className="flex-1" />
                      <Button size="icon" variant="ghost" onClick={() => { const c = [...pricingPlans]; c[i] = { ...c[i], features: c[i].features.filter((_, j) => j !== fi) }; setPricingPlans(c); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* FOOTER TAB */}
        <TabsContent value="footer" className="space-y-4">
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
                <p className="text-sm text-muted-foreground">No footer columns configured. The footer will use the simple layout with CMS page links.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
