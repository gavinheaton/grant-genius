

# Enable PDF Table of Contents + Add DOCX Native ToC

## Summary

Implement Table of Contents support for both PDF and DOCX exports. The PDF ToC toggle already exists in the admin UI and backend - we just need to verify it works correctly. For DOCX, we need to add native Word TableOfContents generation using the `docx` library's built-in class.

## Current State Analysis

| Feature | Current State | Required Action |
|---------|---------------|-----------------|
| PDF ToC Admin Toggle | Exists in UI (lines 600-611 of PDFTemplateForm.tsx) | Already working - just needs enabling |
| PDF ToC Generation | Implemented in generate-pdf (lines 188-198) | Already working |
| DOCX ToC | Not implemented | Add `TableOfContents` class |

## Implementation Plan

### Option A: PDF Table of Contents (Already Available)

**Status: DONE** - The PDF ToC is already fully implemented:

1. **Admin Toggle**: In `PDFTemplateForm.tsx` lines 600-611 under "Layout Options" section
   - Switch for "Include Table of Contents"
   - Description: "Auto-generate TOC from sections"

2. **Backend Generation**: In `generate-pdf/index.ts` lines 188-198
   - Builds TOC HTML from sections array
   - Includes numbered links to each section
   - Adds page break after TOC

**To Enable**: Go to Admin → PDF Templates → Layout Options → Toggle "Include Table of Contents" ON

---

### Option C: DOCX Native Table of Contents

**File: `supabase/functions/generate-docx/index.ts`**

#### Step 1: Import TableOfContents from docx library

Add to existing imports (line 3-19):

```typescript
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  PageBreak,
  BorderStyle,
  convertInchesToTwip,
  LevelFormat,
  ILevelsOptions,
  ShadingType,
  TableOfContents,  // ADD THIS
} from "https://esm.sh/docx@8.5.0";
```

#### Step 2: Add ToC generation function

Add new function after `buildDataGaps` (around line 673):

```typescript
// Build Table of Contents for Word document
function buildTableOfContents(): (Paragraph | TableOfContents)[] {
  const elements: (Paragraph | TableOfContents)[] = [];

  // Title for the TOC page
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Table of Contents",
          bold: true,
          size: STYLES.fontSize.h1,
          color: STYLES.primaryColor,
        }),
      ],
      spacing: { before: 200, after: 400 },
    })
  );

  // Native Word Table of Contents field
  // This creates a TOC that Word can update automatically
  elements.push(
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",  // Include H1, H2, H3
      stylesWithLevels: [
        { styleName: "Heading1", level: 1 },
        { styleName: "Heading2", level: 2 },
        { styleName: "Heading3", level: 3 },
      ],
    })
  );

  // Instruction paragraph
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Right-click and select 'Update Field' to refresh page numbers",
          size: STYLES.fontSize.body - 2,
          color: "888888",
          italics: true,
        }),
      ],
      spacing: { before: 200, after: 200 },
    })
  );

  // Page break after TOC
  elements.push(new Paragraph({ children: [new PageBreak()] }));

  return elements;
}
```

#### Step 3: Update buildDocument function to include ToC

Modify the `buildDocument` function (around line 858-905) to insert ToC after cover page:

```typescript
// Before: (around line 903-904)
// Page break after cover
children.push(new Paragraph({ children: [new PageBreak()] }));

// After:
// Page break after cover
children.push(new Paragraph({ children: [new PageBreak()] }));

// Add Table of Contents
children.push(...buildTableOfContents());
```

#### Step 4: Ensure heading styles are set correctly

The existing code already uses `HeadingLevel.HEADING_1`, `HEADING_2`, `HEADING_3` (lines 914-919), which the ToC will pick up automatically.

---

## Technical Details

### How Word ToC Works

The `docx` library's `TableOfContents` creates a native Word TOC field that:
1. **Hyperlinks**: Each entry links to the section in the document
2. **Auto-detection**: Scans for Heading1, Heading2, Heading3 styles
3. **Updatable**: User can right-click → Update Field to refresh page numbers
4. **Native formatting**: Uses Word's built-in TOC styling

### Configuration Options

```typescript
new TableOfContents("Table of Contents", {
  hyperlink: true,              // Make entries clickable
  headingStyleRange: "1-3",     // Include heading levels 1-3
  stylesWithLevels: [           // Map styles to TOC levels
    { styleName: "Heading1", level: 1 },
    { styleName: "Heading2", level: 2 },
    { styleName: "Heading3", level: 3 },
  ],
})
```

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/generate-docx/index.ts` | MODIFY | Import TableOfContents, add buildTableOfContents function, insert ToC after cover page |

---

## User Experience

### PDF Export
1. Admin enables ToC in Admin → PDF Templates → Layout Options
2. Users download PDF with automatic Table of Contents after cover page
3. Each section is numbered and hyperlinked

### DOCX Export  
1. User downloads DOCX file
2. Table of Contents appears after cover page
3. In Microsoft Word, user can right-click ToC → "Update Field" to populate page numbers
4. Entries are hyperlinked to sections

---

## Acceptance Criteria

1. **PDF ToC**: When enabled in admin, PDF exports include a Table of Contents after the cover page
2. **DOCX ToC**: All DOCX exports include a native Word Table of Contents
3. **ToC entries**: Both ToC types include all major report sections (H1, H2, H3)
4. **Hyperlinks**: Entries are clickable and navigate to the section
5. **Page numbers**: DOCX ToC shows "right-click to update" hint; Word populates page numbers on update

