interface LogoItem {
  url: string;
  alt: string;
  link?: string;
}

interface LogoCloudProps {
  logos: LogoItem[];
  heading?: string | null;
}

export function LogoCloud({ logos, heading }: LogoCloudProps) {
  if (!logos.length) return null;

  return (
    <section className="py-16">
      <div className="container">
        {heading && (
          <p className="text-center text-sm font-medium text-muted-foreground mb-8 uppercase tracking-wider">{heading}</p>
        )}
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          {logos.map((logo, i) => {
            const img = (
              <img
                key={i}
                src={logo.url}
                alt={logo.alt}
                className="h-10 md:h-12 object-contain grayscale hover:grayscale-0 transition-all opacity-60 hover:opacity-100"
              />
            );
            return logo.link ? (
              <a key={i} href={logo.link} target="_blank" rel="noopener noreferrer">{img}</a>
            ) : (
              img
            );
          })}
        </div>
      </div>
    </section>
  );
}
