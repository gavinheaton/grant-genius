

## Move Claude to Grant Details as "Single Prompt" Processing Mode

### Overview
Add "Single Prompt (Claude)" as a third processing mode option alongside "Automated (AI Pipeline)" and "Manual (Admin Review)" in the Grant Details tab. When selected, it automatically sets `execution_engine_default` to `claude` on the grant version. This simplifies the admin experience -- no need to dig into the Advanced tab to switch engines.

### Changes

**1. `src/pages/admin/GrantEdit.tsx`**
- Expand `processingMode` state type from `"automated" | "manual"` to `"automated" | "manual" | "single_prompt"`
- Add a third radio button: "Single Prompt (Claude)" with description text
- When `processingMode` changes to `single_prompt`, automatically set `executionEngineDefault` to `"claude"` on the grant version
- When `processingMode` changes away from `single_prompt`, reset `executionEngineDefault` to `"cloud_run"`
- On load, if `execution_engine_default === "claude"`, set `processingMode` to `"single_prompt"` (sync state)
- Hide the `EngineSettingsCard` Claude option from the Advanced tab (keep Cloud Run / Edge there for the automated mode)

**2. Database migration**
- Update the `grants.processing_mode` column default or allowed values to include `"single_prompt"` (it's a text column so no enum change needed, just documentation)

**3. `src/pages/ApplicationWorkspace.tsx`**
- Handle `processing_mode === "single_prompt"` -- treat it like `"automated"` for the researcher experience (they still click "Generate Report" the same way). No UI changes needed for researchers since the engine difference is transparent.

**4. `src/pages/admin/GrantEdit.tsx` -- Save handler**
- When saving grant details, if `processingMode === "single_prompt"`, also ensure the grant version's `execution_engine_default` is set to `"claude"`
- When saving with `processingMode === "automated"`, ensure engine is `"cloud_run"` (unless manually overridden in Advanced)

### UI in Grant Details Tab

```text
Processing Mode:
  (o) Automated (AI Pipeline)
      Reports generated automatically using the multi-step research pipeline.
  ( ) Single Prompt (Claude)  
      Complete report generated in one AI call. Edit the prompt in the Pipeline tab.
  ( ) Manual (Admin Review)
      Submissions sent to an admin for manual report preparation.
```

### Technical Details

- `processing_mode` lives on the `grants` table (applies to all versions of a grant)
- `execution_engine_default` lives on `grant_versions` (per-version setting)
- When processing mode is `single_prompt`, the engine is always `claude` -- the Advanced tab engine selector becomes read-only or hidden for that mode
- The Pipeline tab already conditionally shows the Claude prompt editor vs pipeline editor based on `executionEngineDefault`, so that continues to work automatically
- The guidelines upload optimization (skip pipeline generation for Claude) also continues to work since it checks `execution_engine_default`

### Files Modified
1. `src/pages/admin/GrantEdit.tsx` -- add third radio option, sync engine on mode change
2. `src/pages/ApplicationWorkspace.tsx` -- treat `single_prompt` same as `automated` for researcher flow
