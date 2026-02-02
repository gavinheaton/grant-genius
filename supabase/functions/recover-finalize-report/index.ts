// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

/**
 * Deterministic finalization fallback
 * 
 * When the AI final step (finalize_report_html) fails to produce valid output,
 * this function assembles the report from the completed prior steps:
 * - assemble_sections_html → sections_html
 * - build_tables_sources_html → tables, all_sources
 */
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Create Supabase client from user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase: any = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Also get the user's client for RLS-safe operations
    const authHeader = req.headers.get("Authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
      auth: { persistSession: false },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    if (authError || !user) {
      return errorResponse("Unauthorized", 401);
    }

    const { reportRunId } = await req.json();
    if (!reportRunId) {
      return errorResponse("reportRunId is required");
    }

    console.log(`[RECOVER] Starting deterministic finalization for run: ${reportRunId}`);

    // 1. Load the report run with application data
    const { data: run, error: runError } = await supabase
      .from("report_runs")
      .select(`
        id,
        status,
        current_step,
        total_steps,
        report_template_version_id,
        application:applications (
          id,
          inputs_json,
          grant_version_id,
          user_id,
          title
        )
      `)
      .eq("id", reportRunId)
      .single();

    if (runError || !run) {
      console.error("Failed to fetch run:", runError);
      return errorResponse("Report run not found", 404);
    }

    const application = run.application;
    if (!application) {
      return errorResponse("Application not found", 404);
    }

    // Verify user owns this application
    if (application.user_id !== user.id) {
      return errorResponse("Unauthorized - you don't own this application", 403);
    }

    // 2. Load all completed steps
    const { data: steps, error: stepsError } = await supabase
      .from("report_run_steps")
      .select("step_number, step_name, status, outputs_json")
      .eq("report_run_id", reportRunId)
      .order("step_number", { ascending: true });

    if (stepsError) {
      console.error("Failed to fetch steps:", stepsError);
      return errorResponse("Failed to load step data", 500);
    }

    console.log(`[RECOVER] Found ${steps?.length || 0} steps`);

    // 3. Find the assembly steps by name (works with any pipeline length)
    const assembleSectionsStep = steps?.find(
      (s: any) => s.step_name === "assemble_sections_html" && s.status === "completed"
    );
    const buildTablesStep = steps?.find(
      (s: any) => s.step_name === "build_tables_sources_html" && s.status === "completed"
    );
    const finalizeStep = steps?.find(
      (s: any) => s.step_name === "finalize_report_html"
    );

    if (!assembleSectionsStep?.outputs_json?.sections_html) {
      console.error("[RECOVER] Missing sections_html from assemble_sections_html step");
      return errorResponse("Cannot recover: missing sections_html from assembly step. Manual intervention required.", 400);
    }

    if (!buildTablesStep?.outputs_json) {
      console.error("[RECOVER] Missing outputs from build_tables_sources_html step");
      return errorResponse("Cannot recover: missing tables data from build step. Manual intervention required.", 400);
    }

    const sectionsHtml = assembleSectionsStep.outputs_json.sections_html as string;
    const tables = (buildTablesStep.outputs_json.tables || {}) as Record<string, string>;
    const allSources = (buildTablesStep.outputs_json.all_sources || []) as Array<{
      title?: string;
      url?: string;
      source?: string;
    }>;
    const dataGaps = (buildTablesStep.outputs_json.data_gaps || []) as string[];

    console.log(`[RECOVER] sections_html length: ${sectionsHtml.length}`);
    console.log(`[RECOVER] tables keys: ${Object.keys(tables).join(", ")}`);
    console.log(`[RECOVER] sources count: ${allSources.length}`);

    // 4. Deterministically build report_html
    let reportHtml = sectionsHtml;

    // Replace table anchors
    const tableAnchors = ["competitors", "market_sizing", "partners"];
    for (const tableId of tableAnchors) {
      const anchor = `<!-- TABLE:${tableId} -->`;
      if (tables[tableId]) {
        if (reportHtml.includes(anchor)) {
          reportHtml = reportHtml.replace(anchor, tables[tableId]);
        } else {
          // Append missing table at the end
          const tableTitle = tableId.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase());
          reportHtml += `\n<h2>${tableTitle}</h2>\n${tables[tableId]}`;
        }
      }
    }

    // Append any remaining tables not in the standard list
    for (const [tableId, tableHtml] of Object.entries(tables)) {
      if (!tableAnchors.includes(tableId) && tableHtml) {
        const tableTitle = tableId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        reportHtml += `\n<h2>${tableTitle}</h2>\n${tableHtml}`;
      }
    }

    // Append references section
    if (allSources.length > 0) {
      const sourcesList = allSources.map((src, idx) => {
        const title = src.title || src.source || `Source ${idx + 1}`;
        const url = src.url || "";
        if (url) {
          return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></li>`;
        }
        return `<li>${title}</li>`;
      }).join("\n");
      
      reportHtml += `\n<h2>References</h2>\n<ul>\n${sourcesList}\n</ul>`;
    }

    console.log(`[RECOVER] Final report_html length: ${reportHtml.length}`);

    // 5. Build content_json in expected format
    const contentJson = {
      assembledReport: {
        title: application.title || "Commercialisation Research Report",
        report_html: reportHtml,
        tables: tables,
        all_sources: allSources,
        data_gaps: dataGaps,
      }
    };

    // 6. Get next version number
    const { data: existingReports } = await supabase
      .from("reports")
      .select("version_number")
      .eq("application_id", application.id)
      .order("version_number", { ascending: false })
      .limit(1);

    const nextVersion = (existingReports?.[0]?.version_number || 0) + 1;

    // 7. Insert the report
    const { data: newReport, error: insertError } = await supabase
      .from("reports")
      .insert({
        application_id: application.id,
        user_id: application.user_id,
        report_run_id: reportRunId,
        grant_version_id: application.grant_version_id,
        report_template_version_id: run.report_template_version_id,
        inputs_snapshot_json: application.inputs_json || {},
        content_json: contentJson,
        citations_json: allSources,
        version_number: nextVersion,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to insert report:", insertError);
      return errorResponse("Failed to save recovered report", 500);
    }

    console.log(`[RECOVER] Created report: ${newReport.id}`);

    // 8. Update finalize step to completed
    if (finalizeStep) {
      await supabase
        .from("report_run_steps")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          outputs_json: {
            report_html: reportHtml,
            recovered: true,
            recovery_timestamp: new Date().toISOString(),
          },
          error_message: null,
        })
        .eq("report_run_id", reportRunId)
        .eq("step_name", "finalize_report_html");
    }

    // 9. Mark run as completed
    await supabase
      .from("report_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        phase: "complete",
      })
      .eq("id", reportRunId);

    // 10. Handle credit re-consumption if needed
    // Check if entitlement_consumptions exists for this run
    const { data: existingConsumption } = await supabase
      .from("entitlement_consumptions")
      .select("id")
      .eq("report_run_id", reportRunId)
      .maybeSingle();

    if (!existingConsumption) {
      console.log("[RECOVER] No consumption record - re-consuming credit");
      
      // Find an available entitlement
      const { data: entitlements } = await supabase
        .from("entitlements")
        .select("id, quantity, used_quantity, expires_at")
        .eq("user_id", application.user_id)
        .eq("entitlement_type", "REPORT_ONE_OFF");

      const availableEntitlement = entitlements?.find((e: any) => {
        const notExpired = !e.expires_at || new Date(e.expires_at) > new Date();
        const hasQuantity = e.quantity > e.used_quantity;
        return notExpired && hasQuantity;
      });

      if (availableEntitlement) {
        // Increment used_quantity
        await supabase
          .from("entitlements")
          .update({ used_quantity: availableEntitlement.used_quantity + 1 })
          .eq("id", availableEntitlement.id);

        // Create consumption record
        await supabase
          .from("entitlement_consumptions")
          .insert({
            entitlement_id: availableEntitlement.id,
            report_run_id: reportRunId,
            report_id: newReport.id,
          });

        console.log(`[RECOVER] Re-consumed credit from entitlement: ${availableEntitlement.id}`);
      } else {
        console.warn("[RECOVER] No available entitlement to consume - report created but no credit charged");
      }
    } else {
      // Update existing consumption with report_id
      await supabase
        .from("entitlement_consumptions")
        .update({ report_id: newReport.id })
        .eq("id", existingConsumption.id);
    }

    // Log the recovery
    await supabase
      .from("report_logs")
      .insert({
        report_run_id: reportRunId,
        level: "info",
        message: "Report recovered using deterministic finalization",
        timestamp: new Date().toISOString(),
        details: {
          report_id: newReport.id,
          version_number: nextVersion,
          sections_html_length: sectionsHtml.length,
          tables_count: Object.keys(tables).length,
          sources_count: allSources.length,
        },
      });

    console.log(`[RECOVER] Recovery complete for run: ${reportRunId}`);

    return jsonResponse({
      success: true,
      reportId: newReport.id,
      message: "Report recovered successfully using deterministic finalization",
    });

  } catch (error) {
    console.error("recover-finalize-report error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
