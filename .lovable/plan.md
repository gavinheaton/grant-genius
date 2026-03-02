

## Add Post-Generation Reference Validation to Claude Reports

### Problem
Claude's single-prompt reports contain hallucinated or outdated URLs in the references section. There is no verification step before the report is saved and delivered to the user.

### Solution
Add a two-phase reference validation step between Claude's response and report save, using Firecrawl (already connected) and Gemini (via Lovable AI, no extra key needed).

### Architecture

```text
Claude generates report HTML
        |
  [Phase 1] Extract all URLs from HTML
        |
  [Phase 2] Validate each URL via Firecrawl scrape
        |
  [Phase 3] AI review: compare cited claims vs actual page content
        |
  [Phase 4] Patch HTML -- remove/flag invalid refs, update reference list
        |
  Save validated report
```

### Technical Changes

**New edge function: `supabase/functions/validate-references/index.ts`**

Accepts `{ report_html: string, report_run_id: string }` and returns `{ validated_html: string, validation_summary: object }`.

Logic:
1. Parse HTML, extract all anchor hrefs and reference list URLs
2. For each URL (up to ~30, with 5s timeout per request):
   - Call Firecrawl scrape endpoint to fetch page content
   - If Firecrawl returns error/404/timeout, mark as "dead"
3. Send a batch to Gemini (google/gemini-2.5-flash via Lovable AI) with the citation context and the scraped page snippet, asking:
   - Does this URL support the claim made in the report? (yes/partially/no)
   - Is this a real, current source? (yes/no)
4. For dead or hallucinated references:
   - Replace the in-text citation with "[Source not verified]"
   - Move to a "Unverified References" appendix at the end
   - Log each flagged reference
5. Return patched HTML + summary (total refs, verified count, flagged count)

**Modified: `supabase/functions/run-claude-report/index.ts`**

After receiving Claude's response (line ~279), before saving the report (line ~293):
1. Update progress: "Validating references..."
2. Call `validate-references` function
3. Use the validated HTML instead of raw Claude output
4. Store validation summary in `content_json` alongside `report_html`
5. Update `total_steps` from 1 to 2 and track step progress for the validation phase

**Modified: `src/hooks/useVirtualProgress.ts`**

Add a "Validating References" phase to the virtual progress display so users see what's happening during the extra processing time.

### Edge Cases
- If Firecrawl is rate-limited or unavailable, the validation step degrades gracefully -- references are kept but marked as "unverified" rather than blocking the entire report
- URLs behind paywalls will be marked as "access restricted -- unable to verify" rather than flagged as hallucinated
- Maximum of 30 URLs validated per report to keep execution time reasonable (est. 30-60 seconds for the validation pass)

### Config.toml Addition
```toml
[functions.validate-references]
verify_jwt = false
```

### No Database Changes Required
Validation summary is stored in the existing `content_json` JSONB column on the `reports` table.
