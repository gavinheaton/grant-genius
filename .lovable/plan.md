
# Redesign: From "Application Builder" to "Research Report Generator"

## ✅ COMPLETED

The system has been redesigned from a complex multi-tab "Application Builder" to a streamlined one-click "Research Report Generator".

### What Was Built

1. **Simplified ApplicationWorkspace UI** (`src/pages/ApplicationWorkspace.tsx`)
   - Removed 4-tab layout (Inputs, Sections, Evidence, Finalize)
   - Single-page flow with inputs, generate button, progress indicator, and downloads

2. **Component Breakdown:**
   - `ReportInputs.tsx` - Article URL + 100-word summary inputs
   - `GenerationProgress.tsx` - 10-step progress indicator
   - `ReportsList.tsx` - Download completed reports

3. **Report Generation Hook** (`src/hooks/useReportGeneration.ts`)
   - Polls for generation progress
   - Manages report state and downloads

4. **Generate Report Edge Function** (`supabase/functions/generate-report/index.ts`)
   - Validates inputs (URL + summary required)
   - Consumes entitlement credit
   - Executes 10-step AI research pipeline using Lovable AI (Gemini-3-Flash)
   - Uses Firecrawl to scrape user's article URL
   - Stores report in database

### The 10 Research Steps (Automated)

| Step | Research Task |
|------|---------------|
| 1 | Extract research context from article |
| 2 | Search for competing/similar research |
| 3 | Identify 3+ market segments |
| 4 | Find existing competitors in market |
| 5 | Calculate TAM using validated sources |
| 6 | Calculate SAM based on target segments |
| 7 | Calculate realistic SOM |
| 8 | Calculate Australian economic impact |
| 9 | Build competitor comparison table |
| 10 | Find Australian partner businesses (ANZSIC codes) |

### User Flow

1. User enters Article URL + Summary
2. Clicks "Generate Report" (consumes 1 credit)
3. Sees progress indicator (Step 1/10, 2/10, etc.)
4. Downloads PDF/DOCX when complete

### Dependencies Enabled

- ✅ Firecrawl connector (for web scraping)
- ✅ Lovable AI (Gemini-3-Flash for research pipeline)

### Next Steps (Future)

- [ ] PDF/DOCX file generation with proper formatting
- [ ] MLA citation formatting in final output
- [ ] Web preview of generated report content
