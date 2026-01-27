

# Fix: TypeError in AIAnalysisPanel Component

## Problem Identified

The `AIAnalysisPanel` component has a bug on **lines 60-65** where `useState` is incorrectly used as a side effect hook:

```typescript
useState(() => {
  if (suggestions) {
    setSelectedInputs(new Set(suggestions.required_inputs.map((i) => i.key)));
    setSelectedSections(new Set(suggestions.rubric.sections.map((s) => s.key)));
  }
});
```

### Why This Fails:
1. **Wrong hook pattern**: `useState` initializer runs immediately during render, but calls `setSelectedInputs` and `setSelectedSections` which violates React rules
2. **Missing null checks**: Even with the `if (suggestions)` guard, the code doesn't validate that `suggestions.required_inputs` and `suggestions.rubric.sections` are arrays before calling `.map()`
3. **Database edge case**: The `ai_suggestions_json` column could contain malformed JSON like `{}` instead of the expected structure

---

## Solution

Replace the incorrect `useState` usage with `useEffect` and add defensive null/array checks:

### Changes to `src/components/admin/AIAnalysisPanel.tsx`

**Before (lines 59-65):**
```typescript
// Initialize selections when suggestions change
useState(() => {
  if (suggestions) {
    setSelectedInputs(new Set(suggestions.required_inputs.map((i) => i.key)));
    setSelectedSections(new Set(suggestions.rubric.sections.map((s) => s.key)));
  }
});
```

**After:**
```typescript
// Initialize selections when suggestions change
useEffect(() => {
  if (suggestions?.required_inputs && Array.isArray(suggestions.required_inputs)) {
    setSelectedInputs(new Set(suggestions.required_inputs.map((i) => i.key)));
  }
  if (suggestions?.rubric?.sections && Array.isArray(suggestions.rubric.sections)) {
    setSelectedSections(new Set(suggestions.rubric.sections.map((s) => s.key)));
  }
}, [suggestions]);
```

### Additional Safety: Add guards in render section

Also add safety checks when rendering the suggestions to prevent crashes if the data structure is unexpected:

```typescript
// Line 234: Add fallback for length
{suggestions.required_inputs?.length ?? 0}

// Line 244: Add optional chaining and fallback
{(suggestions.required_inputs ?? []).map((input) => ...)}

// Line 291: Add fallback for sections length  
{suggestions.rubric?.sections?.length ?? 0}

// Line 301: Add optional chaining and fallback
{(suggestions.rubric?.sections ?? []).map((section) => ...)}
```

---

## Technical Details

| Item | Change |
|------|--------|
| File | `src/components/admin/AIAnalysisPanel.tsx` |
| Import | Add `useEffect` to the React import |
| Line 60-65 | Replace `useState` with `useEffect` + dependency array |
| Line 234, 244 | Add null coalescing for `required_inputs` |
| Line 291, 301 | Add null coalescing for `rubric.sections` |

---

## Root Cause Summary

The error `Cannot read properties of undefined (reading 'map')` occurs because:
1. The component uses `useState` incorrectly as a side effect
2. When `suggestions` exists but has an unexpected shape (missing `required_inputs` or `rubric.sections`), the `.map()` call fails
3. The database column `ai_suggestions_json` defaults to `'{}'::jsonb` which is an empty object, not the expected structure

This fix ensures the component handles all edge cases gracefully.

