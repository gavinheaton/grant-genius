import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FunctionProbeResult {
  name: string;
  status: "ok" | "error" | "not_deployed";
  statusCode: number | null;
  latencyMs: number | null;
  error?: string;
  category: FunctionCategory;
}

export type FunctionCategory = 
  | "report_generation"
  | "user_actions"
  | "payments"
  | "notifications"
  | "exports";

export interface FunctionCategoryInfo {
  id: FunctionCategory;
  label: string;
  functions: string[];
}

export const FUNCTION_CATEGORIES: FunctionCategoryInfo[] = [
  {
    id: "report_generation",
    label: "Report Generation",
    functions: ["generate-report", "enqueue-report", "resume-report-run", "worker-proxy"],
  },
  {
    id: "user_actions",
    label: "User Actions",
    functions: ["cancel-report-run", "create-checkout"],
  },
  {
    id: "payments",
    label: "Payments",
    functions: ["stripe-webhook"],
  },
  {
    id: "notifications",
    label: "Notifications",
    functions: ["send-report-email"],
  },
  {
    id: "exports",
    label: "Exports",
    functions: ["generate-pdf", "generate-docx"],
  },
];

// Get all functions from categories
export const ALL_CRITICAL_FUNCTIONS = FUNCTION_CATEGORIES.flatMap(c => c.functions);

// Map function name to category
function getFunctionCategory(functionName: string): FunctionCategory {
  for (const category of FUNCTION_CATEGORIES) {
    if (category.functions.includes(functionName)) {
      return category.id;
    }
  }
  return "report_generation"; // fallback
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
  summary: {
    total: number;
    healthy: number;
    missing: number;
    errors: number;
  };
}

// Extract backend URL and project ref from the Supabase client
function getBackendInfo() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = match ? match[1] : "unknown";
  
  return {
    backendUrl: supabaseUrl,
    projectRef,
  };
}

// Probe a single function with OPTIONS
async function probeFunction(backendUrl: string, functionName: string): Promise<FunctionProbeResult> {
  const url = `${backendUrl}/functions/v1/${functionName}`;
  const start = performance.now();
  const category = getFunctionCategory(functionName);
  
  try {
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
        category,
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
        category,
      };
    }
    
    // Any other status (401, 405, etc.) means it exists but may require auth
    return {
      name: functionName,
      status: "ok",
      statusCode: optionsResponse.status,
      latencyMs,
      category,
    };
  } catch (error) {
    return {
      name: functionName,
      status: "error",
      statusCode: null,
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : "Network error",
      category,
    };
  }
}

export function useBackendHealth() {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<BackendHealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deployingFunctions, setDeployingFunctions] = useState<Set<string>>(new Set());

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
      
      // 2. Probe ALL critical functions
      const probePromises = ALL_CRITICAL_FUNCTIONS.map(fn => probeFunction(backendUrl, fn));
      const functionProbes = await Promise.all(probePromises);
      
      // 3. Calculate summary
      const healthy = functionProbes.filter(p => p.status === "ok").length;
      const missing = functionProbes.filter(p => p.status === "not_deployed").length;
      const errors = functionProbes.filter(p => p.status === "error").length;
      
      const healthResult: BackendHealthResult = {
        backendUrl,
        projectRef,
        timestamp: new Date().toISOString(),
        systemHealth: systemHealthResult,
        functionProbes,
        summary: {
          total: functionProbes.length,
          healthy,
          missing,
          errors,
        },
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

  // Note: Actual deployment is handled by Lovable's auto-deploy system
  // This function triggers a re-check after user republishes
  const markDeploying = useCallback((functionName: string) => {
    setDeployingFunctions(prev => new Set(prev).add(functionName));
  }, []);

  const clearDeploying = useCallback((functionName: string) => {
    setDeployingFunctions(prev => {
      const next = new Set(prev);
      next.delete(functionName);
      return next;
    });
  }, []);

  const getMissingFunctions = useCallback(() => {
    return result?.functionProbes.filter(p => p.status === "not_deployed") ?? [];
  }, [result]);

  const getProbesByCategory = useCallback((categoryId: FunctionCategory) => {
    return result?.functionProbes.filter(p => p.category === categoryId) ?? [];
  }, [result]);

  const getCategorySummary = useCallback((categoryId: FunctionCategory) => {
    const probes = getProbesByCategory(categoryId);
    const healthy = probes.filter(p => p.status === "ok").length;
    return { total: probes.length, healthy };
  }, [getProbesByCategory]);

  return {
    checkHealth,
    isChecking,
    result,
    error,
    deployingFunctions,
    markDeploying,
    clearDeploying,
    getMissingFunctions,
    getProbesByCategory,
    getCategorySummary,
  };
}
