import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { usePurchase } from "@/hooks/usePurchase";

const plans = [
  {
    name: "Single Report",
    price: "$99",
    description: "Perfect for a single grant application",
    features: [
      "1 Complete Application Report",
      "All Grant-Specific Sections",
      "Evidence Library Access",
      "PDF & DOCX Export",
      "Compliance Validation",
      "30-Day Report Access",
    ],
    cta: "Purchase Report",
    highlighted: true,
    isPurchase: true,
  },
  {
    name: "Research Team",
    price: "Contact Us",
    description: "For departments and research groups",
    features: [
      "Unlimited Applications",
      "Multiple Team Members",
      "Priority Support",
      "Custom Grant Templates",
      "Advanced Analytics",
      "API Access",
    ],
    cta: "Contact Sales",
    highlighted: false,
    isPurchase: false,
  },
];

export function Pricing() {
  const navigate = useNavigate();
  const { purchaseReport, isLoading } = usePurchase();

  const handlePurchase = async () => {
    const result = await purchaseReport();
    if (result.requiresAuth) {
      navigate("/auth");
    }
  };

  return (
    <section id="pricing" className="py-20">
      <div className="container">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Pay only for what you need. No subscriptions, no hidden fees.
          </p>
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
                  Most Popular
                </div>
              )}
              
              <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
              <p className={`text-sm mb-4 ${plan.highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                {plan.description}
              </p>
              
              <div className="mb-6">
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.price !== "Contact Us" && (
                  <span className={`text-sm ${plan.highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    {" "}AUD / report
                  </span>
                )}
              </div>
              
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className={`h-5 w-5 flex-shrink-0 ${plan.highlighted ? "text-accent" : "text-success"}`} />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              
              {plan.isPurchase ? (
                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  onClick={handlePurchase}
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
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  asChild
                >
                  <a href="mailto:sales@grantgenius.com.au">{plan.cta}</a>
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
