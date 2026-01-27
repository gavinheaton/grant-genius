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

interface PurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseModal({ open, onOpenChange }: PurchaseModalProps) {
  const { purchaseReport, isLoading } = usePurchase();

  const handlePurchase = async () => {
    const result = await purchaseReport();
    if (result.success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Purchase Report Credit
          </DialogTitle>
          <DialogDescription>
            Generate AI-powered grant application reports with citations and market analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Price Card */}
          <div className="rounded-lg border bg-muted/50 p-6 text-center">
            <div className="mb-2">
              <Badge variant="secondary" className="mb-3">Single Report</Badge>
            </div>
            <div className="text-4xl font-bold mb-1">$99</div>
            <div className="text-sm text-muted-foreground">AUD per report</div>
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
                Purchase Report
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Secure payment powered by Stripe. You'll be redirected to complete your purchase.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
