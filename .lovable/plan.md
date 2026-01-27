
# Fix AI-Generated Table Layout in Reports

## Problem Identified

When the AI generates tables (particularly in the competitor comparison step), they are output as **markdown table syntax**:

```
| Feature | Our Solution | Competitor 1 | Competitor 2 |
|---------|--------------|--------------|--------------|
| Price   | $100         | $150         | $200         |
```

However, both the **ReportViewer** (in-app view) and **PdfReportRenderer** (PDF export) display this as raw text with `whitespace-pre-wrap`, resulting in poorly formatted, hard-to-read tables.

## Solution Overview

Add markdown table parsing to convert table syntax into proper HTML `<table>` elements for both viewing contexts.

## Implementation Details

### 1. Create a Markdown Table Parser Utility

Create a shared utility function that detects and parses markdown tables:

```text
Location: src/lib/markdownUtils.ts (new file)

Function: parseMarkdownTables(content: string): string
- Detect markdown table patterns using regex
- Parse header row, separator row, and data rows
- Generate styled HTML <table> with proper <thead> and <tbody>
- Handle alignment indicators (:--- left, :--: center, ---: right)
- Return content with tables converted to HTML
```

### 2. Update ReportViewer Component

Modify `src/components/workspace/ReportViewer.tsx`:

```text
Changes to TextContent component:
- Import the parseMarkdownTables utility
- Apply table parsing before rendering
- Add CSS styles for rendered tables within prose container
```

The TextContent component will transform markdown tables into styled HTML tables that match the application's design system.

### 3. Update PdfReportRenderer Component

Modify `src/components/workspace/PdfReportRenderer.tsx`:

```text
Changes to formatContent function:
- Import/include the table parsing logic
- Convert markdown tables to styled HTML tables before other transformations
- Apply inline styles for PDF compatibility (borders, padding, colors)
```

### 4. Table Styling Approach

For in-app viewing (ReportViewer):
```text
- Use Tailwind/shadcn table styles
- Responsive with horizontal scroll on small screens
- Alternating row colors for readability
- Sticky headers for long tables
```

For PDF export (PdfReportRenderer):
```text
- Inline styles for html2canvas compatibility
- Clear borders and cell padding
- Primary color for header background
- Sufficient contrast for print
```

## Technical Implementation

### Markdown Table Parser Logic

```text
Pattern to match:
1. Header row: | Column1 | Column2 | Column3 |
2. Separator:  |---------|---------|---------|
3. Data rows:  | Data1   | Data2   | Data3   |

Algorithm:
1. Split content by lines
2. Identify table blocks (consecutive lines starting with |)
3. Parse header from first line
4. Skip separator line (contains only |, -, :, spaces)
5. Parse data rows
6. Generate HTML table structure
7. Replace original markdown with HTML
```

### File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/lib/markdownUtils.ts` | CREATE | Markdown table parser utility |
| `src/components/workspace/ReportViewer.tsx` | MODIFY | Apply table parsing to TextContent |
| `src/components/workspace/PdfReportRenderer.tsx` | MODIFY | Add table parsing to formatContent |

### Sample Output

Before (raw markdown in UI):
```
| Feature | Our Solution | Competitor A |
|---------|--------------|--------------|
| Price   | $100         | $150         |
```

After (rendered HTML table):

| Feature | Our Solution | Competitor A |
|---------|--------------|--------------|
| Price   | $100         | $150         |

## Edge Cases to Handle

1. **Tables with alignment markers** (`:---`, `:---:`, `---:`)
2. **Tables embedded in paragraphs** (text before/after)
3. **Empty cells** in tables
4. **Bold/italic text inside cells** (`**bold**`, `*italic*`)
5. **Multiple tables in same content block**
6. **Malformed tables** (uneven columns) - graceful fallback

## Additional Improvements

1. **Better visual hierarchy** for complex tables
2. **Zebra striping** for easier row scanning
3. **Responsive design** with horizontal scroll wrapper
4. **Header highlighting** using template colors in PDF
