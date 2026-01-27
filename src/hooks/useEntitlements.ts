import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Entitlement {
  id: string;
  entitlement_type: string;
  quantity: number;
  used_quantity: number;
  expires_at: string | null;
}

export function useEntitlements() {
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [availableReports, setAvailableReports] = useState(0);

  const fetchEntitlements = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setEntitlements([]);
      setAvailableReports(0);
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("entitlements")
      .select("id, entitlement_type, quantity, used_quantity, expires_at")
      .eq("entitlement_type", "REPORT_ONE_OFF");

    if (error) {
      console.error("Error fetching entitlements:", error);
      setIsLoading(false);
      return;
    }

    setEntitlements(data || []);
    
    // Calculate available reports
    const available = (data || []).reduce((sum, ent) => {
      // Check if not expired
      if (ent.expires_at && new Date(ent.expires_at) < new Date()) {
        return sum;
      }
      return sum + (ent.quantity - ent.used_quantity);
    }, 0);
    
    setAvailableReports(available);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchEntitlements();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchEntitlements();
    });

    return () => subscription.unsubscribe();
  }, [fetchEntitlements]);

  const hasAvailableReport = availableReports > 0;

  return {
    entitlements,
    availableReports,
    hasAvailableReport,
    isLoading,
    refetch: fetchEntitlements,
  };
}
