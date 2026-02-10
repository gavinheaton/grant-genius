

## Remove 1500-char Minimum + Add "Re-run QA" Button

### Changes

**1. `src/lib/pipelineQualityGate.ts` -- Remove prompt length hard-fail**

- Delete or set `MINIMUM_PROMPT_LENGTH` to 0
- Remove the hard-fail check at lines 287-289 that rejects steps with prompts under 1500 characters
- This means short prompts will no longer block pipeline publishing

**2. `src/pages/admin/PromptBundleEdit.tsx` -- Add "Re-run QA" button**

- Add a "Re-run QA" button next to the quality card that triggers a fresh validation pass
- Convert the `useMemo`-based quality calculation to a `useState` + manual trigger pattern so it can be re-run on demand
- The button will:
  - Re-run `validatePipelineQuality()` (role coverage, red flags, scoring)
  - Re-run `validatePostReorder()` (forward references, orphaned references)
  - Update the quality card with fresh results
  - Show a brief loading state while running

**3. `src/components/admin/PipelineQualityCard.tsx` -- Support re-run trigger**

- Add props for an optional "Re-run QA" button (`onRerunQA`, `isRerunning`)
- Place the button in the card header next to the verdict badge
- Button labeled "Re-run QA" with a refresh icon

### Technical Details

| File | Change |
|------|--------|
| `src/lib/pipelineQualityGate.ts` | Remove `MINIMUM_PROMPT_LENGTH` check from `checkHardFails` (lines 235, 287-289) |
| `src/pages/admin/PromptBundleEdit.tsx` | Replace `useMemo` with `useState` + `useCallback` for quality/data-flow results; add re-run handler |
| `src/components/admin/PipelineQualityCard.tsx` | Add `onRerunQA` / `isRerunning` props; render refresh button in header |
| `src/test/pipelineQualityGate.test.ts` | Update any tests that assert on the 1500-char hard-fail behavior |

