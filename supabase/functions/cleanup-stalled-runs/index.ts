import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CleanupRequest {
  run_id?: string; // Optional: clean up a specific run
  stale_threshold_minutes?: number; // Default: 10 minutes
}

interface CleanupResult {
  run_id: string;
  application_title: string | null;
  user_email: string | null;
  step: number;
  credit_refunded: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate admin access
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      // Create user client with auth header for getUser
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = userData.user.id;
      
      // Check if user is admin
      const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Authorization header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body: CleanupRequest = await req.json().catch(() => ({}));
    const thresholdMinutes = body.stale_threshold_minutes ?? 10;
    const specificRunId = body.run_id;

    console.log(`Cleanup request: run_id=${specificRunId}, threshold=${thresholdMinutes}min`);

    // Find stalled runs
    let query = supabase
      .from("report_runs")
      .select(`
        id,
        current_step,
        started_at,
        application_id,
        applications!inner(title, user_id, profiles:user_id(email))
      `)
      .in("status", ["running", "pending"]);

    if (specificRunId) {
      query = query.eq("id", specificRunId);
    } else {
      // Only runs started more than threshold minutes ago
      const thresholdTime = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();
      query = query.lt("started_at", thresholdTime);
    }

    const { data: stalledRuns, error: fetchError } = await query;

    if (fetchError) {
      console.error("Error fetching stalled runs:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!stalledRuns || stalledRuns.length === 0) {
      return new Response(JSON.stringify({ 
        message: "No stalled runs found", 
        cleaned: [] 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${stalledRuns.length} stalled run(s) to clean up`);

    const results: CleanupResult[] = [];

    for (const run of stalledRuns) {
      const runId = run.id;
      const currentStep = run.current_step;
      const applicationId = run.application_id;
      const app = run.applications as any;
      const applicationTitle = app?.title || null;
      const userEmail = app?.profiles?.email || null;
      const userId = app?.user_id;

      console.log(`Processing stalled run ${runId} at step ${currentStep}`);

      try {
        // 1. Update the report_run status to failed and reset counters
        const { error: runUpdateError } = await supabase
          .from("report_runs")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            current_step: 0,
            phase: null,
          })
          .eq("id", runId);

        if (runUpdateError) {
          console.error(`Failed to update run ${runId}:`, runUpdateError);
          continue;
        }

        // 2. Update the current step with error message
        const { error: stepUpdateError } = await supabase
          .from("report_run_steps")
          .update({
            status: "failed",
            error_message: "Edge function timed out (cleaned up by admin)",
            completed_at: new Date().toISOString(),
          })
          .eq("report_run_id", runId)
          .eq("step_number", currentStep);

        if (stepUpdateError) {
          console.error(`Failed to update step for run ${runId}:`, stepUpdateError);
        }

        // 3. Clear worker logs for this run
        await supabase
          .from("report_logs")
          .delete()
          .eq("report_run_id", runId);

        // 4. Refund credit if applicable
        let creditRefunded = false;
        if (userId) {
          // Find the entitlement consumption for this run
          const { data: consumption, error: consumptionError } = await supabase
            .from("entitlement_consumptions")
            .select("id, entitlement_id")
            .eq("report_run_id", runId)
            .maybeSingle();

          if (consumptionError) {
            console.error(`Error finding consumption for run ${runId}:`, consumptionError);
          } else if (consumption) {
            // Decrement the used_quantity on the entitlement
            const { error: decrementError } = await supabase.rpc("decrement_entitlement", {
              ent_id: consumption.entitlement_id,
            });

            if (decrementError) {
              console.error(`Failed to decrement entitlement:`, decrementError);
            } else {
              // Delete the consumption record
              const { error: deleteError } = await supabase
                .from("entitlement_consumptions")
                .delete()
                .eq("id", consumption.id);

              if (deleteError) {
                console.error(`Failed to delete consumption:`, deleteError);
              } else {
                creditRefunded = true;
                console.log(`Refunded credit for run ${runId}`);
              }
            }
          } else {
            console.log(`No consumption found for run ${runId} (may not have been charged)`);
          }
        }

        // 4. Update application status to failed
        const { error: appUpdateError } = await supabase
          .from("applications")
          .update({ status: "failed" })
          .eq("id", applicationId);

        if (appUpdateError) {
          console.error(`Failed to update application status:`, appUpdateError);
        }

        results.push({
          run_id: runId,
          application_title: applicationTitle,
          user_email: userEmail,
          step: currentStep,
          credit_refunded: creditRefunded,
        });

        console.log(`Successfully cleaned up run ${runId}`);
      } catch (err) {
        console.error(`Error processing run ${runId}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        message: `Cleaned up ${results.length} stalled run(s)`,
        cleaned: results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
