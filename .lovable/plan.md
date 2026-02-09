
# Dashboard Card Layout Improvements

## Overview
Restructure the application cards on the Dashboard to prioritize the user's project/business name as the primary heading, with the grant name as supporting context. Also improve the call-to-action for opening applications.

---

## Current vs. Proposed Layout

```text
CURRENT LAYOUT:                      PROPOSED LAYOUT:
┌─────────────────────────┐          ┌─────────────────────────┐
│ AEA Ignite Grant  [🗑️]  │          │ My Research Project [🗑️]│  ← Clickable link
│ My Research Project     │          │ AEA Ignite Grant        │  ← Muted badge/text
│                         │          │                         │
│ Last updated: 15 Jan    │          │ Last updated: 15 Jan    │
│ [   Open Application  ] │          │ [     View Details    ] │  ← Clearer button
└─────────────────────────┘          └─────────────────────────┘
```

---

## Changes

### 1. Reverse Heading Hierarchy
- **Primary heading (CardTitle)**: Show the application title (project/business name)
- **Secondary text**: Show the grant name as muted text below
- **Fallback**: If no title is set, display "Untitled Application" as the heading

### 2. Make Heading Clickable
- Wrap the primary heading in a `Link` component pointing to `/applications/{id}`
- Add hover underline styling for clear affordance

### 3. Improve the Button
- Change button text from "Open Application" to "View Details" or "Continue"
- Change variant from `ghost` to `outline` for better visibility
- Keep the full-width layout for easy tapping on mobile

---

## Technical Details

**File to modify:** `src/pages/Dashboard.tsx`

**Changes in the card render section (lines ~316-351):**

```tsx
<CardHeader className="pb-2">
  <div className="flex items-start justify-between">
    {/* Primary: Project/Business Name - now clickable */}
    <Link 
      to={`/applications/${app.id}`}
      className="hover:underline"
    >
      <CardTitle className="text-lg">
        {app.title || "Untitled Application"}
      </CardTitle>
    </Link>
    <div className="flex items-center gap-2">
      {/* Delete button + Status badge (unchanged) */}
    </div>
  </div>
  {/* Secondary: Grant name as muted text */}
  <p className="text-sm text-muted-foreground truncate">
    {app.grant_version?.grant?.name || "Unknown Grant"}
  </p>
</CardHeader>
<CardContent>
  <CardDescription>
    Last updated: {new Date(app.updated_at).toLocaleDateString()}
  </CardDescription>
  {/* Clearer button styling */}
  <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
    <Link to={`/applications/${app.id}`}>
      View Details
    </Link>
  </Button>
</CardContent>
```

**Also update the delete confirmation dialog** to reference the project title instead of grant name for consistency.

---

## Summary
- Project/business name becomes the prominent, clickable heading
- Grant name moves to secondary supporting text
- Button gets clearer styling with `outline` variant and "View Details" label
- Maintains all existing functionality (delete, status badges, search filtering)
