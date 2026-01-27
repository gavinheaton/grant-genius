
# Redesign: From "Application Builder" to "Research Report Generator"

## The Core Problem

You're absolutely right. The current system was designed as a complex "application workspace" with:
- Multiple tabs (Inputs → Sections → Evidence → Finalize)
- Section-by-section generation
- Rubric-based progress tracking
- Evidence library management

**What you actually need** is much simpler - based on your GPT instructions:

```text
Input:  Public article URL + 100-word summary
Output: Complete commercialization research report with citations
```

The 10 research steps should happen **automatically in one click**, not as a multi-step user workflow.

---

## Proposed Solution: Simplified User Flow

### New User Journey

```text
1. Select Grant → Enter Article URL + Summary → Click "Generate Report"
2. Wait ~2-3 minutes (progress indicator shows 10 steps running)
3. Download complete PDF/DOCX with all research + MLA citations
```

### What Gets Removed (Simplified)
- **Sections tab** → No manual section-by-section generation
- **Evidence tab** → AI finds and cites sources automatically
- **Finalize tab** → Report is generated complete, just download

### What Remains
- **Inputs** (simplified): Article URL + Summary (TRL/IP optional)
- **Report status**: Pending/Generating/Ready/Failed
- **Download**: PDF and DOCX once ready

---

## Technical Implementation

### Phase 1: Fix Immediate UX Issue
Update `ApplicationWorkspace.tsx` to show a "Generate Report" button when inputs are complete (URL + summary filled), instead of "Complete your inputs first".

### Phase 2: Create Report Generation Edge Function
Build `supabase/functions/generate-report/index.ts` that:

1. **Validates inputs** (article URL + summary required)
2. **Consumes entitlement** (decrement credits)
3. **Executes 10-step research pipeline** using Lovable AI (Gemini-3-Flash):

| Step | Research Task |
|------|---------------|
| 1 | Scrape public article, extract research context |
| 2 | Search Google Scholar for competing/similar research |
| 3 | Identify 3+ market segments for commercialization |
| 4 | Search for existing products/competitors in market |
| 5 | Calculate TAM using validated data sources |
| 6 | Calculate SAM based on target segments |
| 7 | Calculate realistic SOM |
| 8 | Calculate Australian economic impact |
| 9 | Build competitor comparison table |
| 10 | Find Australian partner businesses (ANZSIC codes) |

4. **Compile report** with MLA citations and reference list
5. **Store in reports table** with PDF/DOCX paths

### Phase 3: Add Firecrawl for Web Research
Connect the Firecrawl connector to enable:
- Scraping the user's public article URL
- Searching web for market data, competitors
- Accessing data sources (OECD, ABS, etc.)

### Phase 4: Simplified Workspace UI
Replace the 4-tab workspace with a single-page flow:

```text
┌─────────────────────────────────────────────────┐
│ [Grant Name]                           [Status] │
├─────────────────────────────────────────────────┤
│                                                 │
│  📎 Article URL: [https://doi.org/...]          │
│                                                 │
│  📝 Summary (100 words):                        │
│  [Your research is about...]                    │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  Optional:                                      │
│  TRL: [TRL 4]     IP Status: [Patent pending]   │
│                                                 │
│  ─────────────────────────────────────────────  │
│                                                 │
│  [✨ Generate Report]  or  [🔄 Regenerate]      │
│                                                 │
│  Progress: Step 5/10 - Calculating TAM...       │
│  ████████░░░░░░░░░░ 50%                         │
│                                                 │
├─────────────────────────────────────────────────┤
│ Previous Reports:                               │
│  • Report v1 (Jan 27) - [PDF] [DOCX]           │
└─────────────────────────────────────────────────┘
```

---

## Implementation Order

### Immediate Fix (5 min)
1. Update Sections tab to show "Generate Report" button when `publicArticleUrl` AND `summary` are filled

### Core Backend (Priority)
2. Create `generate-report` edge function skeleton
3. Wire up entitlement consumption
4. Implement 10-step AI pipeline with Lovable AI
5. Add Firecrawl connector for web scraping/search

### UI Simplification
6. Collapse 4 tabs into single-page workspace
7. Add real-time progress indicator for generation
8. Add report download functionality

---

## Dependencies & Questions

### Firecrawl Connector
To properly scrape websites, access scholarly sources, and search for market data, we should enable the Firecrawl connector. This will allow the AI to:
- Fetch content from the user's article URL
- Search the web for competitor and market data
- Access data from validated sources

### Report Format
Should the final report be:
- **PDF only** (simpler, faster to implement)
- **PDF + DOCX** (researchers can edit DOCX version)
- **Web preview + downloads** (view in browser, then download)

---

## Summary

This redesign shifts the mental model from:
- ❌ "User builds an application step-by-step" 
- ✅ "User provides inputs, AI generates complete research report"

The 10 research steps happen in the backend, not as user-facing workflow stages.
