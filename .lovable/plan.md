

# Fix: Duplicate Variable Declaration in `process-grant-guidelines`

## Problem

The edge function `process-grant-guidelines` is failing to boot due to a **duplicate `const` declaration** of `rubricSections`:

| Location | Line | Code |
|----------|------|------|
| First declaration | 918 | `const rubricSections = suggestions.rubric?.sections \|\| [];` |
| Second declaration | 1204 | `const rubricSections = suggestions.rubric?.sections \|\| [];` |

Both declarations are in the same function scope, causing the JavaScript runtime error:
```
Identifier 'rubricSections' has already been declared
```

Since the function cannot boot, it cannot respond to the CORS preflight request, resulting in the CORS error you see.

---

## Solution

Remove the duplicate declaration on line 1204 and reuse the existing `rubricSections` variable from line 918.

Since `rubricSections` is already defined earlier in the same scope with the same value (`suggestions.rubric?.sections || []`), the second declaration is redundant.

---

## Changes

**File: `supabase/functions/process-grant-guidelines/index.ts`**

| Line | Change |
|------|--------|
| 1204 | Remove the duplicate `const rubricSections = suggestions.rubric?.sections \|\| [];` |
| 1205 | Keep unchanged - still uses `rubricSections` which was already declared at line 918 |

The fix is a single line removal. The function already has access to `rubricSections` from the earlier declaration.

---

## Expected Outcome

After this fix:
1. The edge function will boot successfully
2. CORS preflight requests will return HTTP 200 with proper headers
3. The guidelines upload and processing will work correctly

---

## Testing

After deployment, you can test by:
1. Navigating to the admin grants page
2. Uploading a grant guidelines PDF
3. Verifying the archetype detection and pipeline generation complete without CORS errors

