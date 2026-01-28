

# Fix DOCX Download: Blob Handling Issue

## Problem

The error `TypeError: Failed to execute 'createObjectURL' on 'URL': Overload resolution failed` occurs because:

1. The edge function returns binary data (ArrayBuffer) with correct DOCX content-type
2. `supabase.functions.invoke()` automatically tries to parse responses as JSON
3. The returned `response.data` is not a proper Blob object
4. `URL.createObjectURL()` fails because it requires a valid Blob

## Solution

Use `fetch` directly instead of `supabase.functions.invoke()` to get the raw binary response as a Blob.

## Changes Required

### File: `src/components/workspace/ReportsList.tsx`

Update the `handleGenerateDocx` function to use `fetch` directly:

```typescript
const handleGenerateDocx = useCallback(async (report: Report) => {
  if (!docxTemplate) {
    toast({
      title: "No DOCX template",
      description: "Please ask an admin to upload a DOCX template first.",
      variant: "destructive",
    });
    return;
  }

  setGeneratingDocx(report.id);

  try {
    // Get current session for auth header
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      throw new Error("Not authenticated");
    }

    // Use fetch directly to get binary response as blob
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-docx`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionData.session.access_token}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ reportId: report.id }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to generate DOCX");
    }

    // Get response as blob
    const blob = await response.blob();

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${grantName.replace(/\s+/g, "_")}_Report_v${report.version_number}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "DOCX Generated",
      description: "Your Word document has been downloaded.",
    });
  } catch (error: any) {
    console.error("DOCX generation error:", error);
    toast({
      title: "DOCX Generation Failed",
      description: error.message || "Failed to generate DOCX. Please try again.",
      variant: "destructive",
    });
  } finally {
    setGeneratingDocx(null);
  }
}, [docxTemplate, grantName]);
```

## Why This Works

1. **`fetch()` with `response.blob()`**: Unlike `supabase.functions.invoke()`, using `fetch` directly gives us full control over how to handle the response body
2. **Binary data preserved**: Calling `response.blob()` correctly interprets the binary ArrayBuffer as a Blob
3. **Proper MIME type**: The Blob inherits the correct content-type (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) from the response headers
4. **`URL.createObjectURL()` works**: Now receives a valid Blob object

## Files to Modify

| File | Change |
|------|--------|
| `src/components/workspace/ReportsList.tsx` | Replace `supabase.functions.invoke()` with direct `fetch()` call using `response.blob()` |

## Technical Notes

- The edge function is working correctly - it returns an ArrayBuffer with proper headers
- Only the frontend blob handling needs to be fixed
- This same pattern should be used for any edge function that returns binary data (PDFs, images, etc.)

