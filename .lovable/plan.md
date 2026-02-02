

# Fix DOCX Generation for Recovered Reports (Tables Format Mismatch)

## Problem Summary

After using the "Recover Final Step" feature, DOCX export fails with:
```
(assembledReport.tables || []).filter is not a function
```

## Root Cause

**Data format mismatch between pipeline output and DOCX generator expectation:**

| Source | `tables` Format |
|--------|----------------|
| **Pipeline output** (from `build_tables_sources_html`) | Object: `{ "competitors": "<table>...", "market_sizing": "<table>...", ... }` |
| **DOCX generator expects** | Array: `[{ id, title, section, columns, rows }, ...]` |

The recovery function correctly passes through the object format from the pipeline, but the DOCX generator's `buildDocument` function calls `.filter()` on `tables`, which fails on objects.

## Solution: Update DOCX Generator to Handle Both Formats

Modify `generate-docx/index.ts` to detect and handle both table formats:

1. **Object format** (HTML strings keyed by table ID) - used by new HTML-first pipeline
2. **Array format** (structured data with columns/rows) - legacy format

### Implementation

#### File: `supabase/functions/generate-docx/index.ts`

**Step 1: Update the `AssembledReport` interface (lines 32-40)**

Add support for the object format:
```typescript
tables?: 
  | Array<{
      id?: string;
      title: string;
      section: string;
      columns?: string[];
      rows?: string[][];
      html?: string;
      markdown?: string;
    }>
  | Record<string, string>;  // Object format: { tableId: htmlString }
```

**Step 2: Add a normalizer function (new, after line 266)**

Create a function to convert object format to array format:
```typescript
// Normalize tables to array format
// Handles both object { id: htmlString } and array formats
function normalizeTables(
  tables: AssembledReport["tables"]
): Array<{ id?: string; title: string; section: string; html?: string; columns?: string[]; rows?: string[][] }> {
  if (!tables) return [];
  
  // Already an array - return as-is
  if (Array.isArray(tables)) {
    return tables;
  }
  
  // Object format: convert to array
  // { "competitors": "<table>...", "market_sizing": "<table>..." }
  return Object.entries(tables).map(([id, html]) => ({
    id,
    title: formatTableId(id),  // "competitors" -> "Competitors"
    section: mapTableIdToSection(id),  // Map to expected section
    html: html as string,
  }));
}

// Convert table ID to display title
function formatTableId(id: string): string {
  return id
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Map table ID to expected section name for insertion
function mapTableIdToSection(id: string): string {
  const sectionMap: Record<string, string> = {
    competitors: "Competitive Analysis",
    market_sizing: "Market Sizing",
    partners: "Partners",
  };
  return sectionMap[id] || formatTableId(id);
}
```

**Step 3: Update `buildDocument` (line 684)**

Replace:
```typescript
const tables = (assembledReport.tables || []).filter(t => t.columns && t.rows);
```

With:
```typescript
const normalizedTables = normalizeTables(assembledReport.tables);
// Filter for structured tables (have columns/rows) OR HTML tables
const tables = normalizedTables.filter(t => (t.columns && t.rows) || t.html);
```

**Step 4: Update table building logic (around line 771-778)**

Handle HTML tables that don't have columns/rows:
```typescript
// Insert any tables that match this section
for (let i = 0; i < tables.length; i++) {
  if (!insertedTables.has(i)) {
    const table = tables[i];
    if (sectionMatchesHeading(table.section, currentSectionName)) {
      if (table.columns && table.rows) {
        // Structured table
        children.push(...buildTable(table));
      } else if (table.html) {
        // HTML table - parse and build
        children.push(...buildTableFromHtml(table));
      }
      insertedTables.add(i);
    }
  }
}
```

**Step 5: Add HTML table parser (new function)**

Parse HTML tables into Word table elements:
```typescript
// Build Word table from HTML table string
function buildTableFromHtml(
  tableData: { id?: string; title: string; html?: string }
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  if (tableData.title) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: tableData.title,
            bold: true,
            size: STYLES.fontSize.h3,
          }),
        ],
        spacing: { before: 240, after: 120 },
      })
    );
  }

  if (!tableData.html) return elements;

  // Parse HTML table to extract rows and cells
  const rows = parseHtmlTableRows(tableData.html);
  if (rows.length === 0) return elements;

  const tableRows: TableRow[] = rows.map((row, rowIndex) => {
    const isHeader = rowIndex === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: row.map(cellText =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: cellText,
                  bold: isHeader,
                  size: STYLES.fontSize.body,
                }),
              ],
            }),
          ],
          shading: isHeader
            ? { fill: STYLES.headerColor, type: ShadingType.SOLID }
            : undefined,
        })
      ),
    });
  });

  elements.push(
    new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      // ... borders config
    })
  );

  elements.push(new Paragraph({ spacing: { after: 200 } }));

  return elements;
}

// Parse HTML table into 2D array of cell text
function parseHtmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  
  // Match all table rows
  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  
  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    
    // Match all cells (th or td)
    const cellMatches = rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi);
    
    for (const cellMatch of cellMatches) {
      // Strip HTML tags from cell content
      const cellText = cellMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
      cells.push(cellText);
    }
    
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  
  return rows;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-docx/index.ts` | Update interface, add normalizer, add HTML table parser, update buildDocument |

---

## Expected Outcome

After implementation:
1. Reports recovered via "Recover Final Step" will generate DOCX correctly
2. Both old (array) and new (object) table formats will be handled
3. HTML tables will be parsed and converted to Word tables

---

## Testing

1. Use an existing recovered report (one that currently fails DOCX export)
2. Click "Export DOCX"
3. Verify document generates successfully with tables included
4. Verify table content is readable and formatted properly

