import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Tool definitions for the AI
const tools = [
  {
    type: "function",
    function: {
      name: "execute_sql",
      description:
        "Execute a read-only SQL query against the database. Only SELECT statements are allowed.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The SQL SELECT query to execute",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_run_details",
      description:
        "Get detailed information about a specific report run including steps, errors, and outputs",
      parameters: {
        type: "object",
        properties: {
          run_id: {
            type: "string",
            description: "The UUID of the report run",
          },
        },
        required: ["run_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_stalled_runs",
      description:
        "List all report runs that are stuck in running or pending status for more than 10 minutes",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_failed_runs",
      description:
        "List recent failed report runs with error details",
      parameters: {
        type: "object",
        properties: {
          hours: {
            type: "number",
            description: "Number of hours to look back (default: 24)",
          },
          limit: {
            type: "number",
            description: "Maximum number of runs to return (default: 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "invoke_function",
      description:
        "Invoke another edge function like resume-report-run, cancel-report-run, or cleanup-stalled-runs",
      parameters: {
        type: "object",
        properties: {
          function_name: {
            type: "string",
            enum: ["resume-report-run", "cancel-report-run", "cleanup-stalled-runs"],
            description: "The name of the edge function to invoke",
          },
          payload: {
            type: "object",
            description: "The JSON payload to send to the function",
          },
        },
        required: ["function_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_system_health",
      description:
        "Check the health and deployment status of edge functions",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_system_stats",
      description:
        "Get system statistics like report counts, success rates, and user activity",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Number of days to analyze (default: 7)",
          },
        },
        required: [],
      },
    },
  },
];

const systemPrompt = `You are the Grant Genius Admin Assistant, an AI helper for Super Admins managing the Grant Genius platform.

You have access to tools that allow you to:
1. Execute read-only SQL queries against the database
2. Get details about specific report runs
3. List stalled or failed runs
4. Invoke edge functions (resume, cancel, cleanup)
5. Check system health and deployment status
6. Get system statistics

**Important Guidelines:**
- Only execute SELECT queries - never INSERT, UPDATE, DELETE, or DROP
- When showing query results, format them as readable tables
- For run diagnostics, provide clear analysis of what went wrong
- When suggesting fixes, explain the reasoning
- Be concise but thorough in your explanations
- If you're unsure about something, say so

**Database Schema Context:**
- \`profiles\` - User profiles (user_id, email, full_name)
- \`user_roles\` - User roles (user_id, role: researcher/admin/super_admin)
- \`applications\` - Grant applications (id, user_id, title, status, grant_version_id)
- \`report_runs\` - Report generation runs (id, application_id, status, current_step, total_steps, execution_engine)
- \`report_run_steps\` - Individual steps in a run (id, report_run_id, step_name, status, error_message, outputs_json)
- \`reports\` - Completed reports (id, application_id, content_json)
- \`grants\` - Grant programs (id, name, description, is_active)
- \`grant_versions\` - Versioned grant configurations
- \`entitlements\` - User credits (user_id, quantity, used_quantity)
- \`audit_logs\` - Audit trail for admin actions

Always be helpful and proactive in suggesting next steps or additional information that might be useful.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user is super_admin
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .single();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Super Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Tool execution functions
    async function executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
      console.log(`Executing tool: ${toolName}`, args);
      
      try {
        switch (toolName) {
          case "execute_sql": {
            const query = String(args.query || "");
            // Security: Only allow SELECT queries
            const upperQuery = query.trim().toUpperCase();
            if (!upperQuery.startsWith("SELECT")) {
              return JSON.stringify({ error: "Only SELECT queries are allowed" });
            }
            if (upperQuery.includes("INSERT") || upperQuery.includes("UPDATE") || 
                upperQuery.includes("DELETE") || upperQuery.includes("DROP") ||
                upperQuery.includes("ALTER") || upperQuery.includes("CREATE") ||
                upperQuery.includes("TRUNCATE")) {
              return JSON.stringify({ error: "Query contains forbidden keywords" });
            }
            
            const { data, error } = await serviceClient.rpc("execute_readonly_query", { query_text: query });
            if (error) {
              return JSON.stringify({ error: error.message || "Query rejected" });
            }
            return JSON.stringify(data);
          }
          
          case "get_run_details": {
            const runId = String(args.run_id || "");
            const { data: run, error: runError } = await serviceClient
              .from("report_runs")
              .select(`
                *,
                applications!inner(id, title, user_id, profiles:user_id(email)),
                report_run_steps(*)
              `)
              .eq("id", runId)
              .single();
            
            if (runError) return JSON.stringify({ error: runError.message });
            return JSON.stringify(run);
          }
          
          case "list_stalled_runs": {
            const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
            const { data, error } = await serviceClient
              .from("report_runs")
              .select(`
                id, status, current_step, total_steps, created_at, started_at, execution_engine,
                applications!inner(title, profiles:user_id(email))
              `)
              .in("status", ["running", "pending"])
              .lt("started_at", tenMinutesAgo)
              .order("created_at", { ascending: false })
              .limit(20);
            
            if (error) return JSON.stringify({ error: error.message });
            return JSON.stringify({ stalled_runs: data, count: data?.length || 0 });
          }
          
          case "list_failed_runs": {
            const hours = Number(args.hours) || 24;
            const limit = Number(args.limit) || 10;
            const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
            
            const { data, error } = await serviceClient
              .from("report_runs")
              .select(`
                id, status, current_step, total_steps, created_at, completed_at, execution_engine,
                applications!inner(title, profiles:user_id(email)),
                report_run_steps(step_name, status, error_message)
              `)
              .eq("status", "failed")
              .gte("created_at", since)
              .order("created_at", { ascending: false })
              .limit(limit);
            
            if (error) return JSON.stringify({ error: error.message });
            return JSON.stringify({ failed_runs: data, count: data?.length || 0 });
          }
          
          case "invoke_function": {
            const funcName = String(args.function_name || "");
            const payload = args.payload || {};
            
            const response = await fetch(`${supabaseUrl}/functions/v1/${funcName}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify(payload),
            });
            
            const result = await response.json();
            return JSON.stringify({ status: response.status, result });
          }
          
          case "check_system_health": {
            const response = await fetch(`${supabaseUrl}/functions/v1/system-health`, {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
            });
            
            const result = await response.json();
            return JSON.stringify(result);
          }
          
          case "get_system_stats": {
            const days = Number(args.days) || 7;
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            
            // Get run stats
            const { data: runStats } = await serviceClient
              .from("report_runs")
              .select("status")
              .gte("created_at", since);
            
            const stats = {
              total_runs: runStats?.length || 0,
              completed: runStats?.filter(r => r.status === "completed").length || 0,
              failed: runStats?.filter(r => r.status === "failed").length || 0,
              running: runStats?.filter(r => r.status === "running").length || 0,
              pending: runStats?.filter(r => r.status === "pending").length || 0,
            };
            
            // Get user stats
            const { count: totalUsers } = await serviceClient
              .from("profiles")
              .select("*", { count: "exact", head: true });
            
            const { count: newUsers } = await serviceClient
              .from("profiles")
              .select("*", { count: "exact", head: true })
              .gte("created_at", since);
            
            return JSON.stringify({
              period_days: days,
              runs: stats,
              success_rate: stats.total_runs > 0 
                ? ((stats.completed / stats.total_runs) * 100).toFixed(1) + "%" 
                : "N/A",
              users: { total: totalUsers, new_in_period: newUsers },
            });
          }
          
          default:
            return JSON.stringify({ error: `Unknown tool: ${toolName}` });
        }
      } catch (e) {
        console.error(`Tool ${toolName} error:`, e);
        return JSON.stringify({ error: e instanceof Error ? e.message : "Tool execution failed" });
      }
    }

    // Helper for direct queries on allowed tables
    async function executeDirectQuery(query: string): Promise<unknown> {
      // Parse the query to determine which table is being queried
      const lowerQuery = query.toLowerCase();
      
      // Simple query execution for common patterns
      if (lowerQuery.includes("from profiles")) {
        const { data, error } = await serviceClient.from("profiles").select("*").limit(100);
        if (error) return { error: error.message };
        return data;
      }
      if (lowerQuery.includes("from report_runs")) {
        const { data, error } = await serviceClient.from("report_runs").select("*").limit(100);
        if (error) return { error: error.message };
        return data;
      }
      if (lowerQuery.includes("from applications")) {
        const { data, error } = await serviceClient.from("applications").select("*").limit(100);
        if (error) return { error: error.message };
        return data;
      }
      
      return { error: "Complex queries not supported. Use specific tools for data access." };
    }

    // Make initial AI request with tools
    let aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const makeAIRequest = async (msgs: unknown[]) => {
      return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: msgs,
          tools,
          stream: false,
        }),
      });
    };

    let response = await makeAIRequest(aiMessages);
    
    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result = await response.json();
    let assistantMessage = result.choices?.[0]?.message;
    
    // Process tool calls in a loop
    let iterations = 0;
    const maxIterations = 5;
    
    while (assistantMessage?.tool_calls && iterations < maxIterations) {
      iterations++;
      console.log(`Processing tool calls iteration ${iterations}`);
      
      // Add assistant message with tool calls
      aiMessages.push(assistantMessage);
      
      // Execute all tool calls
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        
        console.log(`Executing tool: ${toolName}`);
        const toolResult = await executeTool(toolName, toolArgs);
        
        // Add tool result
        aiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
        
        // Log to audit
        await serviceClient.from("audit_logs").insert({
          entity_type: "admin_assistant",
          entity_id: user.id,
          action: `tool_call:${toolName}`,
          user_id: user.id,
          new_value_json: { tool: toolName, args: toolArgs, result_preview: toolResult.substring(0, 500) },
        });
      }
      
      // Make another AI request with tool results
      response = await makeAIRequest(aiMessages);
      if (!response.ok) {
        const text = await response.text();
        console.error("AI gateway error on tool result:", response.status, text);
        break;
      }
      
      result = await response.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    // Return final response
    const finalContent = assistantMessage?.content || "I apologize, but I was unable to generate a response.";
    
    // Log the interaction
    await serviceClient.from("audit_logs").insert({
      entity_type: "admin_assistant",
      entity_id: user.id,
      action: "chat_interaction",
      user_id: user.id,
      new_value_json: { 
        user_message: messages[messages.length - 1]?.content,
        assistant_response_preview: finalContent.substring(0, 500),
        tool_calls_count: iterations,
      },
    });

    return new Response(
      JSON.stringify({ 
        content: finalContent,
        tool_calls_made: iterations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("Admin assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
