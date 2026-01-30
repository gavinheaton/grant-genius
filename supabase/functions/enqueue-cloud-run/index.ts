import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * STUB: Cloud Run Enqueue Function
 * 
 * This is a placeholder that will eventually call the Cloud Run API to enqueue
 * report generation steps. For now, it returns null to signal that the caller
 * should fall back to edge function execution.
 * 
 * Future implementation:
 * - Authenticate with GCP
 * - Call Cloud Run Jobs API to enqueue step
 * - Return job ID for tracking
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { reportRunId, stepNumber } = await req.json();

    console.log(`Cloud Run stub: Would enqueue step ${stepNumber} for run ${reportRunId}`);

    // STUB: In the future, this would:
    // 1. Authenticate with GCP service account
    // 2. Call Cloud Run Jobs API to create/execute a job
    // 3. Return the job ID for tracking
    
    // For now, return null to signal fallback to edge execution
    // The caller (generate-report or resume-report-run) will check for null
    // and use the existing edge function flow instead
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        jobId: null,
        message: "Cloud Run not configured. Falling back to edge execution.",
        fallback: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in enqueue-cloud-run:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        fallback: true
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
