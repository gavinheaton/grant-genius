

# Switch to OpenAI Primary with Gemini Fallback

## Overview

Invert the AI provider priority so OpenAI (`gpt-4o-mini`) is tried first, with Gemini via Lovable AI as the fallback if OpenAI fails or is rate-limited.

---

## Current Flow

```text
Request → Lovable AI (Gemini) → [retry 3x on 429] → OpenAI fallback
```

## New Flow

```text
Request → OpenAI (gpt-4o-mini) → [retry 3x on 429] → Lovable AI (Gemini) fallback
```

---

## Implementation

### Update `callAIWithRetry` function

Swap the primary and fallback providers:

```typescript
async function callAIWithRetry(prompt: string, maxRetries: number = 3): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  if (!OPENAI_API_KEY) {
    // No OpenAI key - go straight to Gemini
    console.log("No OpenAI key configured, using Lovable AI");
    return await callLovableAI(prompt);
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callOpenAI(OPENAI_API_KEY, prompt);  // Primary
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes("429")) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(r => setTimeout(r, delay));
        lastError = error instanceof Error ? error : new Error(errorMessage);
        continue;
      }
      
      throw error;
    }
  }
  
  // OpenAI retries exhausted - try Lovable AI fallback
  console.log("OpenAI retries exhausted, attempting Lovable AI fallback");
  return await callLovableAI(prompt);  // Fallback
}
```

### Rename and refactor AI functions

| Current Function | New Function | Role |
|------------------|--------------|------|
| `callLovableAI(apiKey, prompt)` | `callLovableAI(prompt)` | Fallback (gets key internally) |
| `callOpenAIFallback(prompt)` | `callOpenAI(apiKey, prompt)` | Primary |

**`callOpenAI` (Primary):**
```typescript
async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a research commercialization expert..." },
        { role: "user", content: prompt }
      ],
    }),
  });
  // ... error handling
}
```

**`callLovableAI` (Fallback):**
```typescript
async function callLovableAI(prompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    throw new Error("AI service temporarily unavailable.");
  }
  
  console.log("Using Lovable AI (Gemini) fallback");
  
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: "You are a research commercialization expert..." },
        { role: "user", content: prompt }
      ],
    }),
  });
  // ... error handling
}
```

---

## Files to Modify

1. `supabase/functions/generate-report/index.ts`
   - Refactor `callAIWithRetry` to use OpenAI first
   - Rename `callOpenAIFallback` → `callOpenAI` (primary)
   - Refactor `callLovableAI` to get its own API key (fallback)
   - Update logging to reflect new priority

---

## Benefits

| Aspect | Result |
|--------|--------|
| **Reliability** | OpenAI has proven more stable for this workload |
| **Fallback** | Gemini still available if OpenAI is rate-limited |
| **Graceful degradation** | If OpenAI key missing, uses Gemini directly |

