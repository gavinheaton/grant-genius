import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface User {
  id: string;
  email: string | undefined;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: AppRole | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    isAdmin: false,
    isSuperAdmin: false,
    role: null,
  });

  useEffect(() => {
    let mounted = true;

    const fetchUserRole = async (userId: string): Promise<AppRole | null> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user role:", error);
        return null;
      }

      return data?.role || null;
    };

    const updateAuthState = async (userId: string | null, email: string | undefined) => {
      if (!userId) {
        if (mounted) {
          setState({
            user: null,
            isLoading: false,
            isAuthenticated: false,
            isAdmin: false,
            isSuperAdmin: false,
            role: null,
          });
        }
        return;
      }

      const role = await fetchUserRole(userId);
      const isAdmin = role === "admin" || role === "super_admin";
      const isSuperAdmin = role === "super_admin";

      if (mounted) {
        setState({
          user: { id: userId, email },
          isLoading: false,
          isAuthenticated: true,
          isAdmin,
          isSuperAdmin,
          role,
        });
      }
    };

    // Set up auth state change listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          await updateAuthState(session.user.id, session.user.email);
        } else {
          // No session - clear auth state (handles INITIAL_SESSION, SIGNED_OUT, etc.)
          await updateAuthState(null, undefined);
        }
      }
    );

    // Then check for existing session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await updateAuthState(session.user.id, session.user.email);
      } else {
        if (mounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    checkSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
