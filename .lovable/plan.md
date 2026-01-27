

# Delete and Archive Grants Feature for Admin Console

## Context

Based on my exploration, here's what I found:

### Current State
- The `grants` table already has an `is_active` boolean column (used for soft-delete/archiving)
- The GrantEdit page has a toggle for Active/Inactive status, but it's buried in the Details tab
- The Grants list page shows Active/Inactive badges but has no quick actions for archiving/deleting
- **Data exists**: AEA Ignite and ARC Linkage Grant have applications linked to them

### Database Constraints
- `grant_versions` cascades on delete from `grants` (safe)
- `applications` references `grant_versions` **without cascade** - this will BLOCK deletion if applications exist
- This is intentional: we can't delete grants that researchers have used

### Recommended Approach

| Action | Use Case | Implementation |
|--------|----------|----------------|
| **Archive** (Soft Delete) | Grant is no longer active but has historical applications | Toggle `is_active` to false |
| **Delete** (Hard Delete) | Grant was created by mistake, has no applications | DELETE from database (blocked by FK if apps exist) |

---

## Proposed Changes

### 1. Update Grants List Page (`src/pages/admin/Grants.tsx`)

Add action buttons in the Actions column:
- **Archive/Unarchive button** - Toggle `is_active` status
- **Delete button** - Only enabled for grants with zero applications

Add a confirmation dialog using AlertDialog for destructive actions.

```text
Actions column will show:
┌──────────────────────────────────────┐
│  [Edit] [Archive/Activate] [Delete]  │
└──────────────────────────────────────┘
```

### 2. Add Status Filter

Add a filter dropdown to show:
- All grants
- Active only (default)
- Archived only

This helps admins find archived grants to reactivate if needed.

### 3. UI Components to Add

**Archive Confirmation Dialog:**
```text
┌─────────────────────────────────────┐
│ Archive "AEA Ignite"?               │
├─────────────────────────────────────┤
│ This grant will be hidden from      │
│ researchers but existing            │
│ applications will remain accessible.│
│                                     │
│ [Cancel]          [Archive Grant]   │
└─────────────────────────────────────┘
```

**Delete Confirmation Dialog:**
```text
┌─────────────────────────────────────┐
│ Delete "Test Grant"?                │
├─────────────────────────────────────┤
│ This will permanently delete the    │
│ grant and all its versions.         │
│                                     │
│ This action cannot be undone.       │
│                                     │
│ [Cancel]          [Delete Grant]    │
└─────────────────────────────────────┘
```

**Delete Button Disabled State:**
When a grant has applications, the delete button shows a tooltip:
"Cannot delete - this grant has existing applications"

---

## Technical Implementation

### File: `src/pages/admin/Grants.tsx`

**New Imports:**
- `AlertDialog` components from `@/components/ui/alert-dialog`
- `DropdownMenu` for filter
- `Archive`, `Trash2`, `ArchiveRestore` icons from lucide-react
- `useMutation` from tanstack/react-query

**New State:**
```typescript
const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
const [grantToArchive, setGrantToArchive] = useState<Grant | null>(null);
const [grantToDelete, setGrantToDelete] = useState<Grant | null>(null);
```

**New Mutations:**
```typescript
// Archive/Unarchive mutation
const toggleArchiveMutation = useMutation({
  mutationFn: async (grant: Grant) => {
    const { error } = await supabase
      .from("grants")
      .update({ is_active: !grant.is_active })
      .eq("id", grant.id);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["admin-grants"] });
    toast({ title: grant.is_active ? "Grant archived" : "Grant activated" });
  }
});

// Delete mutation
const deleteGrantMutation = useMutation({
  mutationFn: async (grantId: string) => {
    const { error } = await supabase
      .from("grants")
      .delete()
      .eq("id", grantId);
    if (error) throw error;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["admin-grants"] });
    toast({ title: "Grant deleted" });
  },
  onError: (error) => {
    // Handle FK constraint error gracefully
    toast({
      title: "Cannot delete grant",
      description: "This grant has existing applications and cannot be deleted. Consider archiving instead.",
      variant: "destructive"
    });
  }
});
```

**Query Enhancement:**
Add application count to the query to determine if delete is possible:
```typescript
const { data, error } = await supabase
  .from("grants")
  .select(`
    *,
    grant_versions (
      id,
      version_number,
      is_published,
      created_at,
      applications:applications(count)
    )
  `)
  .order("created_at", { ascending: false });
```

**Filter Logic:**
```typescript
const filteredGrants = grants?.filter((grant) => {
  const matchesSearch = 
    grant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    grant.description?.toLowerCase().includes(searchQuery.toLowerCase());
  
  const matchesStatus = 
    statusFilter === "all" ||
    (statusFilter === "active" && grant.is_active) ||
    (statusFilter === "archived" && !grant.is_active);
  
  return matchesSearch && matchesStatus;
});
```

**Actions Column Update:**
```tsx
<TableCell>
  <div className="flex items-center gap-1">
    <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/grants/${grant.id}`)}>
      <Pencil className="h-4 w-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setGrantToArchive(grant)}
    >
      {grant.is_active ? (
        <Archive className="h-4 w-4" />
      ) : (
        <ArchiveRestore className="h-4 w-4" />
      )}
    </Button>
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setGrantToDelete(grant)}
      disabled={hasApplications(grant)}
      title={hasApplications(grant) ? "Cannot delete - has applications" : "Delete grant"}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  </div>
</TableCell>
```

---

## Security Considerations

- Archive/delete operations go through existing RLS policies (`is_admin()` check)
- Deletions are blocked at the database level if applications exist (FK constraint)
- All delete/archive actions are logged via the `log_audit()` trigger
- No changes to RLS policies needed

---

## Summary

| Change | File |
|--------|------|
| Add status filter dropdown | `src/pages/admin/Grants.tsx` |
| Add archive/delete action buttons | `src/pages/admin/Grants.tsx` |
| Add confirmation dialogs | `src/pages/admin/Grants.tsx` |
| Add mutations for archive/delete | `src/pages/admin/Grants.tsx` |
| Update query to include app counts | `src/pages/admin/Grants.tsx` |

No database migrations needed - the `is_active` column and delete cascade behavior already exist.

