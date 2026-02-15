import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface CtaBannerProps {
  content: Record<string, any>;
}

export function CtaBanner({ content }: CtaBannerProps) {
  const heading = content?.heading || "";
  const subtext = content?.subtext || "";
  const buttonText = content?.button_text || "Get Started";
  const buttonLink = content?.button_link || "/auth";
  const style = content?.style || "primary";

  const isPrimary = style === "primary";

  return (
    <section className={`py-16 ${isPrimary ? "gradient-hero text-primary-foreground" : "bg-muted/50"}`}>
      <div className="container text-center">
        {heading && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">{heading}</h2>}
        {subtext && <p className={`text-lg mb-8 max-w-2xl mx-auto ${isPrimary ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{subtext}</p>}
        {buttonText && (
          <Button variant={isPrimary ? "accent" : "default"} size="xl" asChild>
            {buttonLink.startsWith("/") ? (
              <Link to={buttonLink}>
                {buttonText}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            ) : (
              <a href={buttonLink}>
                {buttonText}
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            )}
          </Button>
        )}
      </div>
    </section>
  );
}
