import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useHomepageSettings } from "@/hooks/useHomepageSettings";
import { iconMap } from "@/lib/iconMap";

interface HeroProps {
  overrideContent?: Record<string, any>;
}

export function Hero({ overrideContent }: HeroProps = {}) {
  const { data: settings } = useHomepageSettings();
  const oc = overrideContent;

  const badge = oc?.badge ?? settings?.hero_badge_text ?? "For Australian University Researchers";
  const headline = oc?.headline ?? settings?.hero_headline ?? "Win More Commercialisation Grants with AI-Assisted Applications";
  const subheadline = oc?.subheadline ?? settings?.hero_subheadline ?? "Transform your research into compelling grant applications. Our AI-powered assistant helps you structure, write, and refine your commercialisation proposals with evidence-based recommendations.";
  const ctaPrimaryText = oc?.cta_primary_text ?? settings?.hero_cta_primary_text ?? "Start Your Application";
  const ctaPrimaryLink = oc?.cta_primary_link ?? settings?.hero_cta_primary_link ?? "/auth";
  const ctaSecondaryText = oc?.cta_secondary_text ?? settings?.hero_cta_secondary_text ?? "View Pricing";
  const ctaSecondaryLink = oc?.cta_secondary_link ?? settings?.hero_cta_secondary_link ?? "#pricing";
  const trustItems = oc?.trust_items ?? settings?.hero_trust_items ?? [
    { icon: "FileCheck", label: "Evidence-Based Sections" },
    { icon: "Shield", label: "University-Grade Security" },
    { icon: "Sparkles", label: "AI-Powered Insights" },
  ];
  const heroImage = oc?.image_url ?? settings?.hero_image_url;
  const overlayOpacity = (oc?.overlay_opacity ?? 80) / 100;

  // Split headline on text wrapped in * for primary color emphasis
  const renderHeadline = () => {
    const parts = headline.split(/(\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("*") && part.endsWith("*")) {
        return (
          <span key={i} className="text-primary">
            {part.slice(1, -1)}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <section className="relative overflow-hidden py-20 lg:py-32">
      {/* Background */}
      {heroImage ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: `hsl(var(--background) / ${overlayOpacity})` }} />
        </>
      ) : (
        <>
          <div className="absolute inset-0 gradient-hero opacity-[0.03]" />
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-accent/5 to-transparent" />
        </>
      )}

      <div className="container relative">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary animate-fade-in">
            {(() => { const SparklesIcon = iconMap["Sparkles"]; return SparklesIcon ? <SparklesIcon className="h-4 w-4" /> : null; })()}
            {badge}
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl animate-slide-up">
            {renderHeadline()}
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground animate-slide-up" style={{ animationDelay: "0.1s" }}>
            {subheadline}
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Button variant="hero" size="xl" asChild>
              {ctaPrimaryLink.startsWith("/") || ctaPrimaryLink.startsWith("#") ? (
                <Link to={ctaPrimaryLink}>
                  {ctaPrimaryText}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              ) : (
                <a href={ctaPrimaryLink}>
                  {ctaPrimaryText}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              )}
            </Button>
            <Button variant="outline" size="xl" asChild>
              {ctaSecondaryLink.startsWith("/") ? (
                <Link to={ctaSecondaryLink}>{ctaSecondaryText}</Link>
              ) : (
                <a href={ctaSecondaryLink}>{ctaSecondaryText}</a>
              )}
            </Button>
          </div>

          {/* Trust indicators */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto animate-fade-in" style={{ animationDelay: "0.4s" }}>
            {trustItems.map((item, i) => {
              const Icon = iconMap[item.icon];
              return (
                <div key={i} className="flex items-center justify-center gap-3 text-muted-foreground">
                  {Icon && <Icon className="h-5 w-5 text-primary" />}
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
