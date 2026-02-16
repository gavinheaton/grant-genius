

## Fix: Pricing Section Editor -- Features List, Plan Type, and Highlighted Toggle

### Problem

The pricing section editor in the admin homepage builder is missing critical fields:
- **Feature checklist**: Admins cannot add/edit/remove the bullet-point features shown under each plan (e.g. "1 Complete Application Report", "PDF and DOCX Export")
- **Plan type** (`single` or `bundle`): Controls which Stripe product/price ID is used at checkout -- currently not editable
- **Highlighted toggle**: Controls the "Best Value" badge and dark styling -- currently not editable

### Changes

**File: `src/components/admin/homepage/SectionContentEditor.tsx`**

Update the `pricing` case (around lines 103-125) to add:

1. A **Type** dropdown (`single` / `bundle`) per plan -- this maps to the Stripe price IDs in `usePurchase.ts`
2. A **Highlighted** checkbox per plan -- controls "Best Value" badge
3. A **Features** array editor per plan -- editable list of checklist strings

The updated plan editor will look like:

```
Plan Card:
  [Name]           [Base Price]
  [Description]
  [GST Note]       [CTA Text]
  [Type: single|bundle]  [x] Highlighted
  Features:
    - [feature text]  [delete]
    - [feature text]  [delete]
    [+ Add Feature]
```

### Technical Details

| File | Change |
|---|---|
| `src/components/admin/homepage/SectionContentEditor.tsx` | Add `type` select, `highlighted` checkbox, and `features` string-array editor to the pricing plan editor |

No database changes needed -- the `content_json` JSONB column already stores the full plan objects including `features`, `type`, and `highlighted` fields. The issue is purely that the editor UI was not exposing these fields.

