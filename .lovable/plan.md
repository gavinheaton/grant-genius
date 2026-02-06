
# Update Prompt Quality Length Threshold

## Summary

Change the minimum prompt length threshold for full quality score from 1000 characters to 1500 characters across all 4 files that contain the `adequateLength` scoring logic.

## Files to Update

| File | Line | Change |
|------|------|--------|
| `src/lib/bundleGeneratorSpec.ts` | 1299 | Update threshold from 1000 to 1500 |
| `src/hooks/usePromptQuality.ts` | 176 | Update threshold from 1000 to 1500 |
| `supabase/functions/process-grant-guidelines/index.ts` | 222 | Update threshold from 1000 to 1500 |
| `supabase/functions/regenerate-step-prompt/index.ts` | 24 | Update threshold from 1000 to 1500 |

## Code Change

**Before:**
```typescript
adequateLength: prompt.length >= 1000 ? 5 : Math.round((prompt.length / 1000) * 5 * 10) / 10,
```

**After:**
```typescript
adequateLength: prompt.length >= 1500 ? 5 : Math.round((prompt.length / 1500) * 5 * 10) / 10,
```

## Impact

- Prompts must now be at least 1,500 characters to receive the full 5 points for length
- Shorter prompts will receive proportionally less (e.g., a 750-character prompt scores 2.5 points)
- This aligns with the memory documentation stating "1,500+ character minimum" as the quality standard
- All quality scoring will be consistent across frontend and backend
