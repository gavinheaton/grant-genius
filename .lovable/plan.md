

## Add Grant Tags to Prompt Bundle Cards

Show which grant (if any) each bundle is linked to, directly on the bundle list cards.

### Approach

**1. Fetch grant linkage data in `usePromptBundles` hook (`src/hooks/usePromptBundles.ts`)**

Update the query to also fetch linked grant versions and their parent grant name. Since PostgREST supports reverse foreign key joins, we can query `grant_versions` that reference each bundle:

```ts
.select("*, prompt_bundle_steps(count), grant_versions(id, version_number, is_published, grants(name))")
```

Map the result to add a `linked_grants` array to each `PromptBundle`, e.g.:
```ts
linked_grants: [{ grant_name: "AEA Ignite", version_number: 1, is_published: true }]
```

Update the `PromptBundle` type to include this optional array.

**2. Display grant tags on bundle cards (`src/pages/admin/PromptBundles.tsx`)**

In each bundle's `CardContent` area, render a `Badge` for each linked grant. Show the grant name and version number. Use a muted/outline style for draft versions and a colored style for published ones. Bundles with no linked grant show a subtle "Unlinked" label.

### Technical Details

- **Files changed**: `src/hooks/usePromptBundles.ts`, `src/pages/admin/PromptBundles.tsx`
- No database changes needed -- the `grant_versions.prompt_bundle_id` foreign key already exists
- Badges will show format like: `AEA Ignite (v1)` with a secondary variant for published, outline for draft
- Unlinked bundles show a small muted "No grant linked" text (not a badge) to keep it clean

