import { AlertTriangle, Server, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type ExecutionEngine = "cloud_run" | "edge";

interface EngineSettingsCardProps {
  executionEngineDefault: ExecutionEngine;
  edgeAllowed: boolean;
  onEngineChange: (engine: ExecutionEngine) => void;
  onEdgeAllowedChange: (allowed: boolean) => void;
  isSuperAdmin: boolean;
  disabled?: boolean;
}

export function EngineSettingsCard({
  executionEngineDefault,
  edgeAllowed,
  onEngineChange,
  onEdgeAllowedChange,
  isSuperAdmin,
  disabled = false,
}: EngineSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Execution Engine Settings
        </CardTitle>
        <CardDescription>
          Configure how report generation runs are processed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Edge Allowed Toggle - Super Admin Only */}
        {isSuperAdmin && (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="edge-allowed" className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                Allow Edge Execution (Debug Only)
              </Label>
              <p className="text-sm text-muted-foreground">
                Enable Edge function execution for debugging purposes
              </p>
            </div>
            <Switch
              id="edge-allowed"
              checked={edgeAllowed}
              onCheckedChange={onEdgeAllowedChange}
              disabled={disabled}
            />
          </div>
        )}

        {edgeAllowed && (
          <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              Edge functions have a 60-second timeout limit. Use only for debugging short runs.
            </AlertDescription>
          </Alert>
        )}

        {/* Default Execution Engine Dropdown */}
        <div className="space-y-2">
          <Label htmlFor="execution-engine">Default Execution Engine</Label>
          <Select
            value={executionEngineDefault}
            onValueChange={(value) => onEngineChange(value as ExecutionEngine)}
            disabled={disabled || !isSuperAdmin}
          >
            <SelectTrigger id="execution-engine">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cloud_run">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span>Cloud Run (Recommended)</span>
                </div>
              </SelectItem>
              {edgeAllowed && (
                <SelectItem value="edge">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span>Edge Functions (Debug Only)</span>
                  </div>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {executionEngineDefault === "cloud_run" 
              ? "Cloud Run has no timeout limits and is recommended for production."
              : "Edge functions are limited to 60 seconds per step. Use for debugging only."}
          </p>
        </div>

        {!isSuperAdmin && (
          <p className="text-sm text-muted-foreground italic">
            Only Super Admins can modify execution engine settings.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
