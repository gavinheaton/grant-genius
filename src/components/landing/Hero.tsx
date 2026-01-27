import { Button } from "@/components/ui/button";
import { ArrowRight, FileCheck, Sparkles, Shield } from "lucide-react";
import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-32">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-hero opacity-[0.03]" />
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-accent/5 to-transparent" />
      
      <div className="container relative">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary animate-fade-in">
            <Sparkles className="h-4 w-4" />
            For Australian University Researchers
          </div>
          
          {/* Headline */}
          <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl animate-slide-up">
            Win More{" "}
            <span className="text-primary">Commercialisation Grants</span>
            {" "}with AI-Assisted Applications
          </h1>
          
          {/* Subheadline */}
          <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground animate-slide-up" style={{ animationDelay: "0.1s" }}>
            Transform your research into compelling grant applications. Our AI-powered assistant helps you structure, write, and refine your commercialisation proposals with evidence-based recommendations.
          </p>
          
          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <Button variant="hero" size="xl" asChild>
              <Link to="/auth">
                Start Your Application
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="outline" size="xl" asChild>
              <a href="#pricing">View Pricing</a>
            </Button>
          </div>
          
          {/* Trust indicators */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto animate-fade-in" style={{ animationDelay: "0.4s" }}>
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <FileCheck className="h-5 w-5 text-success" />
              <span className="text-sm font-medium">Evidence-Based Sections</span>
            </div>
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Shield className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">University-Grade Security</span>
            </div>
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Sparkles className="h-5 w-5 text-accent" />
              <span className="text-sm font-medium">AI-Powered Insights</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
