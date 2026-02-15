import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqSectionProps {
  items: FaqItem[];
  heading?: string | null;
  subheading?: string | null;
}

export function FaqSection({ items, heading, subheading }: FaqSectionProps) {
  if (!items.length) return null;

  return (
    <section className="py-20">
      <div className="container max-w-3xl">
        {(heading || subheading) && (
          <div className="text-center mb-12">
            {heading && <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">{heading}</h2>}
            {subheading && <p className="text-lg text-muted-foreground">{subheading}</p>}
          </div>
        )}
        <Accordion type="single" collapsible className="w-full">
          {items.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
