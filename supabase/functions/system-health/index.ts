import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// List of critical functions that must be deployed
const CRITICAL_FUNCTIONS = [
  "generate-report",
  "enqueue-report",
  "worker-proxy",
  "resume-report-run",
  "cancel-report-run",
  "create-checkout",
  "stripe-webhook",
  "send-report-email",
  "generate-pdf",
  "generate-docx",
];

// List of secrets required for operation (we only check existence, never expose values)
const REQUIRED_SECRETS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "CLOUD_RUN_URL",
  "WORKER_SECRET",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Check secrets presence (without exposing values)
    const secretsStatus: Record<string, boolean> = {};
    for (const secret of REQUIRED_SECRETS) {
      const value = Deno.env.get(secret);
      secretsStatus[secret] = Boolean(value && value.length > 0);
    }

    // Build health response
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: Deno.env.get("SUPABASE_URL")?.includes("localhost") ? "local" : "cloud",
      projectRef: extractProjectRef(Deno.env.get("SUPABASE_URL") || ""),
      functions: {
        available: CRITICAL_FUNCTIONS,
        note: "This endpoint confirms system-health is deployed. Other functions are listed but not individually probed.",
      },
      secrets: {
        configured: secretsStatus,
        allPresent: Object.values(secretsStatus).every(Boolean),
      },
      version: "1.0.0",
    };

    return new Response(JSON.stringify(health), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function extractProjectRef(supabaseUrl: string): string {
  // Extract project ref from URL like https://xxx.supabase.co
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : "unknown";
}
