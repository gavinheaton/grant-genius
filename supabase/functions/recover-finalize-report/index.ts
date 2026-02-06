// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

// ============ Strategy Detection Functions ============

// Detect if a value looks like report HTML
function isReportHtml(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Must be substantial HTML with heading tags
  return value.length > 500 && (
    value.includes("<h1") || 
    value.includes("<h2") || 
    value.includes("<section") ||
    value.includes("<article")
  );
}

// Try to extract report HTML from step outputs
function extractReportFromStep(outputs: Record<string, unknown>): string | null {
  // Priority order of field names to check
  const fieldPriority = ["report_html", "report", "html", "content", "sections_html"];
  
  for (const field of fieldPriority) {
    if (outputs[field] && isReportHtml(outputs[field])) {
      return outputs[field] as string;
    }
  }
  
  // Also check nested structures (e.g., { assembledReport: { report_html: ... } })
  if (outputs.assembledReport && typeof outputs.assembledReport === "object") {
    const nested = outputs.assembledReport as Record<string, unknown>;
    for (const field of fieldPriority) {
      if (nested[field] && isReportHtml(nested[field])) {
        return nested[field] as string;
      }
    }
  }
  
  return null;
}

// Extract tables from step outputs (flexible field names)
function extractTablesFromStep(outputs: Record<string, unknown>): Record<string, string> {
  if (outputs.tables && typeof outputs.tables === "object" && !Array.isArray(outputs.tables)) {
    return outputs.tables as Record<string, string>;
  }
  return {};
}

// Extract sources from step outputs (flexible field names)
function extractSourcesFromStep(outputs: Record<string, unknown>): Array<{title?: string; url?: string; source?: string}> {
  const fieldNames = ["all_sources", "sources", "references", "citations"];
  for (const field of fieldNames) {
    if (Array.isArray(outputs[field])) {
      return outputs[field];
    }
  }
  return [];
}

// Extract data gaps from step outputs
function extractDataGapsFromStep(outputs: Record<string, unknown>): string[] {
  if (Array.isArray(outputs.data_gaps)) {
    return outputs.data_gaps;
  }
  return [];
}

/**
 * Multi-Strategy Finalization Recovery
 * 
 * Strategy 1 (Standard): Look for assemble_sections_html + build_tables_sources_html
 * Strategy 2 (Single-Prompt): Scan all completed steps for HTML content
 * Strategy 3 (Fallback): Return descriptive error with available data
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

    console.log(`[RECOVER] Starting multi-strategy finalization for run: ${reportRunId}`);

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

    // 2. Load all steps
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

    // Log all available step data for debugging
    for (const step of steps || []) {
      const outputKeys = step.outputs_json ? Object.keys(step.outputs_json) : [];
      console.log(`[RECOVER] Step ${step.step_number} (${step.step_name}): status=${step.status}, outputs=[${outputKeys.join(", ")}]`);
    }

    // ============ STRATEGY 1: Standard Multi-Step Pipeline ============
    const assembleSectionsStep = steps?.find(
      (s: any) => s.step_name === "assemble_sections_html" && s.status === "completed"
    );
    const buildTablesStep = steps?.find(
      (s: any) => s.step_name === "build_tables_sources_html" && s.status === "completed"
    );

    let reportHtml: string | null = null;
    let tables: Record<string, string> = {};
    let allSources: Array<{title?: string; url?: string; source?: string}> = [];
    let dataGaps: string[] = [];
    let recoveryStrategy = "unknown";

    if (assembleSectionsStep?.outputs_json?.sections_html && buildTablesStep?.outputs_json) {
      // Standard multi-step recovery
      console.log("[RECOVER] Using STANDARD multi-step recovery strategy");
      recoveryStrategy = "multi-step";
      
      reportHtml = assembleSectionsStep.outputs_json.sections_html as string;
      tables = (buildTablesStep.outputs_json.tables || {}) as Record<string, string>;
      allSources = (buildTablesStep.outputs_json.all_sources || []);
      dataGaps = (buildTablesStep.outputs_json.data_gaps || []) as string[];
      
      // Merge tables into report (anchor replacement)
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
    }

    // ============ STRATEGY 2: Single-Prompt Pipeline ============
    if (!reportHtml) {
      console.log("[RECOVER] Standard strategy failed, trying SINGLE-PROMPT strategy");
      
      // Scan completed steps for report content (latest first)
      const completedSteps = (steps || [])
        .filter((s: any) => s.status === "completed" && s.outputs_json)
        .sort((a: any, b: any) => b.step_number - a.step_number);
      
      for (const step of completedSteps) {
        const extracted = extractReportFromStep(step.outputs_json);
        if (extracted) {
          console.log(`[RECOVER] Found report HTML in step ${step.step_number} (${step.step_name})`);
          recoveryStrategy = "single-prompt";
          reportHtml = extracted;
          
          // Also try to extract tables and sources from same or other steps
          if (Object.keys(tables).length === 0) {
            tables = extractTablesFromStep(step.outputs_json);
          }
          if (allSources.length === 0) {
            allSources = extractSourcesFromStep(step.outputs_json);
          }
          if (dataGaps.length === 0) {
            dataGaps = extractDataGapsFromStep(step.outputs_json);
          }
          break;
        }
      }
      
      // If still no report found, try extracting from any step's nested fields
      if (!reportHtml) {
        for (const step of completedSteps) {
          const outputs = step.outputs_json || {};
          for (const [key, value] of Object.entries(outputs)) {
            if (isReportHtml(value)) {
              console.log(`[RECOVER] Found report HTML in step ${step.step_number}.${key}`);
              recoveryStrategy = "single-prompt-nested";
              reportHtml = value as string;
              break;
            }
          }
          if (reportHtml) break;
        }
      }

      // Try to collect tables/sources from other steps if not found yet
      if (reportHtml && (Object.keys(tables).length === 0 || allSources.length === 0)) {
        for (const step of completedSteps) {
          if (Object.keys(tables).length === 0) {
            tables = extractTablesFromStep(step.outputs_json);
          }
          if (allSources.length === 0) {
            allSources = extractSourcesFromStep(step.outputs_json);
          }
          if (dataGaps.length === 0) {
            dataGaps = extractDataGapsFromStep(step.outputs_json);
          }
        }
      }
    }

    // ============ STRATEGY 3: Cannot Recover ============
    if (!reportHtml) {
      const availableData = (steps || [])
        .filter((s: any) => s.status === "completed")
        .map((s: any) => ({
          step: s.step_number as number,
          name: s.step_name as string,
          outputFields: s.outputs_json ? Object.keys(s.outputs_json) : [] as string[],
        }));
      
      console.error("[RECOVER] No recovery strategy succeeded. Available:", JSON.stringify(availableData));
      
      const stepsDescription = availableData.map((s: { name: string; outputFields: string[] }) => 
        `${s.name}(${s.outputFields.join(",")})`
      ).join(", ");
      
      return errorResponse(
        `Cannot recover: no report HTML found in any completed step. ` +
        `Available steps: ${stepsDescription}. ` +
        `Manual intervention required.`,
        400
      );
    }

    console.log(`[RECOVER] Using ${recoveryStrategy} strategy, report_html length: ${reportHtml.length}`);
    console.log(`[RECOVER] tables keys: ${Object.keys(tables).join(", ")}`);
    console.log(`[RECOVER] sources count: ${allSources.length}`);

    // Append references section if we have sources
    if (allSources.length > 0) {
      const sourcesList = allSources.map((src, idx) => {
        const title = src.title || src.source || `Source ${idx + 1}`;
        const url = src.url || "";
        if (url) {
          return `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></li>`;
        }
        return `<li>${title}</li>`;
      }).join("\n");
      
      // Only append if not already in the report
      if (!reportHtml.includes("<h2>References</h2>") && !reportHtml.includes("<h2>Sources</h2>")) {
        reportHtml += `\n<h2>References</h2>\n<ul>\n${sourcesList}\n</ul>`;
      }
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

    // 8. Update finalize step if it exists
    const finalizeStep = steps?.find(
      (s: any) => s.step_name === "finalize_report_html"
    );

    if (finalizeStep) {
      await supabase
        .from("report_run_steps")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          outputs_json: {
            report_html: reportHtml,
            recovered: true,
            recovery_strategy: recoveryStrategy,
            recovery_timestamp: new Date().toISOString(),
          },
          error_message: null,
        })
        .eq("report_run_id", reportRunId)
        .eq("step_name", "finalize_report_html");
    } else {
      // For pipelines without finalize step, mark the last failed step as recovered
      const lastStep = steps?.[steps.length - 1];
      if (lastStep && lastStep.status === "failed") {
        await supabase
          .from("report_run_steps")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            outputs_json: {
              ...lastStep.outputs_json,
              recovered: true,
              recovery_strategy: recoveryStrategy,
            },
            error_message: null,
          })
          .eq("report_run_id", reportRunId)
          .eq("step_number", lastStep.step_number);
      }
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
        message: `Report recovered using ${recoveryStrategy} strategy`,
        timestamp: new Date().toISOString(),
        details: {
          report_id: newReport.id,
          version_number: nextVersion,
          recovery_strategy: recoveryStrategy,
          report_html_length: reportHtml.length,
          tables_count: Object.keys(tables).length,
          sources_count: allSources.length,
        },
      });

    console.log(`[RECOVER] Recovery complete for run: ${reportRunId}`);

    return jsonResponse({
      success: true,
      reportId: newReport.id,
      recoveryStrategy,
      message: `Report recovered successfully using ${recoveryStrategy} strategy`,
    });

  } catch (error) {
    console.error("recover-finalize-report error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});
