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

    // Build a compact representation for the AI (truncate very long prompts)
    const stepsForAnalysis = steps
      .sort((a, b) => a.step_number - b.step_number)
      .map((s) => ({
        step_number: s.step_number,
        step_name: s.step_name,
        step_description: s.step_description,
        prompt_excerpt: s.prompt_template.slice(0, 3000),
        prompt_length: s.prompt_template.length,
        variables_used: [...new Set((s.prompt_template.match(/\{\{(\w+)\}\}/g) || []).map((m: string) => m.replace(/\{\{|\}\}/g, "")))],
      }));

    const systemPrompt = `You are a pipeline validation expert for research grant report generation pipelines. You analyse sequences of AI prompt steps that together produce a structured research commercialisation report.

Your job is to identify issues across 5 categories:
1. **data_flow**: Does a step reference data (via {{stepN}} variables or conceptual expectations) that no preceding step produces? Are there gaps where information is expected but never generated?
2. **redundancy**: Are any two steps doing substantially the same work? Would merging them improve the pipeline?
3. **sequencing**: Are steps in a sensible order? (e.g., market sizing before source gathering makes no sense; citation cleanup should come after all content steps)
4. **completeness**: For a research commercialisation grant pipeline, is anything obviously missing? (e.g., no market sizing, no competitor analysis, no risk assessment)
5. **contract_mismatch**: Does each step's expected output (based on its prompt instructions) align with what downstream steps reference via {{stepN}}?

Each step uses {{stepN}} variables to reference outputs of step N. {{step0}} means the output of step 0, etc. Steps also use base variables like {{summary}}, {{grantName}}, {{requiredInputs}}, {{sources}}, {{unknowns}}, etc.

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
- Use "issues_found" if there are warnings or info-level suggestions
- Use "pass" if the pipeline is well-structured with no significant issues
- Be specific: reference step numbers and names in messages
- Don't flag things that are working correctly — focus on genuine issues
- Keep messages concise but actionable`;

    const userMessage = `Analyse this ${stepsForAnalysis.length}-step research pipeline:\n\n${JSON.stringify(stepsForAnalysis, null, 2)}`;

    // Call Gemini via Lovable AI gateway
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.lovable.dev/api/v1/chat/completions", {
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

    // Parse the JSON response
    let result: AIAnalysisResult;
    try {
      // Strip markdown code fences if present
      const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Failed to parse AI analysis", raw: content }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate shape
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
