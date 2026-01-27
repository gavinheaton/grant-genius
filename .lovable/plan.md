

# Add Delete Draft Functionality to Dashboard

## Overview

Allow users to delete draft applications directly from the dashboard. This provides a clean way to remove incomplete or unwanted applications without cluttering the application list.

## What You'll See

When you hover over or interact with a draft application card on the dashboard:
- A delete button (trash icon) will appear in the card
- Clicking it opens a confirmation dialog to prevent accidental deletions
- Only draft applications can be deleted (applications with reports or in-progress cannot be deleted)
- After deletion, the application is removed from the list without a page refresh

## Technical Changes

### 1. Dashboard Component Updates

Add delete functionality with confirmation:

**New state:**
- `deleteModalOpen` - controls the confirmation dialog visibility
- `applicationToDelete` - stores the application being deleted

**New function:**
- `handleDeleteDraft(applicationId)` - triggers the confirmation dialog
- `confirmDelete()` - executes the deletion after user confirms

**UI Changes:**
- Add a trash icon button to each draft application card
- Button only appears for applications with `status === "draft"`
- Styled subtly to not interfere with the main card action

### 2. Confirmation Dialog

Using the existing AlertDialog component:

```text
+----------------------------------+
| Delete Draft Application?        |
+----------------------------------+
| This will permanently delete     |
| "[Grant Name]" draft. This       |
| action cannot be undone.         |
|                                  |
| [Cancel]    [Delete Application] |
+----------------------------------+
```

### 3. Delete Function Implementation

```typescript
const confirmDelete = async () => {
  if (!applicationToDelete) return;
  
  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationToDelete.id);

  if (error) {
    toast({
      title: "Error deleting application",
      description: "Please try again.",
      variant: "destructive",
    });
  } else {
    // Remove from local state
    setApplications(prev => prev.filter(a => a.id !== applicationToDelete.id));
    toast({
      title: "Application deleted",
      description: "The draft has been removed.",
    });
  }
  
  setDeleteModalOpen(false);
  setApplicationToDelete(null);
};
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Add delete button, confirmation dialog, and delete logic |

## Database Considerations

The `applications` table already has the necessary RLS policy:
- **Policy:** "Users can delete own applications"
- **Expression:** `auth.uid() = user_id`

No database changes are required since users can already delete their own applications via RLS.

## Safety Features

1. **Draft-only deletion** - The delete button only appears on draft applications, preventing accidental deletion of applications with completed reports
2. **Confirmation dialog** - Requires explicit user confirmation before deletion
3. **Error handling** - Graceful error messages if deletion fails
4. **Optimistic UI** - Immediate removal from the list for responsive feel

## Implementation Details

**Card modification:**

```tsx
{/* In the application card header */}
<div className="flex items-start justify-between">
  <CardTitle className="text-lg">{app.grant_version?.grant?.name}</CardTitle>
  <div className="flex items-center gap-2">
    {app.status === "draft" && (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.preventDefault();
          handleDeleteDraft(app);
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    )}
    <Badge variant={config.variant}>
      <StatusIcon className="h-3 w-3" />
      {config.label}
    </Badge>
  </div>
</div>
```

**Confirmation dialog:**

```tsx
<AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Draft Application?</AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently delete the "{applicationToDelete?.grant_version?.grant?.name}" 
        draft. This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction 
        onClick={confirmDelete}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        Delete Application
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

