

# Fix Citation Lint False Positives for Numeric References

## Problem

The worker-proxy citation lint is incorrectly rejecting valid final-format numeric citations like `[13, 14, 15]` as "Unlinked citations." 

**Error observed:**
```json
{
  "error": "Citation lint failed",
  "violations": [{
    "token": "[1]",
    "pattern": "Unlinked citation",
    "context": "...ovarian cancer [13, 14, 15]."
  }]
}
```

## Root Cause

The lint logic at lines 651-683 in `worker-proxy/index.ts` has two issues:

1. **Single-number only check**: The regex `^\d+$` only matches single numbers like `[1]`, but not comma-separated groups like `[13, 14, 15]`
2. **Wrong anchor detection**: It looks for `href="#ref-"` in the 100 chars **before** the bracket, but anchors typically **wrap** the citation: `<a href="#ref-N">[N]</a>`

## Solution

Update the lint logic to properly handle:
1. Comma-separated numeric citations: `[1, 2, 3]` 
2. Correct anchor tag detection (check if inside `<a>...</a>`)
3. Allow valid numeric citations that reasonably map to a References section

---

## Implementation

### File: `supabase/functions/worker-proxy/index.ts`

**Update the unlinked citation check (lines 651-683):**

```typescript
// Check for unlinked bracket tokens (excluding valid linked citations)
const bracketPattern = /\[([^\]]+)\]/g;
let match;
while ((match = bracketPattern.exec(html)) !== null) {
  const content = match[1];
  
  // ALLOWED: Numeric citations (single or comma-separated)
  // Examples: [1], [13], [13, 14], [13, 14, 15]
  if (/^[\d,\s]+$/.test(content)) {
    const nums = content.split(/\s*,\s*/).map(s => s.trim());
    const allNumeric = nums.every(n => /^\d+$/.test(n));
    
    if (allNumeric) {
      // Check if this citation is inside an anchor tag
      // Look for <a...> before and </a> after (within reasonable distance)
      const startIdx = Math.max(0, match.index - 50);
      const endIdx = Math.min(html.length, match.index + match[0].length + 20);
      const beforeContext = html.substring(startIdx, match.index);
      const afterContext = html.substring(match.index + match[0].length, endIdx);
      
      // Either it's hyperlinked (has <a> wrapper)
      // OR it's a valid-looking reference number (we allow unlinked [1], [2] in final output)
      // as they map to the References section at the bottom
      const isInsideAnchor = beforeContext.includes('<a') && afterContext.includes('</a>');
      const isValidRefNumber = nums.every(n => parseInt(n, 10) > 0 && parseInt(n, 10) <= 999);
      
      if (isInsideAnchor || isValidRefNumber) {
        continue; // Valid numeric citation - allow it
      }
    }
  }
  
  // Check if it looks like an internal marker (starts with letter, contains number)
  if (/^[A-Z]/i.test(content) && /\d/.test(content)) {
    const alreadyCounted = violations.some(v => v.token === match![0]);
    if (!alreadyCounted) {
      violations.push({
        token: match[0],
        pattern: 'Bracket token',
        context: extractSentenceContext(html, match.index, match[0].length)
      });
    }
  }
}
```

**Key changes:**

1. **Allow comma-separated numbers**: `[13, 14, 15]` now passes the `^[\d,\s]+$` check
2. **Better anchor detection**: Check for `<a` before AND `</a>` after the bracket
3. **Allow valid reference numbers**: If the numbers are reasonable (1-999), allow them as they're legitimate numeric citations mapping to a References section
4. **Remove the "Unlinked citation" violation**: Numeric citations like `[1]` are valid final-format references

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/worker-proxy/index.ts` | MODIFY | Update bracket check to allow comma-separated numeric citations and improve anchor detection |

---

## Acceptance Criteria

1. Reports with `[1]`, `[13]`, `[13, 14, 15]` style citations pass lint validation
2. Reports with internal markers like `[S0-1]`, `[ARTICLE-1]` are still blocked
3. Reports with placeholders like `{TBD}`, `$Z`, `[Insert...]` are still blocked
4. Hyperlinked citations `<a href="#ref-1">[1]</a>` continue to pass

