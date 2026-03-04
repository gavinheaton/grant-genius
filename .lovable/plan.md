

## Add `{project_title}` Placeholder to PDF Subtitle Template

### What
Add a new `{project_title}` variable to the PDF cover page subtitle template system, so admins can use the application/project title instead of (or alongside) the grant name. Then change the default from `{grant_name}` to `{project_title}`.

### How It Works Today
- The subtitle template (e.g. `{grant_name}`) is stored in `cover_layout_json` on `pdf_templates`
- The server-side `generate-pdf` function fetches the report + grant name, but **ignores** the `cover_layout_json` entirely — it hardcodes `"Research Commercialisation Report"` as the title and `grantName` as the subtitle
- The client-side `PdfReportRenderer` does use `cover_layout_json` and substitutes `{grant_name}`, `{date}`, `{version}`

### Changes

**1. `supabase/functions/generate-pdf/index.ts`** (server-side — this is what actually generates PDFs)
- Join `applications` via `application_id` to get the project title
- Read `cover_layout_json` from the template instead of hardcoding cover content
- Support `{project_title}`, `{grant_name}`, `{date}`, `{version}` substitution in both `title_text` and `subtitle_template`
- Use `cover_layout_json.title_text` for the H1 and `subtitle_template` for the H2

**2. `src/components/workspace/PdfReportRenderer.tsx`** (client-side preview)
- Add `{project_title}` substitution alongside existing `{grant_name}`, `{date}`, `{version}`
- Pass application title through (already available as `grantName` prop context or needs a new prop)

**3. `src/components/admin/PDFTemplateForm.tsx`**
- Update the placeholder hint text for the subtitle field to show `{project_title}` as an available variable

**4. Update the default subtitle**
- Change the default `subtitle_template` from `{grant_name}` to `{project_title}` in `usePdfTemplates.ts` and `PdfReportRenderer.tsx`
- The admin can always change it back to `{grant_name}` or use both: `{project_title} — {grant_name}`

### No database changes needed
The `cover_layout_json` JSONB column already stores the template string — we're just adding a new supported variable.

