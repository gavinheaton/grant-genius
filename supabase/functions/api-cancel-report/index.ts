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
  let clientName: string | null = null;

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

    // 2. Check if API access is enabled
    const { data: settings } = await supabase
      .from("api_settings")
      .select("is_enabled")
      .limit(1)
      .single();

    if (!settings?.is_enabled) {
      responseStatus = 503;
      return new Response(
        JSON.stringify({ error: "API access is currently disabled" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Parse request body
    const body = await req.json();
    const { run_id, client_name } = body;
    clientName = client_name || null;

    if (!run_id) {
      responseStatus = 400;
      return new Response(
        JSON.stringify({ error: "run_id is required" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Fetch the report run
    const { data: reportRun, error: runError } = await supabase
      .from("report_runs")
      .select("id, status, webhook_url")
      .eq("id", run_id)
      .maybeSingle();

    if (runError || !reportRun) {
      responseStatus = 404;
      return new Response(
        JSON.stringify({ error: "Report run not found" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Idempotent: already stopped
    if (reportRun.status !== "pending" && reportRun.status !== "running") {
      responseStatus = 200;

      await supabase.from("api_usage_logs").insert({
        client_name: clientName,
        endpoint: "cancel-report",
        report_run_id: run_id,
        source: "api",
        response_status: responseStatus,
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: "Report generation already stopped",
          already_stopped: true,
        }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Cancel: mark run as failed
    await supabase
      .from("report_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        current_step: 0,
        phase: null,
        halt_reason: "Cancelled via API",
      })
      .eq("id", run_id);

    // 7. Clear worker logs
    await supabase
      .from("report_logs")
      .delete()
      .eq("report_run_id", run_id);

    // 8. Fail pending/running steps
    await supabase
      .from("report_run_steps")
      .update({
        status: "failed",
        error_message: "Cancelled via API",
        completed_at: new Date().toISOString(),
      })
      .eq("report_run_id", run_id)
      .in("status", ["pending", "running"]);

    // 9. Refund credit
    const { data: consumption } = await supabase
      .from("entitlement_consumptions")
      .select("id, entitlement_id")
      .eq("report_run_id", run_id)
      .maybeSingle();

    if (consumption) {
      await supabase.rpc("decrement_entitlement", {
        ent_id: consumption.entitlement_id,
      });
      await supabase
        .from("entitlement_consumptions")
        .delete()
        .eq("id", consumption.id);
      console.log(`Credit refunded for cancelled run ${run_id}`);
    }

    // 10. Fire failure webhook if configured
    if (reportRun.webhook_url) {
      try {
        await fetch(reportRun.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "report.failed",
            run_id,
            status: "failed",
            halt_reason: "Cancelled via API",
          }),
        });
        console.log(`Webhook fired to ${reportRun.webhook_url} for cancelled run ${run_id}`);
      } catch (webhookErr) {
        console.error("Webhook delivery failed:", webhookErr);
      }
    }

    responseStatus = 200;
    console.log(`Report run ${run_id} cancelled via API`);

    // 11. Log API usage
    await supabase.from("api_usage_logs").insert({
      client_name: clientName,
      endpoint: "cancel-report",
      report_run_id: run_id,
      source: "api",
      response_status: responseStatus,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Report generation cancelled",
      }),
      { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("api-cancel-report error:", error);

    try {
      await supabase.from("api_usage_logs").insert({
        client_name: clientName,
        endpoint: "cancel-report",
        source: "api",
        response_status: responseStatus,
      });
    } catch { /* ignore logging errors */ }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
