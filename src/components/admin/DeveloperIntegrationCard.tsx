import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Key, Copy, Eye, EyeOff, ChevronDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function DeveloperIntegrationCard() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [isRevealed, setIsRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Auto-hide after 60 seconds
  useEffect(() => {
    if (!isRevealed || !apiKey) return;
    const timer = setTimeout(() => {
      setIsRevealed(false);
      setApiKey(null);
    }, 60000);
    return () => clearTimeout(timer);
  }, [isRevealed, apiKey]);

  const revealKey = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-api-key");
      if (error) throw error;
      setApiKey(data.api_key);
      setBaseUrl(data.base_url);
      setIsRevealed(true);
    } catch (err) {
      console.error("Failed to fetch API key:", err);
      toast.error("Failed to retrieve API key");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const maskedKey = apiKey ? apiKey.substring(0, 8) + "•".repeat(24) + apiKey.slice(-4) : "";
  const derivedBaseUrl = baseUrl || `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          Developer Integration
        </CardTitle>
        <CardDescription>
          API credentials and integration guide for external applications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Key */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">API Key</label>
          {!apiKey ? (
            <Button onClick={revealKey} variant="outline" size="sm" disabled={isLoading}>
              <Eye className="h-4 w-4 mr-2" />
              {isLoading ? "Loading…" : "Reveal API Key"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono break-all">
                {isRevealed ? apiKey : maskedKey}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsRevealed(!isRevealed)}
                title={isRevealed ? "Hide" : "Show"}
              >
                {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(apiKey, "API Key")}
                title="Copy"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Base URL */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Base URL</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-3 py-2 rounded-md text-sm font-mono">
              {derivedBaseUrl}
            </code>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => copyToClipboard(derivedBaseUrl, "Base URL")}
              title="Copy"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Security Warning */}
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
          <p className="text-muted-foreground">
            This key grants full API access <strong>without credit checks</strong>. Only share with trusted applications.
          </p>
        </div>

        {/* Integration Guide */}
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-0">
              <span className="text-sm font-medium">Integration Guide</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${guideOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-2">
            {/* Generate Report */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="default">POST</Badge>
                <code className="text-sm font-mono">/api-generate-report</code>
              </div>
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre">{`// Trigger a report
const res = await fetch(BASE_URL + "/api-generate-report", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <API_KEY>",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    summary: "Research summary text...",       // required
    public_article_url: "https://...",         // optional
    client_name: "my-app",                     // optional
    webhook_url: "https://my-app.com/webhook"  // optional
  })
});
// → { run_id, application_id, poll_url }`}</pre>
            </div>

            {/* Report Status */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">GET</Badge>
                <code className="text-sm font-mono">/api-report-status?run_id=&lt;uuid&gt;</code>
              </div>
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre">{`// Poll for results (pipeline takes ~10-20 min)
const res = await fetch(
  BASE_URL + "/api-report-status?run_id=" + runId,
  { headers: { "Authorization": "Bearer <API_KEY>" } }
);
// → { status, current_step, total_steps, phase }
// When completed:
// → { status: "completed", report_html, citations }`}</pre>
            </div>

            {/* Cancel Report */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">POST</Badge>
                <code className="text-sm font-mono">/api-cancel-report</code>
              </div>
              <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto whitespace-pre">{`// Cancel a running report
const res = await fetch(BASE_URL + "/api-cancel-report", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <API_KEY>",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    run_id: "<run_id>",           // required
    client_name: "my-app"         // optional
  })
});
// → { success: true, message: "Report generation cancelled" }
// Already stopped:
// → { success: true, message: "...", already_stopped: true }`}</pre>
            </div>

            {/* Webhook */}
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Webhook Callback</p>
              <p className="text-xs text-muted-foreground">
                If <code className="bg-muted px-1 rounded">webhook_url</code> is provided, a POST request is sent on completion with <code className="bg-muted px-1 rounded">{`{ run_id, status, report_html, citations }`}</code>.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
