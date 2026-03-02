

## Fix PDF Paging and DOCX Formatting Issues

### Problem 1: CSS Code Visible in DOCX
The `convertHtmlToSimpleText()` function in `generate-docx/index.ts` strips HTML tags but leaves the **content inside `<style>` blocks** as visible text. The regex `/<[^>]+>/g` removes `<style>` and `</style>` tags but not the CSS rules between them.

**Fix**: Add a pre-processing step to strip `<style>`, `<script>`, and `<head>` blocks (including their content) before any other HTML-to-text conversion.

### Problem 2: Missing Table of Contents in DOCX
The TOC code exists and runs, but the heading detection in `convertHtmlToSimpleText()` uses non-greedy `(.*?)` which fails on multi-line headings or headings containing nested HTML (e.g., `<h2><strong>Market Analysis</strong></h2>`). This means sections aren't recognized as headings, so the TOC has nothing to reference.

**Fix**: Use a more robust heading extraction that handles nested tags inside heading elements, and use `[\s\S]*?` instead of `.*?` for multi-line support.

### Problem 3: PDF Unusual Paging
The PDF HTML sent to PDFShift lacks `page-break-inside: avoid` rules, so tables and content blocks get split across pages arbitrarily.

**Fix**: Add CSS rules to prevent breaking inside tables, list items, blockquotes, and short sections. Add `page-break-before: always` for H1 headings (major sections) to create cleaner page structure.

---

### Technical Changes

**File: `supabase/functions/generate-docx/index.ts`**

1. Update `convertHtmlToSimpleText()` to strip `<style>`, `<script>`, and `<head>` blocks before processing:
```typescript
// Strip style, script, and head blocks entirely (content + tags)
text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
```

2. Fix heading regex to handle nested HTML inside headings:
```typescript
text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, inner) => `## ${inner.replace(/<[^>]+>/g, '').trim()}\n\n`);
text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, inner) => `### ${inner.replace(/<[^>]+>/g, '').trim()}\n\n`);
text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, inner) => `#### ${inner.replace(/<[^>]+>/g, '').trim()}\n\n`);
```

**File: `supabase/functions/generate-pdf/index.ts`**

3. Add page-break CSS rules to the report HTML template (both the `reportHtml` path and legacy path):
```css
table { page-break-inside: avoid; }
tr { page-break-inside: avoid; }
blockquote { page-break-inside: avoid; }
.report-content h1, .report-content h2, .report-content h3 {
  page-break-after: avoid;
}
ul, ol { page-break-inside: avoid; }
section { page-break-inside: avoid; }
```

This adds `page-break-inside: avoid` to tables, blockquotes, lists, and sections so PDFShift won't split them across pages. `page-break-after: avoid` on headings ensures a heading won't appear alone at the bottom of a page.

---

### Files Modified
- `supabase/functions/generate-docx/index.ts` -- Fix CSS leak and heading parsing
- `supabase/functions/generate-pdf/index.ts` -- Add page-break CSS rules

No database changes required. Both edge functions will auto-deploy.
