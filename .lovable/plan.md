

## Show Default Claude Prompt in Editor

### Problem
When the `claude_prompt_template` field is empty/null on a grant version, the backend (`run-claude-report`) falls back to a hardcoded `DEFAULT_CLAUDE_PROMPT`. But the admin UI shows an empty textarea with placeholder text, so admins cannot see or edit the actual prompt being used.

### Solution
Extract the default prompt into a shared constant and pre-populate the editor with it when no custom template is saved.

### Changes

**1. Create `src/lib/defaultClaudePrompt.ts`**
- Export the `DEFAULT_CLAUDE_PROMPT` string (copy from `run-claude-report/index.ts`)
- This gives the frontend access to the default prompt text

**2. Update `src/pages/admin/GrantEdit.tsx`**
- Import `DEFAULT_CLAUDE_PROMPT`
- When loading a grant version, if `claude_prompt_template` is null/empty, set state to the default prompt
- "Reset to Default" button restores the textarea to `DEFAULT_CLAUDE_PROMPT` (and saves `null` to DB so the backend also uses its default)
- Add a visual indicator showing whether the admin is using the default or a custom prompt (e.g., a small badge)

**3. Update `supabase/functions/run-claude-report/index.ts`**
- No functional change needed -- the backend already falls back to `DEFAULT_CLAUDE_PROMPT` when the column is null, which is the correct behavior

### UI Behavior
- On load: textarea shows the full default prompt (editable)
- Admin edits and saves: custom prompt saved to DB
- "Reset to Default" clicked: textarea reverts to default, DB value set to null
- A badge or note indicates "Using default prompt" vs "Custom prompt saved"

### Files
1. **New**: `src/lib/defaultClaudePrompt.ts`
2. **Edit**: `src/pages/admin/GrantEdit.tsx` -- populate textarea with default when empty, update reset logic
