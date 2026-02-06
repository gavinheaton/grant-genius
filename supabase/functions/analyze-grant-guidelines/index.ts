import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    // Update status to analyzing
    await supabase
      .from("grant_versions")
      .update({ ai_analysis_status: "analyzing" })
      .eq("id", grant_version_id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert at analyzing grant application guidelines and extracting structured data.
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
  "required_inputs": [
    {
      "key": "string",
      "label": "string", 
      "type": "text|textarea|url|file|select|number",
      "required": true|false,
      "help_text": "string",
      "max_length": number|null,
      "source_section": "string"
    }
  ],
  "rubric": {
    "sections": [
      {
        "key": "string",
        "title": "string",
        "description": "string",
        "criteria": ["string"],
        "weight": number|null
      }
    ]
  },
  "grant_summary": "string"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Please analyze these grant guidelines and extract the structured data:\n\n${guidelines_text}` },
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      await supabase
        .from("grant_versions")
        .update({ ai_analysis_status: "failed" })
        .eq("id", grant_version_id);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("AI analysis failed");
    }

    const aiResponse = await response.json();
    console.log("AI Response:", JSON.stringify(aiResponse, null, 2));

    let suggestions;
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      suggestions = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try to parse content as JSON
      const content = aiResponse.choices?.[0]?.message?.content;
      if (content) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          suggestions = JSON.parse(jsonMatch[0]);
        }
      }
    }

    if (!suggestions) {
      await supabase
        .from("grant_versions")
        .update({ ai_analysis_status: "failed" })
        .eq("id", grant_version_id);
      throw new Error("Failed to parse AI response");
    }

    // Save suggestions to database
    const { error: updateError } = await supabase
      .from("grant_versions")
      .update({
        ai_analysis_status: "completed",
        ai_suggestions_json: suggestions,
        guidelines_raw_text: guidelines_text.substring(0, 100000) // Limit size
      })
      .eq("id", grant_version_id);

    if (updateError) {
      console.error("Update error:", updateError);
      throw updateError;
    }

    // Log to audit
    await supabase.from("audit_logs").insert({
      entity_type: "grant_version",
      entity_id: grant_version_id,
      action: "AI_ANALYSIS",
      user_id: userId,
      new_value_json: { status: "completed", suggestions_preview: suggestions.grant_summary }
    });

    return new Response(JSON.stringify({ success: true, suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-grant-guidelines error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
