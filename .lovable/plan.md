

## Fix: Citation Lint False Positive on DOI Fragments

### Problem
The citation linter's "Naked source ID" regex pattern (`/\bS\d+-\d+\b/gi`) is matching DOI substrings like `s41560-023` from academic journal references (e.g., `doi.org/10.1038/s41560-023-01234-5`). This causes valid reports with proper academic citations to be rejected with a 400 error.

### Root Cause
Line 645 in `worker-proxy/index.ts`:
```
{ pattern: /\bS\d+-\d+\b(?!["'])/gi, name: 'Naked source ID S0-1' }
```
This pattern is too broad -- it catches any `S` followed by digits-dash-digits, which is a common DOI format (Nature journals use identifiers like `s41560`, `s41586`, etc.).

### Fix

**File: `supabase/functions/worker-proxy/index.ts`** (line 645)

Update the naked source ID pattern to exclude matches that appear inside URLs or DOI strings. Two changes:

1. Add a negative lookbehind to skip matches preceded by `/` or `.` (which indicates a URL/DOI context like `10.1038/s41560-023`)
2. Tighten the pattern to only match the internal marker format: short prefix (1-2 digits), not long journal-style identifiers (5+ digits)

Replace:
```typescript
{ pattern: /\bS\d+-\d+\b(?!["'])/gi, name: 'Naked source ID S0-1' },
```

With:
```typescript
{ pattern: /(?<![\/\.])\bS\d{1,2}-\d{1,3}\b(?!["'\d])/gi, name: 'Naked source ID S0-1' },
```

This ensures:
- `S0-1`, `S1-12`, `S12-3` (internal markers) are still caught
- `s41560-023` (DOI fragments) are excluded because they have 5 digits and are typically preceded by `/` in URLs
- The negative lookbehind `(?<![\/\.])` adds an extra safety layer for URL contexts

### No other files need changes
This is a single-line regex fix in the worker-proxy linter.

