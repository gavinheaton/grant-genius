import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // 1. Get the report_run_id from the request
    const { report_run_id } = await req.json();

    if (!report_run_id) {
      return new Response(
        JSON.stringify({ error: "report_run_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch the secrets
    const workerUrl = Deno.env.get("CLOUD_RUN_URL");
    const workerSecret = Deno.env.get("WORKER_SECRET");

    if (!workerUrl || !workerSecret) {
      console.error("Missing CLOUD_RUN_URL or WORKER_SECRET");
      return new Response(
        JSON.stringify({ error: "Worker configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Enqueuing report run: ${report_run_id}`);

    // 3. Trigger the Worker via the /enqueue-run endpoint
    const fullUrl = `${workerUrl}/enqueue-run`;
    console.log(`Calling worker at: ${fullUrl}`);

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ report_run_id }),
    });

    const responseText = await response.text();
    console.log(`Worker response status: ${response.status}`);

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
  } catch (error) {
    console.error("Error in enqueue-report:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
