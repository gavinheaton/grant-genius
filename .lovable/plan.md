

# Add "Back to Grant Genius" Link in Admin Sidebar

## Overview
Add a navigation link in the Admin sidebar that allows administrators to easily return to the main Grant Genius user dashboard without logging out.

## Implementation

### File to Modify
`src/components/admin/AdminSidebar.tsx`

### Changes

1. **Import Home icon** from lucide-react for the navigation link

2. **Add "Back to Grant Genius" button** in the SidebarFooter, above the existing Logout button

The footer will change from:
```
[Logout]
```

To:
```
[Back to Grant Genius]
[Logout]
```

### Visual Design
- Use the `Home` icon from lucide-react
- Use `Link` component from react-router-dom for navigation
- Style as a ghost button matching the Logout button
- Text: "Grant Genius" (or "Back to App" when collapsed to show icon only)
- Links to `/dashboard`

### Code Changes

Add import:
```typescript
import { Home } from "lucide-react";
import { Link } from "react-router-dom";
```

Update SidebarFooter to include the new link:
```typescript
<SidebarFooter className="border-t border-border p-4 space-y-2">
  <Button
    variant="ghost"
    className="w-full justify-start gap-2"
    asChild
  >
    <Link to="/dashboard">
      <Home className="h-4 w-4" />
      {!collapsed && <span>Grant Genius</span>}
    </Link>
  </Button>
  <Button
    variant="ghost"
    className="w-full justify-start gap-2"
    onClick={handleLogout}
  >
    <LogOut className="h-4 w-4" />
    {!collapsed && <span>Logout</span>}
  </Button>
</SidebarFooter>
```

## User Experience
- Admins can quickly switch between the Admin Console and the main user-facing dashboard
- The link is placed prominently in the footer, always visible
- When sidebar is collapsed, only the Home icon shows (consistent with other collapsed items)
- Maintains session - no re-authentication needed

