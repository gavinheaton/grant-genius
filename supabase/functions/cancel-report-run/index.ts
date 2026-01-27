import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const { reportRunId } = await req.json();

    if (!reportRunId) {
      return new Response(
        JSON.stringify({ error: "Report run ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user owns this report run via application
    const { data: reportRun, error: runError } = await supabaseClient
      .from("report_runs")
      .select(`
        id,
        status,
        application:applications!inner(user_id)
      `)
      .eq("id", reportRunId)
      .maybeSingle();

    if (runError || !reportRun) {
      return new Response(
        JSON.stringify({ error: "Report run not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check ownership - handle the nested select result properly
    // deno-lint-ignore no-explicit-any
    const appData = (reportRun.application as any);
    const ownerUserId = Array.isArray(appData) ? appData[0]?.user_id : appData?.user_id;
    if (ownerUserId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to report run" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only allow cancelling pending or running reports
    if (reportRun.status !== "pending" && reportRun.status !== "running") {
      return new Response(
        JSON.stringify({ error: "Report run is already completed or failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database writes
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Mark the report run as failed
    await supabaseAdmin
      .from("report_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", reportRunId);

    // Mark any pending or running steps as failed
    await supabaseAdmin
      .from("report_run_steps")
      .update({
        status: "failed",
        error_message: "Cancelled by user",
        completed_at: new Date().toISOString(),
      })
      .eq("report_run_id", reportRunId)
      .in("status", ["pending", "running"]);

    console.log(`Report run ${reportRunId} cancelled by user ${userId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Report generation cancelled" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in cancel-report-run:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
