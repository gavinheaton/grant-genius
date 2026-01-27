import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const RESEARCH_STEPS = [
  { name: "extract_context", description: "Extracting research context from article" },
  { name: "competitor_research", description: "Searching for competing research" },
  { name: "market_segments", description: "Identifying market segments" },
  { name: "find_competitors", description: "Finding existing competitors" },
  { name: "calculate_tam", description: "Calculating Total Addressable Market" },
  { name: "calculate_sam", description: "Calculating Serviceable Addressable Market" },
  { name: "calculate_som", description: "Calculating Serviceable Obtainable Market" },
  { name: "economic_impact", description: "Analyzing Australian economic impact" },
  { name: "competitor_table", description: "Building competitor comparison" },
  { name: "partner_businesses", description: "Finding Australian partner businesses" },
];

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
    return new Response(null, { headers: corsHeaders });
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

    // Create report run
    const { data: reportRun, error: runError } = await supabaseAdmin
      .from("report_runs")
      .insert({
        application_id: applicationId,
        report_template_version_id: templateVersion.id,
        status: "running",
        current_step: 0,
        total_steps: RESEARCH_STEPS.length,
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

    // Create step records
    const stepRecords = RESEARCH_STEPS.map((step, index) => ({
      report_run_id: reportRun.id,
      step_number: index + 1,
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

    // Start async processing - this runs after response is sent
    processReportGeneration(
      reportRun.id,
      applicationId,
      application.grant_version_id,
      templateVersion.id,
      userId,
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

// Circuit-breaker flag - scoped to function execution
let useGeminiFallback = false;

async function processReportGeneration(
  reportRunId: string,
  applicationId: string,
  grantVersionId: string,
  templateVersionId: string,
  userId: string,
  inputs: Record<string, unknown>
) {
  // Reset circuit breaker for each report generation
  useGeminiFallback = false;
  
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

  // Create admin client for writes
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const publicArticleUrl = inputs.publicArticleUrl as string;
  const summary = inputs.summary as string;
  const trl = (inputs.trl as string) || "";
  const ipStatus = (inputs.ipStatus as string) || "";

  const reportContent: Record<string, unknown> = {};
  const citations: Array<{ url: string; title: string; accessed: string }> = [];

  try {
    // Step 1: Extract context from article
    await executeStep(supabase, reportRunId, 1, async () => {
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

      const contextPrompt = `You are analyzing research for commercialization potential.

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

Provide a structured analysis.`;

      const contextResult = await callAIWithRetry(contextPrompt);
      reportContent.researchContext = contextResult;
      return { context: contextResult };
    });

    // Step 2: Competitor Research
    await executeStep(supabase, reportRunId, 2, async () => {
      const competitorPrompt = `Based on this research:
${summary}

Search for and identify competing or similar research projects from other researchers worldwide. Include:
1. Names of competing research groups/universities
2. Brief description of their work
3. Key differences from our research
4. Publication dates and status

Format as a structured list. If you cannot find specific examples, indicate this clearly with "No validated sources found" for that area.`;

      const competitorResult = await callAIWithRetry(competitorPrompt);
      reportContent.competitorResearch = competitorResult;
      return { competitors: competitorResult };
    });

    // Step 3: Market Segments
    await executeStep(supabase, reportRunId, 3, async () => {
      const marketPrompt = `Based on this research innovation:
${summary}

Identify at least 3 different market segments where this research could be commercialized as a product or service. At least one must be in Australia.

For each segment provide:
1. Segment name
2. Target customers
3. Product/service concept
4. Geographic focus (include at least one Australian market)
5. Estimated market size category (small/medium/large)

Be specific and practical.`;

      const marketResult = await callAIWithRetry(marketPrompt);
      reportContent.marketSegments = marketResult;
      return { segments: marketResult };
    });

    // Step 4: Find Competitors
    await executeStep(supabase, reportRunId, 4, async () => {
      const existingCompetitorsPrompt = `Based on the market segments identified for this research:
${summary}

Market Segments:
${reportContent.marketSegments}

Find companies that may already have products or services in these markets. For each competitor:
1. Company name
2. Product/service name
3. Estimated market share or revenue if available
4. Geographic presence
5. How they compare to the proposed research

Note: If specific market data cannot be validated, mark as "Data not available - requires further research".`;

      const existingCompetitorsResult = await callAIWithRetry(existingCompetitorsPrompt);
      reportContent.existingCompetitors = existingCompetitorsResult;
      return { competitors: existingCompetitorsResult };
    });

    // Step 5: Calculate TAM
    await executeStep(supabase, reportRunId, 5, async () => {
      const tamPrompt = `Calculate the Total Addressable Market (TAM) for the research commercialization:

Research: ${summary}
Market Segments: ${reportContent.marketSegments}

Using data from validated sources (OECD, World Bank, ABS, industry reports), estimate TAM for each market segment:
1. Market size in USD/AUD
2. Data source and year
3. Growth rate if available
4. Key assumptions

IMPORTANT: Only use numbers from validated sources. If you cannot find validated data, clearly state "Validated data not available - estimate based on [methodology]".`;

      const tamResult = await callAIWithRetry(tamPrompt);
      reportContent.tam = tamResult;
      return { tam: tamResult };
    });

    // CHECKPOINT: Save progress after step 5 and return
    // This splits processing into two phases to avoid edge function timeouts
    await supabase
      .from("report_runs")
      .update({
        checkpoint_data_json: reportContent,
        checkpoint_citations_json: citations,
        current_step: 5,
        status: "pending", // Use pending to signal checkpoint - frontend will detect and resume
      })
      .eq("id", reportRunId);

    console.log(`Checkpoint saved for report run ${reportRunId} at step 5`);
    
    // Return early - the resume-report-run function will continue from here
    return;

  } catch (error) {
    console.error("Report generation error (phase 1):", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateRunStatus(supabase, reportRunId, "failed", errorMessage);
  }
}
// Phase 2 processing is now handled by resume-report-run edge function

// Execute a step with proper error handling and recording
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`Step ${stepNumber} failed:`, errorMessage);
    await updateStep(supabase, reportRunId, stepNumber, "failed", undefined, errorMessage);
    throw error; // Re-throw to trigger overall failure
  }
}

// Retry wrapper with exponential backoff + Gemini fallback + circuit breaker
async function callAIWithRetry(prompt: string, maxRetries: number = 3): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  
  // Circuit breaker tripped OR no OpenAI key - use Gemini directly
  if (useGeminiFallback || !OPENAI_API_KEY) {
    if (useGeminiFallback) {
      console.log("Circuit breaker active - using Gemini directly");
    } else {
      console.log("No OpenAI key configured, using Lovable AI (Gemini)");
    }
    return await callLovableAI(prompt);
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await callOpenAI(OPENAI_API_KEY, prompt);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if rate limited (429) or timeout
      if (errorMessage.includes("429") || errorMessage.includes("timed out")) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`OpenAI error (${errorMessage}), waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      // Non-rate-limit error - throw immediately
      throw error;
    }
  }
  
  // All retries exhausted - trip the circuit breaker for remaining calls in this run
  console.log("OpenAI rate limited - circuit breaker tripped, using Gemini for remaining calls");
  useGeminiFallback = true;
  return await callLovableAI(prompt);
}

// Primary: OpenAI with timeout
async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a research commercialization expert helping prepare grant applications. Provide detailed, well-researched responses. Always cite sources where possible. If data cannot be validated, clearly indicate this."
          },
          { role: "user", content: prompt }
        ],
      }),
    },
    30000 // 30s timeout for AI calls
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", response.status, errorText);
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response generated";
}

// Fallback: Lovable AI (Gemini) with timeout
async function callLovableAI(prompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    throw new Error("AI service temporarily unavailable. Please try again later.");
  }

  console.log("Using Lovable AI (Gemini) fallback");
  
  const response = await fetchWithTimeout(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You are a research commercialization expert helping prepare grant applications. Provide detailed, well-researched responses. Always cite sources where possible. If data cannot be validated, clearly indicate this."
          },
          { role: "user", content: prompt }
        ],
      }),
    },
    30000 // 30s timeout for AI calls
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Lovable AI API error:", response.status, errorText);
    throw new Error(`Lovable AI request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response generated";
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
    
    if (run?.current_step) {
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
