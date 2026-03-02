

## Remove PDFShift "Created by PDF Shift" Watermarks

### Problem
Both PDF generation functions send `sandbox: true` to the PDFShift API. Sandbox mode adds "Created by PDF Shift" watermark overlays throughout the document. Now that a real API key is configured, sandbox mode should be disabled.

### Changes

**File: `supabase/functions/generate-pdf/index.ts`** (line ~895)
- Remove `sandbox: true` from the PDFShift API request body

**File: `supabase/functions/complete-manual-report/index.ts`** (line ~275 area)
- Check for and remove `sandbox: true` if present in the PDFShift API request body there as well

Both are one-line deletions. The edge functions will auto-deploy after the change.
