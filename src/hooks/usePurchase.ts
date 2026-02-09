import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Stripe price IDs (GST-inclusive amounts charged by Stripe)
// Single Report: $45 + GST = $49.50 AUD
export const SINGLE_REPORT_PRICE_ID = "price_SINGLE_REPORT_NEW"; // TODO: Replace with actual Stripe price ID
// Report 10-Pack: $400 + GST = $440 AUD
export const BUNDLE_10_PRICE_ID = "price_BUNDLE_10_NEW"; // TODO: Replace with actual Stripe price ID

export type ProductKey = "REPORT_ONE_OFF" | "REPORT_BUNDLE_10";

const PRICE_TO_PRODUCT: Record<string, ProductKey> = {
  [SINGLE_REPORT_PRICE_ID]: "REPORT_ONE_OFF",
  [BUNDLE_10_PRICE_ID]: "REPORT_BUNDLE_10",
};

export function usePurchase() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const purchase = async (priceId: string) => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast({
          title: "Sign in required",
          description: "Please sign in to purchase a report.",
          variant: "destructive",
        });
        return { success: false, requiresAuth: true };
      }

      const productKey = PRICE_TO_PRODUCT[priceId] || "REPORT_ONE_OFF";

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId,
          productKey,
        },
      });

      if (error) {
        console.error("Checkout error:", error);
        toast({
          title: "Purchase failed",
          description: error.message || "Unable to start checkout. Please try again.",
          variant: "destructive",
        });
        return { success: false };
      }

      if (data?.url) {
        window.open(data.url, "_blank");
        return { success: true };
      }

      return { success: false };
    } catch (err) {
      console.error("Purchase error:", err);
      toast({
        title: "Purchase failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
      return { success: false };
    } finally {
      setIsLoading(false);
    }
  };

  const purchaseReport = () => purchase(SINGLE_REPORT_PRICE_ID);
  const purchaseBundle = () => purchase(BUNDLE_10_PRICE_ID);

  return {
    purchaseReport,
    purchaseBundle,
    purchase,
    isLoading,
  };
}
