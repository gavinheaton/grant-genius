

# Handle Empty URL in Firecrawl Scrape - Use Summary as Fallback

## Problem

When a user generates a report without providing a Public Article URL, the pipeline fails at the `firecrawl_scrape` step because the worker-proxy rejects empty URLs:

```
Step 1 failed: scrape_article
Error: Firecrawl scrape: URL variable 'publicArticleUrl' not found in application inputs
```

---

## Solution

Modify the `handleFirecrawlScrape` function in `worker-proxy` to accept a `fallback_content` parameter. When the URL is empty but fallback content (the researcher's 100-word summary) is provided, return a successful response using that content instead of calling Firecrawl.

---

## Changes Required

### File: `supabase/functions/worker-proxy/index.ts`

**Location:** `handleFirecrawlScrape` function (lines 1145-1212)

**Before:**
```typescript
async function handleFirecrawlScrape(params: Record<string, unknown>) {
  const { url, formats } = params;

  if (!url || typeof url !== "string") {
    return errorResponse("url is required and must be a string");
  }
  // ... rest of function
}
```

**After:**
```typescript
async function handleFirecrawlScrape(params: Record<string, unknown>) {
  const { url, formats, fallback_content } = params;

  // If no URL provided but fallback content exists, use summary as article content
  if (!url || (typeof url === "string" && url.trim() === "")) {
    if (fallback_content && typeof fallback_content === "string" && fallback_content.trim()) {
      console.log(`[FIRECRAWL] No URL provided, using fallback content (${fallback_content.length} chars)`);
      return jsonResponse({
        success: true,
        url: "",
        title: "Researcher Summary",
        description: "Content derived from researcher-provided summary",
        content: fallback_content,
        metadata: {},
        source: {
          source_id: "SUMMARY-1",
          url: "",
          title: "Researcher-provided summary",
          confidence: "high",
        },
        used_fallback: true,
      });
    }
    return errorResponse("url is required (or provide fallback_content)");
  }
  // ... rest of function unchanged
}
```

---

## How It Works

1. **External Worker** calls `execute_firecrawl_scrape` with:
   - `url`: the `publicArticleUrl` (may be empty)
   - `fallback_content`: the `summary` field

2. **Worker-proxy** checks if URL is empty:
   - If empty but `fallback_content` exists → return success with summary as content
   - If empty with no fallback → return error (maintains safety)
   - If URL exists → scrape normally via Firecrawl

3. **Downstream steps** receive `{{articleContent}}` populated with either:
   - Scraped web content (if URL was provided)
   - Researcher's summary (if no URL provided)

---

## Technical Details

| Aspect | Detail |
|--------|--------|
| File | `supabase/functions/worker-proxy/index.ts` |
| Function | `handleFirecrawlScrape` |
| New parameter | `fallback_content: string` (optional) |
| Response flag | `used_fallback: true` for audit trail |

---

## Compatibility

- **External worker** needs to pass `fallback_content: inputs.summary` when calling the scrape action
- **Existing pipelines** with URLs continue to work unchanged
- **New pipelines** without URLs will gracefully use the summary

---

## Note on External Worker

The external Cloud Run worker also needs to be updated to pass `fallback_content` when calling the scrape action. This is handled outside of Lovable's codebase, but the worker-proxy change enables the behavior.

