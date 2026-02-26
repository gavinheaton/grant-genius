import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let responseStatus = 500;

  try {
    // 1. Validate API_SECRET_KEY
    const apiSecretKey = Deno.env.get("API_SECRET_KEY");
    if (!apiSecretKey) {
      responseStatus = 500;
      return new Response(
        JSON.stringify({ error: "API not configured" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "") !== apiSecretKey) {
      responseStatus = 401;
      return new Response(
        JSON.stringify({ error: "Invalid API key" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get run_id from query params or body
    let runId: string | null = null;

    const url = new URL(req.url);
    runId = url.searchParams.get("run_id");

    if (!runId && req.method === "POST") {
      const body = await req.json();
      runId = body.run_id;
    }

    if (!runId) {
      responseStatus = 400;
      return new Response(
        JSON.stringify({ error: "run_id is required" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch run status
    const { data: run, error: runError } = await supabase
      .from("report_runs")
      .select("id, status, current_step, total_steps, phase, halt_reason, created_at, completed_at")
      .eq("id", runId)
      .single();

    if (runError || !run) {
      responseStatus = 404;
      return new Response(
        JSON.stringify({ error: "Report run not found" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Fetch step progress
    const { data: steps } = await supabase
      .from("report_run_steps")
      .select("step_number, step_name, status, error_message")
      .eq("report_run_id", runId)
      .order("step_number", { ascending: true });

    // 5. If completed, fetch the report
    let reportHtml: string | null = null;
    let citations: unknown[] = [];

    if (run.status === "completed") {
      const { data: report } = await supabase
        .from("reports")
        .select("id, content_json, citations_json, pdf_path, docx_path")
        .eq("report_run_id", runId)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      if (report) {
        // Extract HTML from content_json
        const content = report.content_json as Record<string, unknown>;
        if (content?.assembledReport) {
          const assembled = content.assembledReport as Record<string, unknown>;
          reportHtml = (assembled.report_html as string) || null;
        }
        citations = (report.citations_json as unknown[]) || [];
      }
    }

    responseStatus = 200;

    // 6. Log API usage
    const clientName = req.headers.get("X-Client-Name") || null;
    await supabase.from("api_usage_logs").insert({
      client_name: clientName,
      endpoint: "report-status",
      report_run_id: runId,
      source: "api",
      response_status: responseStatus,
    });

    const result: Record<string, unknown> = {
      run_id: run.id,
      status: run.status,
      current_step: run.current_step,
      total_steps: run.total_steps,
      phase: run.phase,
      created_at: run.created_at,
      completed_at: run.completed_at,
      steps: steps || [],
    };

    if (run.status === "failed") {
      result.halt_reason = run.halt_reason;
    }

    if (run.status === "completed" && reportHtml) {
      result.report_html = reportHtml;
      result.citations = citations;
    }

    return new Response(JSON.stringify(result), {
      status: responseStatus,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("api-report-status error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
