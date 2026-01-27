
# Persistent Login and Admin Menu Icon

## Overview
This plan addresses two requirements:
1. Make login sessions persistent across page navigation (no re-authentication needed)
2. Add an Admin Console icon in the header that only appears for Admin and Super Admin users

## Current State Analysis

### Session Configuration (Already Correct)
The Supabase client at `src/integrations/supabase/client.ts` is already configured for session persistence:
- `persistSession: true` - Stores session in localStorage
- `autoRefreshToken: true` - Automatically refreshes expired tokens

### The Actual Problem
The Auth page (`src/pages/Auth.tsx`) doesn't check if a user is already logged in and redirect them. When you visit `/auth` while logged in, you still see the login form instead of being redirected to the dashboard.

## Implementation Plan

### Step 1: Update Auth Page to Redirect Logged-In Users
Add session detection to redirect authenticated users away from the login page.

**File:** `src/pages/Auth.tsx`

Changes:
- Add `useEffect` to check for existing session on mount
- If session exists, redirect to `/dashboard`
- Listen for auth state changes to handle post-magic-link redirect

```text
Logic flow:
1. On page load, check supabase.auth.getSession()
2. If session exists → redirect to /dashboard
3. Set up onAuthStateChange listener
4. On SIGNED_IN event → redirect to /dashboard
```

### Step 2: Create Reusable Auth Hook
Create a general-purpose authentication hook that provides user info and role data for any component.

**File:** `src/hooks/useAuth.ts` (NEW)

Features:
- Returns: `{ user, isLoading, isAuthenticated, isAdmin, isSuperAdmin }`
- Handles session checking and role fetching
- Sets up auth state change listener
- Reusable across landing, dashboard, and other pages

Interface:
```text
{
  user: { id, email } | null
  isLoading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
}
```

### Step 3: Update Dashboard Header with Admin Link
Add conditional Admin link in the Dashboard header for admin/super_admin users.

**File:** `src/pages/Dashboard.tsx`

Changes:
- Import `useAdminAuth` hook (already exists)
- Add Admin Console link/button that shows only when `isAdmin` is true
- Place it in the header near the Sign Out button
- Use the Shield icon from lucide-react

Visual placement:
```text
[Logo] Grant Genius                    [Admin] [user@email.com] [Sign Out]
                                         ^
                                    Only visible to admins
```

### Step 4: Update Landing Header for Logged-In Users
Make the landing page header auth-aware to show different options based on login state.

**File:** `src/components/landing/Header.tsx`

Changes:
- Import the new `useAuth` hook
- When logged in:
  - Replace "Sign In" / "Get Started" with "Dashboard" button
  - Show "Admin" link if user is admin
- When not logged in:
  - Keep current "Sign In" / "Get Started" buttons

Visual changes:
```text
Logged out:
[Logo]                    Features  Pricing  [Sign In] [Get Started]

Logged in (researcher):
[Logo]                    Features  Pricing  [Dashboard]

Logged in (admin):
[Logo]                    Features  Pricing  [Admin] [Dashboard]
```

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useAuth.ts` | CREATE | Reusable auth hook with role detection |
| `src/pages/Auth.tsx` | MODIFY | Redirect logged-in users to dashboard |
| `src/pages/Dashboard.tsx` | MODIFY | Add Admin link in header for admins |
| `src/components/landing/Header.tsx` | MODIFY | Auth-aware navigation with admin link |

## Technical Details

### useAuth Hook Implementation
```text
1. Initialize state: { user: null, isLoading: true, isAuthenticated: false, isAdmin: false }
2. On mount:
   - Call supabase.auth.getSession()
   - If session exists, fetch role from user_roles table
   - Update state with user info and role flags
3. Set up onAuthStateChange listener:
   - On SIGNED_IN: Re-fetch role and update state
   - On SIGNED_OUT: Reset state to unauthenticated
4. Cleanup: Unsubscribe on unmount
```

### Auth Page Redirect Logic
```text
useEffect:
  1. Set up onAuthStateChange listener FIRST (important for magic link)
  2. Check getSession() for existing session
  3. If session exists → navigate("/dashboard")
  4. On SIGNED_IN event → navigate("/dashboard")
```

### Admin Link Styling
- Use `Shield` icon from lucide-react
- Button variant: `ghost` with subtle color
- Tooltip: "Admin Console"
- Links to `/admin`

## User Experience Flow

### Current (Broken) Flow
1. User logs in via magic link
2. Redirected to dashboard
3. User navigates to landing page or closes browser
4. Opens app again → sent to auth page despite being logged in
5. Must request new magic link

### Fixed Flow
1. User logs in via magic link
2. Redirected to dashboard
3. Session stored in localStorage
4. User navigates anywhere or closes browser
5. Opens app again → automatically recognized as logged in
6. If visits `/auth` → redirected to dashboard
7. Admin users see "Admin" link in header
8. Click Admin → goes to `/admin` (session maintained)
9. Click back to dashboard → no re-auth needed
