import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Model selection based on step complexity
function getDefaultModelForStep(stepNumber: number, totalSteps: number): string {
  // Early steps: lighter model
  if (stepNumber <= 3) {
    return "google/gemini-2.5-flash-lite";
  }
  // Middle steps: heavier model for complex analysis
  if (stepNumber <= totalSteps - 3) {
    return "google/gemini-3-flash-preview";
  }
  // Final assembly steps: flash-preview for speed
  if (stepNumber >= totalSteps - 2) {
    return "google/gemini-3-flash-preview";
  }
  // Last step: lite model (simple merge task)
  if (stepNumber === totalSteps - 1) {
    return "google/gemini-2.5-flash-lite";
  }
  return "google/gemini-2.5-flash-lite";
}

// Default system prompt (fallback if no active bundle)
const DEFAULT_SYSTEM_PROMPT = "You are a research commercialization expert helping prepare grant applications. Provide detailed, well-researched responses. Always cite sources where possible. If data cannot be validated, clearly indicate this.";

// Inter-step throttle delay (ms) to spread requests and avoid rate limits
const INTER_STEP_DELAY_MS = 3000;

// Retry delays for rate limit errors (5s, 15s, 30s)
const RETRY_DELAYS = [5000, 15000, 30000];

// Timeout selection based on step complexity (with configurable override)
function getTimeoutForStep(stepNumber: number, totalSteps: number, overrideSeconds: number | null = null): number {
  if (overrideSeconds !== null) {
    return overrideSeconds * 1000;
  }
  // Step 0 and final assembly steps: 42s max
  if (stepNumber === 0 || stepNumber >= totalSteps - 3) return 42000;
  // Middle steps: 38s
  if (stepNumber >= Math.floor(totalSteps / 3) && stepNumber <= Math.floor(totalSteps * 2 / 3)) return 38000;
  // All other steps: 35s
  return 35000;
}

// Type definition for bundle step config
interface StepConfig {
  step_number: number;
  step_name: string;
  prompt_template: string;
  model_override: string | null;
  timeout_seconds: number | null;
  is_heavy: boolean | null;
  max_output_tokens: number | null;
}

// Type definition for prompt bundle
interface PromptBundle {
  id: string;
  system_prompt: string;
  steps: StepConfig[];
}

// Fetch the appropriate prompt bundle for a grant version or fall back to global active
// deno-lint-ignore no-explicit-any
async function fetchBundleForGrant(supabase: any, grantVersionId: string): Promise<PromptBundle | null> {
  try {
    // First check if this grant version has a specific bundle assigned
    const { data: grantVersion, error: gvError } = await supabase
      .from("grant_versions")
      .select("prompt_bundle_id, pipeline_generation_status")
      .eq("id", grantVersionId)
      .maybeSingle();

    if (!gvError && grantVersion?.prompt_bundle_id && grantVersion.pipeline_generation_status === "published") {
      // Use grant-specific bundle
      const { data: bundle, error: bundleError } = await supabase
        .from("prompt_bundles")
        .select("id, system_prompt")
        .eq("id", grantVersion.prompt_bundle_id)
        .maybeSingle();

      if (!bundleError && bundle) {
        const { data: steps, error: stepsError } = await supabase
          .from("prompt_bundle_steps")
          .select("step_number, step_name, prompt_template, model_override, timeout_seconds, is_heavy, max_output_tokens")
          .eq("bundle_id", bundle.id)
          .order("step_number", { ascending: true });

        if (!stepsError && steps && steps.length > 0) {
          console.log(`Using grant-specific bundle ${bundle.id} with ${steps.length} steps`);
          return {
            id: bundle.id,
            system_prompt: bundle.system_prompt,
            steps: steps,
          };
        }
      }
    }

    // Fall back to global active bundle
    const { data: activeBundle, error: activeBundleError } = await supabase
      .from("prompt_bundles")
      .select("id, system_prompt")
      .eq("is_active", true)
      .maybeSingle();

    if (activeBundleError || !activeBundle) {
      console.log("No active prompt bundle found, using defaults");
      return null;
    }

    const { data: activeSteps, error: activeStepsError } = await supabase
      .from("prompt_bundle_steps")
      .select("step_number, step_name, prompt_template, model_override, timeout_seconds, is_heavy, max_output_tokens")
      .eq("bundle_id", activeBundle.id)
      .order("step_number", { ascending: true });

    if (activeStepsError || !activeSteps || activeSteps.length === 0) {
      console.log("No prompt steps found in active bundle, using defaults");
      return null;
    }

    console.log(`Using global active bundle ${activeBundle.id} with ${activeSteps.length} steps`);
    return {
      id: activeBundle.id,
      system_prompt: activeBundle.system_prompt,
      steps: activeSteps,
    };
  } catch (e) {
    console.error("Error fetching prompt bundle:", e);
    return null;
  }
}

// Fetch grant context for prompt interpolation
// deno-lint-ignore no-explicit-any
async function fetchGrantContext(supabase: any, grantVersionId: string): Promise<{
  name: string;
  versionLabel: string;
  guidelinesExcerpt: string;
  formattedRubric: string;
  rubricJson: object;
  requiredInputs: object[];
  summary: string;
}> {
  const MAX_GUIDELINES_LENGTH = 10000;
  
  try {
    const { data, error } = await supabase
      .from("grant_versions")
      .select(`
        version_number,
        guidelines_raw_text,
        rubric_json,
        required_inputs_json,
        ai_suggestions_json,
        grant:grants!inner(name)
      `)
      .eq("id", grantVersionId)
      .maybeSingle();

    if (error || !data) {
      console.log("Grant context not found for version:", grantVersionId);
      return {
        name: "",
        versionLabel: "",
        guidelinesExcerpt: "",
        formattedRubric: "",
        rubricJson: { sections: [] },
        requiredInputs: [],
        summary: "",
      };
    }

    // Extract grant name
    // deno-lint-ignore no-explicit-any
    const grantData = data.grant as any;
    const grantName = Array.isArray(grantData) ? grantData[0]?.name : grantData?.name || "";
    const versionLabel = `v${data.version_number}`;

    // Truncate guidelines
    let guidelinesExcerpt = data.guidelines_raw_text || "";
    if (guidelinesExcerpt.length > MAX_GUIDELINES_LENGTH) {
      guidelinesExcerpt = guidelinesExcerpt.slice(0, MAX_GUIDELINES_LENGTH) + "\n\n[Guidelines truncated...]";
    }

    // Format rubric from rubric_json or ai_suggestions_json
    let formattedRubric = "";
    // deno-lint-ignore no-explicit-any
    const rubricData = data.rubric_json as any;
    // deno-lint-ignore no-explicit-any
    const suggestions = data.ai_suggestions_json as any;
    const rubricSections = rubricData?.sections || suggestions?.rubric?.sections;
    
    if (rubricSections && Array.isArray(rubricSections)) {
      formattedRubric = "Assessment Criteria:\n\n";
      // deno-lint-ignore no-explicit-any
      rubricSections.forEach((section: any, index: number) => {
        const weight = section.weight ? ` (${section.weight}%)` : "";
        formattedRubric += `${index + 1}. ${section.title || section.key}${weight}\n`;
        if (Array.isArray(section.criteria)) {
          section.criteria.forEach((criterion: string) => {
            formattedRubric += `   - ${criterion}\n`;
          });
        }
        formattedRubric += "\n";
      });
    }

    // Get summary from ai_suggestions_json
    const summary = suggestions?.summary || "";

    return {
      name: grantName,
      versionLabel,
      guidelinesExcerpt,
      formattedRubric: formattedRubric.trim(),
      rubricJson: data.rubric_json || { sections: [] },
      requiredInputs: data.required_inputs_json || [],
      summary,
    };
  } catch (e) {
    console.error("Error fetching grant context:", e);
    return {
      name: "",
      versionLabel: "",
      guidelinesExcerpt: "",
      formattedRubric: "",
      rubricJson: { sections: [] },
      requiredInputs: [],
      summary: "",
    };
  }
}

// Interpolate variables in prompt template
function interpolatePrompt(template: string, variables: Record<string, string>): string {
  let result = template;
  
  // Handle simple {{variable}} replacements
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  }
  
  // Handle conditional blocks {{#variable}}...{{/variable}}
  for (const [key, value] of Object.entries(variables)) {
    const conditionalRegex = new RegExp(`\\{\\{#${key}\\}\\}([\\s\\S]*?)\\{\\{/${key}\\}\\}`, "g");
    if (value && value.trim()) {
      result = result.replace(conditionalRegex, "$1");
    } else {
      result = result.replace(conditionalRegex, "");
    }
  }
  
  return result.trim();
}

// Timeout wrapper for fetch calls
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

    // Fetch report run with checkpoint data
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: reportRun, error: runError } = await supabaseAdmin
      .from("report_runs")
      .select(`
        id,
        status,
        current_step,
        total_steps,
        checkpoint_data_json,
        checkpoint_citations_json,
        application_id,
        report_template_version_id,
        email_on_complete,
        application:applications!inner(user_id, inputs_json, grant_version_id)
      `)
      .eq("id", reportRunId)
      .maybeSingle();

    if (runError || !reportRun) {
      return new Response(
        JSON.stringify({ error: "Report run not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check ownership
    // deno-lint-ignore no-explicit-any
    const appData = (reportRun.application as any);
    const ownerUserId = Array.isArray(appData) ? appData[0]?.user_id : appData?.user_id;
    if (ownerUserId !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to report run" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalSteps = reportRun.total_steps || 15; // Use actual total_steps from run
    const finalStepIndex = totalSteps - 1; // e.g., 13 for 14 steps, 14 for 15 steps
    
    let effectiveResumeFromStep = reportRun.current_step;

    // FINAL STEP RECOVERY: Handle case where final step stalled without completing
    if (effectiveResumeFromStep >= finalStepIndex) {
      // Check if a report already exists for this run
      const { data: existingReport } = await supabaseAdmin
        .from("reports")
        .select("id")
        .eq("report_run_id", reportRunId)
        .maybeSingle();

      if (existingReport) {
        // Report already created - just mark run as completed and return success
        await supabaseAdmin
          .from("report_runs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", reportRunId);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Report already completed. Please refresh to view.",
            code: "ALREADY_COMPLETE"
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // No report exists - final step stalled. Reset to resume from previous step
      console.log(`Final step recovery: Run ${reportRunId} stuck at step ${effectiveResumeFromStep} without report. Resetting.`);
      
      await supabaseAdmin
        .from("report_run_steps")
        .update({
          status: "pending",
          started_at: null,
          completed_at: null,
          error_message: null,
          outputs_json: {},
        })
        .eq("report_run_id", reportRunId)
        .eq("step_number", finalStepIndex);

      effectiveResumeFromStep = finalStepIndex - 1;
    }

    // Validate checkpoint range
    if (effectiveResumeFromStep < 0 || effectiveResumeFromStep > finalStepIndex - 1) {
      return new Response(
        JSON.stringify({ error: "Report run is not at a valid checkpoint" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only accept pending status for resume
    if (reportRun.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Report run is not in pending status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark as running for next phase
    await supabaseAdmin
      .from("report_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", reportRunId);

    // Get application data
    const inputs = Array.isArray(appData) ? appData[0]?.inputs_json : appData?.inputs_json;
    const grantVersionId = Array.isArray(appData) ? appData[0]?.grant_version_id : appData?.grant_version_id;

    // Process the next single step - MUST await to keep edge function alive
    try {
      await processSingleStep(
        reportRunId,
        reportRun.application_id,
        grantVersionId,
        reportRun.report_template_version_id,
        userId,
        inputs || {},
        reportRun.checkpoint_data_json || {},
        reportRun.checkpoint_citations_json || [],
        effectiveResumeFromStep,
        reportRun.email_on_complete ?? false,
        totalSteps
      );

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Step ${effectiveResumeFromStep + 1} completed successfully` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (stepError) {
      console.error(`Step processing error (from step ${effectiveResumeFromStep}):`, stepError);
      return new Response(
        JSON.stringify({ 
          error: stepError instanceof Error ? stepError.message : "Step processing failed",
          step: effectiveResumeFromStep + 1
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Error in resume-report-run:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * DYNAMIC STEP EXECUTION
 * Runs exactly ONE step using prompts from prompt_bundle_steps, then checkpoints.
 * This function supports any pipeline length dynamically.
 */
async function processSingleStep(
  reportRunId: string,
  applicationId: string,
  grantVersionId: string,
  templateVersionId: string,
  userId: string,
  inputs: Record<string, unknown>,
  checkpointData: Record<string, unknown>,
  checkpointCitations: Array<{ url: string; title: string; accessed: string }>,
  resumeFromStep: number,
  emailOnComplete: boolean,
  totalSteps: number
) {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Fetch prompt bundle (grant-specific or global active)
  const bundle = await fetchBundleForGrant(supabase, grantVersionId);
  const systemPrompt = bundle?.system_prompt || DEFAULT_SYSTEM_PROMPT;

  // User inputs
  const summary = inputs.summary as string || "";
  const publicArticleUrl = inputs.publicArticleUrl as string || "";
  const trl = inputs.trl as string || "";
  const ipStatus = inputs.ipStatus as string || "";
  
  const reportContent: Record<string, unknown> = { ...checkpointData };
  const citations = [...checkpointCitations];
  
  const nextStep = resumeFromStep + 1;
  const finalStepIndex = totalSteps - 1;
  console.log(`DYNAMIC: Executing step ${nextStep} of ${totalSteps} (resumed from ${resumeFromStep})`);

  // Fetch grant context for prompt interpolation
  const grantContext = await fetchGrantContext(supabase, grantVersionId);

  // Fetch all completed step outputs from database for dynamic variable building
  const { data: existingSteps } = await supabase
    .from("report_run_steps")
    .select("step_number, step_name, outputs_json, status")
    .eq("report_run_id", reportRunId)
    .order("step_number", { ascending: true });

  // Build step variables dynamically from completed steps in database
  const stepVariables: Record<string, string> = {};
  if (existingSteps) {
    for (const step of existingSteps) {
      if (step.status === "completed" && step.outputs_json) {
        // Store as step0, step1, step2, etc.
        stepVariables[`step${step.step_number}`] = JSON.stringify(step.outputs_json);
      }
    }
  }

  // Also build from checkpoint data for backward compatibility
  // Extract source pack from Step 0 output (stored in checkpoint or step outputs)
  // deno-lint-ignore no-explicit-any
  const sourcePack = (reportContent.sourcePack as any) || 
    (stepVariables.step0 ? JSON.parse(stepVariables.step0).sourcePack : null) || 
    { sources: [], unknowns: [] };
  const sourcesJson = JSON.stringify(sourcePack.sources || []);
  const unknownsJson = JSON.stringify(sourcePack.unknowns || []);

  // Semantic equivalents mapping: alternate names for canonical input fields
  // This prevents loops when prompts use {{project_summary}} but form only collects {{summary}}
  const SEMANTIC_EQUIVALENTS: Record<string, string> = {
    'project_summary': 'summary',
    'research_summary': 'summary',
    'project_description': 'summary',
    'executive_summary': 'summary',
    'project_title': 'projectName',
    'article_url': 'publicArticleUrl',
    'technology_readiness_level': 'trl',
    'ip_status_description': 'ipStatus',
  };

  // Build complete interpolation variables
  const buildVariables = (): Record<string, string> => {
    const vars: Record<string, string> = {
      // User inputs (canonical)
      summary,
      publicArticleUrl,
      trl,
      ipStatus,
      // Grant context
      grantName: grantContext.name,
      grantVersionLabel: grantContext.versionLabel,
      grantGuidelines: grantContext.guidelinesExcerpt,
      grantRubric: grantContext.formattedRubric,
      grantRubricJson: JSON.stringify(grantContext.rubricJson, null, 2),
      requiredInputs: JSON.stringify(grantContext.requiredInputs, null, 2),
      grantSummary: grantContext.summary,
      // Source pack from Step 0
      sources: sourcesJson,
      unknowns: unknownsJson,
      // All step outputs (dynamically built from DB)
      ...stepVariables,
      // Legacy semantic names for backward compatibility with old prompts
      researchContext: String(reportContent.researchContext || ""),
      competitorResearch: String(reportContent.competitorResearch || ""),
      marketSegments: String(reportContent.marketSegments || ""),
      existingCompetitors: String(reportContent.existingCompetitors || ""),
      tam: String(reportContent.tam || ""),
      sam: String(reportContent.sam || ""),
      som: String(reportContent.som || ""),
      economicImpact: String(reportContent.economicImpact || ""),
      competitorTable: String(reportContent.competitorTable || ""),
      partnerBusinesses: String(reportContent.partnerBusinesses || ""),
      marketSizingSourcePack: String(reportContent.marketSizingSourcePack || ""),
    };
    
    // DYNAMIC INPUT HYDRATION: Add ALL applicant input keys from inputs_json
    // This ensures any grant-specific field (e.g., project_budget, nrf_priority_area)
    // is available as a template variable if defined in required_inputs_json
    const canonicalKeys = ['summary', 'publicArticleUrl', 'trl', 'ipStatus'];
    for (const [key, value] of Object.entries(inputs)) {
      // Skip already-mapped canonical fields to avoid overwriting
      if (canonicalKeys.includes(key)) continue;
      // Skip if variable already exists (from step outputs or other sources)
      if (vars[key] !== undefined) continue;
      
      // Map value based on type
      if (value === null || value === undefined) {
        vars[key] = "";
      } else if (typeof value === "object") {
        vars[key] = JSON.stringify(value);
      } else {
        vars[key] = String(value);
      }
    }
    
    // SEMANTIC EQUIVALENTS FALLBACK: Map alternate variable names to canonical fields
    // This handles cases where prompts use {{project_summary}} but form only has {{summary}}
    for (const [alias, canonical] of Object.entries(SEMANTIC_EQUIVALENTS)) {
      // Only add alias if it's not already defined AND the canonical value exists
      if (vars[alias] === undefined && vars[canonical]) {
        vars[alias] = vars[canonical];
      }
    }
    
    return vars;
  };

  try {
    // Find the step configuration from the bundle
    const stepConfig = bundle?.steps.find(s => s.step_number === nextStep);
    
    if (!stepConfig && !bundle) {
      // No bundle found - this shouldn't happen but provide graceful error
      throw new Error(`No prompt configuration found for step ${nextStep}. Please contact support.`);
    }

    if (stepConfig) {
      // DYNAMIC EXECUTION: Use prompt from database
      console.log(`DYNAMIC: Executing step ${nextStep} (${stepConfig.step_name}) from bundle`);
      
      await executeStep(supabase, reportRunId, nextStep, async () => {
        // Special handling for Step 1 which needs article scraping
        let additionalVars: Record<string, string> = {};
        if (nextStep === 1 && FIRECRAWL_API_KEY && publicArticleUrl) {
          try {
            const scrapeResponse = await fetchWithTimeout(
              "https://api.firecrawl.dev/v1/scrape",
              {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  url: publicArticleUrl,
                  formats: ["markdown"],
                  onlyMainContent: true,
                }),
              },
              60000
            );

            if (scrapeResponse.ok) {
              const scrapeData = await scrapeResponse.json();
              additionalVars.articleContent = (scrapeData.data?.markdown || scrapeData.markdown || "").slice(0, 8000);
              if (scrapeData.data?.metadata?.title) {
                citations.push({
                  url: publicArticleUrl,
                  title: scrapeData.data.metadata.title,
                  accessed: new Date().toISOString().split("T")[0],
                });
              }
            }
          } catch (e) {
            console.error("Firecrawl scrape error:", e);
          }
        }

        const allVariables = { ...buildVariables(), ...additionalVars };
        const interpolatedPrompt = interpolatePrompt(stepConfig.prompt_template, allVariables);
        
        const model = stepConfig.model_override || getDefaultModelForStep(nextStep, totalSteps);
        const timeoutMs = getTimeoutForStep(nextStep, totalSteps, stepConfig.timeout_seconds);
        const maxOutputTokens = stepConfig.max_output_tokens || undefined;
        
        const result = await callAIWithRetry(interpolatedPrompt, nextStep, systemPrompt, model, timeoutMs, maxOutputTokens);
        
        // Store output in reportContent using step name as key
        reportContent[stepConfig.step_name] = result;
        
        // Parse JSON if the step is expected to return JSON (assembly steps)
        if (stepConfig.step_name.includes("html") || stepConfig.step_name.includes("sections") || stepConfig.step_name.includes("tables") || stepConfig.step_name.includes("finalize")) {
          try {
            const parsed = JSON.parse(result);
            return parsed;
          } catch {
            return { raw_output: result };
          }
        }
        
        return { [stepConfig.step_name]: result };
      });

      // Check if this is the final step
      if (nextStep === finalStepIndex) {
        // FINAL STEP: Create the report and mark as complete
        await createFinalReport(
          supabase,
          reportRunId,
          applicationId,
          grantVersionId,
          templateVersionId,
          userId,
          inputs,
          reportContent,
          citations,
          emailOnComplete
        );
        
        console.log(`DYNAMIC: Report run ${reportRunId} completed successfully`);
        return;
      }
    } else {
      // No step config found in bundle - error
      throw new Error(`Step ${nextStep} not found in prompt bundle. Pipeline may be incomplete.`);
    }

    // For non-final steps: Save checkpoint and exit
    await supabase
      .from("report_runs")
      .update({
        checkpoint_data_json: reportContent,
        checkpoint_citations_json: citations,
        current_step: nextStep,
        status: "pending",
      })
      .eq("id", reportRunId);

    console.log(`DYNAMIC: Checkpoint saved at step ${nextStep} for report run ${reportRunId}`);

  } catch (error) {
    console.error(`DYNAMIC: Step ${nextStep} failed:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateRunStatus(supabase, reportRunId, "failed", errorMessage);
    
    // Refund credit on failure
    await refundCredit(supabase, reportRunId);

    // Send failure notification email (fire-and-forget)
    sendFailureNotification(reportRunId, errorMessage).catch(e =>
      console.error("Failed to send failure notification:", e)
    );
  }
}

/**
 * Send failure notification email to admin (fire-and-forget)
 */
async function sendFailureNotification(reportRunId: string, haltReason: string) {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  const APP_URL = Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com";

  if (!BREVO_API_KEY) {
    console.warn("BREVO_API_KEY not set, skipping failure notification");
    return;
  }

  const manualQueueLink = `${APP_URL}/admin/manual-queue`;

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
      to: [{ email: "grantgenius@disruptorsco.com", name: "Grant Genius Admin" }],
      subject: `⚠️ Report Run Failed: ${reportRunId.slice(0, 8)}`,
      htmlContent: `<h2>Report Run Failed</h2>
        <p><strong>Run ID:</strong> ${reportRunId}</p>
        <p><strong>Halt Reason:</strong> ${haltReason}</p>
        <p><a href="${manualQueueLink}">View in Manual Queue</a></p>`,
    }),
  });

  console.log(`Failure notification sent for run ${reportRunId}`);
}

/**
 * Refund the credit consumed by a failed report run
 */
// deno-lint-ignore no-explicit-any
async function refundCredit(supabase: any, reportRunId: string) {
  try {
    const { data: consumption } = await supabase
      .from("entitlement_consumptions")
      .select("id, entitlement_id")
      .eq("report_run_id", reportRunId)
      .maybeSingle();

    if (consumption) {
      await supabase.rpc("decrement_entitlement", { 
        ent_id: consumption.entitlement_id 
      });
      
      await supabase
        .from("entitlement_consumptions")
        .delete()
        .eq("id", consumption.id);
        
      console.log(`Credit refunded for failed run ${reportRunId}`);
    }
  } catch (e) {
    console.error("Failed to refund credit:", e);
  }
}

// deno-lint-ignore no-explicit-any
async function createFinalReport(
  supabase: any,
  reportRunId: string,
  applicationId: string,
  grantVersionId: string,
  templateVersionId: string,
  userId: string,
  inputs: Record<string, unknown>,
  reportContent: Record<string, unknown>,
  citations: Array<{ url: string; title: string; accessed: string }>,
  emailOnComplete: boolean
) {
  // Get next version number
  const { data: existingReports } = await supabase
    .from("reports")
    .select("version_number")
    .eq("application_id", applicationId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersion = existingReports && existingReports.length > 0 
    ? (existingReports[0] as { version_number: number }).version_number + 1 
    : 1;

  // Create the final report
  const { data: newReport, error: reportInsertError } = await supabase.from("reports").insert({
    application_id: applicationId,
    user_id: userId,
    grant_version_id: grantVersionId,
    report_template_version_id: templateVersionId,
    report_run_id: reportRunId,
    version_number: nextVersion,
    content_json: reportContent,
    citations_json: citations,
    inputs_snapshot_json: inputs,
  }).select("id").single();

  if (reportInsertError) {
    console.error("Failed to insert report:", reportInsertError);
    throw new Error(`Failed to save report: ${reportInsertError.message}`);
  }

  // Update run as completed
  const { error: runUpdateError } = await supabase
    .from("report_runs")
    .update({
      status: "completed",
      current_step: await getMaxStepNumber(supabase, reportRunId),
      completed_at: new Date().toISOString(),
    })
    .eq("id", reportRunId);

  if (runUpdateError) {
    console.error("Failed to update run status:", runUpdateError);
  }

  // Update application status
  const { error: appUpdateError } = await supabase
    .from("applications")
    .update({ status: "ready" })
    .eq("id", applicationId);

  if (appUpdateError) {
    console.error("Failed to update application status:", appUpdateError);
  }

  // Check for review workflow before sending email
  if (newReport?.id) {
    const workflowResult = await checkAndStartReviewWorkflow(supabase, newReport.id, applicationId, grantVersionId);
    
    if (workflowResult.hasWorkflow) {
      console.log(`Report ${newReport.id} sent to review workflow (step 1 of ${workflowResult.totalSteps})`);
      // Don't send email to user - workflow will handle it after approval
    } else if (emailOnComplete) {
      // No workflow - send email directly (current behavior)
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        
        await fetch(`${SUPABASE_URL}/functions/v1/send-report-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            reportRunId,
            reportId: newReport.id,
            applicationId,
            userId,
          }),
        });
        console.log(`Email notification triggered for report ${newReport.id}`);
      } catch (emailError) {
        console.error("Failed to send email notification:", emailError);
      }
    }
  }
}

/**
 * Check if the grant has an enabled review workflow, and if so,
 * set the report to pending_review and notify the first reviewer.
 */
// deno-lint-ignore no-explicit-any
async function checkAndStartReviewWorkflow(
  supabase: any,
  reportId: string,
  applicationId: string,
  grantVersionId: string
): Promise<{ hasWorkflow: boolean; totalSteps: number }> {
  try {
    // Get the grant_id from grant_version
    const { data: grantVersion } = await supabase
      .from("grant_versions")
      .select("grant_id")
      .eq("id", grantVersionId)
      .single();

    if (!grantVersion) return { hasWorkflow: false, totalSteps: 0 };

    // Check for enabled workflow
    const { data: workflow } = await supabase
      .from("grant_review_workflows")
      .select("id, step_count, is_enabled")
      .eq("grant_id", grantVersion.grant_id)
      .eq("is_enabled", true)
      .maybeSingle();

    if (!workflow) return { hasWorkflow: false, totalSteps: 0 };

    // Get step 1 reviewer
    const { data: firstStep } = await supabase
      .from("grant_review_workflow_steps")
      .select("id, reviewer_user_id")
      .eq("workflow_id", workflow.id)
      .eq("step_number", 1)
      .single();

    if (!firstStep) return { hasWorkflow: false, totalSteps: 0 };

    // Set report to pending review
    await supabase
      .from("reports")
      .update({ review_status: "pending_review", current_review_step: 1 })
      .eq("id", reportId);

    // Create first review record
    await supabase
      .from("report_reviews")
      .insert({
        report_id: reportId,
        workflow_step_id: firstStep.id,
        reviewer_user_id: firstStep.reviewer_user_id,
        step_number: 1,
        status: "pending",
      });

    // Send email to first reviewer
    await sendReviewNotification(supabase, firstStep.reviewer_user_id, reportId, 1, workflow.step_count);

    return { hasWorkflow: true, totalSteps: workflow.step_count };
  } catch (e) {
    console.error("Error checking review workflow:", e);
    return { hasWorkflow: false, totalSteps: 0 };
  }
}

// deno-lint-ignore no-explicit-any
async function sendReviewNotification(supabase: any, reviewerUserId: string, reportId: string, stepNumber: number, totalSteps: number) {
  try {
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) return;

    const { data: reviewer } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", reviewerUserId)
      .single();

    if (!reviewer) return;

    const { data: report } = await supabase
      .from("reports")
      .select("application:applications!inner(title, grant_version:grant_versions!inner(grant:grants!inner(name)))")
      .eq("id", reportId)
      .single();

    const app = report?.application as any;
    const gv = app?.grant_version as any;
    const grant = Array.isArray(gv?.grant) ? gv.grant[0] : gv?.grant;

    const appUrl = Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com";

    // Find review record for the link
    const { data: reviewRecord } = await supabase
      .from("report_reviews")
      .select("id")
      .eq("report_id", reportId)
      .eq("step_number", stepNumber)
      .eq("reviewer_user_id", reviewerUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const reviewLink = reviewRecord
      ? `${appUrl}/admin/reviews/${reviewRecord.id}`
      : `${appUrl}/admin/reviews`;

    const variables: Record<string, string> = {
      reviewer_name: reviewer.full_name || reviewer.email.split("@")[0],
      grant_name: grant?.name || "Unknown Grant",
      application_title: app?.title || "Untitled",
      review_link: reviewLink,
      step_number: String(stepNumber),
      total_steps: String(totalSteps),
    };

    // Fetch template
    const { data: emailTemplate } = await supabase
      .from("email_templates")
      .select("html_content, subject, sender_name, sender_email")
      .eq("template_key", "REVIEW_REQUESTED")
      .maybeSingle();

    let htmlContent = emailTemplate?.html_content ||
      `<h2>Review Requested</h2><p>Hi {{reviewer_name}},</p><p>A report for <strong>{{grant_name}}</strong> ({{application_title}}) is ready for your review (Step {{step_number}} of {{total_steps}}).</p><p><a href="{{review_link}}">Click here to review the report</a></p>`;
    let subject = emailTemplate?.subject || "Report Review Required - {{grant_name}}";

    for (const [key, value] of Object.entries(variables)) {
      htmlContent = htmlContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: emailTemplate?.sender_name || "Grant Genius", email: emailTemplate?.sender_email || "grantgenius@disruptorsco.com" },
        to: [{ email: reviewer.email, name: variables.reviewer_name }],
        subject,
        htmlContent,
      }),
    });

    await supabase.from("email_outbox").insert({
      user_id: reviewerUserId,
      to_email: reviewer.email,
      template_key: "REVIEW_REQUESTED",
      subject,
      status: "sent",
      sent_at: new Date().toISOString(),
      variables_json: variables,
    });

    console.log(`Review notification sent to ${reviewer.email}`);
  } catch (e) {
    console.error("Failed to send review notification:", e);
  }
}

// Helper to get max step number for a run
// deno-lint-ignore no-explicit-any
async function getMaxStepNumber(supabase: any, reportRunId: string): Promise<number> {
  const { data } = await supabase
    .from("report_run_steps")
    .select("step_number")
    .eq("report_run_id", reportRunId)
    .order("step_number", { ascending: false })
    .limit(1);
  
  return data?.[0]?.step_number ?? 14;
}

// Execute a step with proper error handling, recording, and inter-step throttling
// deno-lint-ignore no-explicit-any
async function executeStep(
  supabase: any,
  reportRunId: string,
  stepNumber: number,
  stepFn: () => Promise<Record<string, unknown>>
): Promise<void> {
  try {
    await updateStep(supabase, reportRunId, stepNumber, "running");
    const outputs = await stepFn();
    await updateStep(supabase, reportRunId, stepNumber, "completed", outputs);
    
    console.log(`Step ${stepNumber} complete, waiting ${INTER_STEP_DELAY_MS / 1000}s before next step`);
    await new Promise(r => setTimeout(r, INTER_STEP_DELAY_MS));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Step ${stepNumber} failed:`, errorMessage);
    await updateStep(supabase, reportRunId, stepNumber, "failed", undefined, errorMessage);
    throw error;
  }
}

// AI call with retry for rate limits
async function callAIWithRetry(
  prompt: string, 
  stepNumber: number,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  model: string,
  customTimeoutMs: number,
  maxOutputTokens?: number
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    throw new Error("AI service not configured. Please contact support.");
  }

  // Normalize model name: ensure provider prefix is present
  if (model.startsWith("gemini")) {
    model = `google/${model}`;
  } else if (model.startsWith("gpt")) {
    model = `openai/${model}`;
  }

  console.log(`Step ${stepNumber}: Using model ${model}, timeout ${customTimeoutMs / 1000}s${maxOutputTokens ? `, max_tokens ${maxOutputTokens}` : ''}`);

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      console.log(`Rate limited, retry ${attempt}/${RETRY_DELAYS.length}, waiting ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const response = await fetchWithTimeout(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt }
            ],
            ...(maxOutputTokens && { max_tokens: maxOutputTokens }),
          }),
        },
        customTimeoutMs
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI API error (attempt ${attempt + 1}):`, response.status, errorText);
        
        if (response.status === 429) {
          if (attempt < RETRY_DELAYS.length) {
            continue;
          }
          throw new Error("AI service rate limited. Please try again in a few minutes.");
        }
        
        if (response.status === 402) {
          throw new Error("AI credits exhausted. Please add funds to continue.");
        }
        
        throw new Error(`AI request failed: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "No response generated";
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      
      if (msg.includes("429") && attempt < RETRY_DELAYS.length) {
        continue;
      }
      
      if (msg.includes("timed out")) {
        console.error(`AI request timed out for step ${stepNumber} after ${customTimeoutMs}ms - failing fast`);
        throw new Error(`AI request timed out for step ${stepNumber}. Please try again.`);
      }
      
      throw error;
    }
  }

  throw new Error("AI service rate limited after all retries. Please try again later.");
}

// deno-lint-ignore no-explicit-any
async function updateStep(
  supabase: any,
  reportRunId: string,
  stepNumber: number,
  status: string,
  outputs?: Record<string, unknown>,
  errorMessage?: string
) {
  const updates: Record<string, unknown> = { status };
  
  if (status === "running") {
    updates.started_at = new Date().toISOString();
    
    const { data: currentStep } = await supabase
      .from("report_run_steps")
      .select("attempt_count")
      .eq("report_run_id", reportRunId)
      .eq("step_number", stepNumber)
      .maybeSingle();
    
    updates.attempt_count = (currentStep?.attempt_count || 0) + 1;
  } else if (status === "completed" || status === "failed") {
    updates.completed_at = new Date().toISOString();
  }
  
  if (outputs) {
    updates.outputs_json = outputs;
  }

  if (errorMessage) {
    updates.error_message = errorMessage;
  }

  await supabase
    .from("report_run_steps")
    .update(updates)
    .eq("report_run_id", reportRunId)
    .eq("step_number", stepNumber);

  if (status === "running") {
    await supabase
      .from("report_runs")
      .update({ current_step: stepNumber })
      .eq("id", reportRunId);
  }
}

// deno-lint-ignore no-explicit-any
async function updateRunStatus(supabase: any, reportRunId: string, status: string, errorMessage?: string) {
  const updates: Record<string, unknown> = { status };
  
  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
  }
  
  await supabase
    .from("report_runs")
    .update(updates)
    .eq("id", reportRunId);

  // Also update the current step with the error if failed
  if (status === "failed" && errorMessage) {
    const { data: currentRun } = await supabase
      .from("report_runs")
      .select("current_step")
      .eq("id", reportRunId)
      .single();
    
    if (currentRun) {
      await supabase
        .from("report_run_steps")
        .update({ 
          status: "failed", 
          error_message: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq("report_run_id", reportRunId)
        .eq("step_number", currentRun.current_step);
    }
  }
}
