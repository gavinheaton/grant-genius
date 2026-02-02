# Completed: DOCX Generation Tables Format Fix

**Status**: ✅ Implemented and deployed

## Summary

Fixed the DOCX generation error `(assembledReport.tables || []).filter is not a function` that occurred when exporting recovered reports.

## Changes Made

### File: `supabase/functions/generate-docx/index.ts`

1. **Updated `AssembledReport` interface** - Now supports both array and object formats for tables:
   ```typescript
   tables?: TableArrayItem[] | Record<string, string>;
   ```

2. **Added helper functions**:
   - `formatTableId()` - Converts "market_sizing" → "Market Sizing"
   - `mapTableIdToSection()` - Maps table IDs to expected section names
   - `normalizeTables()` - Converts object format to array format
   - `parseHtmlTableRows()` - Parses HTML table into 2D array
   - `buildTableFromHtml()` - Creates Word table from HTML string

3. **Updated `buildDocument()`**:
   - Uses `normalizeTables()` to handle both formats
   - Filters for tables with columns/rows OR html content
   - Builds tables using appropriate method based on data format

## Testing

1. Navigate to a recovered report
2. Click "Export DOCX"
3. Verify document generates with tables included
