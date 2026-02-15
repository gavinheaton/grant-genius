import { useHomepageSettings, type FeatureItem } from "@/hooks/useHomepageSettings";
import { iconMap } from "@/lib/iconMap";

const defaultFeatures: FeatureItem[] = [
  { icon: "FileText", title: "Smart Application Builder", description: "Guided workflow with grant-specific inputs tailored to Australian commercialisation programs." },
  { icon: "Zap", title: "AI-Powered Sections", description: "Generate compelling narrative sections with proper structure, citations, and evidence linking." },
  { icon: "Database", title: "Evidence Library", description: "Organize your research papers, patents, and supporting documents with automatic citation tracking." },
  { icon: "CheckCircle", title: "Compliance Checks", description: "Automated validation against grant requirements and rubric criteria before submission." },
  { icon: "Download", title: "Export Ready", description: "Generate professionally formatted PDF and DOCX reports ready for submission." },
  { icon: "Lock", title: "Secure & Private", description: "Your research data is encrypted and never shared. University-grade security standards." },
];

interface FeaturesProps {
  overrideHeading?: string | null;
  overrideSubheading?: string | null;
  overrideItems?: FeatureItem[] | null;
}

export function Features({ overrideHeading, overrideSubheading, overrideItems }: FeaturesProps = {}) {
  const { data: settings } = useHomepageSettings();

  const heading = overrideHeading ?? settings?.features_heading ?? "Everything You Need to Win Grants";
  const subheading = overrideSubheading ?? settings?.features_subheading ?? "From initial research summary to final submission-ready documents, our platform guides you through every step.";
  const features = overrideItems ?? settings?.features_items ?? defaultFeatures;

  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">{heading}</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{subheading}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = iconMap[feature.icon];
            return (
              <div
                key={feature.title}
                className="group relative bg-card rounded-xl p-6 shadow-card hover:shadow-elevated transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  {Icon && <Icon className="h-6 w-6" />}
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
