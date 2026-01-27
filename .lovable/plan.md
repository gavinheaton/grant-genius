
Goal: eliminate persistent 500s from the backend function `generate-pdf` by addressing the real root cause shown in backend logs: PDFShift returns `400` with `The requested page took too long to load`, which our function then maps to a `500` for the browser.

What we know (from exploration)
- The backend logs for `generate-pdf` still show:
  - `PDFShift error: {"success":false,"error":"The requested page took too long to load.","code":400}`
- The recent change removed Google Fonts loading and added `sandbox: true`, but the timeout persists.
- The default PDF template has `logo_path = null`, so the timeout is not caused by a logo image fetch.
- PDFShift API docs show relevant options we are not currently setting:
  - `wait_for_network` (default: true)
  - `ignore_long_polling` (default: false)
  - `disable_javascript` (default: false)
  - `timeout` (kills page loading at a set time without failing with TimeoutError)

Hypothesis (why it still times out)
- Even with no external fonts, PDFShift by default waits for “no network requests in the last 500ms” (`wait_for_network: true`).
- If the headless browser sees any request that never fully “settles” (or a persistent connection / long-poll / resource that keeps the network busy), PDFShift can keep waiting and eventually throws the “page took too long to load” error.
- Since our HTML is static, we do not need PDFShift to wait for network idle or run JavaScript.

Planned fix (most likely to work)
1) Update the PDFShift request payload in `supabase/functions/generate-pdf/index.ts` to force “static render mode”:
   - `wait_for_network: false` (do not wait for network idle)
   - `disable_javascript: true` (prevent any JS from running / opening connections)
   - `ignore_long_polling: true` (belt-and-suspenders if PDFShift still tracks long requests)
   - `timeout: 15` (or 20–30) seconds to hard-stop page loading and proceed to render
   - Keep `use_print: true` and `format`
   - Keep (or remove) `sandbox: true` depending on your preference; it is not solving the underlying issue either way.

2) Improve observability (so we stop “guessing” if this happens again):
   - When PDFShift responds non-2xx:
     - Log the HTTP status + full response body (already done)
     - Additionally log a few debugging fields that help pinpoint “what is PDFShift waiting on”:
       - HTML byte length
       - Whether logoUrl is present
       - Whether template.include_cover_page/include_toc are enabled
   - Return a more informative JSON error payload to the frontend (still generic enough not to leak secrets), e.g.:
     - `{ error: "PDF generation failed", provider: "pdfshift", providerStatus: 400 }`
     - This will make browser-side debugging much faster.

3) Validate after change
   - Trigger PDF generation again from the UI.
   - Confirm:
     - Backend logs no longer show “page took too long to load”
     - Browser receives 200 with a signed `downloadUrl`
     - The PDF uploads correctly to the private `reports` bucket and `reports.pdf_path` is updated

Fallback plan if it still fails (rare, but prepared)
A) If PDFShift still times out:
   - Add `delay: 0` explicitly and remove any advanced `@page` margin box CSS (some render engines behave oddly). This would be a second step only if needed.

B) If the failure correlates with specific reports only:
   - Add a “minimal HTML mode” flag temporarily (server-side) to generate a very simple PDF with only plain text and see if the issue is caused by a particular content section.

Files involved
- supabase/functions/generate-pdf/index.ts
  - Modify PDFShift POST body to include: `wait_for_network:false`, `disable_javascript:true`, `ignore_long_polling:true`, `timeout:<seconds>`
  - Add a little more structured logging and a slightly richer error response

Why this approach is the right next step
- It is directly aligned with PDFShift’s documented defaults (wait_for_network=true) and error behavior.
- It reduces variability by ensuring PDFShift doesn’t wait on conditions that are irrelevant for a static HTML-to-PDF conversion.
- It is low-risk and localized to the backend function only.

Acceptance criteria (“done”)
- Clicking “Generate PDF” consistently returns a signed download URL (no 500).
- Backend logs show successful PDFShift conversion responses.
- Generated PDF is stored in `reports` bucket and is downloadable by the owning user.
