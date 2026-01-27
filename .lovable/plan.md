

# Implement Fallback AI System with OpenAI API Key

## Overview

Add a robust AI fallback system to the report generation pipeline that:
1. Tries Lovable AI (Gemini) first
2. Falls back to your private OpenAI API if rate limited (429)
3. Includes retry logic with exponential backoff
4. Provides clear error messages to users

---

## Implementation Steps

### Step 1: Add OpenAI API Key Secret

Use the secrets tool to request your OpenAI API key. This will be stored securely and accessible only to backend functions.

**Secret Name:** `OPENAI_API_KEY`

---

### Step 2: Update generate-report Edge Function

Modify `supabase/functions/generate-report/index.ts` to implement:

**A) Retry Logic with Exponential Backoff**
```typescript
async function callAIWithRetry(
  prompt: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Try Lovable AI first
      return await callLovableAI(prompt);
    } catch (error) {
      if (error.message.includes("429")) {
        // Rate limited - wait with exponential backoff
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delay));
        lastError = error;
        continue;
      }
      throw error; // Non-rate-limit error
    }
  }
  
  // All retries failed - try OpenAI fallback
  return await callOpenAIFallback(prompt);
}
```

**B) OpenAI Fallback Function**
```typescript
async function callOpenAIFallback(prompt: string): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  if (!OPENAI_API_KEY) {
    throw new Error("AI service temporarily unavailable. Please try again later.");
  }
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // Cost-effective, fast model
      messages: [
        {
          role: "system",
          content: "You are a research commercialization expert..."
        },
        { role: "user", content: prompt }
      ],
    }),
  });
  
  // Handle response...
}
```

**C) Update All Step Calls**

Replace each `callLovableAI()` call in the 10-step pipeline with `callAIWithRetry()`:
```typescript
// Before
const contextResult = await callLovableAI(LOVABLE_API_KEY, contextPrompt);

// After  
const contextResult = await callAIWithRetry(contextPrompt);
```

---

### Step 3: Add User-Facing Error Handling

Update the frontend to show clear error messages when generation fails:

**In `useReportGeneration.ts`:**
```typescript
if (error.message.includes("rate limit") || error.message.includes("429")) {
  toast({
    title: "High demand",
    description: "The AI service is busy. Please wait a minute and try again.",
    variant: "destructive",
  });
}
```

---

## Technical Details

| Component | Change |
|-----------|--------|
| `OPENAI_API_KEY` secret | New secret for fallback |
| `callAIWithRetry()` | New function with 3 retries + backoff |
| `callOpenAIFallback()` | New function using OpenAI API |
| Step pipeline | Use retry wrapper for all 10 steps |
| Error messages | User-friendly rate limit messaging |

**Model Selection:**
- Primary: `google/gemini-3-flash-preview` (Lovable AI)
- Fallback: `gpt-4o-mini` (OpenAI) - fast, cost-effective

---

## Files to Modify

1. `supabase/functions/generate-report/index.ts` - Add retry logic and OpenAI fallback
2. `src/hooks/useReportGeneration.ts` - Improve error messaging

---

## After Implementation

Once approved, I will:
1. Request your OpenAI API key using the secrets tool
2. Update the edge function with the fallback system
3. Deploy and test the report generation flow

