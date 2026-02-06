import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Whitelist of allowed function names for security
const ALLOWED_FUNCTIONS = [
  "generate-report",
  "enqueue-report",
  "resume-report-run",
  "worker-proxy",
  "cancel-report-run",
  "create-checkout",
  "stripe-webhook",
  "send-report-email",
  "generate-pdf",
  "generate-docx",
  "analyze-grant-guidelines",
  "cleanup-stalled-runs",
  "clear-and-restart-run",
  "enqueue-cloud-run",
  "grant-credit",
  "invite-admin",
  "process-grant-guidelines",
  "recover-finalize-report",
  "regenerate-step-prompt",
  "system-health",
  "trigger-deploy",
];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user and verify admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const { functionNames } = await req.json() as { functionNames: string[] };
    
    if (!functionNames || !Array.isArray(functionNames) || functionNames.length === 0) {
      return new Response(
        JSON.stringify({ error: "functionNames array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate function names against whitelist
    const invalidFunctions = functionNames.filter(fn => !ALLOWED_FUNCTIONS.includes(fn));
    if (invalidFunctions.length > 0) {
      return new Response(
        JSON.stringify({ error: `Invalid function names: ${invalidFunctions.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the Lovable API key from secrets
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get project ID from environment
    const projectId = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "Could not determine project ID" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Lovable deployment API
    // The Lovable platform provides an internal deployment endpoint
    const deployUrl = `https://api.lovable.dev/v1/projects/${projectId}/deploy/functions`;
    
    console.log(`Deploying functions: ${functionNames.join(", ")}`);
    
    const deployResponse = await fetch(deployUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ functions: functionNames }),
    });

    if (!deployResponse.ok) {
      const errorText = await deployResponse.text();
      console.error(`Deployment API error: ${deployResponse.status} - ${errorText}`);
      
      // If the Lovable API isn't available, provide helpful instructions
      if (deployResponse.status === 404) {
        return new Response(
          JSON.stringify({ 
            error: "Deployment API not available",
            message: "Edge functions are deployed automatically when you publish your project. Click 'Publish' in the top-right corner to deploy all functions.",
            functionNames,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: `Deployment failed: ${deployResponse.status}`,
          details: errorText,
        }),
        { status: deployResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await deployResponse.json();
    
    console.log(`Deployment result:`, result);

    return new Response(
      JSON.stringify({ 
        success: true,
        deployed: functionNames,
        result,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in trigger-deploy:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
