

# Fix: Safeguard Against AI Code Fence Outputs

## Problem

The AI model sometimes wraps its JSON output in markdown code fences (`\`\`\`json ... \`\`\``), which breaks JSON parsing in both the frontend report viewer and DOCX generation.

The current stripping logic exists in two places but has gaps:
- Only handles `json` or no language tag (misses `JSON`, `html`, etc.)
- Regex patterns may fail on truncated/malformed fences
- No centralized sanitization at the data layer

## Solution: Multi-Layer Defense

Apply code fence stripping at **three levels** for robust handling:

| Layer | Location | Purpose |
|-------|----------|---------|
| 1. Backend | `worker-proxy` | Sanitize as data is saved |
| 2. Frontend | `htmlReportUtils.ts` | Improve regex patterns |
| 3. DOCX | `generate-docx` | Already has basic handling |

## Changes

### 1. Add Sanitization Helper to `worker-proxy/index.ts`

Create a reusable `stripCodeFences` function and apply it in:
- `handleUpdateStep` - when saving step outputs
- `handleSaveReport` - when saving final report

```text
// New helper function
function stripCodeFences(content: string): string {
  if (!content || typeof content !== "string") return content;
  
  let trimmed = content.trim();
  
  // Handle opening fence: ```json, ```JSON, ```html, ``` etc.
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```[a-zA-Z]*\s*\n?/, "");
  }
  
  // Handle closing fence (may be truncated/incomplete)
  trimmed = trimmed.replace(/\n?```\s*$/, "");
  
  return trimmed.trim();
}
```

Apply to string fields in `outputs_json` before saving.

### 2. Improve Frontend `htmlReportUtils.ts`

Update the regex patterns to be more permissive:

**Current:**
```javascript
trimmed.replace(/^```json?\s*\n?/, "")
```

**Improved:**
```javascript
trimmed.replace(/^```[a-zA-Z]*\s*\n?/, "")  // Any language tag
```

Also add fallback handling for truncated closing fences.

### 3. Update `generate-docx/index.ts`

Apply the same improved regex pattern to `parseJsonFromSection`.

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/worker-proxy/index.ts` | Add `stripCodeFences` helper, apply to step outputs and report content |
| `src/lib/htmlReportUtils.ts` | Improve regex to handle any language tag |
| `supabase/functions/generate-docx/index.ts` | Improve regex pattern |

## Technical Details

### `stripCodeFences` Implementation

```javascript
function stripCodeFences(content: unknown): unknown {
  // Handle string content
  if (typeof content === "string") {
    let trimmed = content.trim();
    
    // Opening fence with any language tag (json, JSON, html, etc.)
    if (trimmed.startsWith("```")) {
      trimmed = trimmed.replace(/^```[a-zA-Z]*\s*\n?/, "");
    }
    
    // Closing fence (may be truncated)
    trimmed = trimmed.replace(/\n?```\s*$/, "");
    
    return trimmed.trim();
  }
  
  // Handle object - recursively clean string values
  if (typeof content === "object" && content !== null) {
    if (Array.isArray(content)) {
      return content.map(item => stripCodeFences(item));
    }
    
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(content)) {
      cleaned[key] = stripCodeFences(value);
    }
    return cleaned;
  }
  
  return content;
}
```

### Where It's Applied

1. **`handleUpdateStep`**: Before saving `outputs_json`
2. **`handleSaveReport`**: Before saving `content_json`
3. **Frontend parsing**: As backup if data wasn't sanitized

## Success Criteria

1. Reports with `\`\`\`json` wrapped output render correctly
2. DOCX exports work without code fence artifacts
3. New reports are saved without code fences in database
4. Legacy data with code fences still works (frontend handles it)

