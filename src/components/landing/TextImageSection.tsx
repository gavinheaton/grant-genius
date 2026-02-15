import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface TextImageSectionProps {
  content: Record<string, any>;
  imagePosition: "left" | "right";
  heading?: string | null;
}

export function TextImageSection({ content, imagePosition, heading }: TextImageSectionProps) {
  const title = content?.heading || heading || "";
  const body = content?.body_markdown || "";
  const imageUrl = content?.image_url || "";
  const ctaText = content?.cta_text || "";
  const ctaLink = content?.cta_link || "";

  const textBlock = (
    <div className="flex flex-col justify-center space-y-4">
      {title && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>}
      {body && <p className="text-lg text-muted-foreground whitespace-pre-line">{body}</p>}
      {ctaText && ctaLink && (
        <div>
          <Button asChild>
            {ctaLink.startsWith("/") ? (
              <Link to={ctaLink}>{ctaText}</Link>
            ) : (
              <a href={ctaLink}>{ctaText}</a>
            )}
          </Button>
        </div>
      )}
    </div>
  );

  const imageBlock = imageUrl ? (
    <div className="flex items-center justify-center">
      <img src={imageUrl} alt={title || "Section image"} className="rounded-xl shadow-card max-h-96 object-cover w-full" />
    </div>
  ) : (
    <div className="flex items-center justify-center bg-muted rounded-xl min-h-[240px]">
      <span className="text-muted-foreground text-sm">No image set</span>
    </div>
  );

  return (
    <section className="py-20">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {imagePosition === "left" ? (
            <>{imageBlock}{textBlock}</>
          ) : (
            <>{textBlock}{imageBlock}</>
          )}
        </div>
      </div>
    </section>
  );
}
