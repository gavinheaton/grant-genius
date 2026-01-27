

# Guidelines Upload and AI Analysis System

## Understanding the Problem

You've highlighted a critical insight about the grant application workflow:

1. **What's publicly available**: When a grant is released, researchers only get the **guidelines document** (like the AEA Ignite PDF you uploaded)
2. **What's NOT available**: The actual rubric (scoring criteria) and structured required inputs are internal to the funding body
3. **What's needed**: An AI system that analyzes the guidelines PDF and **infers/extracts**:
   - Required inputs (what information the researcher must provide)
   - Rubric criteria (assessment areas based on the guidelines)

This transforms the Admin Console from "manually entering rubric/inputs" to "upload guidelines, AI suggests structure, admin reviews and refines."

---

## Current State

The `grant_versions` table already has the right structure:
- `guidelines_json` - Currently empty, will store the raw extracted content
- `required_inputs_json` - Currently empty, AI will suggest these
- `rubric_json` - Currently empty, AI will suggest these

The Admin Console currently has manual JSON editors for these fields, but no way to upload a PDF or analyze it.

---

## Proposed Solution

### Phase 1: Database Schema Update

Add a new column to `grant_versions` for storing the original PDF:

```text
grant_versions
├── guidelines_source_path (TEXT) - Path to uploaded PDF in storage
├── guidelines_raw_text (TEXT) - Extracted raw text from PDF
├── ai_analysis_status (TEXT) - 'pending' | 'analyzing' | 'completed' | 'failed'
├── ai_suggestions_json (JSONB) - AI's suggested inputs and rubric
```

Create a storage bucket for grant guidelines PDFs.

---

### Phase 2: UI Enhancement for Grant Edit Page

Update the Grant Edit page (`/admin/grants/:id`) to add a new **Guidelines** tab:

```text
Tabs: Details | Versions | Guidelines | Required Inputs | Rubric
                           ↑ NEW
```

**Guidelines Tab Features:**
1. **Upload PDF** - Drag and drop or file picker for guidelines PDF
2. **View uploaded PDF** - Show link to current guidelines
3. **AI Analysis Button** - "Analyze Guidelines" triggers the AI edge function
4. **Analysis Status** - Shows progress (Pending → Analyzing → Complete)
5. **AI Suggestions Preview** - Shows what AI extracted:
   - Suggested required inputs with checkboxes to accept/modify
   - Suggested rubric criteria with checkboxes to accept/modify
6. **Apply Suggestions** - Copies accepted suggestions to the Required Inputs and Rubric tabs

---

### Phase 3: Edge Function for PDF Analysis

Create `supabase/functions/analyze-grant-guidelines/index.ts`:

**What it does:**
1. Receives: `grant_version_id` and optional `pdf_url`
2. Fetches the PDF from storage
3. Extracts text content using PDF parsing
4. Calls Lovable AI with a structured prompt to analyze the text
5. Returns structured JSON with:
   - `required_inputs`: Array of input field definitions
   - `rubric`: Assessment criteria organized by section
   - `summary`: Brief description of the grant

**AI Prompt Strategy:**

```text
You are analyzing grant application guidelines to extract two things:

1. REQUIRED INPUTS: What information must the applicant provide?
   - Look for sections like "Part A", "Part B", form fields
   - Each input should have: key, label, type (text/textarea/url/file/select), required, help_text

2. RUBRIC CRITERIA: What will applications be assessed on?
   - Look for "selection criteria", "assessment criteria", "scoring"
   - Each criterion should have: section_key, title, description, weight (if mentioned)

From the AEA Ignite guidelines, extract structured data...
```

**Output Format:**

```json
{
  "required_inputs": [
    {
      "key": "project_title",
      "label": "Project Title",
      "type": "text",
      "required": true,
      "help_text": "Provide a concise title (max 20 words)",
      "max_length": 200,
      "source_section": "A1"
    },
    {
      "key": "public_summary",
      "label": "Public Project Summary",
      "type": "textarea",
      "required": true,
      "help_text": "Non-technical summary for public (750 chars)",
      "max_length": 750,
      "source_section": "A8"
    },
    {
      "key": "business_case_pdf",
      "label": "Business Case Document",
      "type": "file",
      "required": true,
      "help_text": "5 pages max using AEA template",
      "source_section": "B1"
    }
  ],
  "rubric": {
    "sections": [
      {
        "key": "commercialisation_potential",
        "title": "Commercialisation Potential",
        "description": "Ability to translate research into commercial outcomes",
        "criteria": [
          "Clear pathway to market",
          "Identified end-users and market demand",
          "Competitive advantage and IP position"
        ],
        "weight": 25
      },
      {
        "key": "team_capability",
        "title": "Team and Capability",
        "description": "Expertise and capacity to deliver",
        "criteria": [
          "Relevant commercialisation experience",
          "Technical expertise",
          "Partner organisation commitment"
        ],
        "weight": 25
      }
    ]
  },
  "grant_summary": "AEA Ignite grants support researchers at TRL 3-5..."
}
```

---

### Phase 4: Workflow Integration

**Admin Workflow:**

1. Admin creates new grant or edits existing
2. Admin uploads guidelines PDF in the Guidelines tab
3. Admin clicks "Analyze with AI"
4. System shows progress indicator
5. AI returns suggestions in a preview panel
6. Admin reviews suggestions:
   - Checkboxes to include/exclude each suggested input
   - Editable fields to refine labels/descriptions
   - Drag to reorder
7. Admin clicks "Apply to Grant Version"
8. Suggestions are copied to `required_inputs_json` and `rubric_json`
9. Admin can further refine in the existing JSON editors if needed
10. Super Admin publishes the version when ready

---

## File Structure

```text
src/
├── components/admin/
│   ├── GuidelinesUploader.tsx      # PDF upload component
│   ├── AIAnalysisPanel.tsx         # Shows AI suggestions
│   └── SuggestionReview.tsx        # Checkbox list to accept/modify
├── pages/admin/
│   └── GrantEdit.tsx               # Updated with Guidelines tab

supabase/
├── functions/
│   └── analyze-grant-guidelines/
│       └── index.ts                # AI analysis edge function
├── migrations/
│   └── add_guidelines_storage.sql  # New columns + storage bucket
```

---

## Technical Considerations

**PDF Text Extraction Options:**
1. **Use pdf-parse library in edge function** - Parse PDF directly
2. **Use external service** - More reliable for complex PDFs
3. **Store raw text from document parser** - Use Lovable's document parsing

**Storage:**
- Create `grant-guidelines` storage bucket
- Store PDFs at path: `{grant_id}/{version_number}/guidelines.pdf`
- RLS: Only admins can upload/view

**AI Model Selection:**
- Use `google/gemini-3-flash-preview` for fast, cost-effective analysis
- Structured output using tool calling for reliable JSON

---

## Security

- File upload restricted to admin users
- Edge function validates admin role before processing
- PDFs stored in private bucket with admin-only RLS
- AI analysis logged in audit_logs

---

## Summary of Changes

| Component | Change |
|-----------|--------|
| Database | Add 4 columns to grant_versions, create storage bucket |
| GrantEdit.tsx | Add Guidelines tab with upload and AI analysis |
| New Edge Function | analyze-grant-guidelines for AI processing |
| New Components | GuidelinesUploader, AIAnalysisPanel |
| Storage | grant-guidelines bucket with admin RLS |

This approach transforms grant setup from "manual JSON entry" to "upload PDF, review AI suggestions, refine" - making it much faster and more accurate for admins while ensuring the system has structured data for the researcher workspace.

