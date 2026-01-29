import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 13-STEP ARCHITECTURE: Step 0 (source pack) + Steps 1-11 (research) + Step 12 (assembly)
const RESEARCH_STEPS = [
  { name: "build_source_pack", description: "Building Australia-first source pack" },
  { name: "extract_context", description: "Extracting research context from article" },
  { name: "competitor_research", description: "Searching for competing research" },
  { name: "market_segments", description: "Identifying market segments" },
  { name: "find_competitors", description: "Finding existing competitors" },
  { name: "market_sizing_source_pack", description: "Building market sizing source pack" }, // NEW Step 5
  { name: "calculate_tam", description: "Calculating Total Addressable Market" },
  { name: "calculate_sam", description: "Calculating Serviceable Addressable Market" },
  { name: "calculate_som", description: "Calculating Serviceable Obtainable Market" },
  { name: "economic_impact", description: "Analyzing Australian economic impact" },
  { name: "competitor_table", description: "Building competitor comparison" },
  { name: "partner_businesses", description: "Finding Australian partner businesses" },
  { name: "assemble_report", description: "Assembling final grant report" },
];

// Model selection based on step complexity
function getModelForStep(stepNumber: number): string {
  // Step 0: Source pack - needs good reasoning for source curation
  if (stepNumber === 0) {
    return "google/gemini-3-flash-preview";
  }
  // Steps 1-3: Context extraction, basic search - use lighter model
  if (stepNumber <= 3) {
    return "google/gemini-2.5-flash-lite";
  }
  // Steps 4-8: Complex market analysis (including new Step 5) - use heavier model
  if (stepNumber <= 8) {
    return "google/gemini-3-flash-preview";
  }
  // Step 12: Final assembly - use most capable model
  if (stepNumber === 12) {
    return "google/gemini-3-pro-preview";
  }
  return "google/gemini-2.5-flash-lite";
}

// Default system prompt (fallback if no active bundle)
const DEFAULT_SYSTEM_PROMPT = "You are a research commercialization expert helping prepare grant applications. Provide detailed, well-researched responses. Always cite sources where possible. If data cannot be validated, clearly indicate this.";

// Inter-step throttle delay (ms) to spread requests and avoid rate limits
const INTER_STEP_DELAY_MS = 3000;

// Retry delays for rate limit errors (5s, 15s, 30s)
const RETRY_DELAYS = [5000, 15000, 30000];

// Cache for active prompt bundle
let cachedBundle: {
  system_prompt: string;
  steps: Map<number, { prompt_template: string; model_override: string | null }>;
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
      .select("step_number, prompt_template, model_override")
      .eq("bundle_id", bundle.id)
      .order("step_number", { ascending: true });

    if (stepsError || !steps) {
      console.log("No prompt steps found, using defaults");
      return null;
    }

    const stepsMap = new Map<number, { prompt_template: string; model_override: string | null }>();
    for (const step of steps) {
      stepsMap.set(step.step_number, {
        prompt_template: step.prompt_template,
        model_override: step.model_override,
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
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const { applicationId } = await req.json();

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: "Application ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch application and verify ownership
    const { data: application, error: appError } = await supabaseClient
      .from("applications")
      .select("id, user_id, inputs_json, grant_version_id")
      .eq("id", applicationId)
      .maybeSingle();

    if (appError || !application) {
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (application.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized access to application" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate inputs
    const inputs = application.inputs_json as Record<string, unknown> || {};
    const publicArticleUrl = inputs.publicArticleUrl as string;
    const summary = inputs.summary as string;

    if (!publicArticleUrl || !summary) {
      return new Response(
        JSON.stringify({ error: "Article URL and summary are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for available entitlement
    const { data: entitlements, error: entError } = await supabaseClient
      .from("entitlements")
      .select("id, quantity, used_quantity, expires_at")
      .eq("user_id", userId)
      .eq("entitlement_type", "REPORT_ONE_OFF");

    if (entError) {
      console.error("Error fetching entitlements:", entError);
      return new Response(
        JSON.stringify({ error: "Failed to verify credits" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find an entitlement with available credits
    const now = new Date();
    const availableEntitlement = (entitlements || []).find((ent) => {
      if (ent.expires_at && new Date(ent.expires_at) < now) return false;
      return ent.quantity > ent.used_quantity;
    });

    if (!availableEntitlement) {
      return new Response(
        JSON.stringify({ error: "No report credits available. Please purchase a report." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get a published report template version
    const { data: templateVersion, error: templateError } = await supabaseClient
      .from("report_template_versions")
      .select("id")
      .eq("is_published", true)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (templateError || !templateVersion) {
      console.error("No published template version found");
      return new Response(
        JSON.stringify({ error: "Report template not configured. Please contact support." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for database writes
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Create report run with 13 total steps (0-12)
    const { data: reportRun, error: runError } = await supabaseAdmin
      .from("report_runs")
      .insert({
        application_id: applicationId,
        report_template_version_id: templateVersion.id,
        status: "running",
        current_step: 0,
        total_steps: RESEARCH_STEPS.length, // 13 steps (0-12)
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (runError || !reportRun) {
      console.error("Error creating report run:", runError);
      return new Response(
        JSON.stringify({ error: "Failed to start report generation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create step records (0-12)
    const stepRecords = RESEARCH_STEPS.map((step, index) => ({
      report_run_id: reportRun.id,
      step_number: index, // 0-12
      step_name: step.name,
      status: "pending" as const,
    }));

    await supabaseAdmin.from("report_run_steps").insert(stepRecords);

    // Consume entitlement
    await supabaseAdmin
      .from("entitlements")
      .update({ used_quantity: availableEntitlement.used_quantity + 1 })
      .eq("id", availableEntitlement.id);

    // Create entitlement consumption record - linked to report run for refund tracking
    await supabaseAdmin.from("entitlement_consumptions").insert({
      entitlement_id: availableEntitlement.id,
      report_id: null, // Will be updated when report is created
      report_run_id: reportRun.id, // Track which run consumed this credit
    });

    // Start async processing - 13-PHASE ARCHITECTURE: Phase 0 runs ONLY Step 0, then checkpoints
    processStep0Only(
      reportRun.id,
      applicationId,
      application.grant_version_id,
      inputs
    ).catch((e) => console.error("Background processing error:", e));

    return new Response(
      JSON.stringify({ 
        success: true, 
        reportRunId: reportRun.id,
        message: "Report generation started" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-report:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * 13-PHASE ARCHITECTURE: Phase 0
 * Runs ONLY Step 0 (build source pack), then checkpoints.
 * The frontend will detect the checkpoint and invoke resume-report-run for Step 1.
 */
async function processStep0Only(
  reportRunId: string,
  applicationId: string,
  grantVersionId: string,
  inputs: Record<string, unknown>
) {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

  // Create admin client for writes
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Fetch active prompt bundle
  const bundle = await fetchActiveBundle(supabase);
  const systemPrompt = bundle?.system_prompt || DEFAULT_SYSTEM_PROMPT;

  const publicArticleUrl = inputs.publicArticleUrl as string;
  const summary = inputs.summary as string;
  const trl = (inputs.trl as string) || "";
  const ipStatus = (inputs.ipStatus as string) || "";

  // Fetch grant context for prompt interpolation
  const grantContext = await fetchGrantContext(supabase, grantVersionId);

  const reportContent: Record<string, unknown> = {};
  const citations: Array<{ url: string; title: string; accessed: string }> = [];

  try {
    // First, scrape the article to get content for Step 0
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
          60000 // 60s timeout for Firecrawl
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
        // Continue without scraped content
      }
    }

    // Step 0: Build Source Pack
    await executeStep(supabase, reportRunId, 0, async () => {
      // Get step 0 prompt from bundle
      const stepConfig = bundle?.steps.get(0);
      
      // Build interpolation variables including grant context
      const interpolationVars = {
        summary,
        publicArticleUrl,
        articleContent: articleContent.slice(0, 8000),
        trl,
        ipStatus,
        grantName: grantContext.name,
        grantVersionLabel: grantContext.versionLabel,
        grantGuidelines: grantContext.guidelinesExcerpt,
        grantRubric: grantContext.formattedRubric,
        grantSummary: grantContext.summary,
      };
      
      let sourcePackPrompt: string;
      if (stepConfig?.prompt_template) {
        sourcePackPrompt = interpolatePrompt(stepConfig.prompt_template, interpolationVars);
      } else {
        // Fallback prompt for source pack
        sourcePackPrompt = `You are a grant research analyst preparing Australia-first validated sources.

Research Summary: ${summary}
Article URL: ${publicArticleUrl}
${articleContent ? `Article Content:\n${articleContent.slice(0, 8000)}` : ""}
${trl ? `Technology Readiness Level: ${trl}` : ""}
${ipStatus ? `IP Status: ${ipStatus}` : ""}

Grant Context: ${grantContext.name} (${grantContext.versionLabel})

Your task is to curate 12-25 authoritative sources for downstream research steps.

Priority Order:
1. Australian Government (.gov.au, ABS, CSIRO, NHMRC)
2. Australian Industry Bodies (CSIRO, universities, peak bodies)
3. Global Authoritative (OECD, World Bank, WHO, peer-reviewed journals)
4. Reputable Industry Sources (established market research firms)

For each source, provide:
- source_id: S0-1, S0-2, etc.
- url: Full URL
- title: Source title
- publisher: Organization name
- accessed: Today's date
- type: government | academic | industry | market_research
- relevance: Brief note on why this is relevant
- data_type: market_size | competitor | policy | technical | economic

Also identify unknowns - data categories that could not be sourced:
- category: What data is missing
- search_attempted: What you searched for
- suggested_source: Where this data might be found

Return JSON:
{
  "sources": [...],
  "unknowns": [...]
}`;
      }

      const sourcePackResult = await callAIWithRetry(sourcePackPrompt, 0, systemPrompt, stepConfig?.model_override);
      
      // Try to parse as JSON, otherwise wrap in structure
      let parsedSourcePack;
      try {
        parsedSourcePack = JSON.parse(sourcePackResult);
      } catch {
        parsedSourcePack = { 
          sources: [], 
          unknowns: [],
          raw: sourcePackResult 
        };
      }
      
      reportContent.sourcePack = parsedSourcePack;
      return { sourcePack: parsedSourcePack };
    });

    // CHECKPOINT: Save progress after Step 0
    // Frontend will detect status="pending" and invoke resume-report-run for Step 1
    await supabase
      .from("report_runs")
      .update({
        checkpoint_data_json: reportContent,
        checkpoint_citations_json: citations,
        current_step: 0,
        status: "pending",
      })
      .eq("id", reportRunId);

    console.log(`Phase 0 complete: Checkpoint saved at step 0 for report run ${reportRunId}`);
    
    // Return - the resume-report-run function will continue from step 1
    return;

  } catch (error) {
    console.error("Report generation error (phase 0 - step 0):", error);
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
    throw error; // Re-throw to trigger overall failure
  }
}

// Gemini-only AI call with aggressive retry delays for rate limits
async function callAIWithRetry(
  prompt: string, 
  stepNumber: number, 
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  modelOverride?: string | null
): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    throw new Error("AI service not configured. Please contact support.");
  }

  // Use model override if provided, otherwise use default for step
  const model = modelOverride || getModelForStep(stepNumber);
  console.log(`Step ${stepNumber}: Using model ${model}`);

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
        45000 // 45s timeout for AI calls
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
      
      // If it's a timeout and we have retries left, continue
      if (msg.includes("timed out") && attempt < RETRY_DELAYS.length) {
        console.log(`Request timed out on attempt ${attempt + 1}, will retry`);
        continue;
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

  // Update current step on the run
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

  // Store error message in the current step if there is one
  if (errorMessage) {
    // Get current step to update with error
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
