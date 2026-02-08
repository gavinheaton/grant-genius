
# Fix: Real-Time Status Updates for Processing Guidelines Card

## Problem Analysis

When guidelines are uploaded and processing starts, the "Processing Guidelines" card updates once after a few seconds but then stops updating until the page is refreshed. The user has to manually refresh to see subsequent status changes.

### Root Cause

The page uses React Query polling with a conditional `refetchInterval`:

```typescript
refetchInterval: (query) => {
  const data = query.state.data;  // Uses CACHED query data
  const isProcessing = selectedVer.ai_analysis_status === "analyzing";
  return isProcessing ? 3000 : false;
}
```

**Problem Flow:**
1. User uploads guidelines
2. `onProcessingStart()` sets local state: `setAiAnalysisStatus("analyzing")`
3. The `refetchInterval` function checks `query.state.data` (still shows `"pending"`)
4. Polling condition fails → no automatic refetch
5. Status appears stuck until manual page refresh

## Solution: Add Supabase Realtime Subscription

Rather than relying on polling with stale data conditions, we will add a proper Supabase Realtime subscription to the `grant_versions` table that provides instant updates when status changes.

### Changes Required

#### 1. Enable Realtime for `grant_versions` Table

Add a database migration to include `grant_versions` in the Supabase realtime publication:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.grant_versions;
```

#### 2. Add Realtime Subscription in `GrantEdit.tsx`

Add a `useEffect` hook that subscribes to `postgres_changes` on the `grant_versions` table, filtered by the selected version ID. When an UPDATE is received, update the local state immediately:

```typescript
useEffect(() => {
  if (!selectedVersionId) return;

  const channel = supabase
    .channel(`grant-version-${selectedVersionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'grant_versions',
        filter: `id=eq.${selectedVersionId}`,
      },
      (payload) => {
        const newData = payload.new;
        setAiAnalysisStatus(newData.ai_analysis_status || "pending");
        setPipelineStatus(newData.pipeline_generation_status || "none");
        setPromptBundleId(newData.prompt_bundle_id || null);
        setAiSuggestions(newData.ai_suggestions_json || null);
        // Invalidate query to sync full data
        queryClient.invalidateQueries({ queryKey: ["admin-grant", id] });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [selectedVersionId, id, queryClient]);
```

#### 3. Remove/Simplify Polling Logic

Since realtime provides instant updates, we can either:
- Remove the `refetchInterval` entirely (recommended)
- Or keep it as a fallback with a longer interval (30 seconds)

### Technical Details

| Component | Change |
|-----------|--------|
| **Database Migration** | Add `grant_versions` to `supabase_realtime` publication |
| **`GrantEdit.tsx`** | Add `useEffect` with Supabase Realtime subscription |
| **`GrantEdit.tsx`** | Remove or simplify `refetchInterval` polling logic |

### Benefits

1. **Instant Updates**: Status changes appear immediately (no 3-second polling delay)
2. **No Refresh Required**: UI updates automatically as backend processing progresses
3. **More Efficient**: Realtime pushes updates only when data changes vs. continuous polling
4. **Consistent Pattern**: Matches how `report_runs` and `report_run_steps` already work in the codebase

### Alternative Considered (Not Recommended)

We could fix this by also checking local state in the polling condition, but this is a band-aid that still has 3-second latency and doesn't follow the realtime pattern already established for report generation.
