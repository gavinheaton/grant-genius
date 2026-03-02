

## Fix Reference Validation Timeouts and Improve Dead Link Handling

### Root Cause

The `run-claude-report` edge function is timing out because it runs two heavy operations sequentially within a single edge function invocation:
1. Claude API call (~60-120 seconds)
2. `validate-references` call (~30-60 seconds for scraping + AI)

Edge functions have a ~150s wall-clock limit, and the combined time frequently exceeds this. The logs confirm: `Http: connection closed before message completed` (504 timeout on `run-claude-report`).

Additionally, even when validation partially completes, dead/404 links are only *flagged* with a superscript label but the broken URLs remain clickable -- users still land on 404 pages.

### Solution: Decouple Validation from Generation

Split the flow so `run-claude-report` saves the report immediately after Claude responds, then triggers validation asynchronously. The validation function updates the saved report in-place when it completes.

```text
run-claude-report:
  Claude API call --> Save report (unvalidated) --> Mark run complete
       |
       +--> Fire-and-forget call to validate-references
                 |
                 +--> Scrape URLs (reduced to 15 max, 5s timeout)
                 +--> AI verify reachable refs
                 +--> Patch report HTML in DB
                 +--> Log validation summary
```

### Technical Changes

**1. `supabase/functions/run-claude-report/index.ts`**

- Save the report immediately after Claude responds (move report save before validation)
- Call `validate-references` as fire-and-forget (don't await the response)
- Pass the `report_id` to `validate-references` so it can update the saved report directly
- Mark the run as `completed` without waiting for validation
- Remove the validation step tracking from the synchronous flow

**2. `supabase/functions/validate-references/index.ts`**

- Accept optional `report_id` parameter for async updates
- When `report_id` is provided, update the report's `content_json` directly in the database after validation
- Reduce `MAX_URLS` from 30 to 15 to stay within edge function limits
- Use simple `HEAD` requests (2s timeout) for initial reachability before Firecrawl scraping -- only scrape URLs that respond to HEAD
- Add a 45-second overall timeout guard to ensure the function always completes
- Replace dead link `href` attributes with `javascript:void(0)` and add strikethrough styling so users can't click through to 404 pages
- For unverified links, keep the URL but add a clear visual warning

**3. `src/hooks/useVirtualProgress.ts`**

- Remove the "Validating references" and "Checking sources" phases from the synchronous progress bar
- Add a post-completion phase: "Enhancing references..." that shows briefly after report is saved (cosmetic -- the report is already viewable)

### Dead Link Handling (Improved)

Currently, dead links get a tiny superscript `[Link unavailable]` but the anchor still points to the broken URL. The fix will:
- Replace the `href` with `#` on dead links
- Add `style="text-decoration: line-through; color: #999;"` to dead link anchors
- Keep the citation text visible but clearly marked as unavailable
- The "Unverified References" appendix remains for transparency

### Edge Cases

- If `validate-references` fails or times out, the report is already saved and accessible -- validation is purely additive
- A `validated_at` timestamp field in `content_json` lets the UI show "References checked" vs "References pending" status
- If the user views the report before validation completes, they see the raw Claude output (functional, just unvalidated)

### No Database Schema Changes Required

All validation data is stored in the existing `content_json` JSONB column on the `reports` table.

