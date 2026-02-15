import ReactMarkdown from "react-markdown";

interface RichTextSectionProps {
  markdown: string;
  heading?: string | null;
}

export function RichTextSection({ markdown, heading }: RichTextSectionProps) {
  if (!markdown && !heading) return null;

  return (
    <section className="py-16">
      <div className="container max-w-3xl">
        {heading && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">{heading}</h2>}
        {markdown && (
          <div className="prose prose-lg max-w-none text-foreground">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        )}
      </div>
    </section>
  );
}
