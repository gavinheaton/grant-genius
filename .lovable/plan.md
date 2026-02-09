
# Restrict User Applications & Extend Admin Applications Overview

## Summary

This plan addresses two related requirements:
1. **Researchers** should only see their own applications on the Dashboard
2. **Admins** should have visibility into all applications (not just manual queue) for monitoring volume and activity

## Current State Analysis

### RLS Policies (Database)
The `applications` table already has proper RLS policies:
- `Users can view own applications`: Only returns rows where `user_id = auth.uid()`
- `Admins can view all applications`: Returns all rows for admin users

**The database security is already correct** - users can only see their own data at the database level.

### Dashboard Code Issue
The Dashboard (`src/pages/Dashboard.tsx`) doesn't apply any additional filtering because RLS handles it. However, if a user has an admin role, the "Admins can view all applications" RLS policy kicks in and they see ALL applications - including other users' applications on their personal "My Applications" page.

### Current Admin Manual Queue
The `/admin/manual-queue` page only shows applications with `manual_status IS NOT NULL`, which limits visibility to manually-processed grants only.

## Solution

### Part 1: Filter Dashboard to User's Own Applications

Even though admins CAN see all applications via RLS, the "My Applications" Dashboard should only show the logged-in user's own applications. This requires adding a client-side filter:

**File**: `src/pages/Dashboard.tsx`
- Add `.eq("user_id", session.user.id)` to the Supabase query
- This ensures admins see only their own work on the Dashboard, while still having full visibility in the Admin Console

### Part 2: Extend Admin Manual Queue to "All Applications"

Rename and expand the Manual Queue page to become a comprehensive "Applications" overview:

**File**: `src/pages/admin/ManualQueue.tsx` → Extend with tabbed interface
- **Tab 1: All Applications** - Shows all applications across the platform with status, user, grant, and date info
- **Tab 2: Manual Queue** - Existing functionality for manual submissions

**Add new summary cards**:
- Total Applications
- By Status breakdown (Draft / In Progress / Ready / Failed)
- Recent activity trends

**File**: `src/components/admin/AdminSidebar.tsx`
- Rename "Manual Queue" to "Applications" for clarity

## Technical Details

### Dashboard.tsx Changes
```typescript
// Current (line ~97-108)
const { data, error } = await supabase
  .from("applications")
  .select(`...`)
  .order("updated_at", { ascending: false });

// Updated - add user filter
const { data, error } = await supabase
  .from("applications")
  .select(`...`)
  .eq("user_id", session.user.id)  // <-- Add this filter
  .order("updated_at", { ascending: false });
```

### ManualQueue.tsx Changes
1. Add Tabs component with "All Applications" and "Manual Queue" tabs
2. Create a new query for all applications:
```typescript
const { data: allApplications } = useQuery({
  queryKey: ["admin-all-applications"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("applications")
      .select(`
        id, title, status, created_at, updated_at,
        grant_version:grant_versions!inner(grant:grants!inner(id, name)),
        profile:profiles!applications_user_id_profiles_fkey(email, full_name)
      `)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
```
3. Add summary cards showing status breakdown
4. Add a table displaying all applications with filtering

### Sidebar Update
Change the menu item label from "Manual Queue" to "Applications" to reflect the expanded scope.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Add `.eq("user_id", session.user.id)` filter |
| `src/pages/admin/ManualQueue.tsx` | Add tabs, "All Applications" view, summary cards |
| `src/components/admin/AdminSidebar.tsx` | Rename "Manual Queue" to "Applications" |

## No Database Changes Required
The existing RLS policies are correctly configured. This is a UI/UX change only.
