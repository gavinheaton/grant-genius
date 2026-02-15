interface TestimonialItem {
  quote: string;
  author: string;
  role?: string;
  avatar_url?: string;
}

interface TestimonialsProps {
  items: TestimonialItem[];
  heading?: string | null;
  subheading?: string | null;
}

export function Testimonials({ items, heading, subheading }: TestimonialsProps) {
  if (!items.length) return null;

  return (
    <section className="py-20">
      <div className="container">
        {(heading || subheading) && (
          <div className="text-center mb-12">
            {heading && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">{heading}</h2>}
            {subheading && <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{subheading}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {items.map((item, i) => (
            <div key={i} className="bg-card rounded-xl p-6 shadow-card">
              <blockquote className="text-muted-foreground mb-4 italic">"{item.quote}"</blockquote>
              <div className="flex items-center gap-3">
                {item.avatar_url && (
                  <img src={item.avatar_url} alt={item.author} className="w-10 h-10 rounded-full object-cover" />
                )}
                <div>
                  <div className="font-semibold text-sm">{item.author}</div>
                  {item.role && <div className="text-xs text-muted-foreground">{item.role}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
