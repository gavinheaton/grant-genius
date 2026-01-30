import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Model selection based on step complexity
function getModelForStep(stepNumber: number): string {
  // Step 0: Source pack - handled by generate-report
  // Steps 1-3: Context extraction, basic search - use lighter model
  if (stepNumber <= 3) {
    return "google/gemini-2.5-flash-lite";
  }
  // Steps 4-8: Complex market analysis (including Step 5) - use heavier model
  if (stepNumber <= 8) {
    return "google/gemini-3-flash-preview";
  }
  // Steps 12-13: Assembly steps - use flash-preview for good speed
  if (stepNumber === 12 || stepNumber === 13) {
    return "google/gemini-3-flash-preview";
  }
  // Step 14: Final merge - use lite model (simple task)
  if (stepNumber === 14) {
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
// CRITICAL: Must leave ~15-20s headroom within 60s platform limit for:
// - Function boot time (~100-200ms)
// - Database queries (fetch bundle, grant context)
// - Response parsing and checkpoint save
function getTimeoutForStep(stepNumber: number, overrideSeconds: number | null = null): number {
  // If there's a configured override, use it
  if (overrideSeconds !== null) {
    return overrideSeconds * 1000; // Convert to ms
  }
  // Steps 0, 12, 13: Complex tasks - 42s max to stay safely under 60s limit
  if (stepNumber === 0 || stepNumber === 12 || stepNumber === 13) return 42000;
  // Steps 6-8: TAM/SAM/SOM calculations - 38s
  if (stepNumber >= 6 && stepNumber <= 8) return 38000;
  // All other steps - 35s
  return 35000;
}

// Cache for active prompt bundle
let cachedBundle: {
  system_prompt: string;
  steps: Map<number, { prompt_template: string; model_override: string | null; timeout_seconds: number | null }>;
} | null = null;

// Fetch active prompt bundle from database
// deno-lint-ignore no-explicit-any
async function fetchActiveBundle(supabase: any): Promise<typeof cachedBundle> {
  if (cachedBundle) return cachedBundle;

  try {
    const { data: bundle, error: bundleError } = await supabase
      .from("prompt_bundles")
      .select("id, system_prompt")
      .eq("is_active", true)
      .maybeSingle();

    if (bundleError || !bundle) {
      console.log("No active prompt bundle found, using defaults");
      return null;
    }

    const { data: steps, error: stepsError } = await supabase
      .from("prompt_bundle_steps")
      .select("step_number, prompt_template, model_override, timeout_seconds")
      .eq("bundle_id", bundle.id)
      .order("step_number", { ascending: true });

    if (stepsError || !steps) {
      console.log("No prompt steps found, using defaults");
      return null;
    }

    const stepsMap = new Map<number, { prompt_template: string; model_override: string | null; timeout_seconds: number | null }>();
    for (const step of steps) {
      stepsMap.set(step.step_number, {
        prompt_template: step.prompt_template,
        model_override: step.model_override,
        timeout_seconds: step.timeout_seconds,
      });
    }

    cachedBundle = {
      system_prompt: bundle.system_prompt,
      steps: stepsMap,
    };

    console.log("Loaded active prompt bundle with", stepsMap.size, "steps");
    return cachedBundle;
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
  summary: string;
}> {
  const MAX_GUIDELINES_LENGTH = 10000;
  
  try {
    const { data, error } = await supabase
      .from("grant_versions")
      .select(`
        version_number,
        guidelines_raw_text,
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

    // Format rubric from ai_suggestions_json
    let formattedRubric = "";
    // deno-lint-ignore no-explicit-any
    const suggestions = data.ai_suggestions_json as any;
    if (suggestions?.rubric?.sections && Array.isArray(suggestions.rubric.sections)) {
      formattedRubric = "Assessment Criteria:\n\n";
      // deno-lint-ignore no-explicit-any
      suggestions.rubric.sections.forEach((section: any, index: number) => {
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
      summary,
    };
  } catch (e) {
    console.error("Error fetching grant context:", e);
    return {
      name: "",
      versionLabel: "",
      guidelinesExcerpt: "",
      formattedRubric: "",
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
      // Replace with content inside the block
      result = result.replace(conditionalRegex, "$1");
    } else {
      // Remove the entire block
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

    // 15-PHASE ARCHITECTURE: Accept any checkpoint from steps 0-13, plus recovery for step 14
    let effectiveResumeFromStep = reportRun.current_step;

    // STEP 14 RECOVERY: Handle case where final step stalled without completing
    if (effectiveResumeFromStep >= 14) {
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

      // No report exists - step 14 stalled. Reset to resume from step 13 (re-run step 14)
      console.log(`Step 14 recovery: Run ${reportRunId} stuck at step 14 without report. Resetting to resume from step 13.`);
      
      // Reset step 14 row so it can be re-run
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
        .eq("step_number", 14);

      // Treat as resuming from step 13 so next step executed is 14
      effectiveResumeFromStep = 13;
    }

    // Validate checkpoint range (steps 0-13 are valid checkpoints, step 14 is final)
    if (effectiveResumeFromStep < 0 || effectiveResumeFromStep > 13) {
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
        reportRun.email_on_complete ?? false
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
 * 15-PHASE ARCHITECTURE: Run exactly ONE step, then checkpoint
 * This function is called for steps 1-14.
 * Step 14 completes the report instead of checkpointing.
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
  emailOnComplete: boolean
) {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Fetch active prompt bundle
  const bundle = await fetchActiveBundle(supabase);
  const systemPrompt = bundle?.system_prompt || DEFAULT_SYSTEM_PROMPT;

  const summary = inputs.summary as string || "";
  const publicArticleUrl = inputs.publicArticleUrl as string || "";
  const trl = inputs.trl as string || "";
  const ipStatus = inputs.ipStatus as string || "";
  
  const reportContent: Record<string, unknown> = { ...checkpointData };
  const citations = [...checkpointCitations];
  
  const nextStep = resumeFromStep + 1;
  console.log(`15-PHASE: Executing step ${nextStep} (resumed from ${resumeFromStep})`);

  // Fetch grant context for prompt interpolation
  const grantContext = await fetchGrantContext(supabase, grantVersionId);

  // Extract source pack from Step 0 output
  // deno-lint-ignore no-explicit-any
  const sourcePack = reportContent.sourcePack as any || { sources: [], unknowns: [] };
  const sourcesJson = JSON.stringify(sourcePack.sources || []);
  const unknownsJson = JSON.stringify(sourcePack.unknowns || []);

  // Build base interpolation variables including grant context and source pack
  const getBaseVariables = (): Record<string, string> => ({
    summary,
    publicArticleUrl,
    trl,
    ipStatus,
    grantName: grantContext.name,
    grantVersionLabel: grantContext.versionLabel,
    grantGuidelines: grantContext.guidelinesExcerpt,
    grantRubric: grantContext.formattedRubric,
    grantSummary: grantContext.summary,
    // Source pack from Step 0
    sources: sourcesJson,
    unknowns: unknownsJson,
    // Step outputs (from checkpoint data)
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
    // NEW: Market Sizing Source Pack from Step 5
    marketSizingSourcePack: String(reportContent.marketSizingSourcePack || ""),
    // Assembly variables (JSON stringified for Steps 12-14)
    step0: JSON.stringify(reportContent.sourcePack || {}),
    step1: JSON.stringify(reportContent.researchContext || {}),
    step2: JSON.stringify(reportContent.competitorResearch || {}),
    step3: JSON.stringify(reportContent.marketSegments || {}),
    step4: JSON.stringify(reportContent.existingCompetitors || {}),
    step5: JSON.stringify(reportContent.marketSizingSourcePack || {}),
    step6: JSON.stringify(reportContent.tam || {}),
    step7: JSON.stringify(reportContent.sam || {}),
    step8: JSON.stringify(reportContent.som || {}),
    step9: JSON.stringify(reportContent.economicImpact || {}),
    step10: JSON.stringify(reportContent.competitorTable || {}),
    step11: JSON.stringify(reportContent.partnerBusinesses || {}),
    // New assembly step outputs
    step12: JSON.stringify(reportContent.assembledSections || {}),
    step13: JSON.stringify(reportContent.tablesSources || {}),
  });

  // Helper function to get prompt for a step
  const getStepPrompt = (stepNum: number, defaultPrompt: string) => {
    const stepConfig = bundle?.steps.get(stepNum);
    if (stepConfig?.prompt_template) {
      return interpolatePrompt(stepConfig.prompt_template, getBaseVariables());
    }
    return defaultPrompt;
  };

  // Helper function to get model override for a step
  const getStepModel = (stepNum: number) => {
    return bundle?.steps.get(stepNum)?.model_override || null;
  };

  // Helper function to get timeout for a step (in ms)
  const getStepTimeout = (stepNum: number) => {
    const stepConfig = bundle?.steps.get(stepNum);
    return getTimeoutForStep(stepNum, stepConfig?.timeout_seconds || null);
  };

  try {
    // Execute exactly one step based on nextStep
    switch (nextStep) {
      case 1:
        // Step 1: Extract Context (moved from generate-report)
        await executeStep(supabase, reportRunId, 1, async () => {
          // Scrape article content if not already in checkpoint
          let articleContent = "";
          if (FIRECRAWL_API_KEY) {
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
                articleContent = scrapeData.data?.markdown || scrapeData.markdown || "";
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

          const stepConfig = bundle?.steps.get(1);
          const interpolationVars = {
            ...getBaseVariables(),
            articleContent: articleContent.slice(0, 8000),
          };
          
          let contextPrompt: string;
          if (stepConfig?.prompt_template) {
            contextPrompt = interpolatePrompt(stepConfig.prompt_template, interpolationVars);
          } else {
            contextPrompt = `You are analyzing research for commercialization potential.

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

## MISSING DATA CATEGORIES
${unknownsJson}

Research Summary: ${summary}
Article URL: ${publicArticleUrl}
${articleContent ? `Article Content:\n${articleContent.slice(0, 8000)}` : ""}
${trl ? `Technology Readiness Level: ${trl}` : ""}
${ipStatus ? `IP Status: ${ipStatus}` : ""}

Extract and summarize:
1. The core research innovation
2. Key technologies or methods involved
3. Potential applications
4. Current stage of development

When citing data, reference sources by source_id from the source pack (e.g., [S0-1]).
Provide a structured analysis.`;
          }

          const contextResult = await callAIWithRetry(contextPrompt, 1, systemPrompt, stepConfig?.model_override, getStepTimeout(1));
          reportContent.researchContext = contextResult;
          return { context: contextResult };
        });
        break;

      case 2:
        // Step 2: Competitor Research
        await executeStep(supabase, reportRunId, 2, async () => {
          const competitorPrompt = getStepPrompt(2, `Based on this research:
${summary}

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

Search for and identify competing or similar research projects from other researchers worldwide. Include:
1. Names of competing research groups/universities
2. Brief description of their work
3. Key differences from our research
4. Publication dates and status

Reference sources by source_id (e.g., [S0-1]).
Format as a structured list. If you cannot find specific examples, indicate this clearly with "No validated sources found" for that area.`);

          const competitorResult = await callAIWithRetry(competitorPrompt, 2, systemPrompt, getStepModel(2), getStepTimeout(2));
          reportContent.competitorResearch = competitorResult;
          return { competitors: competitorResult };
        });
        break;

      case 3:
        // Step 3: Market Segments
        await executeStep(supabase, reportRunId, 3, async () => {
          const marketPrompt = getStepPrompt(3, `Based on this research innovation:
${summary}

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

Identify at least 3 different market segments where this research could be commercialized as a product or service. At least one must be in Australia.

For each segment provide:
1. Segment name
2. Target customers
3. Product/service concept
4. Geographic focus (include at least one Australian market)
5. Estimated market size category (small/medium/large)

Reference sources by source_id (e.g., [S0-1]).
Be specific and practical.`);

          const marketResult = await callAIWithRetry(marketPrompt, 3, systemPrompt, getStepModel(3), getStepTimeout(3));
          reportContent.marketSegments = marketResult;
          return { segments: marketResult };
        });
        break;

      case 4:
        // Step 4: Find Competitors
        await executeStep(supabase, reportRunId, 4, async () => {
          const existingCompetitorsPrompt = getStepPrompt(4, `Based on the market segments identified for this research:
${summary}

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

Market Segments:
${reportContent.marketSegments}

Find companies that may already have products or services in these markets. For each competitor:
1. Company name
2. Product/service name
3. Estimated market share or revenue if available
4. Geographic presence
5. How they compare to the proposed research

Reference sources by source_id (e.g., [S0-1]).
Note: If specific market data cannot be validated, mark as "Data not available - requires further research".`);

          const existingCompetitorsResult = await callAIWithRetry(existingCompetitorsPrompt, 4, systemPrompt, getStepModel(4), getStepTimeout(4));
          reportContent.existingCompetitors = existingCompetitorsResult;
          return { competitors: existingCompetitorsResult };
        });
        break;

      case 5:
        // Step 5: Market Sizing Source Pack (NEW)
        await executeStep(supabase, reportRunId, 5, async () => {
          const stepConfig = bundle?.steps.get(5);
          const interpolationVars = {
            ...getBaseVariables(),
            marketSegments: String(reportContent.marketSegments || ""),
          };
          
          let marketSizingPrompt: string;
          if (stepConfig?.prompt_template) {
            marketSizingPrompt = interpolatePrompt(stepConfig.prompt_template, interpolationVars);
          } else {
            marketSizingPrompt = `Build a validated source pack of market categories and sizes for the market segments identified.

## INPUTS
Research Summary: ${summary}
Market Segments: ${reportContent.marketSegments}

## TASK
For each segment, identify 2-4 externally-defined market categories with validated market size numbers where available.
Return JSON with by_segment array containing candidate_categories and unknowns.
If you cannot find validated sources, set market_value to "Unknown (no validated source found)".`;
          }

          const marketSizingResult = await callAIWithRetry(marketSizingPrompt, 5, systemPrompt, stepConfig?.model_override, getStepTimeout(5));
          reportContent.marketSizingSourcePack = marketSizingResult;
          return { marketSizingSourcePack: marketSizingResult };
        });
        break;

      case 6:
        // Step 6: Calculate TAM (was Step 5)
        await executeStep(supabase, reportRunId, 6, async () => {
          const tamPrompt = getStepPrompt(6, `Calculate the Total Addressable Market (TAM) for the research commercialization:

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

## MARKET SIZING SOURCE PACK (from Step 5)
${reportContent.marketSizingSourcePack || "Not available"}

Research: ${summary}
Market Segments: ${reportContent.marketSegments}

Using data from the validated sources above AND the market sizing source pack (prioritize Australian Government, OECD, World Bank, ABS, industry reports), estimate TAM for each market segment:
1. Market size in USD/AUD
2. Data source and year (reference by source_id e.g., [S0-1])
3. Growth rate if available
4. Key assumptions

IMPORTANT: Only use numbers from validated sources. If you cannot find validated data, clearly state "Validated data not available - estimate based on [methodology]".`);

          const tamResult = await callAIWithRetry(tamPrompt, 6, systemPrompt, getStepModel(6), getStepTimeout(6));
          reportContent.tam = tamResult;
          return { tam: tamResult };
        });
        break;

      case 7:
        // Step 7: Calculate SAM (was Step 6)
        await executeStep(supabase, reportRunId, 7, async () => {
          const samPrompt = getStepPrompt(7, `Based on the TAM analysis:
${reportContent.tam}

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

## MARKET SIZING SOURCE PACK (from Step 5)
${reportContent.marketSizingSourcePack || "Not available"}

Calculate the Serviceable Addressable Market (SAM) - the portion of TAM that can realistically be served:
1. Geographic limitations
2. Customer segment focus
3. Distribution capabilities
4. Regulatory constraints

Reference sources by source_id (e.g., [S0-1]).
Provide SAM for each market segment with clear methodology.`);

          const samResult = await callAIWithRetry(samPrompt, 7, systemPrompt, getStepModel(7), getStepTimeout(7));
          reportContent.sam = samResult;
          return { sam: samResult };
        });
        break;

      case 8:
        // Step 8: Calculate SOM (was Step 7)
        await executeStep(supabase, reportRunId, 8, async () => {
          const somPrompt = getStepPrompt(8, `Based on the SAM analysis:
${reportContent.sam}

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

## MARKET SIZING SOURCE PACK (from Step 5)
${reportContent.marketSizingSourcePack || "Not available"}

Calculate a realistic Serviceable Obtainable Market (SOM) - what can actually be captured:
1. First year targets
2. 3-year projections
3. 5-year projections
4. Market penetration assumptions
5. Competitive dynamics

Reference sources by source_id (e.g., [S0-1]).
Be conservative and realistic in estimates.`);

          const somResult = await callAIWithRetry(somPrompt, 8, systemPrompt, getStepModel(8), getStepTimeout(8));
          reportContent.som = somResult;
          return { som: somResult };
        });
        break;

      case 9:
        // Step 9: Australian Economic Impact (was Step 8)
        await executeStep(supabase, reportRunId, 9, async () => {
          const impactPrompt = getStepPrompt(9, `Based on the SOM projections:
${reportContent.som}

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

Calculate the likely economic impact to the Australian economy from commercializing this research:
1. Direct revenue in Australia
2. Job creation potential
3. Export opportunities
4. IP licensing revenue
5. Tax contribution estimates
6. Industry development benefits
7. Knowledge economy contribution

Reference sources by source_id (e.g., [S0-1]).
Provide 5-year projections where possible.`);

          const impactResult = await callAIWithRetry(impactPrompt, 9, systemPrompt, getStepModel(9), getStepTimeout(9));
          reportContent.economicImpact = impactResult;
          return { impact: impactResult };
        });
        break;

      case 10:
        // Step 10: Competitor Comparison Table (was Step 9)
        await executeStep(supabase, reportRunId, 10, async () => {
          const tablePrompt = getStepPrompt(10, `Create a competitor comparison table based on:

Our Products: ${reportContent.marketSegments}
Existing Competitors: ${reportContent.existingCompetitors}

Build a markdown table comparing:
| Feature | Our Solution | Competitor 1 | Competitor 2 | Competitor 3 |
|---------|--------------|--------------|--------------|--------------|
| Feature Set | | | | |
| User Experience | | | | |
| Price Point | | | | |
| Technology | | | | |
| Market Focus | | | | |

Fill in with specific comparisons.`);

          const tableResult = await callAIWithRetry(tablePrompt, 10, systemPrompt, getStepModel(10), getStepTimeout(10));
          reportContent.competitorTable = tableResult;
          return { table: tableResult };
        });
        break;

      case 11:
        // Step 11: Partner Businesses (was Step 10)
        await executeStep(supabase, reportRunId, 11, async () => {
          const partnerPrompt = getStepPrompt(11, `Based on the ANZSIC Industry Codes, identify Australian businesses that could partner for commercialization:

## AVAILABLE SOURCES (from Step 0)
${sourcesJson}

Research: ${summary}
Market Segments: ${reportContent.marketSegments}

1. Identify relevant ANZSIC codes
2. For each code, list 3-5 Australian businesses operating in that classification
3. Include company name, location, size, and potential partnership type
4. Focus on businesses that could:
   - Provide distribution
   - Offer co-development
   - License the technology
   - Invest in the venture

Reference sources by source_id (e.g., [S0-1]).
Use the ANZSIC hierarchy for classification.`);

          const partnerResult = await callAIWithRetry(partnerPrompt, 11, systemPrompt, getStepModel(11), getStepTimeout(11));
          reportContent.partnerBusinesses = partnerResult;
          return { partners: partnerResult };
        });
        break;

      case 12:
        // Step 12: Assemble Report Sections (HTML)
        // This step generates the 11 report sections as clean HTML
        await executeStep(supabase, reportRunId, 12, async () => {
          console.log("Step 12: Assembling report sections (HTML)");
          
          const defaultSectionsPrompt = `You are assembling report sections for Australian government assessors.

Grant: {{grantName}} ({{grantVersionLabel}})

## STEP OUTPUTS (raw JSON from research pipeline)

Step 0 - Source Pack: {{step0}}
Step 1 - Research Context: {{step1}}
Step 2 - Competitor Research: {{step2}}
Step 3 - Market Segments: {{step3}}
Step 4 - Existing Competitors: {{step4}}
Step 5 - Market Sizing Source Pack: {{step5}}
Step 6 - TAM: {{step6}}
Step 7 - SAM: {{step7}}
Step 8 - SOM: {{step8}}
Step 9 - Economic Impact: {{step9}}
Step 10 - Competitor Table: {{step10}}
Step 11 - Partner Businesses: {{step11}}

## TASK

Generate the 11 report sections as well-formatted HTML.

RULES:
- Use ONLY validated facts from step outputs
- Every numeric claim must have a citation marker [S#] referencing sources
- If an output contains an assumption, label it (High/Med/Low confidence)
- Remove internal process phrasing
- Use semantic HTML elements (h1, h2, h3, p, ul, ol, li, table, th, td, strong, em)
- Do NOT include <html>, <head>, <body> tags - just the content

## SECTIONS TO GENERATE

1. Executive Summary (8-12 bullet points, each with [S#] citation)
2. Research Context and Innovation
3. Unmet Need and Australian Relevance
4. Commercialisation Pathways (3 Segments: product, customer, value prop, AU angle, GTM hypothesis)
5. Competitive Landscape and Differentiation (2-5 comparators per segment with evidence)
6. Market Sizing (TAM/SAM/SOM narrative - tables will be added in next step)
7. Indicative Economic Impact to Australia (2+ quantified pathways)
8. Potential Australian Partners (ANZSIC mapping - table will be added in next step)
9. Key Risks and Mitigations
10. Data Gaps and Validation Needs
11. References placeholder (sources list will be added in next step)

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "report_html": "<h1>Executive Summary</h1><ul><li>Point 1 [S1]</li>...</ul><h1>Research Context...</h1>...",
  "section_metadata": {
    "sections_generated": ["Executive Summary", "Research Context", ...],
    "citation_markers_used": ["S1", "S2", ...]
  }
}

IMPORTANT: 
- For tables, use proper <table>, <thead>, <tbody>, <tr>, <th>, <td> elements
- Add inline styles for table borders: style="border: 1px solid #e5e7eb; padding: 10px;"
- Use <strong> for bold, <em> for italic
- Wrap paragraphs in <p> tags`;

          const sectionsPrompt = getStepPrompt(12, defaultSectionsPrompt);
          const sectionsResult = await callAIWithRetry(
            sectionsPrompt, 
            12, 
            systemPrompt, 
            getStepModel(12),
            getStepTimeout(12)
          );
          
          // Parse the JSON response
          let parsedSections;
          try {
            parsedSections = JSON.parse(sectionsResult);
          } catch {
            // If JSON parsing fails, wrap raw output as HTML
            parsedSections = { 
              report_html: sectionsResult, 
              section_metadata: { sections_generated: [], citation_markers_used: [] }
            };
          }
          
          reportContent.assembledSections = parsedSections;
          return { assembledSections: parsedSections };
        });
        break;

      case 13:
        // Step 13: Build Tables and Sources (HTML)
        // Extract all tables and build deduplicated source list
        await executeStep(supabase, reportRunId, 13, async () => {
          console.log("Step 13: Building tables and source list (HTML)");
          
          const defaultTablesPrompt = `You are building the tables and source list for a grant report.

## STEP OUTPUTS (JSON from research pipeline)

Step 0 - Source Pack: {{step0}}
Step 4 - Existing Competitors: {{step4}}
Step 5 - Market Sizing Source Pack: {{step5}}
Step 6 - TAM: {{step6}}
Step 7 - SAM: {{step7}}
Step 8 - SOM: {{step8}}
Step 9 - Economic Impact: {{step9}}
Step 10 - Competitor Table: {{step10}}
Step 11 - Partner Businesses: {{step11}}
Step 12 - Assembled Sections: {{step12}}

## TASK

Extract and consolidate ALL tables and sources from the step outputs.

For TABLES (as HTML):
1. Market Sizing Table (TAM/SAM/SOM consolidated with sources)
2. Assumptions Table (all assumptions with confidence levels)
3. Competitor Comparison Table
4. Partner Businesses Table
5. Economic Impact Table
6. Any additional tables from step outputs

For SOURCES:
1. Collect ALL sources referenced in any step output
2. Deduplicate by URL
3. Format each in MLA style with Accessed date
4. Assign sequential IDs (S1, S2, etc.)

## OUTPUT FORMAT

Return ONLY valid JSON:
{
  "tables": [
    {
      "id": "market-sizing",
      "title": "Market Sizing Summary",
      "section": "Market Sizing",
      "html": "<table style='width:100%;border-collapse:collapse;'><thead><tr><th style='border:1px solid #e5e7eb;padding:10px;background:#1e3a5f;color:white;'>Metric</th>...</tr></thead><tbody>...</tbody></table>"
    }
  ],
  "all_sources": [
    {"id": "S1", "mla_citation": "Author. Title. Publisher, Date. URL. Accessed Date.", "url": "https://..."}
  ]
}

IMPORTANT:
- Tables must be complete HTML with inline styles for borders and padding
- Use background:#1e3a5f and color:white for header cells
- Use alternating row backgrounds: #ffffff and #f9fafb`;

          const tablesPrompt = getStepPrompt(13, defaultTablesPrompt);
          const tablesResult = await callAIWithRetry(
            tablesPrompt, 
            13, 
            systemPrompt, 
            getStepModel(13),
            getStepTimeout(13)
          );
          
          // Parse the JSON response
          let parsedTables;
          try {
            parsedTables = JSON.parse(tablesResult);
          } catch {
            parsedTables = { tables: [], all_sources: [] };
          }
          
          reportContent.tablesSources = parsedTables;
          return { tablesSources: parsedTables };
        });
        break;

      case 14:
        // Step 14: Finalize Report - FINAL STEP
        // Merge sections + tables + sources into final HTML
        await executeStep(supabase, reportRunId, 14, async () => {
          console.log("Step 14: Finalizing report (HTML)");
          
          const defaultFinalizePrompt = `You are finalizing a grant report for Australian government assessors.

## INPUTS

Step 12 - Report Sections (HTML): {{step12}}

Step 13 - Tables and Sources: {{step13}}

## TASK

Merge the report sections with the tables and sources into the final report structure.

1. Take report_html from Step 12
2. Insert HTML tables from Step 13 into their appropriate sections
3. Add the all_sources list from Step 13
4. Collect all data_gaps mentioned across steps into data_gaps array
5. Validate that citation markers [S#] in the HTML match IDs in all_sources

## OUTPUT FORMAT

Return ONLY valid JSON matching this exact schema:
{
  "title": "Commercialisation Research Report",
  "report_html": "<h1>Executive Summary</h1>...<h1>Market Sizing</h1><p>...</p>[TABLE_HERE]...",
  "tables": [{"id": "string", "title": "string", "html": "string", "section": "string"}],
  "all_sources": [{"id": "S1", "mla_citation": "string", "url": "string"}],
  "data_gaps": ["Gap description 1", "Gap description 2"]
}

CRITICAL: 
- Ensure report_html is a complete, assessor-ready HTML document
- Do NOT wrap in code blocks
- The report_html should include the tables inline where appropriate`;

          const finalizePrompt = getStepPrompt(14, defaultFinalizePrompt);
          const finalizeResult = await callAIWithRetry(
            finalizePrompt, 
            14, 
            systemPrompt, 
            getStepModel(14),
            getStepTimeout(14)
          );
          
          // Parse the JSON response
          let parsedReport;
          try {
            parsedReport = JSON.parse(finalizeResult);
          } catch {
            // If JSON parsing fails, try to construct from previous steps
            const sections = reportContent.assembledSections as { report_html?: string } || {};
            const tablesSources = reportContent.tablesSources as { tables?: unknown[]; all_sources?: unknown[] } || {};
            parsedReport = { 
              report_html: sections.report_html || finalizeResult, 
              tables: tablesSources.tables || [], 
              all_sources: tablesSources.all_sources || [], 
              data_gaps: [] 
            };
          }
          
          reportContent.assembledReport = parsedReport;
          return { assembledReport: parsedReport };
        });

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
        
        console.log(`15-PHASE: Report run ${reportRunId} completed successfully`);
        return; // No checkpoint needed - we're done
    }

    // For steps 1-13: Save checkpoint and exit
    // Frontend will detect pending status and call resume-report-run again
    await supabase
      .from("report_runs")
      .update({
        checkpoint_data_json: reportContent,
        checkpoint_citations_json: citations,
        current_step: nextStep,
        status: "pending",
      })
      .eq("id", reportRunId);

    console.log(`15-PHASE: Checkpoint saved at step ${nextStep} for report run ${reportRunId}`);

  } catch (error) {
    console.error(`15-PHASE: Step ${nextStep} failed:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateRunStatus(supabase, reportRunId, "failed", errorMessage);
    
    // Refund credit on failure
    await refundCredit(supabase, reportRunId);
  }
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
      // Decrement used_quantity using the RPC function
      await supabase.rpc("decrement_entitlement", { 
        ent_id: consumption.entitlement_id 
      });
      
      // Delete the consumption record
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

  // Create the final report - with explicit error handling
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

  // Update run as completed - with explicit error handling
  const { error: runUpdateError } = await supabase
    .from("report_runs")
    .update({
      status: "completed",
      current_step: 14, // Final step is now 14
      completed_at: new Date().toISOString(),
    })
    .eq("id", reportRunId);

  if (runUpdateError) {
    console.error("Failed to update run status:", runUpdateError);
    // Don't throw here - report is already saved
  }

  // Update application status - with explicit error handling
  const { error: appUpdateError } = await supabase
    .from("applications")
    .update({ status: "ready" })
    .eq("id", applicationId);

  if (appUpdateError) {
    console.error("Failed to update application status:", appUpdateError);
    // Don't throw here - report is already saved
  }

  // Send email notification if enabled
  if (emailOnComplete && newReport?.id) {
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
      // Don't fail the report creation if email fails
      console.error("Failed to send email notification:", emailError);
    }
  }
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
    
    // Throttle: wait between steps to spread requests and avoid rate limits
    console.log(`Step ${stepNumber} complete, waiting ${INTER_STEP_DELAY_MS / 1000}s before next step`);
    await new Promise(r => setTimeout(r, INTER_STEP_DELAY_MS));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Step ${stepNumber} failed:`, errorMessage);
    await updateStep(supabase, reportRunId, stepNumber, "failed", undefined, errorMessage);
    throw error;
  }
}

// Gemini-only AI call with aggressive retry delays for rate limits
async function callAIWithRetry(
  prompt: string, 
  stepNumber: number,
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  modelOverride?: string | null,
  customTimeoutMs?: number
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    throw new Error("AI service not configured. Please contact support.");
  }

  // Use model override if provided, otherwise use default for step
  const model = modelOverride || getModelForStep(stepNumber);
  
  // Use custom timeout if provided, otherwise use step-specific default
  const timeoutMs = customTimeoutMs || getTimeoutForStep(stepNumber);
  console.log(`Step ${stepNumber}: Using model ${model}, timeout ${timeoutMs / 1000}s`);

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    // Wait before retry (not on first attempt)
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
          }),
        },
        timeoutMs // Use configurable timeout
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI API error (attempt ${attempt + 1}):`, response.status, errorText);
        
        // Rate limit - retry with backoff
        if (response.status === 429) {
          if (attempt < RETRY_DELAYS.length) {
            continue; // Will wait and retry
          }
          throw new Error("AI service rate limited. Please try again in a few minutes.");
        }
        
        // Payment required
        if (response.status === 402) {
          throw new Error("AI credits exhausted. Please add funds to continue.");
        }
        
        throw new Error(`AI request failed: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "No response generated";
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      
      // If it's a rate limit message and we have retries left, continue
      if (msg.includes("429") && attempt < RETRY_DELAYS.length) {
        continue;
      }
      
      // FAIL FAST on timeout - do NOT retry within this function invocation.
      // Retrying timeouts within edge function extends execution past 60s limit.
      // The frontend auto-resume mechanism will trigger a new function call.
      if (msg.includes("timed out")) {
        console.error(`AI request timed out for step ${stepNumber} after ${customTimeoutMs || getTimeoutForStep(stepNumber)}ms - failing fast`);
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
    updates.last_attempt_at = new Date().toISOString();
    updates.worker = `edge-${Deno.env.get("DENO_DEPLOYMENT_ID") || "local"}`;
    
    // Increment attempt_count - first get current value
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
async function updateRunStatus(
  supabase: any,
  reportRunId: string,
  status: string,
  errorMessage?: string
) {
  const updates: Record<string, unknown> = {
    status,
    completed_at: new Date().toISOString(),
  };

  if (errorMessage) {
    const { data: run } = await supabase
      .from("report_runs")
      .select("current_step")
      .eq("id", reportRunId)
      .single();
    
    if (run?.current_step !== undefined) {
      await supabase
        .from("report_run_steps")
        .update({ 
          status: "failed",
          error_message: errorMessage,
          completed_at: new Date().toISOString()
        })
        .eq("report_run_id", reportRunId)
        .eq("step_number", run.current_step);
    }
  }

  await supabase
    .from("report_runs")
    .update(updates)
    .eq("id", reportRunId);
}
