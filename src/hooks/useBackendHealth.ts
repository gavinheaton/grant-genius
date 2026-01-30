import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FunctionProbeResult {
  name: string;
  status: "ok" | "error" | "not_deployed";
  statusCode: number | null;
  latencyMs: number | null;
  error?: string;
}

export interface BackendHealthResult {
  backendUrl: string;
  projectRef: string;
  timestamp: string;
  systemHealth: {
    status: "ok" | "error" | "unreachable";
    data?: Record<string, unknown>;
    error?: string;
  };
  functionProbes: FunctionProbeResult[];
}

// Extract backend URL and project ref from the Supabase client
function getBackendInfo() {
  // The supabase client has the URL embedded - we can access it via the REST URL
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = match ? match[1] : "unknown";
  
  return {
    backendUrl: supabaseUrl,
    projectRef,
  };
}

// Probe a single function with OPTIONS and GET
async function probeFunction(backendUrl: string, functionName: string): Promise<FunctionProbeResult> {
  const url = `${backendUrl}/functions/v1/${functionName}`;
  const start = performance.now();
  
  try {
    // Try OPTIONS first (preflight)
    const optionsResponse = await fetch(url, {
      method: "OPTIONS",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    const latencyMs = Math.round(performance.now() - start);
    
    // 200 or 204 for OPTIONS is expected
    if (optionsResponse.status === 200 || optionsResponse.status === 204) {
      return {
        name: functionName,
        status: "ok",
        statusCode: optionsResponse.status,
        latencyMs,
      };
    }
    
    // 404 means not deployed
    if (optionsResponse.status === 404) {
      return {
        name: functionName,
        status: "not_deployed",
        statusCode: 404,
        latencyMs,
        error: "Function not found (404)",
      };
    }
    
    // Any other status (401, 405, etc.) means it exists but may require auth
    return {
      name: functionName,
      status: "ok",
      statusCode: optionsResponse.status,
      latencyMs,
    };
  } catch (error) {
    return {
      name: functionName,
      status: "error",
      statusCode: null,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export function useBackendHealth() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<BackendHealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    setError(null);
    
    const { backendUrl, projectRef } = getBackendInfo();
    
    try {
      // 1. Check system-health endpoint
      let systemHealthResult: BackendHealthResult["systemHealth"];
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("system-health");
        
        if (invokeError) {
          systemHealthResult = {
            status: "error",
            error: invokeError.message,
          };
        } else {
          systemHealthResult = {
            status: "ok",
            data: data,
          };
        }
      } catch (err) {
        systemHealthResult = {
          status: "unreachable",
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
      
      // 2. Probe critical functions
      const criticalFunctions = ["generate-report", "enqueue-report", "resume-report-run"];
      const probePromises = criticalFunctions.map(fn => probeFunction(backendUrl, fn));
      const functionProbes = await Promise.all(probePromises);
      
      const healthResult: BackendHealthResult = {
        backendUrl,
        projectRef,
        timestamp: new Date().toISOString(),
        systemHealth: systemHealthResult,
        functionProbes,
      };
      
      setResult(healthResult);
      return healthResult;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Health check failed";
      setError(errorMsg);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, []);

  return {
    checkHealth,
    isChecking,
    result,
    error,
  };
}
