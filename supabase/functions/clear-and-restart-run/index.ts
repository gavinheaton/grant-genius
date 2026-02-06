import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { reportRunId } = await req.json();

    if (!reportRunId) {
      return new Response(
        JSON.stringify({ error: "reportRunId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is a Super Admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleError) {
      console.error("Role lookup error:", roleError);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (roleData?.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Super Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Super Admin ${user.id} clearing and restarting run ${reportRunId}`);

    // Delete all steps for this run
    const { error: deleteError } = await supabaseAdmin
      .from("report_run_steps")
      .delete()
      .eq("report_run_id", reportRunId);

    if (deleteError) {
      console.error("Error deleting steps:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete steps" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset the run to step 0 with pending status
    const { error: updateError } = await supabaseAdmin
      .from("report_runs")
      .update({
        status: "pending",
        current_step: 0,
        checkpoint_data_json: {},
        checkpoint_citations_json: [],
        started_at: null,
        completed_at: null,
      })
      .eq("id", reportRunId);

    if (updateError) {
      console.error("Error resetting run:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to reset run" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Trigger the worker via enqueue-report
    const workerUrl = Deno.env.get("CLOUD_RUN_URL");
    const workerSecret = Deno.env.get("WORKER_SECRET");

    if (workerUrl && workerSecret) {
      try {
        const response = await fetch(`${workerUrl}/enqueue-run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${workerSecret}`,
          },
          body: JSON.stringify({ report_run_id: reportRunId }),
        });

        const result = await response.json();
        console.log(`Worker enqueue response: ${response.status}`, result);
      } catch (e) {
        console.error("Failed to enqueue with worker, run will need manual resume:", e);
      }
    }

    console.log(`Run ${reportRunId} cleared and restarted successfully`);

    return new Response(
      JSON.stringify({ success: true, message: "Run cleared and restarted" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in clear-and-restart-run:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
