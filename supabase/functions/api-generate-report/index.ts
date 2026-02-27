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

    // 2. Check if API access is enabled
    const { data: settings } = await supabase
      .from("api_settings")
      .select("is_enabled, default_grant_id, api_system_user_id")
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
    const {
      summary,
      public_article_url,
      grant_id,
      trl,
      ip_status,
      webhook_url,
      client_name,
      title,
    } = body;

    if (!summary) {
      responseStatus = 400;
      return new Response(
        JSON.stringify({ error: "summary is required" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Find the published grant version
    const targetGrantId = grant_id || settings.default_grant_id;

    if (!targetGrantId) {
      responseStatus = 400;
      return new Response(
        JSON.stringify({ error: "No grant_id provided and no default grant configured. Set a default grant in the API Management admin page." }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let grantVersionId: string;

    const { data: gv, error: gvError } = await supabase
      .from("grant_versions")
      .select("id")
      .eq("grant_id", targetGrantId)
      .eq("is_published", true)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    if (gvError || !gv) {
      responseStatus = 404;
      return new Response(
        JSON.stringify({ error: "No published grant version found for the specified grant" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    grantVersionId = gv.id;

    // 5. Find published report template version
    const { data: templateVersion, error: tvError } = await supabase
      .from("report_template_versions")
      .select("id")
      .eq("is_published", true)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();

    if (tvError || !templateVersion) {
      responseStatus = 500;
      return new Response(
        JSON.stringify({ error: "No published report template found" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Determine the application owner
    // Prefer configured api_system_user_id; fall back to first super_admin
    let systemUserId = settings.api_system_user_id;

    if (!systemUserId) {
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "super_admin")
        .limit(1)
        .single();

      if (!adminRole) {
        responseStatus = 500;
        return new Response(
          JSON.stringify({ error: "No system user configured. Set an API System User in the API Management admin page." }),
          { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      systemUserId = adminRole.user_id;
    }

    // 7. Create application record
    const inputsJson = {
      summary,
      publicArticleUrl: public_article_url || "",
      trl: trl || "",
      ipStatus: ip_status || "",
    };

    const { data: application, error: appError } = await supabase
      .from("applications")
      .insert({
        user_id: systemUserId,
        grant_version_id: grantVersionId,
        status: "draft",
        inputs_json: inputsJson,
        title: title || `API Report - ${client_name || "external"}`,
        api_source: client_name || "api",
      })
      .select("id")
      .single();

    if (appError || !application) {
      console.error("Failed to create application:", appError);
      responseStatus = 500;
      return new Response(
        JSON.stringify({ error: "Failed to create application" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Create report run
    const { data: reportRun, error: runError } = await supabase
      .from("report_runs")
      .insert({
        application_id: application.id,
        report_template_version_id: templateVersion.id,
        status: "pending",
        execution_engine: "cloud_run",
        execution_engine_reason: "api_triggered",
        webhook_url: webhook_url || null,
      })
      .select("id")
      .single();

    if (runError || !reportRun) {
      console.error("Failed to create report run:", runError);
      responseStatus = 500;
      return new Response(
        JSON.stringify({ error: "Failed to create report run" }),
        { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Update application status
    await supabase
      .from("applications")
      .update({ status: "in_progress" })
      .eq("id", application.id);

    // 10. Trigger enqueue-report
    const enqueueUrl = `${supabaseUrl}/functions/v1/enqueue-report`;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const enqueueResp = await fetch(enqueueUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ report_run_id: reportRun.id }),
    });

    const enqueueBody = await enqueueResp.text();
    console.log(`enqueue-report response: ${enqueueResp.status} - ${enqueueBody.substring(0, 200)}`);

    responseStatus = 200;

    // 11. Log API usage
    await supabase.from("api_usage_logs").insert({
      client_name: client_name || null,
      endpoint: "generate-report",
      report_run_id: reportRun.id,
      source: "api",
      response_status: responseStatus,
    });

    const projectId = supabaseUrl.replace("https://", "").split(".")[0];

    return new Response(
      JSON.stringify({
        run_id: reportRun.id,
        application_id: application.id,
        status: "enqueued",
        poll_url: `https://${projectId}.supabase.co/functions/v1/api-report-status?run_id=${reportRun.id}`,
      }),
      { status: responseStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("api-generate-report error:", error);

    // Log the failed attempt
    try {
      const body = await req.clone().json().catch(() => ({}));
      await supabase.from("api_usage_logs").insert({
        client_name: (body as Record<string, string>).client_name || null,
        endpoint: "generate-report",
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
