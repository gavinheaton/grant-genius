import { useState, useEffect, useRef } from "react";
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
  
  // Track if initial load is complete to avoid duplicate updates
  const initialLoadComplete = useRef(false);
  const brevoCalled = useRef(false);

  useEffect(() => {
    let mounted = true;

    const fetchUserRole = async (userId: string): Promise<AppRole | null> => {
      try {
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
      } catch (e) {
        console.error("Error fetching user role:", e);
        return null;
      }
    };

    const updateAuthState = async (
      userId: string | null, 
      email: string | undefined
    ) => {
      if (!mounted) return;

      if (!userId) {
        setState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
          isAdmin: false,
          isSuperAdmin: false,
          role: null,
        });
        return;
      }

      const role = await fetchUserRole(userId);
      if (!mounted) return;
      
      const isAdmin = role === "admin" || role === "super_admin";
      const isSuperAdmin = role === "super_admin";

      setState({
        user: { id: userId, email },
        isLoading: false,
        isAuthenticated: true,
        isAdmin,
        isSuperAdmin,
        role,
      });
    };

    // STEP 1: Set up auth state change listener for FUTURE changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Skip INITIAL_SESSION - we handle that with getSession() below
        if (event === "INITIAL_SESSION") return;
        
        // Fire-and-forget: add user to Brevo prospects list on sign-in
        if (event === "SIGNED_IN" && session?.user?.email && !brevoCalled.current) {
          brevoCalled.current = true;
          supabase.functions.invoke("add-to-brevo-list", {
            body: { email: session.user.email },
          }).catch((err) => console.error("Brevo list error:", err));
        }

        // For all other events (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
        if (session?.user) {
          updateAuthState(session.user.id, session.user.email);
        } else {
          updateAuthState(null, undefined);
        }
      }
    );

    // STEP 2: Check initial session state (this is the primary resolver)
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // Fire Brevo call on initial session too (magic link may only emit INITIAL_SESSION)
          if (session.user.email && !brevoCalled.current) {
            brevoCalled.current = true;
            supabase.functions.invoke("add-to-brevo-list", {
              body: { email: session.user.email },
            }).catch((err) => console.error("Brevo list error:", err));
          }
          await updateAuthState(session.user.id, session.user.email);
        } else {
          // No session - immediately set loading to false
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
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
        // On error, still set loading to false
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
      } finally {
        initialLoadComplete.current = true;
      }
    };

    initializeAuth();

    // STEP 3: Safety timeout - ensure loading never hangs
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        setState(prev => {
          if (prev.isLoading) {
            console.warn("Auth loading timed out - forcing resolution");
            return { ...prev, isLoading: false };
          }
          return prev;
        });
      }
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  return state;
}
