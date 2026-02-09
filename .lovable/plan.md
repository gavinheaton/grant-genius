

# Make Public Article URL Optional

## Overview

This change removes the "required" status from the Public Article URL field in the grant application form, making only the 100-word Summary a required input.

---

## Changes Required

### 1. Update Form Label (UI)

**File:** `src/components/workspace/ReportInputs.tsx`

Remove the red asterisk from the Public Article URL label to indicate it's now optional.

| Before | After |
|--------|-------|
| `Public Article URL *` | `Public Article URL` |

Also update the helper text to clarify the field is optional.

---

### 2. Update Validation Logic

**File:** `src/pages/ApplicationWorkspace.tsx`

Change the `inputsComplete` check to only require the summary field.

| Before | After |
|--------|-------|
| `publicArticleUrl.trim() !== "" && summary.trim() !== ""` | `summary.trim() !== ""` |

---

## Technical Details

### Files Modified

| File | Change |
|------|--------|
| `src/components/workspace/ReportInputs.tsx` | Remove `*` from label, update helper text |
| `src/pages/ApplicationWorkspace.tsx` | Update `inputsComplete` validation (line 282) |

### Impact on Pipeline

The AI pipeline already handles missing `publicArticleUrl` gracefully:
- The `firecrawl_scrape` step that uses `{{publicArticleUrl}}` will receive an empty string
- Prompts should already handle "if provided" scenarios per the minimal input philosophy
- The `articleContent` variable will be empty if no URL is provided

---

## Summary

Two simple changes make the Public Article URL optional while keeping the 100-word Summary as the only required input for researchers.

