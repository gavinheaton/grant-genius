import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Sparkles, CheckCircle, Loader2 } from "lucide-react";
import { usePurchase } from "@/hooks/usePurchase";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface PurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PlanOption = "single" | "bundle";

export function PurchaseModal({ open, onOpenChange }: PurchaseModalProps) {
  const { purchaseReport, purchaseBundle, isLoading } = usePurchase();
  const [selected, setSelected] = useState<PlanOption>("single");

  const handlePurchase = async () => {
    const result = selected === "bundle" ? await purchaseBundle() : await purchaseReport();
    if (result.success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Purchase Report Credits
          </DialogTitle>
          <DialogDescription>
            Generate AI-powered grant application reports with citations and market analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Plan Options */}
          <div className="grid grid-cols-1 gap-3">
            {/* Single Report */}
            <button
              type="button"
              onClick={() => setSelected("single")}
              className={cn(
                "rounded-lg border p-4 text-left transition-all",
                selected === "single"
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border bg-muted/30 hover:bg-muted/50"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold">Single Report</span>
                <Badge variant="secondary">1 Credit</Badge>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">$45</span>
                <span className="text-sm text-muted-foreground">+ GST ($49.50 inc. GST)</span>
              </div>
            </button>

            {/* Bundle */}
            <button
              type="button"
              onClick={() => setSelected("bundle")}
              className={cn(
                "rounded-lg border p-4 text-left transition-all relative",
                selected === "bundle"
                  ? "border-primary bg-primary/5 ring-2 ring-primary"
                  : "border-border bg-muted/30 hover:bg-muted/50"
              )}
            >
              <Badge className="absolute -top-2 right-3 bg-accent text-accent-foreground">
                Save $50
              </Badge>
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold">Report 10-Pack</span>
                <Badge variant="secondary">10 Credits</Badge>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold">$400</span>
                <span className="text-sm text-muted-foreground">+ GST ($440 inc. GST)</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">$40/report — best value</p>
            </button>
          </div>

          {/* Features */}
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>AI-generated sections with citations</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>Market analysis & competitor research</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>PDF & DOCX export</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span>Have a coupon? Enter it at checkout</span>
            </li>
          </ul>

          {/* Purchase Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handlePurchase}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening checkout...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                {selected === "bundle" ? "Purchase 10-Pack — $400 + GST" : "Purchase Report — $45 + GST"}
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            All prices in AUD. Secure payment powered by Stripe.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
