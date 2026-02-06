// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Valid actions whitelist
const VALID_ACTIONS = [
  "get_run_context",
  "update_step",
  "update_run",
  "save_report",
  "refund_credit",
  "get_prompt_bundle",
  "log_message",
  "execute_firecrawl_search",
  "execute_firecrawl_scrape",
] as const;

type Action = typeof VALID_ACTIONS[number];

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str);
}

// Strip markdown code fences from AI output
// Handles: ```json, ```JSON, ```html, ``` (no tag), truncated fences
function stripCodeFences(content: unknown): unknown {
  // Handle string content
  if (typeof content === "string") {
    let trimmed = content.trim();
    
    // Opening fence with any language tag (json, JSON, html, etc.)
    if (trimmed.startsWith("```")) {
      trimmed = trimmed.replace(/^```[a-zA-Z]*\s*\n?/, "");
    }
    
    // Closing fence (may be truncated)
    trimmed = trimmed.replace(/\n?```\s*$/, "");
    
    return trimmed.trim();
  }
  
  // Handle object - recursively clean string values
  if (typeof content === "object" && content !== null) {
    if (Array.isArray(content)) {
      return content.map(item => stripCodeFences(item));
    }
    
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(content)) {
      cleaned[key] = stripCodeFences(value);
    }
    return cleaned;
  }
  
  return content;
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
      case "log_message":
        return await handleLogMessage(supabase, params);
      case "execute_firecrawl_search":
        return await handleFirecrawlSearch(params);
      case "execute_firecrawl_scrape":
        return await handleFirecrawlScrape(params);
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
      phase,
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

  const application = run.application;
  let bundle = null;
  let grantContext = null;
  let usingGrantBundle = false;

  // First, try to get grant-specific bundle if available
  if (application?.grant_version_id) {
    const { data: grantVersion, error: grantError } = await supabase
      .from("grant_versions")
      .select(`
        id,
        version_number,
        guidelines_raw_text,
        rubric_json,
        ai_suggestions_json,
        prompt_bundle_id,
        pipeline_generation_status,
        grant:grants (
          id,
          name,
          description
        )
      `)
      .eq("id", application.grant_version_id)
      .single();

    if (!grantError && grantVersion) {
      // Check if grant has a published pipeline
      if (grantVersion.prompt_bundle_id && grantVersion.pipeline_generation_status === "published") {
        const { data: grantBundle, error: bundleError } = await supabase
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
            max_expected_seconds,
            is_assembly_step,
            step_type,
            step_config_json
          )
          `)
          .eq("id", grantVersion.prompt_bundle_id)
          .single();

        if (!bundleError && grantBundle) {
          bundle = grantBundle;
          usingGrantBundle = true;
          console.log(`Using grant-specific bundle: ${grantBundle.id} for grant version ${grantVersion.id}`);
        }
      }

      // Build grant context
      const guidelinesExcerpt = grantVersion.guidelines_raw_text
        ? grantVersion.guidelines_raw_text.substring(0, 10000)
        : "";

      const rubricJson = grantVersion.rubric_json;
      let formattedRubric = "";
      if (rubricJson && typeof rubricJson === "object") {
        // Handle both formats: { sections: [...] } and direct object
        const sections = rubricJson.sections || Object.entries(rubricJson);
        if (Array.isArray(sections)) {
          formattedRubric = sections.map((section: any) => {
            if (typeof section === "object" && section !== null) {
              const criteria = Array.isArray(section.criteria) 
                ? section.criteria.join("; ") 
                : (section.criteria || "");
              return `## ${section.title || section.key}\nWeight: ${section.weight || "N/A"}%\n${section.description || ""}\nCriteria: ${criteria}`;
            }
            return "";
          }).filter(Boolean).join("\n\n");
        } else {
          formattedRubric = Object.entries(rubricJson).map(([key, value]: [string, any]) => {
            if (typeof value === "object" && value !== null) {
              return `## ${value.title || key}\nWeight: ${value.weight || "N/A"}\n${value.criteria || ""}`;
            }
            return `## ${key}\n${String(value)}`;
          }).join("\n\n");
        }
      }

      const grant = grantVersion.grant;
      const aiSuggestions = grantVersion.ai_suggestions_json;

      grantContext = {
        name: grant?.name || "Unknown Grant",
        description: grant?.description || "",
        version_number: grantVersion.version_number,
        guidelines_excerpt: guidelinesExcerpt,
        rubric: formattedRubric,
        summary: aiSuggestions?.grant_summary || aiSuggestions?.summary || "",
      };
    }
  }

  // Fallback to global active bundle if no grant-specific bundle
  if (!bundle) {
    const { data: activeBundle, error: bundleError } = await supabase
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
          max_expected_seconds,
          is_assembly_step,
          step_type,
          step_config_json
        )
      `)
      .eq("is_active", true)
      .single();

    if (bundleError || !activeBundle) {
      console.error("Failed to fetch prompt bundle:", bundleError);
      return errorResponse("No active prompt bundle found", 404);
    }

    bundle = activeBundle;
    console.log(`Using global active bundle: ${activeBundle.id}`);
  }

  // Sort steps by step_number
  bundle.steps?.sort((a: any, b: any) => a.step_number - b.step_number);

  // Fetch existing step statuses
  const { data: steps, error: stepsError } = await supabase
    .from("report_run_steps")
    .select("step_number, step_name, status, outputs_json, citations_json, error_message")
    .eq("report_run_id", report_run_id)
    .order("step_number", { ascending: true });

  if (stepsError) {
    console.error("Failed to fetch steps:", stepsError);
  }

  // Create normalized step_outputs map keyed by step number for consistent access
  const step_outputs: Record<string, unknown> = {};
  for (const step of steps || []) {
    if (step.status === "completed" && step.outputs_json) {
      step_outputs[`step${step.step_number}`] = step.outputs_json;
    }
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
      phase: run.phase || "research",  // Include phase for coordination
      checkpoint_data_json: run.checkpoint_data_json,
      checkpoint_citations_json: run.checkpoint_citations_json,
      report_template_version_id: run.report_template_version_id,
      application: run.application,
    },
    prompt_bundle: {
      id: bundle.id,
      system_prompt: bundle.system_prompt,
      steps: stepsWithModel,  // Each step includes is_assembly_step flag
      is_grant_specific: usingGrantBundle,
    },
    grant_context: grantContext,
    existing_steps: steps || [],
    step_outputs,  // Normalized map for consistent step access by number
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
  
  // Apply code fence stripping to outputs before saving
  if (outputs_json !== undefined) updateData.outputs_json = stripCodeFences(outputs_json);
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
  const { report_run_id, status, current_step, phase, checkpoint_data_json, checkpoint_citations_json, started_at, completed_at } = params;

  if (!report_run_id || typeof report_run_id !== "string" || !isValidUUID(report_run_id)) {
    return errorResponse("Invalid report_run_id");
  }

  const updateData: Record<string, unknown> = {};
  
  if (status !== undefined) updateData.status = status;
  if (current_step !== undefined) updateData.current_step = current_step;
  // Phase coordination: worker can transition between research/assembly/complete
  if (phase !== undefined) {
    if (!["research", "assembly", "complete"].includes(phase as string)) {
      return errorResponse("Invalid phase. Valid values: research, assembly, complete");
    }
    updateData.phase = phase;
    console.log(`[PHASE] Run ${report_run_id} transitioning to phase: ${phase}`);
  }
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

  // Apply code fence stripping to content before saving
  const sanitizedContent = stripCodeFences(content_json);

  // Create the report
  const { data: report, error: insertError } = await supabase
    .from("reports")
    .insert({
      report_run_id,
      application_id: application.id,
      user_id: application.user_id,
      grant_version_id: application.grant_version_id,
      report_template_version_id: run.report_template_version_id,
      content_json: sanitizedContent,
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
        max_expected_seconds,
        step_type,
        step_config_json
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

async function handleLogMessage(supabase: any, params: Record<string, unknown>) {
  const { report_run_id, timestamp, level, message, details } = params;

  if (!report_run_id || typeof report_run_id !== "string" || !isValidUUID(report_run_id)) {
    return errorResponse("Invalid report_run_id");
  }

  if (!timestamp) {
    return errorResponse("timestamp is required");
  }

  if (!level || !["info", "warn", "error"].includes(level as string)) {
    return errorResponse("Invalid level. Must be 'info', 'warn', or 'error'");
  }

  if (!message || typeof message !== "string") {
    return errorResponse("message is required");
  }

  // Parse details if it's a string
  let parsedDetails = null;
  if (details) {
    try {
      parsedDetails = typeof details === "string" ? JSON.parse(details) : details;
    } catch {
      parsedDetails = { raw: details };
    }
  }

  const { error } = await supabase
    .from("report_logs")
    .insert({
      report_run_id,
      timestamp,
      level,
      message,
      details: parsedDetails,
    });

  if (error) {
    console.error("Failed to insert log:", error);
    return errorResponse("Failed to insert log: " + error.message, 500);
  }

  return jsonResponse({ success: true });
}

// ============================================
// FIRECRAWL HANDLERS
// ============================================

async function handleFirecrawlSearch(params: Record<string, unknown>) {
  const { query, limit, scrape_options, site_filters } = params;

  if (!query || typeof query !== "string") {
    return errorResponse("query is required and must be a string");
  }

  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    console.error("FIRECRAWL_API_KEY not configured");
    return errorResponse("Firecrawl connector not configured", 500);
  }

  // Build query with optional site filters
  let searchQuery = query;
  if (site_filters && Array.isArray(site_filters) && site_filters.length > 0) {
    const siteClause = site_filters.map((s: string) => `site:${s}`).join(" OR ");
    searchQuery = `${query} ${siteClause}`;
  }

  console.log(`[FIRECRAWL] Search query: ${searchQuery}, limit: ${limit || 10}`);

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: typeof limit === "number" ? limit : 10,
        scrapeOptions: scrape_options || { formats: ["markdown"] },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Firecrawl search error:", data);
      return errorResponse(data.error || `Firecrawl search failed: ${response.status}`, response.status);
    }

    // Format results with source IDs for AI consumption
    const results = data.data || [];
    const sources = results.map((r: any, i: number) => ({
      source_id: `SEARCH-${i + 1}`,
      url: r.url,
      title: r.title || r.metadata?.title || "Untitled",
      description: r.description || r.metadata?.description || "",
      content: r.markdown?.substring(0, 8000) || r.content?.substring(0, 8000) || "",
      confidence: "high", // Real search result
    }));

    console.log(`[FIRECRAWL] Search returned ${sources.length} results`);

    return jsonResponse({
      success: true,
      query: searchQuery,
      results_count: sources.length,
      sources,
    });
  } catch (error) {
    console.error("Firecrawl search exception:", error);
    return errorResponse(error instanceof Error ? error.message : "Firecrawl search failed", 500);
  }
}

async function handleFirecrawlScrape(params: Record<string, unknown>) {
  const { url, formats } = params;

  if (!url || typeof url !== "string") {
    return errorResponse("url is required and must be a string");
  }

  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    console.error("FIRECRAWL_API_KEY not configured");
    return errorResponse("Firecrawl connector not configured", 500);
  }

  // Format URL
  let formattedUrl = url.trim();
  if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
    formattedUrl = `https://${formattedUrl}`;
  }

  console.log(`[FIRECRAWL] Scraping URL: ${formattedUrl}`);

  try {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: formats || ["markdown"],
        onlyMainContent: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Firecrawl scrape error:", data);
      return errorResponse(data.error || `Firecrawl scrape failed: ${response.status}`, response.status);
    }

    // Extract content from response
    const scraped = data.data || data;
    const content = scraped.markdown || scraped.content || "";
    const metadata = scraped.metadata || {};

    console.log(`[FIRECRAWL] Scraped ${content.length} chars from ${formattedUrl}`);

    return jsonResponse({
      success: true,
      url: formattedUrl,
      title: metadata.title || "Untitled",
      description: metadata.description || "",
      content: content.substring(0, 50000), // Cap at 50k chars
      metadata,
      source: {
        source_id: "ARTICLE-1",
        url: formattedUrl,
        title: metadata.title || "User-provided article",
        confidence: "high",
      },
    });
  } catch (error) {
    console.error("Firecrawl scrape exception:", error);
    return errorResponse(error instanceof Error ? error.message : "Firecrawl scrape failed", 500);
  }
}
