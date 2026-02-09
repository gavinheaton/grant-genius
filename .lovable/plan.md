

# Fix Backend Validation for Optional Public Article URL

## Problem

The frontend now allows submitting reports without a Public Article URL, but the `generate-report` Edge Function still requires it at line 393:

```typescript
if (!publicArticleUrl || !summary) {
  return new Response(
    JSON.stringify({ error: "Article URL and summary are required" }),
    ...
  );
}
```

This causes a 400 error when a user tries to generate a report without providing an article URL.

---

## Solution

Update the backend validation to only require the `summary` field, matching the frontend change.

---

## Change Required

**File:** `supabase/functions/generate-report/index.ts`

**Location:** Lines 393-398

| Before | After |
|--------|-------|
| `if (!publicArticleUrl \|\| !summary)` | `if (!summary)` |
| `"Article URL and summary are required"` | `"Summary is required"` |

---

## Additional Consideration

The pipeline may also need to handle empty `publicArticleUrl` gracefully. Looking at the code:

1. **Line 390:** `const publicArticleUrl = inputs.publicArticleUrl as string;` - This will be `undefined` or empty string
2. **Firecrawl steps:** The external worker uses `publicArticleUrl` for article scraping - it should skip this step if no URL is provided

The worker likely already handles this, but we should verify the behavior when `articleContent` is empty throughout the pipeline prompts.

---

## Summary

| File | Change |
|------|--------|
| `supabase/functions/generate-report/index.ts` | Update validation to only require `summary` (lines 393-398) |

