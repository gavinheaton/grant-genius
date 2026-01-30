

# Fix Cloud Run Worker Connection Debugging

## Problem Identified
The `enqueue-report` edge function is calling the Cloud Run worker at `${CLOUD_RUN_URL}/enqueue-run`, but the worker is returning an **HTML error page** instead of JSON. When the edge function tries to parse this with `response.json()`, it throws a syntax error.

The HTML response (`<!DOCTYPE...`) typically indicates:
- **404 Not Found** - The endpoint `/enqueue-run` doesn't exist on the worker
- **502 Bad Gateway** - The worker service is down or unreachable
- **Authentication redirect** - Some services redirect to login pages

## Solution: Improve Error Handling

Update the `enqueue-report` edge function to:
1. Log the full URL being called (helps verify the secret value)
2. Read response as text first, then attempt JSON parsing
3. On failure, log and return the raw response for debugging

## Implementation

### File: `supabase/functions/enqueue-report/index.ts`

```typescript
// After the fetch call (line 41-48), replace lines 50-56 with:

const responseText = await response.text();
console.log(`Worker response status: ${response.status}`);
console.log(`Worker URL called: ${workerUrl}/enqueue-run`);

// Try to parse as JSON, fall back to raw text on failure
let result;
try {
  result = JSON.parse(responseText);
} catch {
  console.error(`Worker returned non-JSON response: ${responseText.substring(0, 500)}`);
  return new Response(
    JSON.stringify({ 
      error: "Worker returned invalid response",
      status: response.status,
      preview: responseText.substring(0, 200),
    }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

console.log(`Worker result:`, result);

return new Response(JSON.stringify(result), {
  status: response.status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
```

## What This Reveals

After deploying, when you retest:
- The logs will show the exact URL being called
- If the worker returns HTML, you'll see the first 200 characters in the response
- This will clarify whether it's a 404, 502, or auth issue

## Next Steps After Fix

1. **Deploy the updated edge function** 
2. **Retest** - the response will now include diagnostic info
3. **Check the Replit worker** to ensure:
   - It's running and publicly accessible
   - The `/enqueue-run` POST endpoint is implemented
   - The `CLOUD_RUN_URL` secret matches the Replit deployment URL

