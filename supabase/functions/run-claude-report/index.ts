import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_CLAUDE_PROMPT = `GPT INSTRUCTIONS

ROLE
You are a lead researcher for a science-based project within a university
You are based in Australia 
You have 10 years of research experience, and many peer reviewed journal articles published
You are preparing a grant application designed to support commercialisation of your research. 

PART ONE 

INSTRUCTION - PART ONE
Based on a technical description of the research from the prompt, you want to develop a business case as part of a grant application that meets the requirements in the {{grantName}} Applicants Guide. You should focus attention on the market opportunity section of the case. 

{{#grantGuidelines}}
GRANT GUIDELINES:
{{grantGuidelines}}
{{/grantGuidelines}}

{{#grantRubricFormatted}}
ASSESSMENT RUBRIC:
{{grantRubricFormatted}}
{{/grantRubricFormatted}}

RESEARCHER'S SUMMARY:
{{summary}}

{{#articleContent}}
PUBLIC ARTICLE URL:
{{articleContent}}
{{/articleContent}}

{{#trl}}
TECHNOLOGY READINESS LEVEL: {{trl}}
{{/trl}}

{{#ipStatus}}
IP STATUS: {{ipStatus}}
{{/ipStatus}}

For each step in the Part One instruction process, you should use validated external sources (scholarly and industry sources) to support any assertions or claims made per step. These validated external sources should be identified and, where citing any external URL, the full URL should be listed under the step. 

This task should be performed in the following step order:
Check Google Scholar and other scholarly sources to establish if there are competitive or similar research projects produced by other researchers
Describe how the research may be translated into a product or service for at least three different market segments. Segments must include at least one market in Australia. 
Check Google to find companies that may have a product or service based on similar research already in market, and if so, try to determine their market size and revenue generation
Using https://datasetsearch.research.google.com/, https://ourworldindata.org/, https://explodingtopics.com/, https://www.pewresearch.org/tools-and-datasets/, https://www.euromonitor.com/, https://www.marketresearch.com/ and other relevant validated external sources determine the Total Addressable Market for the products in all market segments identified
Based on the TAMs identified in Step 4, identify the likely Serviceable Addressable Market for the products in all market segments identified
Based on the Serviceable Addressable Markets from Step 5, present a realistic Serviceable Obtainable Market for the products in all market segments identified. 
Based on the Serviceable Obtainable Market from Step 6, calculate the likely economic impact to the Australian economy for the commercialisation of the research.
Build a table that compares the products from Step 2 with all existing competitors in all Serviceables Obtainable Markets by feature set, user experience and price.
Based on the ANZSIC Industry Codes at https://www.dcceew.gov.au/sites/default/files/documents/anzsic-code-hierarchy.pdf, generate a list of relevant industry classifications where there may be businesses that could act as partners for the products in all market segments
Based on identified industry classifications, find Australian businesses that are operating within the identified industry classification in Step 9.
Based on the information collected, create a report in HTML code with all references cited in APA style and a reference list at the back of the document. Do not include direct interactions with me. Ensure that all citations are hyperlinked to relevant URLs. For text in tables the font size should be two sizes lower than the rest of the text. All tables should have a 1 pixel black border. 

All steps should be completed before you generate output. Where you are unable to complete any step or have missing information, this should be identified. Do not make up information; use validated sources to support all outputs. 

CONTEXT 
The audience for the output of Part One should be the assessors of the grant. 

CONSTRAINTS 
You should choose market segments, products and business partnerships that maximise the return on investment for the Australian Government. 
Always provide details of the TAM, SAM and SOM in the text. 
You should produce a reference list, titled "References", which includes all cited references at the end of the report, delivered in APA format. Always check all references are correct and not malformed. 
Do not embold any text except for headings, table column labels and dot point labels or lead-ins. 
Never use Horizontal rules between sections; add an additional paragraph mark instead.

OUTPUT FORMAT 
The output should include tables and graphs where relevant. 

INSTRUCTIONS - PART TWO
Turn this output into a report in HTML code with all references cited in APA style and a reference list at the back of the document. Remove all the references to "your instructions" and direct interactions with me. Ensure that all citations are hyperlinked to relevant URLs and produce a Table of Contents at the beginning of the report. For text in tables the font size should be two sizes lower than the rest of the text. All tables should have a 1 pixel black border. 

Then consider how best to improve the report and its findings, and what needs to be considered before preparing the rest of the grant application. 

CONTEXT - PART TWO
The audience for Part Two instructions is the researcher who is applying for the grant. 

CONSTRAINTS AND OUTPUT FORMAT - PART TWO
Ensure there is an html version of the report available. Present all other recommendations normally.

CRITICAL OUTPUT INSTRUCTION:
Your ENTIRE response must be a single valid HTML document. Start with <!DOCTYPE html> and end with </html>. Do not include any text outside the HTML tags. Do not use markdown. The HTML should be self-contained with inline CSS styles.`;

function interpolatePrompt(template: string, variables: Record<string, string>): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  }
  
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const { report_run_id, chunk_index } = await req.json();
    if (!report_run_id) {
      return new Response(
        JSON.stringify({ error: "report_run_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!anthropicApiKey) {
      await markRunFailed(supabase, report_run_id, "ANTHROPIC_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[run-claude-report] Starting for run ${report_run_id}`);

    // Fetch run + application + grant version context
    const { data: run, error: runError } = await supabase
      .from("report_runs")
      .select(`
        id, application_id, report_template_version_id, status, webhook_url, email_on_complete,
        application:applications!inner(
          id, user_id, inputs_json, grant_version_id,
          grant_version:grant_versions!inner(
            id, claude_prompt_template, guidelines_raw_text, rubric_json, 
            ai_suggestions_json, required_inputs_json,
            grant:grants!inner(name)
          )
        )
      `)
      .eq("id", report_run_id)
      .single();

    if (runError || !run) {
      console.error("Run not found:", runError);
      return new Response(
        JSON.stringify({ error: "Report run not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (run.status === "completed" || run.status === "failed") {
      return new Response(
        JSON.stringify({ error: `Run already ${run.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const app = run.application as any;
    const grantVersion = Array.isArray(app.grant_version) ? app.grant_version[0] : app.grant_version;
    const grantData = Array.isArray(grantVersion.grant) ? grantVersion.grant[0] : grantVersion.grant;
    const inputs = (app.inputs_json || {}) as Record<string, string>;

    // Update run to running
    await supabase
      .from("report_runs")
      .update({ status: "running", started_at: new Date().toISOString(), current_step: 1, total_steps: 1 })
      .eq("id", report_run_id);

    // Create single step record
    await supabase.from("report_run_steps").insert({
      report_run_id,
      step_number: 0,
      step_name: "claude_single_prompt",
      status: "running",
      started_at: new Date().toISOString(),
    });

    // Log start
    await logMessage(supabase, report_run_id, "info", "Starting Claude single-prompt report generation");

    // Build prompt from template
    const promptTemplate = grantVersion.claude_prompt_template || DEFAULT_CLAUDE_PROMPT;
    
    // Format rubric
    let formattedRubric = "";
    const rubricData = grantVersion.rubric_json as any;
    const suggestions = grantVersion.ai_suggestions_json as any;
    const rubricSections = rubricData?.sections || suggestions?.rubric?.sections;
    if (rubricSections && Array.isArray(rubricSections)) {
      formattedRubric = "Assessment Criteria:\n\n";
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

    const variables: Record<string, string> = {
      summary: inputs.summary || "",
      articleContent: inputs.publicArticleUrl || "",
      trl: inputs.trl || "",
      ipStatus: inputs.ipStatus || inputs.ip_status || "",
      grantGuidelines: grantVersion.guidelines_raw_text || "",
      grantRubricFormatted: formattedRubric,
      grantName: grantData?.name || "",
    };

    const assembledPrompt = interpolatePrompt(promptTemplate, variables);
    
    await logMessage(supabase, report_run_id, "info", `Preparing prompt and context (${assembledPrompt.length} chars)...`);
    await logMessage(supabase, report_run_id, "info", "Calling Claude API...");

    // Pin the report model unless an explicit override is configured. Do not
    // automatically select the newest Sonnet: Sonnet 5 enables adaptive
    // thinking by default and can consume the output budget before emitting
    // any report HTML, resulting in stop_reason=max_tokens with empty text.
    let claudeModel = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-5";
    console.log(`Using Claude model: ${claudeModel}`);

    // Stream the Anthropic response. Long single-prompt generations regularly
    // exceed a plain 120s request, so we stream and guard on idle time instead.
    const MAX_TOTAL_MS = 600_000; // hard ceiling for the whole generation
    const MAX_IDLE_MS = 120_000; // no bytes received for this long => abort
    const controller = new AbortController();
    const startedAt = Date.now();
    let lastChunkAt = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastChunkAt > MAX_IDLE_MS || Date.now() - startedAt > MAX_TOTAL_MS) {
        controller.abort();
      }
    }, 5_000);

    const failStreaming = async (reason: string, status: number) => {
      console.error(reason);
      await markRunFailed(supabase, report_run_id, reason);
      await logMessage(supabase, report_run_id, "error", reason);
      return new Response(
        JSON.stringify({ error: reason }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    };

    type StreamResult = {
      text: string;
      stopReason: string | null;
      streamErrorType: string | null;
      streamErrorMessage: string | null;
      httpStatus: number | null;
      httpBody: string | null;
      aborted: boolean;
      transportError: string | null;
    };

    const runStreamedAttempt = async (): Promise<StreamResult> => {
      const result: StreamResult = {
        text: "",
        stopReason: null,
        streamErrorType: null,
        streamErrorMessage: null,
        httpStatus: null,
        httpBody: null,
        aborted: false,
        transportError: null,
      };

      let claudeResponse: Response;
      try {
        claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicApiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: claudeModel,
            max_tokens: 16000,
            stream: true,
            messages: [{ role: "user", content: assembledPrompt }],
          }),
          signal: controller.signal,
        });
      } catch (fetchError) {
        result.aborted = fetchError instanceof DOMException && fetchError.name === "AbortError";
        result.transportError = fetchError instanceof Error ? fetchError.message : String(fetchError);
        return result;
      }

      if (!claudeResponse.ok) {
        result.httpStatus = claudeResponse.status;
        result.httpBody = (await claudeResponse.text()).substring(0, 800);
        return result;
      }

      try {
        const reader = claudeResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;
          if (!value) continue;
          lastChunkAt = Date.now();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            // Only the parse is tolerant — event handling must not be swallowed.
            let evt: any;
            try {
              evt = JSON.parse(payload);
            } catch (_e) {
              continue; // partial / unparseable SSE payload
            }

            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              result.text += evt.delta.text ?? "";
            } else if (evt.type === "message_delta" && evt.delta?.stop_reason) {
              result.stopReason = evt.delta.stop_reason;
            } else if (evt.type === "message_start" && evt.message?.model) {
              console.log(
                `Claude stream started (model: ${evt.message.model}, input tokens: ${evt.message?.usage?.input_tokens ?? "?"})`
              );
            } else if (evt.type === "error") {
              result.streamErrorType = evt.error?.type ?? "stream_error";
              result.streamErrorMessage = evt.error?.message ?? "Claude stream error";
              done = true;
              break;
            }
          }
        }
      } catch (streamError) {
        result.aborted = streamError instanceof DOMException && streamError.name === "AbortError";
        result.transportError = streamError instanceof Error ? streamError.message : String(streamError);
      }

      return result;
    };

    const RETRYABLE = ["overloaded_error", "rate_limit_error", "api_error"];
    let attempt = await runStreamedAttempt();

    if (
      !attempt.text &&
      !attempt.aborted &&
      attempt.streamErrorType &&
      RETRYABLE.includes(attempt.streamErrorType)
    ) {
      await logMessage(
        supabase,
        report_run_id,
        "warn",
        `Claude stream returned ${attempt.streamErrorType}; retrying once in 5s...`
      );
      await new Promise((r) => setTimeout(r, 5000));
      lastChunkAt = Date.now();
      attempt = await runStreamedAttempt();
    }

    clearInterval(watchdog);

    if (attempt.httpStatus) {
      console.error(`Claude API error: ${attempt.httpStatus} - ${attempt.httpBody}`);
      await markRunFailed(supabase, report_run_id, `Claude API error: ${attempt.httpStatus}`);
      await logMessage(
        supabase,
        report_run_id,
        "error",
        `Claude API error: ${attempt.httpStatus} - ${attempt.httpBody ?? ""}`
      );
      return new Response(
        JSON.stringify({ error: "Claude API call failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!attempt.text) {
      let reason: string;
      let status = 502;
      if (attempt.aborted) {
        reason = `Claude stream stalled (no output for ${Math.round(MAX_IDLE_MS / 1000)}s)`;
        status = 504;
      } else if (attempt.streamErrorMessage) {
        reason = `Claude stream error (${attempt.streamErrorType}): ${attempt.streamErrorMessage}`;
      } else if (attempt.transportError) {
        reason = `Claude stream failed: ${attempt.transportError}`;
        status = 504;
      } else if (attempt.stopReason) {
        reason = `Claude produced no content (stop_reason: ${attempt.stopReason})`;
      } else {
        reason = "Claude stream closed with no content";
      }
      return await failStreaming(reason, status);
    }

    const reportHtml = attempt.text;

    if (attempt.transportError || attempt.streamErrorMessage) {
      await logMessage(
        supabase,
        report_run_id,
        "warn",
        `Claude stream ended early but partial content was captured: ${attempt.streamErrorMessage ?? attempt.transportError}`
      );
    }

    await logMessage(
      supabase,
      report_run_id,
      "info",
      `Claude stream finished (${reportHtml.length} chars, stop_reason: ${attempt.stopReason ?? "unknown"})`
    );



    await logMessage(supabase, report_run_id, "info", `Claude response received (${reportHtml.length} chars). Processing result...`);

    // Mark step 0 completed
    await supabase
      .from("report_run_steps")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        outputs_json: { report_html: reportHtml },
      })
      .eq("report_run_id", report_run_id)
      .eq("step_number", 0);

    // Save report IMMEDIATELY (before validation)
    const { data: newReport, error: reportError } = await supabase.from("reports").insert({
      application_id: app.id,
      user_id: app.user_id,
      report_run_id,
      grant_version_id: grantVersion.id,
      report_template_version_id: run.report_template_version_id,
      inputs_snapshot_json: inputs,
      content_json: {
        report_html: reportHtml,
        validation_summary: null,
        validated_at: null,
      },
      citations_json: [],
    }).select("id").single();

    if (reportError) {
      console.error("Error saving report:", reportError);
      await markRunFailed(supabase, report_run_id, `Failed to save report: ${reportError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to save report" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await logMessage(supabase, report_run_id, "info", "Report saved. Finalizing...");

    // Mark run completed
    await supabase
      .from("report_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        current_step: 1,
      })
      .eq("id", report_run_id);

    // Update application status
    await supabase
      .from("applications")
      .update({ status: "ready" })
      .eq("id", app.id);

    await logMessage(supabase, report_run_id, "info", "Report generation complete");

    // Fire-and-forget: trigger async reference validation
    if (newReport?.id) {
      fetch(`${supabaseUrl}/functions/v1/validate-references`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          report_html: reportHtml,
          report_run_id,
          report_id: newReport.id,
        }),
      }).catch((err) => {
        console.error("Failed to trigger async reference validation:", err);
      });

      await logMessage(supabase, report_run_id, "info", "Reference validation triggered in background");
    }

    // Send completion email if requested
    if (run.email_on_complete) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-report-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            reportRunId: report_run_id,
            reportId: newReport?.id,
            applicationId: app.id,
            userId: app.user_id,
          }),
        });
      } catch (emailError) {
        console.error("Failed to send completion email:", emailError);
      }
    }

    // Fire webhook if configured
    if (run.webhook_url) {
      try {
        await fetch(run.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "report.completed",
            run_id: report_run_id,
            report_html: reportHtml,
            citations: [],
          }),
        });
      } catch (webhookError) {
        console.error("Webhook delivery failed:", webhookError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, run_id: report_run_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("run-claude-report error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function markRunFailed(supabase: any, runId: string, reason: string) {
  await supabase
    .from("report_runs")
    .update({
      status: "failed",
      halt_reason: reason,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  await supabase
    .from("report_run_steps")
    .update({
      status: "failed",
      error_message: reason,
      completed_at: new Date().toISOString(),
    })
    .eq("report_run_id", runId)
    .eq("step_number", 0);

  const { data: run } = await supabase
    .from("report_runs")
    .select("application_id, webhook_url")
    .eq("id", runId)
    .single();

  if (run?.application_id) {
    await supabase
      .from("applications")
      .update({ status: "failed" })
      .eq("id", run.application_id);
  }

  if (run?.webhook_url) {
    try {
      await fetch(run.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "report.failed",
          run_id: runId,
          status: "failed",
          halt_reason: reason,
        }),
      });
    } catch { /* ignore */ }
  }
}

// deno-lint-ignore no-explicit-any
async function logMessage(supabase: any, runId: string, level: string, message: string) {
  try {
    await supabase.from("report_logs").insert({
      report_run_id: runId,
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch { /* ignore logging errors */ }
}
