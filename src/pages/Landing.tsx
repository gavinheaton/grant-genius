import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Pricing } from "@/components/landing/Pricing";
import { Footer } from "@/components/landing/Footer";
import { SectionRenderer } from "@/components/landing/SectionRenderer";
import { useHomepageSections } from "@/hooks/useHomepageSections";

export default function Landing() {
  const { data: sections } = useHomepageSections();
  const hasSections = sections && sections.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {hasSections ? (
          sections.map((section) => (
            <SectionRenderer key={section.id} section={section} />
          ))
        ) : (
          <>
            <Hero />
            <Features />
            <Pricing />
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
