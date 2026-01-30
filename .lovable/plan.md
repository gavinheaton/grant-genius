

# Fix JSON Fence Parsing for Report Content

## Problem

The Replit worker returns report content wrapped in ` ```json ` code fences, but:
1. Sometimes the closing ` ``` ` fence is missing (output truncation)
2. The current regex requires exact fence format: `^```json?\s*\n([\s\S]*?)\n```\s*$`

This causes the parser to fail and fall back to treating raw JSON as markdown, which displays the literal `{` and `"report_markdown":` text to the user.

## Solution

Update `extractHtmlFromSectionContent()` in `htmlReportUtils.ts` to be more forgiving:

1. **Strip opening fence if present** - Handle ` ```json\n ` at the start even without closing fence
2. **Try to extract valid JSON** - Use a more flexible approach to find and parse JSON content
3. **Handle incomplete JSON gracefully** - If the JSON is truncated, extract what we can

## Implementation

### File: `src/lib/htmlReportUtils.ts`

Update `extractHtmlFromSectionContent()` function (lines 52-89):

```typescript
function extractHtmlFromSectionContent(content: string): string | null {
  if (!content || typeof content !== "string") return null;
  
  let trimmed = content.trim();
  
  // Case 1: Already HTML (starts with < tag)
  if (trimmed.startsWith("<")) {
    return trimmed;
  }
  
  // Case 2: Code-fenced content - strip fences regardless of completeness
  // Handle ```json or ```json\n at the start
  if (trimmed.startsWith("```")) {
    // Remove opening fence (```json or ```)
    trimmed = trimmed.replace(/^```json?\s*\n?/, "");
    // Remove closing fence if present
    trimmed = trimmed.replace(/\n?```\s*$/, "");
    trimmed = trimmed.trim();
  }
  
  // Case 3: Try to parse as JSON (with or without fences)
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      
      if (parsed.report_html && typeof parsed.report_html === "string") {
        return parsed.report_html;
      }
      if (parsed.html && typeof parsed.html === "string") {
        return parsed.html;
      }
      if (parsed.report_markdown && typeof parsed.report_markdown === "string") {
        return convertMarkdownToHtml(parsed.report_markdown);
      }
    } catch {
      // JSON parse failed - try to extract markdown field with regex
      const markdownMatch = trimmed.match(/"report_markdown"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/);
      if (markdownMatch?.[1]) {
        // Unescape JSON string escapes
        const markdown = markdownMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
        return convertMarkdownToHtml(markdown);
      }
    }
  }
  
  // Case 4: Plain markdown content - convert it
  return convertMarkdownToHtml(trimmed);
}
```

### Key Changes

| Issue | Fix |
|-------|-----|
| Fence regex too strict | Use simple `replace()` calls to strip fences |
| Missing closing fence | Strip opening fence independently of closing |
| Truncated JSON | Fall back to regex extraction of `report_markdown` field |
| Escaped newlines in markdown | Unescape `\n`, `\"`, `\\` when extracting via regex |

## Files Changed

| File | Change |
|------|--------|
| `src/lib/htmlReportUtils.ts` | Update `extractHtmlFromSectionContent()` to handle incomplete JSON fences |

## Testing

After implementation:
1. The existing report should now render correctly
2. Future reports with proper JSON should continue to work
3. Truncated reports will show as much content as can be extracted

