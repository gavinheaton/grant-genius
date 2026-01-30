// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Valid actions whitelist
const VALID_ACTIONS = [
  "get_run_context",
  "update_step",
  "update_run",
  "save_report",
  "refund_credit",
  "get_prompt_bundle",
] as const;

type Action = typeof VALID_ACTIONS[number];

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// Map Lovable AI models to Replit-compatible Gemini models
function mapToReplitModel(lovableModel: string | null | undefined): string {
  if (!lovableModel) {
    return "gemini-2.0-flash"; // Default
  }
  
  // Direct mapping from Lovable AI identifiers to Replit-supported models
  const mapping: Record<string, string> = {
    // Pro tier → gemini-1.5-pro
    "google/gemini-3-pro-preview": "gemini-1.5-pro",
    "google/gemini-2.5-pro": "gemini-1.5-pro",
    // Flash tier → gemini-2.0-flash (latest)
    "google/gemini-3-flash-preview": "gemini-2.0-flash",
    "google/gemini-2.5-flash": "gemini-2.0-flash",
    // Lite/fast tier → gemini-1.5-flash (cheaper/faster)
    "google/gemini-2.5-flash-lite": "gemini-1.5-flash",
  };
  
  return mapping[lovableModel] || "gemini-2.0-flash";
}

// Get default Lovable model based on step number (from UI logic in PromptStepEditor)
function getDefaultModelForStep(stepNumber: number): string {
  if (stepNumber <= 3) return "google/gemini-2.5-flash-lite";
  if (stepNumber <= 7) return "google/gemini-3-flash-preview";
  if (stepNumber === 11) return "google/gemini-3-pro-preview";
  return "google/gemini-2.5-flash-lite";
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // 1. Validate WORKER_SECRET
    const workerSecret = Deno.env.get("WORKER_SECRET");
    if (!workerSecret) {
      console.error("WORKER_SECRET not configured");
      return errorResponse("Server configuration error", 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Missing or invalid Authorization header", 401);
    }

    const providedSecret = authHeader.replace("Bearer ", "");
    if (providedSecret !== workerSecret) {
      return errorResponse("Invalid worker secret", 401);
    }

    // 2. Parse request body
    const body = await req.json();
    const { action, ...params } = body;

    if (!action || !VALID_ACTIONS.includes(action)) {
      return errorResponse(`Invalid action. Valid actions: ${VALID_ACTIONS.join(", ")}`);
    }

    // 3. Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase: any = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 4. Handle each action
    switch (action as Action) {
      case "get_run_context":
        return await handleGetRunContext(supabase, params);
      case "update_step":
        return await handleUpdateStep(supabase, params);
      case "update_run":
        return await handleUpdateRun(supabase, params);
      case "save_report":
        return await handleSaveReport(supabase, params);
      case "refund_credit":
        return await handleRefundCredit(supabase, params);
      case "get_prompt_bundle":
        return await handleGetPromptBundle(supabase);
      default:
        return errorResponse("Unknown action");
    }
  } catch (error) {
    console.error("worker-proxy error:", error);
    return errorResponse(error instanceof Error ? error.message : "Unknown error", 500);
  }
});

// ============================================
// ACTION HANDLERS
// ============================================

async function handleGetRunContext(supabase: any, params: Record<string, unknown>) {
  const { report_run_id } = params;
  
  if (!report_run_id || typeof report_run_id !== "string" || !isValidUUID(report_run_id)) {
    return errorResponse("Invalid report_run_id");
  }

  // Fetch the report run with application data
  const { data: run, error: runError } = await supabase
    .from("report_runs")
    .select(`
      id,
      status,
      current_step,
      total_steps,
      checkpoint_data_json,
      checkpoint_citations_json,
      report_template_version_id,
      application:applications (
        id,
        inputs_json,
        grant_version_id,
        user_id,
        title
      )
    `)
    .eq("id", report_run_id)
    .single();

  if (runError || !run) {
    console.error("Failed to fetch run:", runError);
    return errorResponse("Report run not found", 404);
  }

  // Fetch the active prompt bundle with steps
  const { data: bundle, error: bundleError } = await supabase
    .from("prompt_bundles")
    .select(`
      id,
      system_prompt,
      steps:prompt_bundle_steps (
        step_number,
        step_name,
        step_description,
        prompt_template,
        model_override,
        timeout_seconds,
        is_heavy,
        max_expected_seconds
      )
    `)
    .eq("is_active", true)
    .single();

  if (bundleError || !bundle) {
    console.error("Failed to fetch prompt bundle:", bundleError);
    return errorResponse("No active prompt bundle found", 404);
  }

  // Sort steps by step_number
  bundle.steps?.sort((a: any, b: any) => a.step_number - b.step_number);

  // Fetch grant context
  const application = run.application;
  let grantContext = null;

  if (application?.grant_version_id) {
    const { data: grantVersion, error: grantError } = await supabase
      .from("grant_versions")
      .select(`
        id,
        version_number,
        guidelines_raw_text,
        rubric_json,
        ai_suggestions_json,
        grant:grants (
          id,
          name,
          description
        )
      `)
      .eq("id", application.grant_version_id)
      .single();

    if (!grantError && grantVersion) {
      // Truncate guidelines to 10,000 chars
      const guidelinesExcerpt = grantVersion.guidelines_raw_text
        ? grantVersion.guidelines_raw_text.substring(0, 10000)
        : "";

      // Format rubric
      const rubricJson = grantVersion.rubric_json;
      let formattedRubric = "";
      if (rubricJson && typeof rubricJson === "object") {
        const sections = Object.entries(rubricJson);
        formattedRubric = sections.map(([key, value]: [string, any]) => {
          if (typeof value === "object" && value !== null) {
            return `## ${value.title || key}\nWeight: ${value.weight || "N/A"}\n${value.criteria || ""}`;
          }
          return `## ${key}\n${String(value)}`;
        }).join("\n\n");
      }

      const grant = grantVersion.grant;
      const aiSuggestions = grantVersion.ai_suggestions_json;

      grantContext = {
        name: grant?.name || "Unknown Grant",
        description: grant?.description || "",
        version_number: grantVersion.version_number,
        guidelines_excerpt: guidelinesExcerpt,
        rubric: formattedRubric,
        summary: aiSuggestions?.summary || "",
      };
    }
  }

  // Fetch existing step statuses
  const { data: steps, error: stepsError } = await supabase
    .from("report_run_steps")
    .select("step_number, step_name, status, outputs_json, citations_json, error_message")
    .eq("report_run_id", report_run_id)
    .order("step_number", { ascending: true });

  if (stepsError) {
    console.error("Failed to fetch steps:", stepsError);
  }

  // Compute effective model for each step (mapped to Replit-compatible names)
  const stepsWithModel = bundle.steps?.map((step: any) => {
    const effectiveModel = step.model_override || getDefaultModelForStep(step.step_number);
    return {
      ...step,
      model: mapToReplitModel(effectiveModel), // Replit-compatible model name
    };
  }) || [];

  return jsonResponse({
    run: {
      id: run.id,
      status: run.status,
      current_step: run.current_step,
      total_steps: run.total_steps,
      checkpoint_data_json: run.checkpoint_data_json,
      checkpoint_citations_json: run.checkpoint_citations_json,
      report_template_version_id: run.report_template_version_id,
      application: run.application,
    },
    prompt_bundle: {
      id: bundle.id,
      system_prompt: bundle.system_prompt,
      steps: stepsWithModel,  // Now includes `model` field
    },
    grant_context: grantContext,
    existing_steps: steps || [],
  });
}

async function handleUpdateStep(supabase: any, params: Record<string, unknown>) {
  const { report_run_id, step_number, status, outputs_json, citations_json, error_message, started_at, completed_at } = params;

  // DIAGNOSTIC LOGGING
  const outputsPreview = outputs_json 
    ? JSON.stringify(outputs_json).substring(0, 500) 
    : "undefined";
  console.log(`[DIAG] update_step: run=${report_run_id}, step=${step_number}, status=${status}`);
  console.log(`[DIAG] update_step outputs preview: ${outputsPreview}`);
  if (outputs_json && typeof outputs_json === "object") {
    const keys = Object.keys(outputs_json as object);
    console.log(`[DIAG] update_step outputs keys: ${keys.join(", ")}`);
  }
  // END DIAGNOSTIC LOGGING

  if (!report_run_id || typeof report_run_id !== "string" || !isValidUUID(report_run_id)) {
    return errorResponse("Invalid report_run_id");
  }
  if (typeof step_number !== "number") {
    return errorResponse("Invalid step_number");
  }
  if (!["pending", "running", "completed", "failed"].includes(status as string)) {
    return errorResponse("Invalid status");
  }

  const updateData: Record<string, unknown> = { status };
  
  if (outputs_json !== undefined) updateData.outputs_json = outputs_json;
  if (citations_json !== undefined) updateData.citations_json = citations_json;
  if (error_message !== undefined) updateData.error_message = error_message;
  if (started_at !== undefined) updateData.started_at = started_at;
  if (completed_at !== undefined) updateData.completed_at = completed_at;

  const { error } = await supabase
    .from("report_run_steps")
    .update(updateData)
    .eq("report_run_id", report_run_id)
    .eq("step_number", step_number);

  if (error) {
    console.error("Failed to update step:", error);
    return errorResponse("Failed to update step", 500);
  }

  return jsonResponse({ success: true });
}

async function handleUpdateRun(supabase: any, params: Record<string, unknown>) {
  const { report_run_id, status, current_step, checkpoint_data_json, checkpoint_citations_json, started_at, completed_at } = params;

  if (!report_run_id || typeof report_run_id !== "string" || !isValidUUID(report_run_id)) {
    return errorResponse("Invalid report_run_id");
  }

  const updateData: Record<string, unknown> = {};
  
  if (status !== undefined) updateData.status = status;
  if (current_step !== undefined) updateData.current_step = current_step;
  if (checkpoint_data_json !== undefined) updateData.checkpoint_data_json = checkpoint_data_json;
  if (checkpoint_citations_json !== undefined) updateData.checkpoint_citations_json = checkpoint_citations_json;
  if (started_at !== undefined) updateData.started_at = started_at;
  if (completed_at !== undefined) updateData.completed_at = completed_at;

  if (Object.keys(updateData).length === 0) {
    return errorResponse("No fields to update");
  }

  const { error } = await supabase
    .from("report_runs")
    .update(updateData)
    .eq("id", report_run_id);

  if (error) {
    console.error("Failed to update run:", error);
    return errorResponse("Failed to update run", 500);
  }

  return jsonResponse({ success: true });
}

async function handleSaveReport(supabase: any, params: Record<string, unknown>) {
  const { report_run_id, content_json, citations_json } = params;

  // DIAGNOSTIC LOGGING
  console.log(`[DIAG] save_report called for run: ${report_run_id}`);
  
  if (content_json && typeof content_json === "object") {
    const keys = Object.keys(content_json as object);
    console.log(`[DIAG] save_report content_json keys: ${keys.join(", ")}`);
    
    // Check for assembledReport structure
    const contentObj = content_json as Record<string, unknown>;
    if (contentObj.assembledReport) {
      const assembled = contentObj.assembledReport as Record<string, unknown>;
      const assembledKeys = Object.keys(assembled);
      console.log(`[DIAG] save_report assembledReport keys: ${assembledKeys.join(", ")}`);
      
      if (assembled.report_html) {
        const htmlLength = String(assembled.report_html).length;
        console.log(`[DIAG] save_report report_html length: ${htmlLength} chars`);
      } else {
        console.log(`[DIAG] save_report WARNING: No report_html in assembledReport!`);
      }
    } else {
      console.log(`[DIAG] save_report WARNING: No assembledReport in content_json!`);
    }
    
    // Check for sections array
    if (contentObj.sections && Array.isArray(contentObj.sections)) {
      const nonEmptySections = (contentObj.sections as Array<{content?: string}>)
        .filter(s => s.content && s.content.length > 0);
      console.log(`[DIAG] save_report sections: ${contentObj.sections.length} total, ${nonEmptySections.length} with content`);
    }
  }
  
  const contentPreview = content_json 
    ? JSON.stringify(content_json).substring(0, 1000) 
    : "undefined";
  console.log(`[DIAG] save_report content preview: ${contentPreview}`);
  // END DIAGNOSTIC LOGGING

  if (!report_run_id || typeof report_run_id !== "string" || !isValidUUID(report_run_id)) {
    return errorResponse("Invalid report_run_id");
  }
  if (!content_json) {
    return errorResponse("content_json is required");
  }

  // Fetch the run to get application details
  const { data: run, error: runError } = await supabase
    .from("report_runs")
    .select(`
      id,
      report_template_version_id,
      application:applications (
        id,
        user_id,
        grant_version_id,
        inputs_json
      )
    `)
    .eq("id", report_run_id)
    .single();

  if (runError || !run) {
    console.error("Failed to fetch run for save_report:", runError);
    return errorResponse("Report run not found", 404);
  }

  const application = run.application;

  if (!application) {
    return errorResponse("Application not found", 404);
  }

  // Get the next version number for this application
  const { data: existingReports, error: countError } = await supabase
    .from("reports")
    .select("version_number")
    .eq("application_id", application.id)
    .order("version_number", { ascending: false })
    .limit(1);

  if (countError) {
    console.error("Failed to count existing reports:", countError);
  }

  const nextVersion = existingReports && existingReports.length > 0 
    ? existingReports[0].version_number + 1 
    : 1;

  // Create the report
  const { data: report, error: insertError } = await supabase
    .from("reports")
    .insert({
      report_run_id,
      application_id: application.id,
      user_id: application.user_id,
      grant_version_id: application.grant_version_id,
      report_template_version_id: run.report_template_version_id,
      content_json: content_json,
      citations_json: citations_json || [],
      inputs_snapshot_json: application.inputs_json || {},
      version_number: nextVersion,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("Failed to save report:", insertError);
    return errorResponse("Failed to save report", 500);
  }

  // Update entitlement_consumptions to link to the report
  const { error: consumptionError } = await supabase
    .from("entitlement_consumptions")
    .update({ report_id: report.id })
    .eq("report_run_id", report_run_id);

  if (consumptionError) {
    console.error("Failed to update consumption:", consumptionError);
    // Non-fatal, continue
  }

  return jsonResponse({ success: true, report_id: report.id });
}

async function handleRefundCredit(supabase: any, params: Record<string, unknown>) {
  const { report_run_id } = params;

  if (!report_run_id || typeof report_run_id !== "string" || !isValidUUID(report_run_id)) {
    return errorResponse("Invalid report_run_id");
  }

  // Find the consumption record for this run
  const { data: consumption, error: fetchError } = await supabase
    .from("entitlement_consumptions")
    .select("id, entitlement_id")
    .eq("report_run_id", report_run_id)
    .single();

  if (fetchError || !consumption) {
    console.log("No consumption found to refund for run:", report_run_id);
    return jsonResponse({ success: true, refunded: false, message: "No consumption found" });
  }

  // Decrement the used_quantity on the entitlement
  const { error: decrementError } = await supabase.rpc("decrement_entitlement", {
    ent_id: consumption.entitlement_id,
  });

  if (decrementError) {
    console.error("Failed to decrement entitlement:", decrementError);
    return errorResponse("Failed to refund credit", 500);
  }

  // Delete the consumption record
  const { error: deleteError } = await supabase
    .from("entitlement_consumptions")
    .delete()
    .eq("id", consumption.id);

  if (deleteError) {
    console.error("Failed to delete consumption:", deleteError);
    // Non-fatal, credit was already refunded
  }

  console.log("Credit refunded for run:", report_run_id);
  return jsonResponse({ success: true, refunded: true });
}

async function handleGetPromptBundle(supabase: any) {
  const { data: bundle, error } = await supabase
    .from("prompt_bundles")
    .select(`
      id,
      name,
      system_prompt,
      steps:prompt_bundle_steps (
        step_number,
        step_name,
        step_description,
        prompt_template,
        model_override,
        timeout_seconds,
        is_heavy,
        max_expected_seconds
      )
    `)
    .eq("is_active", true)
    .single();

  if (error || !bundle) {
    console.error("Failed to fetch prompt bundle:", error);
    return errorResponse("No active prompt bundle found", 404);
  }

  // Sort steps by step_number
  bundle.steps?.sort((a: any, b: any) => a.step_number - b.step_number);

  // Compute effective model for each step (mapped to Replit-compatible names)
  const stepsWithModel = bundle.steps?.map((step: any) => {
    const effectiveModel = step.model_override || getDefaultModelForStep(step.step_number);
    return {
      ...step,
      model: mapToReplitModel(effectiveModel),
    };
  }) || [];

  return jsonResponse({
    id: bundle.id,
    name: bundle.name,
    system_prompt: bundle.system_prompt,
    steps: stepsWithModel,
  });
}
