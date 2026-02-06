
# Real Edge Function Deployment from Admin Dashboard

## Problem
The current "Deploy" button just shows instructions to republish. This is not useful because:
1. Functions may already exist in code but not be deployed
2. Republishing the entire project is heavy-handed
3. Admins need immediate action, not manual steps

## Root Cause
Edge functions can become "orphaned" when:
- A deploy fails silently during a previous publish
- Functions were added in a branch that wasn't properly published
- Platform issues during deployment

## Solution: Create a Deployment Trigger Edge Function

Create `supabase/functions/trigger-deploy/index.ts` that:
1. Receives a list of function names to deploy
2. Calls the Lovable deployment API using `LOVABLE_API_KEY`
3. Returns deployment status

### Technical Approach

The Lovable platform exposes a deployment API that can deploy specific edge functions. The edge function will act as a proxy to this API, authenticated with the project's `LOVABLE_API_KEY`.

```text
Admin Dashboard                    
      |                            
      v                            
[Deploy Button] ──POST──> [trigger-deploy edge function]
                                   |
                                   v
                          [Lovable Deployment API]
                                   |
                                   v
                          [Function Deployed]
```

### Files to Create

**supabase/functions/trigger-deploy/index.ts**
- Accepts `{ functionNames: string[] }` body
- Validates admin authentication
- Calls Lovable deployment API
- Returns deployment results

### Files to Modify

**supabase/config.toml**
- Add `[functions.trigger-deploy]` configuration

**src/hooks/useBackendHealth.ts**
- Add `deployFunction(name: string)` method that calls the edge function
- Add `deployAllMissing()` method
- Track deployment status with loading states

**src/pages/admin/SystemHealth.tsx**
- Wire up deploy buttons to call the actual deployment
- Show loading spinner during deployment
- Refresh health check after deployment completes

**src/components/admin/FunctionCategorySection.tsx**
- Update to show deployment progress per function

### Security Considerations

1. **Admin-only access**: The trigger-deploy function verifies the caller is an admin
2. **Rate limiting**: Prevent rapid repeated deploy requests
3. **Function name validation**: Only allow deploying known functions from a whitelist

### User Experience

Before:
```
[Deploy] -> Toast: "Make a code change and republish"
```

After:
```
[Deploy] -> Loading spinner -> Function deployed -> Auto-refresh health
```

### Implementation Order

1. Create `trigger-deploy` edge function with Lovable API call
2. Update `config.toml` with function configuration
3. Update `useBackendHealth.ts` with real deployment method
4. Update `SystemHealth.tsx` to call deployment and show progress
5. Test end-to-end with a missing function

### Edge Cases

- **Deployment fails**: Show error message with retry option
- **API timeout**: 30-second timeout with graceful failure
- **Multiple simultaneous deploys**: Queue them or deploy in parallel
- **User not admin**: Return 403 forbidden
