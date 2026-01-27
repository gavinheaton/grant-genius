

# Fix PDFShift Timeout Error

## The Problem

The error from PDFShift is:
```json
{"success":false,"error":"The requested page took too long to load.","code":400}
```

This occurs because the HTML includes an external Google Fonts link that PDFShift tries to load:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter..." rel="stylesheet">
```

PDFShift waits for all external resources to load before rendering, and if the font fetch takes too long (or fails), the entire conversion times out.

## The Solution

There are two approaches to fix this:

### Option A: Inline Font Loading (Recommended)
Use a web-safe font stack as a fallback and inline CSS for fonts that don't require external loading. This is more reliable and faster.

### Option B: Configure PDFShift Wait Options
PDFShift has options to control waiting behavior:
- `wait_for_status`: Wait for specific HTTP status instead of full page load
- `sandbox`: Disable loading external resources

## Recommended Fix

Update the `generate-pdf` edge function to:

1. **Remove the external Google Fonts link** from the HTML head
2. **Use web-safe font fallbacks** that work without network requests
3. **Optionally embed base64-encoded fonts** if custom fonts are required

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/generate-pdf/index.ts` | Remove Google Fonts dependency, use web-safe fallbacks |

## Implementation Details

### Change 1: Update Font Handling in buildHtml()

Remove the Google Fonts `<link>` tag and update the font-family CSS to use a web-safe stack:

```typescript
// Before (causes timeout)
const fontUrl = `https://fonts.googleapis.com/css2?family=${template.font_family.replace(/ /g, "+")}...`;
// ... 
<link href="${fontUrl}" rel="stylesheet">

// After (web-safe fallback)
// No external font link needed
// Use font stack that includes template font as first choice with fallbacks
```

### Change 2: Create Font Stack Mapping

Create a mapping from template fonts to safe font stacks:

```typescript
function getFontStack(fontFamily: string): string {
  const fontStacks: Record<string, string> = {
    "Inter": "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "Roboto": "Roboto, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "Open Sans": "'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    "Lato": "Lato, -apple-system, BlinkMacSystemFont, sans-serif",
    "Montserrat": "Montserrat, -apple-system, BlinkMacSystemFont, sans-serif",
    "Source Sans Pro": "'Source Sans Pro', -apple-system, sans-serif",
    "Nunito": "Nunito, -apple-system, BlinkMacSystemFont, sans-serif",
    "Merriweather": "Merriweather, Georgia, 'Times New Roman', serif",
    "Playfair Display": "'Playfair Display', Georgia, serif",
  };
  return fontStacks[fontFamily] || `'${fontFamily}', sans-serif`;
}
```

### Change 3: Update PDFShift API Call

Add options to disable waiting for network idle:

```typescript
const pdfResponse = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
  method: "POST",
  headers: {
    Authorization: `Basic ${btoa("api:" + PDFSHIFT_API_KEY)}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    source: htmlContent,
    landscape: false,
    format: template.page_format,
    use_print: true,
    sandbox: true,  // Disable loading external resources
  }),
});
```

### Alternative: Embed Google Fonts as Base64

If custom fonts are essential, we can:
1. Pre-download the most common font variants (Regular, Bold)
2. Store them as base64 in the edge function
3. Inline them as `@font-face` rules

However, this significantly increases the function size and complexity. The web-safe fallback approach is simpler and more reliable.

## Summary of Changes

The edge function will be updated to:
1. Remove the external Google Fonts `<link>` tag
2. Use a font stack with the template font as first choice and system fonts as fallbacks
3. Add `sandbox: true` to the PDFShift call to prevent external resource loading
4. The PDF will render using system fonts that visually match the selected font family

This approach trades exact font matching for reliability and speed. Since most system fonts closely match the popular Google Fonts (e.g., Inter ≈ SF Pro, Roboto ≈ system sans-serif), the visual difference is minimal.

