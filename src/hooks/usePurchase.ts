import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Stripe price ID for Single Report ($99 AUD)
const SINGLE_REPORT_PRICE_ID = "price_1Su4veAGMXEI4spP3kUXzIAj";

export function usePurchase() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const purchaseReport = async () => {
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

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          priceId: SINGLE_REPORT_PRICE_ID,
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
        // Open Stripe Checkout in new tab
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

  return {
    purchaseReport,
    isLoading,
  };
}
