

# Fix: Update `ip_landscape_review` Prompt to Prevent Placeholder Tokens

## Problem

Step 5 (`ip_landscape_review`) failed with:
```
JSON Guard failed after 3 attempts: Contains placeholder token: [Specific Biologic/Target]
```

The AI returned placeholder brackets like `[Specific Biologic/Target]` instead of actual data because the prompt lacks explicit output format instructions.

## Root Cause

Current prompt (only 2 sentences):
```
Search for existing patents and IP filings related to {{summary}}. Identify the 'freedom to operate' landscape and cite key patent families that currently dominate this field. If relevant, cite recent Australian IP trends in this specific NRF priority sector.
```

Compare to Step 4 (`competitor_and_alternative_benchmarking`) which has explicit rules:
- URL requirements with validation rules
- Fallback search instructions  
- "DO NOT include that competitor" if data is missing

Step 5 needs similar explicit constraints.

## Solution

Update the `ip_landscape_review` prompt with:
1. **Explicit output structure** defining expected fields
2. **Placeholder prohibition rule** forbidding `[brackets]` or `{curly braces}` in output
3. **Fallback handling** for when specific data isn't available
4. **URL/source requirements** for patent citations

## Updated Prompt Template

```text
Search for existing patents and IP filings related to {{summary}}. Identify the 'freedom to operate' landscape and cite key patent families that currently dominate this field.

OUTPUT FORMAT (STRICT JSON):
Return a JSON object with these fields:
- key_patent_families: Array of patent objects with { title, patent_number, assignee, jurisdiction, url, relevance }
- freedom_to_operate: Object with { assessment, risk_level, key_blocking_patents, white_space_opportunities }
- australian_ip_trends: Object with { trend_summary, recent_filings_count, key_players, source_url }
- ip_strategy_recommendations: Array of recommendation strings

CRITICAL OUTPUT RULES:

1. NO PLACEHOLDER TOKENS ALLOWED
   - NEVER output brackets like [Specific Biologic] or [Insert Technology]
   - NEVER output curly braces like {technology_name} or {target}
   - Use the ACTUAL technology name from {{summary}} in your responses
   - If specific data is unavailable, describe what IS known, not what should be filled in

2. UNKNOWN DATA HANDLING
   - If a patent number is unknown: Use "Patent pending" or "Application filed" with the technology description
   - If a URL is unavailable: Use the patent office search URL (e.g., https://pericles.ipaustralia.gov.au/ols/auspat/)
   - If an assignee is unknown: Use "Not disclosed" - NEVER use [Company Name]

3. SOURCE REQUIREMENTS
   - Every patent reference must have either a patent number OR a patent office search URL
   - Australian patents: Use IP Australia (ipaustralia.gov.au)
   - International patents: Use Google Patents (patents.google.com) or WIPO (wipo.int)
   - Academic IP: Use university tech transfer office URLs

4. SPECIFICITY RULE
   - Replace generic terms with specifics from the research summary
   - Bad: "Patents in [therapeutic area]"
   - Good: "Patents in CAR-T cell therapy for solid tumors"

If the technology area has limited patent activity, state this explicitly with supporting evidence rather than inventing placeholder entries.
```

## Database Update

```sql
UPDATE prompt_bundle_steps 
SET prompt_template = '[updated prompt above]'
WHERE bundle_id = '0393efea-a3c2-48f1-8087-278e7da3fbc4' 
AND step_name = 'ip_landscape_review';
```

## Technical Details

| Item | Value |
|------|-------|
| Step ID | `deb7fe6d-4333-424a-a3d9-8fa7fb60e1d7` |
| Bundle ID | `0393efea-a3c2-48f1-8087-278e7da3fbc4` |
| Step Number | 5 |

## After Implementation

1. Resume the failed report run to test the updated prompt
2. Monitor for any remaining placeholder issues in other steps

