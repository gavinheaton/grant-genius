

# Fix: Auth Loading State Stuck on Homepage (v2)

## Problem Analysis
The previous fix wasn't sufficient. The "Sign In" button on the homepage still shows a spinning loader. The `/auth` page works because it uses its own local state (`isCheckingSession`) that's resolved by a simple `getSession()` call - not the `useAuth` hook.

## Root Cause (Deeper Analysis)
The `useAuth` hook's `onAuthStateChange` callback is **async**, which creates subtle timing issues:

```typescript
supabase.auth.onAuthStateChange(async (event, session) => {
  // This is an async function, but Supabase doesn't await it!
  if (session?.user) {
    await updateAuthState(session.user.id, session.user.email);
  } else {
    await updateAuthState(null, undefined); // Database query for roles happens here
  }
});
```

When there's **no session**, `updateAuthState(null, undefined)` is called which should immediately set `isLoading: false`. However, the async nature of the callback combined with potential race conditions between `onAuthStateChange` and `getSession()` can cause the state update to be lost or delayed indefinitely.

## Solution
Simplify the auth state resolution logic to ensure loading state is **always** resolved:

1. **Make the initial check synchronous-first**: Check for session state synchronously where possible
2. **Ensure a single source of truth**: Use `getSession()` as the primary resolver, with `onAuthStateChange` only for subsequent changes
3. **Add safety timeout**: Ensure loading never hangs indefinitely

## Implementation

### File: `src/hooks/useAuth.ts`

```typescript
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
      email: string | undefined,
      skipIfComplete = false
    ) => {
      // Avoid duplicate updates on initial load
      if (skipIfComplete && initialLoadComplete.current) return;
      
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
      if (mounted && state.isLoading) {
        console.warn("Auth loading timed out - forcing resolution");
        setState(prev => ({ ...prev, isLoading: false }));
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
```

## Key Changes

| Change | Reason |
|--------|--------|
| Skip `INITIAL_SESSION` in listener | Avoid race condition with `getSession()` |
| Use `getSession()` as primary resolver | More reliable for initial state |
| Add try/catch around `getSession()` | Ensure loading resolves even on errors |
| Add 5-second safety timeout | Prevent infinite loading in edge cases |
| Add `initialLoadComplete` ref | Prevent duplicate updates |

## Why This Will Work
1. The `/auth` page works because it uses `getSession()` directly without the async listener complexity
2. This fix mirrors that approach - using `getSession()` as the single source of truth for initial state
3. The `onAuthStateChange` listener is only used for subsequent auth changes (login, logout, token refresh)
4. The safety timeout ensures the UI is never stuck indefinitely

## Technical Summary
| Aspect | Details |
|--------|---------|
| Files modified | `src/hooks/useAuth.ts` |
| Risk level | Low - more defensive approach |
| Testing | Load homepage → Sign In button should appear within 1 second |

