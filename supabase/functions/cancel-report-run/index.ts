import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
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

    // Check ownership (admins bypass)
    // deno-lint-ignore no-explicit-any
    const appData = (reportRun.application as any);
    const ownerUserId = Array.isArray(appData) ? appData[0]?.user_id : appData?.user_id;

    // Check if user is admin using service role
    const supabaseAdminCheck = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: isAdminResult } = await supabaseAdminCheck.rpc("is_admin", { _user_id: userId });
    const userIsAdmin = isAdminResult === true;

    if (ownerUserId !== userId && !userIsAdmin) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to report run" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Make cancellation idempotent - if already stopped, return success
    if (reportRun.status !== "pending" && reportRun.status !== "running") {
      console.log(`Report run ${reportRunId} already in status ${reportRun.status}, treating as cancelled`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Report generation already stopped",
          alreadyStopped: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database writes
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Mark the report run as failed and reset counters
    await supabaseAdmin
      .from("report_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        current_step: 0,
        phase: null,
      })
      .eq("id", reportRunId);

    // Clear worker logs for this run
    await supabaseAdmin
      .from("report_logs")
      .delete()
      .eq("report_run_id", reportRunId);

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

    // Refund the credit: find the consumption linked to this report run
    const { data: consumption } = await supabaseAdmin
      .from("entitlement_consumptions")
      .select("id, entitlement_id")
      .eq("report_run_id", reportRunId)
      .maybeSingle();

    if (consumption) {
      // Decrement used_quantity using the safe function
      await supabaseAdmin.rpc("decrement_entitlement", { 
        ent_id: consumption.entitlement_id 
      });
      
      // Delete the consumption record
      await supabaseAdmin
        .from("entitlement_consumptions")
        .delete()
        .eq("id", consumption.id);
        
      console.log(`Credit refunded for cancelled run ${reportRunId}`);
    }

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
