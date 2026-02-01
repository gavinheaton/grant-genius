import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // Verify user is admin
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "super_admin"])
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { grant_version_id, guidelines_text } = await req.json();

    if (!grant_version_id || !guidelines_text) {
      return new Response(
        JSON.stringify({ error: "grant_version_id and guidelines_text are required" }),
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

    // Fetch grant info
    const { data: grantVersion, error: grantError } = await supabaseAdmin
      .from("grant_versions")
      .select(`
        id,
        version_number,
        grant_id,
        grant:grants (
          id,
          name,
          description
        )
      `)
      .eq("id", grant_version_id)
      .single();

    if (grantError || !grantVersion) {
      return new Response(
        JSON.stringify({ error: "Grant version not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atomic claim - only proceeds if status is 'pending' (idempotency check)
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("grant_versions")
      .update({ 
        ai_analysis_status: "processing",
        pipeline_generation_status: "none"
      })
      .eq("id", grant_version_id)
      .eq("ai_analysis_status", "pending")  // Only if not already started
      .select("id")
      .single();

    if (claimError || !claimed) {
      console.log("Already processing or completed - skipping duplicate call");
      return new Response(JSON.stringify({ 
        message: "Already processing or completed",
        skipped: true 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Step 1: Extracting rubric and inputs...");

    // ========== AI CALL #1: Extract rubric and inputs ==========
    const extractionPrompt = `You are an expert at analyzing grant application guidelines and extracting structured data.
Your task is to analyze the provided grant guidelines document and extract:

1. REQUIRED INPUTS: What information must the applicant provide?
   - Look for application form sections, required fields, document uploads
   - Each input should have: key (snake_case), label, type (text/textarea/url/file/select/number), required (boolean), help_text, max_length (if applicable), source_section (where in doc)

2. RUBRIC/ASSESSMENT CRITERIA: What will applications be assessed on?
   - Look for "selection criteria", "assessment criteria", "scoring", "evaluation"
   - Each section should have: key (snake_case), title, description, criteria (array of strings), weight (percentage if mentioned)

3. GRANT SUMMARY: A brief description of what the grant is for

Return ONLY valid JSON matching this exact structure:
{
  "required_inputs": [...],
  "rubric": { "sections": [...] },
  "grant_summary": "string"
}`;

    const extractionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: extractionPrompt },
          { role: "user", content: `Please analyze these grant guidelines and extract the structured data:\n\n${guidelines_text.substring(0, 80000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_grant_structure",
              description: "Extract required inputs and rubric criteria from grant guidelines",
              parameters: {
                type: "object",
                properties: {
                  required_inputs: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        key: { type: "string" },
                        label: { type: "string" },
                        type: { type: "string", enum: ["text", "textarea", "url", "file", "select", "number"] },
                        required: { type: "boolean" },
                        help_text: { type: "string" },
                        max_length: { type: "number" },
                        source_section: { type: "string" }
                      },
                      required: ["key", "label", "type", "required"]
                    }
                  },
                  rubric: {
                    type: "object",
                    properties: {
                      sections: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: { type: "string" },
                            title: { type: "string" },
                            description: { type: "string" },
                            criteria: { type: "array", items: { type: "string" } },
                            weight: { type: "number" }
                          },
                          required: ["key", "title", "criteria"]
                        }
                      }
                    },
                    required: ["sections"]
                  },
                  grant_summary: { type: "string" }
                },
                required: ["required_inputs", "rubric", "grant_summary"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_grant_structure" } }
      }),
    });

    if (!extractionResponse.ok) {
      const errorText = await extractionResponse.text();
      console.error("AI extraction error:", extractionResponse.status, errorText);
      
      await supabaseAdmin
        .from("grant_versions")
        .update({ ai_analysis_status: "failed" })
        .eq("id", grant_version_id);

      throw new Error("AI extraction failed");
    }

    const extractionResult = await extractionResponse.json();
    let suggestions;
    
    const toolCall = extractionResult.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      suggestions = JSON.parse(toolCall.function.arguments);
    } else {
      const content = extractionResult.choices?.[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        }
      }
    }

    if (!suggestions) {
      await supabaseAdmin
        .from("grant_versions")
        .update({ ai_analysis_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to parse extraction response");
    }

    console.log("Step 2: Applying extracted data...");

    // Auto-apply extracted data
    await supabaseAdmin
      .from("grant_versions")
      .update({
        ai_analysis_status: "completed",
        ai_suggestions_json: suggestions,
        required_inputs_json: suggestions.required_inputs || [],
        rubric_json: { sections: suggestions.rubric?.sections || [] },
        guidelines_raw_text: guidelines_text.substring(0, 100000),
        pipeline_generation_status: "generating"
      })
      .eq("id", grant_version_id);

    console.log("Step 3: Generating research pipeline...");

    // ========== AI CALL #2: Generate research pipeline ==========
    const grantName = (grantVersion as any).grant?.name || "Grant";
    const rubricSections = suggestions.rubric?.sections || [];
    
    const formattedRubric = rubricSections.map((s: any) => 
      `## ${s.title} ${s.weight ? `(${s.weight}% weight)` : ''}\n${s.description || ''}\nCriteria: ${(s.criteria || []).join('; ')}`
    ).join('\n\n');

    const pipelinePrompt = `You are an expert at designing research pipelines for grant applications.

Context:
- Grant: ${grantName}
- Summary: ${suggestions.grant_summary || 'Commercialization grant'}

Rubric/Assessment Criteria:
${formattedRubric}

Design a research pipeline to gather evidence supporting applications for this grant. 

KEY REQUIREMENTS:
1. RESEARCH FOCUS: Generate steps that produce citable evidence, NOT application writing
2. DYNAMIC STEPS: Determine the right number of steps (typically 8-20) based on rubric complexity
3. SKIP NON-RESEARCH: Ignore criteria requiring applicant-provided info (team bios, track record, etc.)
4. EVIDENCE-BASED: Each step should gather external data that can be cited

REQUIRED PIPELINE STRUCTURE:
- Step 0: build_source_pack (ALWAYS first - curates authoritative sources for the research domain)
- Steps 1-N: Research steps mapped to rubric sections (market sizing, competition, impact, etc.)
- Final 2 research steps: report_assembly (combine all research) and finalize_citations (compile references)

DO NOT include HTML assembly or formatting steps - these will be added automatically after your research steps.

For each step, provide:
- step_number: Sequential integer starting at 0
- step_name: snake_case identifier (e.g., "market_sizing", "competitor_analysis")
- step_description: What research this step produces (1-2 sentences)
- prompt_template: Full prompt with {{variable}} placeholders.
  APPROVED VARIABLES (use ONLY these):
  - User Inputs: {{summary}}, {{publicArticleUrl}}, {{articleContent}}, {{trl}}, {{ipStatus}}
  - Grant Context: {{grantName}}, {{grantVersionLabel}}, {{grantGuidelines}}, {{grantRubric}}, {{grantSummary}}
  - Source Pack (from Step 0): {{sources}}, {{unknowns}}
  - Step Outputs: {{step0}}, {{step1}}, {{step2}}, etc. for referencing prior step JSON outputs
- model_tier: "lite" | "balanced" | "pro" based on complexity

Example step types to consider:
- Market sizing (TAM/SAM/SOM calculations with sources)
- Competitor/alternative analysis
- Partner/stakeholder mapping
- Economic impact assessment
- Technology landscape review
- Policy/regulatory alignment
- IP landscape analysis

Return a JSON object with:
{
  "pipeline_name": "string",
  "pipeline_description": "string",
  "system_prompt": "string (general instructions for all steps)",
  "steps": [...]
}`;

    const pipelineResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: pipelinePrompt },
          { role: "user", content: "Generate the research pipeline based on the grant requirements above." },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_pipeline",
              description: "Create a research pipeline for the grant",
              parameters: {
                type: "object",
                properties: {
                  pipeline_name: { type: "string" },
                  pipeline_description: { type: "string" },
                  system_prompt: { type: "string" },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        step_number: { type: "number" },
                        step_name: { type: "string" },
                        step_description: { type: "string" },
                        prompt_template: { type: "string" },
                        model_tier: { type: "string", enum: ["lite", "balanced", "pro"] }
                      },
                      required: ["step_number", "step_name", "step_description", "prompt_template"]
                    }
                  }
                },
                required: ["pipeline_name", "system_prompt", "steps"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_pipeline" } }
      }),
    });

    if (!pipelineResponse.ok) {
      const errorText = await pipelineResponse.text();
      console.error("AI pipeline generation error:", pipelineResponse.status, errorText);
      
      await supabaseAdmin
        .from("grant_versions")
        .update({ pipeline_generation_status: "failed" })
        .eq("id", grant_version_id);

      throw new Error("AI pipeline generation failed");
    }

    const pipelineResult = await pipelineResponse.json();
    let pipelineData;
    
    const pipelineToolCall = pipelineResult.choices?.[0]?.message?.tool_calls?.[0];
    if (pipelineToolCall?.function?.arguments) {
      pipelineData = JSON.parse(pipelineToolCall.function.arguments);
    } else {
      const content = pipelineResult.choices?.[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          pipelineData = JSON.parse(jsonMatch[0]);
        }
      }
    }

    if (!pipelineData || !pipelineData.steps) {
      await supabaseAdmin
        .from("grant_versions")
        .update({ pipeline_generation_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to parse pipeline response");
    }

    console.log("Step 4: Creating prompt bundle...");

    // Map model_tier to actual model identifiers
    const tierToModel: Record<string, string> = {
      lite: "google/gemini-2.5-flash-lite",
      balanced: "google/gemini-3-flash-preview",
      pro: "google/gemini-3-pro-preview"
    };

    // ========== HTML Assembly Steps (auto-appended to all pipelines) ==========
    // These are hardcoded to ensure consistent report formatting across all grants
    const createHtmlAssemblySteps = (maxAIStep: number) => {
      // Generate dynamic step references for all prior steps
      const stepRefs = Array.from({ length: maxAIStep + 1 }, (_, i) => `{{step${i}}}`).join(", ");
      
      return [
        {
          step_name: "assemble_sections_html",
          step_description: "Generate report sections as clean HTML narrative from evidence gathering steps",
          model_tier: "balanced",
          prompt_template: `STEP ${maxAIStep + 1} — Assemble Sections as HTML

You are a grant-commercialisation analyst writing for Australian government grant assessors.

INPUTS (from previous steps):
- All prior step outputs: ${stepRefs}
- Grant: {{grantName}} ({{grantVersionLabel}})

PURPOSE:
Transform the research findings from steps 0-${maxAIStep} into a cohesive HTML narrative report.

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON with a single top-level object
2. Do NOT include code fences (no \`\`\` anywhere in your response)
3. The first character of your response must be { and the last must be }
4. Include a "sections_html" field containing semantic HTML

REQUIRED SECTIONS:
1. Executive Summary - Key findings and recommendations
2. Research Context and Innovation - What the technology/research is
3. Unmet Need and Australian Relevance - Problem being solved
4. Commercialisation Pathways - Routes to market
5. Competitive Landscape - Key competitors and differentiation
6. Market Sizing (TAM/SAM/SOM) - Market opportunity with calculations
7. IP and Regulatory Pathway - Protection and compliance considerations
8. Economic Impact - Jobs, exports, GDP contribution estimates
9. Stakeholders and Partners - Key ecosystem players
10. Data Gaps and Validation Needs - What requires further investigation

HTML FORMATTING RULES:
- Use <h2> for main section headings
- Use <h3> for subsections
- Use <p> for paragraphs with proper spacing
- Use <ul><li> for bullet lists
- Use <strong> for emphasis
- Include citation markers as superscript: <sup>[S0-1]</sup>, <sup>[S3-2]</sup> etc.
- Insert table anchors: <!-- TABLE:competitors -->, <!-- TABLE:market_sizing -->, <!-- TABLE:partners -->
- Do NOT use markdown syntax inside HTML

OUTPUT JSON SCHEMA:
{
  "sections_html": "<h2>Executive Summary</h2><p>...</p><h2>Research Context</h2>...",
  "data_gaps": ["gap1", "gap2", ...]
}`
        },
        {
          step_name: "build_tables_sources_html",
          step_description: "Build HTML tables and deduplicated source list from research steps",
          model_tier: "balanced",
          prompt_template: `STEP ${maxAIStep + 2} — Build Tables and Sources (HTML)

Using the research data from previous steps (${stepRefs}), compile:

1. COMPARISON TABLES - Create HTML tables for:
   - Competitor comparison (features, pricing, market position)
   - TAM/SAM/SOM summary with calculations
   - Partner capability matrix
   - Any other tabular data from research

2. SOURCE CONSOLIDATION - Compile ALL citations from all steps into a single deduplicated list

OUTPUT REQUIREMENTS (CRITICAL):
1. Return ONLY valid JSON - no code fences, no markdown
2. First character must be {, last must be }
3. Tables must be valid HTML <table> elements

OUTPUT JSON SCHEMA:
{
  "tables": {
    "competitors": "<table class=\\"data-table\\"><thead><tr><th>Company</th><th>Product</th><th>Differentiator</th></tr></thead><tbody>...</tbody></table>",
    "market_sizing": "<table class=\\"data-table\\"><thead><tr><th>Segment</th><th>Value</th><th>Source</th></tr></thead><tbody>...</tbody></table>",
    "partners": "<table class=\\"data-table\\"><thead><tr><th>Partner</th><th>Type</th><th>Capability</th></tr></thead><tbody>...</tbody></table>"
  },
  "all_sources": [
    {"id": "S0-1", "mla_citation": "Author. Title. Publication, Date. URL.", "url": "https://..."},
    {"id": "S1-1", "mla_citation": "...", "url": "..."}
  ]
}`
        },
        {
          step_name: "finalize_report_html",
          step_description: "Merge sections, tables, and sources into final report_html output",
          model_tier: "lite",
          prompt_template: `STEP ${maxAIStep + 3} — Finalize Report (HTML)

Combine the narrative from {{step${maxAIStep + 1}}} with tables from {{step${maxAIStep + 2}}} into the final report.

INSTRUCTIONS:
1. Take the sections_html from step ${maxAIStep + 1}
2. Replace table anchors with actual tables:
   - <!-- TABLE:competitors --> → competitors table
   - <!-- TABLE:market_sizing --> → market_sizing table
   - <!-- TABLE:partners --> → partners table
3. Add a References section at the end with all sources

OUTPUT REQUIREMENTS (CRITICAL - READ CAREFULLY):
1. Return ONLY valid JSON - absolutely NO code fences (\`\`\`json or \`\`\`)
2. The very first character must be { and the very last must be }
3. Do NOT wrap the output in any markdown formatting
4. The report_html field contains the complete HTML document

OUTPUT JSON SCHEMA:
{
  "title": "Grant Report: [Project Title from research]",
  "report_html": "<h2>Executive Summary</h2><p>...</p>...<h2>References</h2><div class=\\"sources\\">...</div>",
  "all_sources": [...],
  "data_gaps": [...],
  "tables": {...}
}`
        }
      ];
    };

    // Create the prompt bundle
    const { data: bundle, error: bundleError } = await supabaseAdmin
      .from("prompt_bundles")
      .insert({
        name: pipelineData.pipeline_name || `${grantName} Pipeline`,
        description: pipelineData.pipeline_description || `Auto-generated pipeline for ${grantName}`,
        system_prompt: pipelineData.system_prompt || "You are an expert research analyst supporting grant applications with evidence-based analysis.",
        is_active: false, // Draft - not globally active
      })
      .select("id")
      .single();

    if (bundleError || !bundle) {
      console.error("Failed to create bundle:", bundleError);
      await supabaseAdmin
        .from("grant_versions")
        .update({ pipeline_generation_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to create prompt bundle");
    }

    // Get the highest step number from AI-generated steps
    const maxAIStep = Math.max(...pipelineData.steps.map((s: any) => s.step_number));
    
    // Prepare AI-generated research steps
    const researchSteps = pipelineData.steps.map((step: any) => ({
      bundle_id: bundle.id,
      step_number: step.step_number,
      step_name: step.step_name,
      step_description: step.step_description,
      prompt_template: step.prompt_template,
      model_override: tierToModel[step.model_tier] || null,
      is_heavy: step.model_tier === "pro",
    }));

    // Generate and append standardized HTML assembly steps
    const htmlAssemblySteps = createHtmlAssemblySteps(maxAIStep);
    const assemblySteps = htmlAssemblySteps.map((step, idx) => ({
      bundle_id: bundle.id,
      step_number: maxAIStep + 1 + idx,
      step_name: step.step_name,
      step_description: step.step_description,
      prompt_template: step.prompt_template,
      model_override: tierToModel[step.model_tier] || null,
      is_heavy: false,
    }));

    // Combine research steps + assembly steps
    const stepsToInsert = [...researchSteps, ...assemblySteps];
    
    console.log(`Inserting ${researchSteps.length} research steps + ${assemblySteps.length} HTML assembly steps = ${stepsToInsert.length} total`);

    const { error: stepsError } = await supabaseAdmin
      .from("prompt_bundle_steps")
      .insert(stepsToInsert);

    if (stepsError) {
      console.error("Failed to insert steps:", stepsError);
      // Clean up the bundle
      await supabaseAdmin.from("prompt_bundles").delete().eq("id", bundle.id);
      await supabaseAdmin
        .from("grant_versions")
        .update({ pipeline_generation_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to create pipeline steps");
    }

    console.log("Step 5: Linking bundle to grant version...");

    // Link bundle to grant version
    await supabaseAdmin
      .from("grant_versions")
      .update({
        prompt_bundle_id: bundle.id,
        pipeline_generation_status: "draft"
      })
      .eq("id", grant_version_id);

    // Audit log - include total step count (research + assembly)
    const totalStepCount = stepsToInsert.length;
    await supabaseAdmin.from("audit_logs").insert({
      entity_type: "grant_version",
      entity_id: grant_version_id,
      action: "PIPELINE_GENERATED",
      user_id: userId,
      new_value_json: { 
        bundle_id: bundle.id, 
        research_steps: researchSteps.length,
        assembly_steps: assemblySteps.length,
        total_steps: totalStepCount,
        pipeline_name: pipelineData.pipeline_name
      }
    });

    console.log("Processing complete!");

    return new Response(JSON.stringify({
      success: true,
      bundle_id: bundle.id,
      step_count: totalStepCount,
      research_steps: researchSteps.length,
      assembly_steps: assemblySteps.length,
      suggestions: {
        grant_summary: suggestions.grant_summary,
        input_count: (suggestions.required_inputs || []).length,
        rubric_section_count: (suggestions.rubric?.sections || []).length
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("process-grant-guidelines error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
