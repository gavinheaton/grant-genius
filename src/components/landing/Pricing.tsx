import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePurchase } from "@/hooks/usePurchase";
import { useHomepageSettings, type PricingPlan } from "@/hooks/useHomepageSettings";

const defaultPlans: PricingPlan[] = [
  {
    name: "Single Report",
    basePrice: "$45",
    gstNote: "+ GST ($49.50 inc. GST)",
    description: "Perfect for a single grant application",
    features: [
      "1 Complete Application Report",
      "All Grant-Specific Sections",
      "Evidence Library Access",
      "PDF & DOCX Export",
      "Compliance Validation",
    ],
    cta: "Purchase Report",
    highlighted: false,
    type: "single",
  },
  {
    name: "Report 10-Pack",
    basePrice: "$400",
    gstNote: "+ GST ($440 inc. GST)",
    description: "Best value for multiple applications",
    features: [
      "10 Report Credits",
      "All Grant-Specific Sections",
      "Evidence Library Access",
      "PDF & DOCX Export",
      "Compliance Validation",
      "Save $50 vs individual",
    ],
    cta: "Purchase 10-Pack",
    highlighted: true,
    type: "bundle",
  },
];

export function Pricing() {
  const navigate = useNavigate();
  const { purchaseReport, purchaseBundle, isLoading } = usePurchase();
  const { data: settings } = useHomepageSettings();

  const heading = settings?.pricing_heading ?? "Simple, Transparent Pricing";
  const subheading = settings?.pricing_subheading ?? "Pay only for what you need. No subscriptions, no hidden fees.";
  const plans = settings?.pricing_plans ?? defaultPlans;
  const footerNote = settings?.pricing_footer_note ?? "All prices in AUD. GST applies to Australian customers. Have a coupon? Enter it at checkout.";

  const handlePurchase = async (type: "single" | "bundle") => {
    const result = type === "bundle" ? await purchaseBundle() : await purchaseReport();
    if (result.requiresAuth) {
      navigate("/auth");
    }
  };

  return (
    <section id="pricing" className="py-20">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">{heading}</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{subheading}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-8 ${
                plan.highlighted
                  ? "bg-primary text-primary-foreground shadow-elevated"
                  : "bg-card shadow-card border"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-accent text-accent-foreground text-sm font-medium">
                  Best Value
                </div>
              )}

              <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
              <p className={`text-sm mb-4 ${plan.highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {plan.description}
              </p>

              <div className="mb-2">
                <span className="text-4xl font-bold">{plan.basePrice}</span>
              </div>
              <p className={`text-sm mb-6 ${plan.highlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {plan.gstNote}
              </p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className={`h-5 w-5 flex-shrink-0 ${plan.highlighted ? "text-accent" : "text-success"}`} />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={plan.highlighted ? "accent" : "outline"}
                size="lg"
                className="w-full"
                onClick={() => handlePurchase(plan.type)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  plan.cta
                )}
              </Button>
            </div>
          ))}
        </div>

        <p className="text-xs text-center text-muted-foreground mt-6">{footerNote}</p>
      </div>
    </section>
  );
}
