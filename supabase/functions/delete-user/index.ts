import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity using their JWT
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is super_admin using service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: Super Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string") {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Manually delete related data (no CASCADE from auth.users)
    // Order matters due to foreign key constraints

    // Get application IDs for this user
    const { data: apps } = await adminClient
      .from("applications")
      .select("id")
      .eq("user_id", userId);
    const appIds = apps?.map((a) => a.id) || [];

    if (appIds.length > 0) {
      // Delete report-related data
      const { data: reports } = await adminClient
        .from("reports")
        .select("id")
        .eq("user_id", userId);
      const reportIds = reports?.map((r) => r.id) || [];

      if (reportIds.length > 0) {
        await adminClient.from("report_reviews").delete().in("report_id", reportIds);
      }

      // Delete report runs and their steps/logs
      const { data: runs } = await adminClient
        .from("report_runs")
        .select("id")
        .in("application_id", appIds);
      const runIds = runs?.map((r) => r.id) || [];

      if (runIds.length > 0) {
        await adminClient.from("report_run_steps").delete().in("report_run_id", runIds);
        await adminClient.from("report_logs").delete().in("report_run_id", runIds);
        await adminClient.from("entitlement_consumptions").delete().in("report_run_id", runIds);
      }

      await adminClient.from("reports").delete().eq("user_id", userId);
      await adminClient.from("report_runs").delete().in("application_id", appIds);
      await adminClient.from("evidence_items").delete().eq("user_id", userId);
      await adminClient.from("applications").delete().eq("user_id", userId);
    }

    // Delete entitlements and related consumptions
    const { data: ents } = await adminClient
      .from("entitlements")
      .select("id")
      .eq("user_id", userId);
    const entIds = ents?.map((e) => e.id) || [];
    if (entIds.length > 0) {
      await adminClient.from("entitlement_consumptions").delete().in("entitlement_id", entIds);
    }
    await adminClient.from("entitlements").delete().eq("user_id", userId);

    await adminClient.from("orders").delete().eq("user_id", userId);
    await adminClient.from("email_outbox").delete().eq("user_id", userId);
    await adminClient.from("app_events").delete().eq("user_id", userId);
    await adminClient.from("user_roles").delete().eq("user_id", userId);
    await adminClient.from("profiles").delete().eq("user_id", userId);

    // Finally delete the auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-user error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
