import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PipelineStep {
  step_number: number;
  step_name: string;
  step_description: string;
  prompt_template: string;
  step_type?: string;
  step_config_json?: Record<string, unknown> | null;
}

interface AIIssue {
  step_number: number;
  step_name: string;
  category: "data_flow" | "redundancy" | "sequencing" | "completeness" | "contract_mismatch";
  severity: "error" | "warning" | "info";
  message: string;
}

interface AIAnalysisResult {
  verdict: "pass" | "issues_found" | "fail";
  overall_notes: string;
  issues: AIIssue[];
  strengths: string[];
}

function extractVariables(...templates: (string | undefined)[]): string[] {
  const vars = new Set<string>();
  for (const t of templates) {
    if (!t) continue;
    const matches = t.match(/\{\{(\w+)\}\}/g) || [];
    for (const m of matches) {
      vars.add(m.replace(/\{\{|\}\}/g, ""));
    }
  }
  return [...vars];
}

function buildStepForAnalysis(s: PipelineStep) {
  const stepType = s.step_type || "ai_prompt";
  const config = (s.step_config_json || {}) as Record<string, unknown>;

  const base: Record<string, unknown> = {
    step_number: s.step_number,
    step_name: s.step_name,
    step_type: stepType,
    step_description: s.step_description,
  };

  if (stepType === "firecrawl_search") {
    const queryTemplate = (config.query_template as string) || "";
    base.query_template = queryTemplate;
    base.search_limit = config.limit ?? 8;
    base.scrape_results = config.scrape_results ?? false;
    base.prompt_excerpt = s.prompt_template ? s.prompt_template.slice(0, 500) : "(none — search step)";
    base.variables_used = extractVariables(queryTemplate, s.prompt_template);
  } else if (stepType === "firecrawl_scrape") {
    base.url_variable = config.url_variable || "publicArticleUrl";
    base.formats = config.formats || ["markdown"];
    base.prompt_excerpt = s.prompt_template ? s.prompt_template.slice(0, 500) : "(none — scrape step)";
    base.variables_used = extractVariables(s.prompt_template);
  } else {
    base.prompt_excerpt = s.prompt_template.slice(0, 3000);
    base.prompt_length = s.prompt_template.length;
    base.variables_used = extractVariables(s.prompt_template);
  }

  return base;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — require admin/super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { steps } = await req.json() as { steps: PipelineStep[] };
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return new Response(JSON.stringify({ error: "steps array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stepsForAnalysis = steps
      .sort((a, b) => a.step_number - b.step_number)
      .map(buildStepForAnalysis);

    const systemPrompt = `You are a pipeline validation expert for research grant report generation pipelines. You analyse sequences of AI prompt steps that together produce a structured research commercialisation report.

IMPORTANT: Steps have different execution types indicated by "step_type":
- **ai_prompt**: Standard AI processing step. Evaluate its "prompt_excerpt".
- **firecrawl_search**: A web search step. Its primary content is the "query_template" field (NOT "prompt_excerpt"). Evaluate the query template for variable references and search quality.
- **firecrawl_scrape**: A URL scrape step that fetches content from a user-provided URL. It uses a "url_variable" to determine which URL to scrape.

For firecrawl_search steps, the "query_template" is where you should look for references to upstream data (e.g., {{step_name}} or {{stepN}} variables). The "prompt_excerpt" may be empty or generic for these steps — that is expected and NOT an issue.

CRITICAL CONSTRAINT: Do NOT suggest alternative architectures or data flow patterns. If a step correctly references an upstream variable that exists and is produced by a preceding step, that reference is valid regardless of whether you would design it differently. The admin has made deliberate architectural choices — your job is to verify correctness, not suggest improvements.

Your job is to identify issues across 5 categories. Each category has strict boundaries:

1. **data_flow**: ONLY flag when a {{variable}} reference points to a step that does not exist or has not run yet (forward reference). Do NOT flag choices about which upstream data to use — if the referenced step exists and precedes the current step, the reference is valid. Raw vs processed data is an architectural choice, not a bug.

2. **redundancy**: ONLY flag when two steps produce substantially identical outputs from the same inputs. Do NOT flag steps that work on similar topics but with different scopes, inputs, or output structures.

3. **sequencing**: ONLY flag when a step cannot logically execute in its current position because it needs data that has not been produced yet by any preceding step. Do NOT suggest reordering for stylistic or efficiency reasons.

4. **completeness**: ONLY flag when a section that is explicitly required by the pipeline's own step descriptions is never produced by any step. Do NOT suggest adding sections, topics, or analyses that the admin has not included — the admin decides what the pipeline covers.

5. **contract_mismatch**: ONLY flag when a downstream step references a specific field or structure that the upstream step's prompt explicitly does not produce. If the upstream step's output is ambiguous or flexible, do not flag it.

Each step uses {{stepN}} variables to reference outputs of step N, or {{step_name}} variables to reference outputs by name. Steps also use base variables like {{summary}}, {{grantName}}, {{requiredInputs}}, {{sources}}, {{unknowns}}, {{articleContent}}, etc.

Return your analysis as a JSON object with this exact schema:
{
  "verdict": "pass" | "issues_found" | "fail",
  "overall_notes": "1-2 sentence summary",
  "issues": [
    {
      "step_number": <number>,
      "step_name": "<string>",
      "category": "data_flow" | "redundancy" | "sequencing" | "completeness" | "contract_mismatch",
      "severity": "error" | "warning" | "info",
      "message": "<clear explanation>"
    }
  ],
  "strengths": ["<what the pipeline does well>"]
}

Rules:
- Use "fail" verdict only if there are errors that would cause the pipeline to produce broken output
- Use "issues_found" ONLY if there are genuine warnings or errors — not for info-level observations alone
- Use "pass" if the pipeline is well-structured with no significant issues. A pipeline with only minor info-level observations should still receive "pass"
- Severity "info" should ONLY be used for factual observations (e.g., "step 5 does not reference any upstream data"). NEVER use "info" for subjective suggestions or style preferences. If you cannot point to a specific broken reference or missing data dependency, do not create an issue
- Be specific: reference step numbers and names in messages
- Don't flag things that are working correctly — focus on genuine issues
- Keep messages concise but actionable
- Do NOT flag firecrawl_search steps for having empty/generic prompt_excerpt — their query_template is the relevant content
- Do NOT suggest that a step should use different upstream data than what the admin chose
- Do NOT recommend merging, splitting, or reordering steps unless there is an objective execution blocker`;

    const userMessage = `Analyse this ${stepsForAnalysis.length}-step research pipeline:\n\n${JSON.stringify(stepsForAnalysis, null, 2)}`;

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: AIAnalysisResult;
    try {
      const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Failed to parse AI analysis", raw: content }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!result.verdict || !Array.isArray(result.issues) || !Array.isArray(result.strengths)) {
      return new Response(JSON.stringify({ error: "Invalid AI response shape", raw: result }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("validate-pipeline error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
