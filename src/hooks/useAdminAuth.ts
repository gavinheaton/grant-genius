import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AdminAuthState {
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: AppRole | null;
  userId: string | null;
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>({
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
    isSuperAdmin: false,
    role: null,
    userId: null,
  });

  useEffect(() => {
    let mounted = true;

    const checkAdminStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          if (mounted) {
            setState({
              isLoading: false,
              isAuthenticated: false,
              isAdmin: false,
              isSuperAdmin: false,
              role: null,
              userId: null,
            });
          }
          return;
        }

        // Fetch user role from user_roles table
        const { data: roleData, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (error) {
          console.error("Error fetching user role:", error);
          if (mounted) {
            setState({
              isLoading: false,
              isAuthenticated: true,
              isAdmin: false,
              isSuperAdmin: false,
              role: null,
              userId: session.user.id,
            });
          }
          return;
        }

        const role = roleData?.role || "researcher";
        const isAdmin = role === "admin" || role === "super_admin";
        const isSuperAdmin = role === "super_admin";

        if (mounted) {
          setState({
            isLoading: false,
            isAuthenticated: true,
            isAdmin,
            isSuperAdmin,
            role,
            userId: session.user.id,
          });
        }
      } catch (error) {
        console.error("Error checking admin status:", error);
        if (mounted) {
          setState({
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
            isSuperAdmin: false,
            role: null,
            userId: null,
          });
        }
      }
    };

    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
