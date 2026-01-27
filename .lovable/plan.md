
# Fix Report Viewer to Handle Existing Data Structure

## The Problem

The error `TypeError: i.marketSegments.map is not a function` occurs because:

- **What's stored in the database**: Raw AI-generated text strings (e.g., `marketSegments` is a long markdown/text response)
- **What the ReportViewer expects**: Structured arrays (e.g., `Array<{ name, description, size }>`)

Your existing report data is valid and complete - it just needs to be displayed correctly.

## The Solution

Update `ReportViewer.tsx` to handle both data formats:
1. Check if each field is an array or a string
2. Display strings as formatted text blocks
3. Only use `.map()` on actual arrays

**No report regeneration required - your existing data will display correctly.**

## Files to Modify

| File | Change |
|------|--------|
| `src/components/workspace/ReportViewer.tsx` | Add type guards to safely render both string and array content |

## Implementation Approach

For each section in the viewer, add a type check:

```typescript
// Before (causes error on string data):
{content.marketSegments && content.marketSegments.length > 0 && (
  <section>
    {content.marketSegments.map((segment, idx) => (
      // ...
    ))}
  </section>
)}

// After (handles both string and array):
{content.marketSegments && (
  <section>
    {Array.isArray(content.marketSegments) ? (
      // Render as structured cards
      content.marketSegments.map((segment, idx) => (...))
    ) : (
      // Render as formatted text block
      <div className="prose prose-sm max-w-none">
        <pre className="whitespace-pre-wrap">{String(content.marketSegments)}</pre>
      </div>
    )}
  </section>
)}
```

## Sections to Update

All sections need this pattern applied:

| Section | Current Field | Fix |
|---------|--------------|-----|
| Market Segments | `marketSegments` | Handle string or array |
| Competitors | `competitors` or `competitorResearch` or `existingCompetitors` | Handle string or array |
| TAM/SAM/SOM | `tam`, `sam`, `som` | Handle string or object |
| Economic Impact | `economicImpact` | Handle string or object |
| Partners | `partners` or `partnerBusinesses` | Handle string or array |
| Research Context | `researchContext` | Already handles string |

## Updated Interface Type

```typescript
interface ReportContent {
  researchContext?: string;
  
  // Can be structured array OR raw AI text
  marketSegments?: string | Array<{...}>;
  competitorResearch?: string;
  existingCompetitors?: string | Array<{...}>;
  competitors?: string | Array<{...}>;
  
  // Can be structured object OR raw AI text
  tam?: string | { value?: string; methodology?: string; sources?: string[] };
  sam?: string | { value?: string; methodology?: string; sources?: string[] };
  som?: string | { value?: string; methodology?: string; sources?: string[] };
  economicImpact?: string | { summary?: string; jobs?: string; ... };
  
  // Partner data may use different field name
  partners?: string | Array<{...}>;
  partnerBusinesses?: string;
  
  competitorTable?: string;
  citations?: Array<{...}>;
}
```

## Benefits of This Fix

1. **Immediate fix** - View your existing reports right away
2. **Backward compatible** - Works with old string-based data
3. **Forward compatible** - Will work if you later upgrade to structured data
4. **No data loss** - All your generated research content is preserved
