import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Quality scoring function (matching the frontend hook)
function calculateQualityScore(prompt: string): { total: number; level: 'good' | 'warning' | 'poor' } {
  if (!prompt || typeof prompt !== 'string') {
    return { total: 0, level: 'poor' };
  }

  const scores = {
    contextHeader: /STEP\s*\d|INPUTS?:/i.test(prompt) ? 15 : 0,
    hardRules: /HARD RULES|CRITICAL RULES|REQUIREMENTS|RULES:/i.test(prompt) ? 20 : 0,
    outputSchema: /OUTPUT.*JSON|JSON.*SCHEMA|OUTPUT.*SCHEMA|Return.*JSON/is.test(prompt) ? 20 : 0,
    urlValidation: /URL.*valid|valid.*URL|URL.*require|source.*URL/i.test(prompt) ? 15 : 0,
    unknownHandling: /unknown.*handling|if.*not.*found|unknowns.*array|Not disclosed|proxy.*estimate/i.test(prompt) ? 15 : 0,
    placeholderProhibition: /\[.*\].*forbidden|placeholder.*prohibit|NEVER.*\[|Do NOT.*\[|bracket.*forbidden/i.test(prompt) ? 10 : 0,
    adequateLength: prompt.length >= 1000 ? 5 : Math.round((prompt.length / 1000) * 5 * 10) / 10,
  };

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const level = total >= 70 ? 'good' : total >= 40 ? 'warning' : 'poor';
  return { total: Math.round(total), level };
}

// Quality template for enhancement
const QUALITY_TEMPLATE = `
MANDATORY PROMPT STRUCTURE (every research step MUST include ALL of these):

1. CONTEXT HEADER - State the step purpose and inputs clearly
   Example: "STEP N — [Purpose]. INPUTS: {{summary}}, {{step0}}"

2. HARD RULES SECTION - Include 5+ explicit constraints like:
   - "Do NOT invent facts or numbers"
   - "Only include sources you can validate as real"
   - "If specific data unavailable, use proxy calculations with shown methodology"
   - "NEVER use placeholder tokens like [Company] or {value} - use actual values or 'Not disclosed'"
   - "Prefer Australian authoritative sources (.gov.au, .edu.au)"

3. OUTPUT SCHEMA - Define exact JSON structure with:
   - Every field name with its type
   - Constraints (required, max_length, etc.)
   - Example values

4. URL VALIDATION RULES (for steps requiring sources):
   - "Every source MUST have a valid URL or explicit 'URL not available'"
   - "Prefer government, academic, or industry body sources"
   - "If URL cannot be verified, mark confidence as 'low'"

5. UNKNOWN HANDLING PROTOCOL:
   - "If data unavailable, provide conservative proxy estimate with calculation shown"
   - "Include 'unknowns' array listing what couldn't be found"
   - "Use descriptive text like 'Not publicly disclosed' instead of 'Unknown'"

MINIMUM PROMPT LENGTH: Each research step prompt MUST be at least 1,500 characters.
`;

const REFERENCE_EXAMPLE = `
REFERENCE EXAMPLE (follow this exact structure for all research prompts):

STEP 0 — Build Source Pack (Australia-first, domain-agnostic)

You are a grant-commercialisation analyst. Your task is to curate a Source Pack of 12–25 high-quality sources relevant to the research domain described by the user.

INPUTS:
- {{summary}}: The user's 100-word research summary
- {{grantGuidelines}}: Assessment criteria for this grant

HARD RULES:
- Do NOT invent facts or numbers.
- Only include sources you can validate as real and relevant.
- Prefer Australian authoritative sources first when applicable.
- If you cannot find a source type, record it as an Unknown in the unknowns array.
- NEVER use placeholder text like "[Source Title]" or "{URL}" - use actual content or 'Not available'.

SOURCE PACK REQUIREMENTS:
Return 12–25 sources total (max 25). Include, where relevant:
A) Australia-first authoritative sources: ABS, data.gov.au, AIHW, Productivity Commission, NHMRC, CSIRO
B) Sector/standards/peak bodies relevant to the research domain
C) Academic publications, market reports, industry statistics
D) Policy documents and regulatory guidance

FOR EACH SOURCE, provide:
- source_id: Sequential ID like "S0-1", "S0-2"
- title: Actual title of the source (no placeholders)
- publisher: Organization that published it
- url: Valid URL or "URL not available"
- date_accessed: Today's date or "Not accessible"
- relevance: One sentence on why this source matters
- confidence: "high" (verified URL), "medium" (known publisher), "low" (unverified)

OUTPUT JSON SCHEMA:
{
  "sources": [
    {
      "source_id": "S0-1",
      "title": "Cancer in Australia 2023 Report",
      "publisher": "Australian Institute of Health and Welfare",
      "url": "https://www.aihw.gov.au/reports/cancer/cancer-in-australia-2023",
      "date_accessed": "2025-02-01",
      "relevance": "Provides national cancer incidence and survival statistics",
      "confidence": "high"
    }
  ],
  "unknowns": [
    "No accessible market sizing reports specific to this niche technology"
  ]
}
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is super_admin
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Check super_admin role (only super admins can regenerate)
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Super Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { step_id, additional_context } = await req.json();

    if (!step_id) {
      return new Response(
        JSON.stringify({ error: "step_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use service role for database operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Fetch the step with bundle info
    const { data: step, error: stepError } = await supabaseAdmin
      .from("prompt_bundle_steps")
      .select(`
        id,
        step_number,
        step_name,
        step_description,
        prompt_template,
        bundle_id,
        bundle:prompt_bundles (
          id,
          name,
          system_prompt
        )
      `)
      .eq("id", step_id)
      .single();

    if (stepError || !step) {
      return new Response(
        JSON.stringify({ error: "Step not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to find grant context if bundle is linked to a grant version
    let grantContext = "";
    const { data: grantVersion } = await supabaseAdmin
      .from("grant_versions")
      .select(`
        id,
        ai_suggestions_json,
        rubric_json,
        grant:grants (
          id,
          name,
          description
        )
      `)
      .eq("prompt_bundle_id", step.bundle_id)
      .single();

    if (grantVersion) {
      const grantName = (grantVersion as any).grant?.name || "Grant";
      const grantSummary = (grantVersion.ai_suggestions_json as any)?.grant_summary || "";
      const rubricSections = (grantVersion.rubric_json as any)?.sections || [];
      
      const formattedRubric = rubricSections.map((s: any) => 
        `## ${s.title} ${s.weight ? `(${s.weight}% weight)` : ''}\n${s.description || ''}\nCriteria: ${(s.criteria || []).join('; ')}`
      ).join('\n\n');

      grantContext = `
GRANT CONTEXT:
- Grant Name: ${grantName}
- Summary: ${grantSummary}

RUBRIC/ASSESSMENT CRITERIA:
${formattedRubric}
`;
    }

    // Calculate current quality score
    const currentScore = calculateQualityScore(step.prompt_template);

    console.log(`Regenerating step ${step.step_number} (${step.step_name}), current quality: ${currentScore.total}`);

    // Build the enhancement prompt
    const enhancementPrompt = `You are an expert at improving research prompts for grant applications.

${QUALITY_TEMPLATE}

${REFERENCE_EXAMPLE}

${grantContext}

TASK: Improve the following research step prompt to meet quality standards.

STEP DETAILS:
- Step Number: ${step.step_number}
- Step Name: ${step.step_name}
- Purpose: ${step.step_description}
- Current Quality Score: ${currentScore.total}/100 (${currentScore.level})

CURRENT PROMPT (${step.prompt_template.length} characters):
---
${step.prompt_template}
---

${additional_context ? `ADDITIONAL CONTEXT FROM ADMIN:\n${additional_context}\n` : ''}

REQUIREMENTS:
1. Maintain the same research purpose as the original
2. The enhanced prompt MUST be at least 1,500 characters
3. Include ALL mandatory sections: CONTEXT HEADER, HARD RULES, OUTPUT SCHEMA, etc.
4. Use only approved variables: {{summary}}, {{publicArticleUrl}}, {{articleContent}}, {{trl}}, {{ipStatus}}, {{grantName}}, {{grantVersionLabel}}, {{grantGuidelines}}, {{grantRubric}}, {{grantSummary}}, {{sources}}, {{unknowns}}, {{step0}}, {{step1}}, etc.

Return ONLY the enhanced prompt text. Do not include any JSON wrapping or markdown code fences.`;

    const enhanceResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: enhancementPrompt },
          { role: "user", content: "Generate the enhanced prompt now." },
        ],
      }),
    });

    if (!enhanceResponse.ok) {
      const errorText = await enhanceResponse.text();
      console.error("AI enhancement error:", enhanceResponse.status, errorText);
      throw new Error("AI enhancement failed");
    }

    const enhanceResult = await enhanceResponse.json();
    const regeneratedPrompt = enhanceResult.choices?.[0]?.message?.content?.trim();

    if (!regeneratedPrompt) {
      throw new Error("Failed to generate enhanced prompt");
    }

    // Calculate new quality score
    const newScore = calculateQualityScore(regeneratedPrompt);

    console.log(`Regenerated prompt: ${regeneratedPrompt.length} chars, quality: ${newScore.total} (${newScore.level})`);

    return new Response(
      JSON.stringify({
        regenerated_prompt: regeneratedPrompt,
        original_score: currentScore,
        new_score: newScore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in regenerate-step-prompt:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
