
# Fix PDF Generation - Include Full Report Content

## Problem Identified

The PDF is only showing the cover page because the `PdfReportRenderer` component is looking for field names that don't match the actual data structure in `content_json`.

### Field Name Mismatch

| PdfReportRenderer expects | Actual field in content_json |
|--------------------------|------------------------------|
| `market_segments` | `marketSegments` |
| `competitive_landscape` | `competitorResearch` or `existingCompetitors` |
| `tam_sam_som` | `tam`, `sam`, `som` (separate fields) |
| `economic_impact` | `economicImpact` |
| `potential_partners` | `partnerBusinesses` or `partners` |
| `industry_stakeholders` | Not present |
| `ip_landscape` | Not present |
| `regulatory_environment` | Not present |
| `success_metrics` | Not present |
| `executive_summary` | `researchContext` |

Since no fields match, the `sections` array is empty, and only the cover page renders.

## Solution

Update `PdfReportRenderer.tsx` to:
1. Use the correct field names from the actual report data
2. Handle both string and structured data formats (matching `ReportViewer` logic)
3. Improve markdown-to-HTML conversion for better formatting
4. Add proper spacing and visual hierarchy for multi-page rendering

## Files to Modify

| File | Change |
|------|--------|
| `src/components/workspace/PdfReportRenderer.tsx` | Fix field name mappings and content rendering |
| `src/lib/generatePdfClient.ts` | Minor improvements to pagination and timing |

## Implementation Details

### Change 1: Update ContentJson Interface

Update the interface to match actual report data:

```typescript
interface ContentJson {
  researchContext?: string;
  marketSegments?: string | MarketSegment[];
  competitorResearch?: string;
  existingCompetitors?: string | Competitor[];
  competitorTable?: string;
  tam?: string | MarketSize;
  sam?: string | MarketSize;
  som?: string | MarketSize;
  economicImpact?: string | EconomicImpact;
  partners?: string | Partner[];
  partnerBusinesses?: string;
  citations?: string | Citation[];
  [key: string]: any;
}
```

### Change 2: Update Section Building Logic

Change the section-building logic to use correct field names:

```typescript
// Executive Summary / Research Context
if (content.researchContext) {
  sections.push({ title: "Research Context", content: content.researchContext });
}

// Market Segments
if (content.marketSegments) {
  const marketContent = Array.isArray(content.marketSegments)
    ? content.marketSegments.map(s => `**${s.name}**\n${s.description}`).join('\n\n')
    : String(content.marketSegments);
  sections.push({ title: "Market Segments", content: marketContent });
}

// Competitive Landscape
const competitors = content.existingCompetitors || content.competitorResearch;
if (competitors) {
  const compContent = Array.isArray(competitors)
    ? competitors.map(c => `**${c.name}**${c.type ? ` (${c.type})` : ''}\n${c.description || ''}`).join('\n\n')
    : String(competitors);
  sections.push({ title: "Competitive Landscape", content: compContent });
}

// Competitor Table (if separate)
if (content.competitorTable) {
  sections.push({ title: "Competitor Comparison", content: content.competitorTable });
}

// TAM/SAM/SOM - Render as separate sections or combined
if (content.tam || content.sam || content.som) {
  let marketSizeContent = '';
  if (content.tam) {
    marketSizeContent += `**Total Addressable Market (TAM)**\n${typeof content.tam === 'string' ? content.tam : content.tam.value || 'N/A'}\n\n`;
  }
  if (content.sam) {
    marketSizeContent += `**Serviceable Addressable Market (SAM)**\n${typeof content.sam === 'string' ? content.sam : content.sam.value || 'N/A'}\n\n`;
  }
  if (content.som) {
    marketSizeContent += `**Serviceable Obtainable Market (SOM)**\n${typeof content.som === 'string' ? content.som : content.som.value || 'N/A'}`;
  }
  sections.push({ title: "Market Size Analysis", content: marketSizeContent });
}

// Economic Impact
if (content.economicImpact) {
  const impactContent = typeof content.economicImpact === 'string'
    ? content.economicImpact
    : content.economicImpact.summary || JSON.stringify(content.economicImpact);
  sections.push({ title: "Economic Impact", content: impactContent });
}

// Partners
const partners = content.partners || content.partnerBusinesses;
if (partners) {
  const partnerContent = Array.isArray(partners)
    ? partners.map(p => `**${p.name}**${p.industry ? ` - ${p.industry}` : ''}\n${p.reason || ''}`).join('\n\n')
    : String(partners);
  sections.push({ title: "Potential Partners", content: partnerContent });
}

// Citations
if (content.citations) {
  const citationsContent = Array.isArray(content.citations)
    ? content.citations.map((c, i) => `[${i+1}] ${c.title || 'Untitled'}. ${c.url || ''}`).join('\n')
    : String(content.citations);
  sections.push({ title: "References", content: citationsContent });
}
```

### Change 3: Improve formatContent Function

Enhance the markdown-to-HTML conversion:

```typescript
function formatContent(content: string): string {
  if (!content) return "";
  
  return content
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Bold text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Italic text  
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // H3 headers
    .replace(/^### (.*?)$/gm, '<h4 style="font-weight: 600; margin: 24px 0 12px; font-size: 1.1em;">$1</h4>')
    // H2 headers
    .replace(/^## (.*?)$/gm, '<h3 style="font-weight: 600; margin: 28px 0 14px; font-size: 1.2em;">$1</h3>')
    // Bullet points - wrap in ul
    .replace(/^- (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 8px; list-style-type: disc;">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.*?)$/gm, '<li style="margin-left: 20px; margin-bottom: 8px; list-style-type: decimal;">$1</li>')
    // Links [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #2563eb;">$1</a>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;" />')
    // Paragraphs
    .replace(/\n\n/g, '</p><p style="margin-bottom: 16px;">')
    // Line breaks
    .replace(/\n/g, "<br />");
}
```

### Change 4: Improve Rendering Timing

Update `ReportsList.tsx` to wait longer for render:

```typescript
// Wait for the component to render completely
await new Promise(resolve => setTimeout(resolve, 500));
```

### Change 5: Fix Pagination Logic

Update `generatePdfClient.ts` to properly calculate page slices based on actual content height:

```typescript
// Calculate the portion of canvas for this page based on actual content height ratio
const pxPerPage = (contentHeight / imgHeight) * canvas.height;
const sourceY = page * pxPerPage;
const sourceHeight = Math.min(pxPerPage, canvas.height - sourceY);
```

## Summary

The PDF renderer was looking for snake_case field names (`market_segments`, `competitive_landscape`) but the actual report data uses camelCase (`marketSegments`, `competitorResearch`). This fix aligns the PDF renderer with the actual data structure, matching how `ReportViewer` already handles the data.

After this fix:
- Cover page will render (if enabled in template)
- Table of contents will render (if enabled)
- All report sections will render with proper formatting
- Markdown in content will be converted to styled HTML
- Multi-page PDFs will paginate correctly
