import type { HomepageSection } from "@/hooks/useHomepageSections";
import { Hero } from "./Hero";
import { Features } from "./Features";
import { Pricing } from "./Pricing";
import { TextImageSection } from "./TextImageSection";
import { StatsBar } from "./StatsBar";
import { Testimonials } from "./Testimonials";
import { CtaBanner } from "./CtaBanner";
import { LogoCloud } from "./LogoCloud";
import { FaqSection } from "./FaqSection";
import { RichTextSection } from "./RichTextSection";

interface SectionRendererProps {
  section: HomepageSection;
}

export function SectionRenderer({ section }: SectionRendererProps) {
  if (!section.is_visible) return null;

  const content = section.content_json;
  const settings = section.settings_json;

  const bgClass = settings?.background === "muted" ? "bg-muted/30" : settings?.background === "dark" ? "bg-foreground text-background" : "";

  const wrap = (children: React.ReactNode) => (
    <div className={bgClass}>{children}</div>
  );

  switch (section.section_type) {
    case "hero":
      return wrap(<Hero overrideContent={content} />);
    case "features_grid":
      return wrap(
        <Features
          overrideHeading={section.heading}
          overrideSubheading={section.subheading}
          overrideItems={content?.items}
        />
      );
    case "pricing":
      return wrap(
        <Pricing
          overrideHeading={section.heading}
          overrideSubheading={section.subheading}
          overridePlans={content?.plans}
          overrideFooterNote={content?.footer_note}
        />
      );
    case "text_image_left":
      return wrap(<TextImageSection content={content} imagePosition="right" heading={section.heading} />);
    case "text_image_right":
      return wrap(<TextImageSection content={content} imagePosition="left" heading={section.heading} />);
    case "stats_bar":
      return wrap(<StatsBar stats={content?.stats ?? []} heading={section.heading} />);
    case "testimonials":
      return wrap(<Testimonials items={content?.items ?? []} heading={section.heading} subheading={section.subheading} />);
    case "cta_banner":
      return wrap(<CtaBanner content={content} />);
    case "logo_cloud":
      return wrap(<LogoCloud logos={content?.logos ?? []} heading={content?.heading || section.heading} />);
    case "faq":
      return wrap(<FaqSection items={content?.items ?? []} heading={section.heading} subheading={section.subheading} />);
    case "rich_text":
      return wrap(<RichTextSection markdown={content?.markdown ?? ""} heading={section.heading} />);
    default:
      return null;
  }
}
