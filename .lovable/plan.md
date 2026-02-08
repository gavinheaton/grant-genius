
# Fix: Process Grant Guidelines Parsing Error

## Problem Summary

The `process-grant-guidelines` edge function fails with "Failed to parse extraction response" at the Step 1 extraction phase. The code doesn't log the actual AI response, making debugging impossible.

## Root Cause Analysis

The parsing logic has several weaknesses:

1. **No logging of AI response** - When parsing fails, we don't know what was received
2. **Silent JSON.parse failures** - If `JSON.parse()` throws, it propagates up without context
3. **Gemini-3 response format** - The tool call response structure may differ from expected

```text
Step 1: Extracting Grant DNA Pack...
        │
        ├── AI returns response
        │           │
        │           ├── toolCall?.function?.arguments exists?
        │           │           │
        │           │           ├── YES → JSON.parse(arguments)
        │           │           │              └── May throw SyntaxError (no catch)
        │           │           │
        │           │           └── NO → Check content for JSON
        │           │                          └── May also fail to parse
        │           │
        │           └── suggestions is undefined → throw "Failed to parse"
        │
        └── No log of what AI actually returned
```

## Solution

### 1. Add Comprehensive Logging

Log the full AI response structure before parsing so we can see what's happening:

```typescript
console.log("Extraction response structure:", JSON.stringify({
  hasChoices: !!extractionResult.choices,
  choiceCount: extractionResult.choices?.length,
  hasMessage: !!extractionResult.choices?.[0]?.message,
  hasToolCalls: !!extractionResult.choices?.[0]?.message?.tool_calls,
  toolCallCount: extractionResult.choices?.[0]?.message?.tool_calls?.length,
  contentLength: extractionResult.choices?.[0]?.message?.content?.length,
  finishReason: extractionResult.choices?.[0]?.finish_reason,
}, null, 2));
```

### 2. Wrap JSON.parse in Try-Catch

Add proper error handling around JSON parsing with detailed error messages:

```typescript
const toolCall = extractionResult.choices?.[0]?.message?.tool_calls?.[0];
if (toolCall?.function?.arguments) {
  try {
    suggestions = JSON.parse(toolCall.function.arguments);
    console.log("Successfully parsed tool call arguments");
  } catch (parseError) {
    console.error("Failed to parse tool call arguments:", parseError);
    console.error("Raw arguments (first 1000 chars):", toolCall.function.arguments.substring(0, 1000));
  }
}

if (!suggestions) {
  const content = extractionResult.choices?.[0]?.message?.content;
  if (content) {
    console.log("Attempting content fallback, content length:", content.length);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        suggestions = JSON.parse(jsonMatch[0]);
        console.log("Successfully parsed from content fallback");
      } catch (parseError) {
        console.error("Failed to parse content JSON:", parseError);
        console.error("Raw match (first 1000 chars):", jsonMatch[0].substring(0, 1000));
      }
    } else {
      console.error("No JSON object found in content");
    }
  } else {
    console.error("No content in response");
  }
}
```

### 3. Handle Gemini-3 Specific Response Formats

Gemini models sometimes return tool calls in a slightly different structure. Add additional fallback paths:

```typescript
// Some models use tool_calls, others use function_call
const message = extractionResult.choices?.[0]?.message;
let toolCallArgs: string | undefined;

// Try standard OpenAI format
if (message?.tool_calls?.[0]?.function?.arguments) {
  toolCallArgs = message.tool_calls[0].function.arguments;
}
// Try older function_call format
else if (message?.function_call?.arguments) {
  toolCallArgs = message.function_call.arguments;
}
// Try Gemini's grounding structure
else if (message?.tool_calls?.[0]?.args) {
  // Gemini sometimes puts args directly, not as string
  suggestions = message.tool_calls[0].args;
}
```

### 4. Fallback to Simpler Model

If Gemini-3-Flash-Preview is having issues, add a retry with a known-stable model:

```typescript
// After first attempt fails, retry with stable model
if (!suggestions) {
  console.log("Retrying extraction with gemini-2.5-flash...");
  
  const retryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: extractionPrompt },
        { role: "user", content: `Analyze these grant guidelines and extract the Grant DNA Pack. Return ONLY valid JSON:\n\n${guidelines_text.substring(0, 60000)}` },
      ],
      // Note: Skip tool_choice for simpler response
    }),
  });
  
  // Parse retry response...
}
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/process-grant-guidelines/index.ts` | Add logging, error handling, fallback parsing, and retry logic |

## Implementation Details

### Location: Lines 1666-1688

Replace the current parsing block with enhanced version that:
1. Logs the response structure before parsing
2. Wraps each JSON.parse in try-catch
3. Logs what was attempted and what failed
4. Handles multiple possible response formats
5. Adds a retry with simpler model if first attempt fails

## Testing Checklist

1. [ ] Upload a grant guidelines PDF
2. [ ] Check edge function logs for response structure
3. [ ] Verify parsing succeeds or provides actionable error
4. [ ] If retry kicks in, verify it uses stable model
5. [ ] Confirm pipeline generation completes

## Expected Outcome

After this fix, either:
- **Success**: The parsing works with proper format handling
- **Debugging**: Logs show exactly what the AI returned so we can fix the prompt/model
