import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Model selection based on step complexity
// Lighter model for simple steps, heavier for complex analysis
function getModelForStep(stepNumber: number): string {
  // Steps 6-7: Complex market analysis - use heavier model
  // Steps 8-10: Summary and formatting - use lighter model
  if (stepNumber <= 7) {
    return "google/gemini-3-flash-preview";
  }
  return "google/gemini-2.5-flash-lite";
}

// System prompt for AI calls
const SYSTEM_PROMPT = "You are a research commercialization expert helping prepare grant applications. Provide detailed, well-researched responses. Always cite sources where possible. If data cannot be validated, clearly indicate this.";

// Inter-step throttle delay (ms) to spread requests and avoid rate limits
const INTER_STEP_DELAY_MS = 3000;

// Retry delays for rate limit errors (5s, 15s, 30s)
const RETRY_DELAYS = [5000, 15000, 30000];

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

    // Check if at checkpoint (step 5 or step 8, pending status)
    const resumeFromStep = reportRun.current_step;
    if ((resumeFromStep !== 5 && resumeFromStep !== 8) || reportRun.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Report run is not at checkpoint" }),
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

    // Start async processing for the appropriate phase
    processReportPhase(
      reportRunId,
      reportRun.application_id,
      grantVersionId,
      reportRun.report_template_version_id,
      userId,
      inputs || {},
      reportRun.checkpoint_data_json || {},
      reportRun.checkpoint_citations_json || [],
      resumeFromStep // Pass which step we're resuming from
    ).catch((e) => console.error(`Phase processing error (from step ${resumeFromStep}):`, e));

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Report generation resumed from step ${resumeFromStep}` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in resume-report-run:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processReportPhase(
  reportRunId: string,
  applicationId: string,
  grantVersionId: string,
  templateVersionId: string,
  userId: string,
  inputs: Record<string, unknown>,
  checkpointData: Record<string, unknown>,
  checkpointCitations: Array<{ url: string; title: string; accessed: string }>,
  resumeFromStep: number
) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const summary = inputs.summary as string || "";
  const reportContent: Record<string, unknown> = { ...checkpointData };
  const citations = [...checkpointCitations];

  try {
    if (resumeFromStep === 5) {
      // Phase 2: Steps 6-8, then checkpoint
      
      // Step 6: Calculate SAM
      await executeStep(supabase, reportRunId, 6, async () => {
        const samPrompt = `Based on the TAM analysis:
${reportContent.tam}

Calculate the Serviceable Addressable Market (SAM) - the portion of TAM that can realistically be served:
1. Geographic limitations
2. Customer segment focus
3. Distribution capabilities
4. Regulatory constraints

Provide SAM for each market segment with clear methodology.`;

        const samResult = await callAIWithRetry(samPrompt, 6);
        reportContent.sam = samResult;
        return { sam: samResult };
      });

      // Step 7: Calculate SOM
      await executeStep(supabase, reportRunId, 7, async () => {
        const somPrompt = `Based on the SAM analysis:
${reportContent.sam}

Calculate a realistic Serviceable Obtainable Market (SOM) - what can actually be captured:
1. First year targets
2. 3-year projections
3. 5-year projections
4. Market penetration assumptions
5. Competitive dynamics

Be conservative and realistic in estimates.`;

        const somResult = await callAIWithRetry(somPrompt, 7);
        reportContent.som = somResult;
        return { som: somResult };
      });

      // Step 8: Australian Economic Impact
      await executeStep(supabase, reportRunId, 8, async () => {
        const impactPrompt = `Based on the SOM projections:
${reportContent.som}

Calculate the likely economic impact to the Australian economy from commercializing this research:
1. Direct revenue in Australia
2. Job creation potential
3. Export opportunities
4. IP licensing revenue
5. Tax contribution estimates
6. Industry development benefits
7. Knowledge economy contribution

Provide 5-year projections where possible.`;

        const impactResult = await callAIWithRetry(impactPrompt, 8);
        reportContent.economicImpact = impactResult;
        return { impact: impactResult };
      });

      // CHECKPOINT: Save progress after step 8 and return
      await supabase
        .from("report_runs")
        .update({
          checkpoint_data_json: reportContent,
          checkpoint_citations_json: citations,
          current_step: 8,
          status: "pending", // Signal checkpoint - frontend will detect and resume
        })
        .eq("id", reportRunId);

      console.log(`Checkpoint saved for report run ${reportRunId} at step 8`);
      return; // Frontend will trigger Phase 3
    }

    // Phase 3: Steps 9-10 (resumeFromStep === 8)
    
    // Step 9: Competitor Comparison Table
    await executeStep(supabase, reportRunId, 9, async () => {
      const tablePrompt = `Create a competitor comparison table based on:

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

Fill in with specific comparisons.`;

      const tableResult = await callAIWithRetry(tablePrompt, 9);
      reportContent.competitorTable = tableResult;
      return { table: tableResult };
    });

    // Step 10: Partner Businesses
    await executeStep(supabase, reportRunId, 10, async () => {
      const partnerPrompt = `Based on the ANZSIC Industry Codes, identify Australian businesses that could partner for commercialization:

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

Use the ANZSIC hierarchy for classification.`;

      const partnerResult = await callAIWithRetry(partnerPrompt, 10);
      reportContent.partnerBusinesses = partnerResult;
      return { partners: partnerResult };
    });

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
    await supabase.from("reports").insert({
      application_id: applicationId,
      user_id: userId,
      grant_version_id: grantVersionId,
      report_template_version_id: templateVersionId,
      report_run_id: reportRunId,
      version_number: nextVersion,
      content_json: reportContent,
      citations_json: citations,
      inputs_snapshot_json: inputs,
    });

    // Update run as completed
    await supabase
      .from("report_runs")
      .update({
        status: "completed",
        current_step: 10,
        completed_at: new Date().toISOString(),
      })
      .eq("id", reportRunId);

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "ready" })
      .eq("id", applicationId);

    console.log(`Report run ${reportRunId} completed successfully`);

  } catch (error) {
    console.error(`Report generation error (phase from step ${resumeFromStep}):`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await updateRunStatus(supabase, reportRunId, "failed", errorMessage);
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
async function callAIWithRetry(prompt: string, stepNumber: number): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    throw new Error("AI service not configured. Please contact support.");
  }

  const model = getModelForStep(stepNumber);
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
              { role: "system", content: SYSTEM_PROMPT },
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
