import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle, AlertTriangle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { FunctionHealthCard } from "./FunctionHealthCard";
import type { FunctionProbeResult, FunctionCategoryInfo } from "@/hooks/useBackendHealth";

interface FunctionCategorySectionProps {
  category: FunctionCategoryInfo;
  probes: FunctionProbeResult[];
  deployingFunctions: Set<string>;
  onRequestDeploy: (functionName: string) => void;
}

export function FunctionCategorySection({ 
  category, 
  probes, 
  deployingFunctions,
  onRequestDeploy 
}: FunctionCategorySectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  
  const healthy = probes.filter(p => p.status === "ok").length;
  const total = probes.length;
  const allHealthy = healthy === total;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg transition-colors">
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium">{category.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {allHealthy ? (
              <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                <CheckCircle className="h-3 w-3" />
                {healthy}/{total}
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {healthy}/{total}
              </Badge>
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 pl-6 pr-2 pb-2">
          {probes.map((probe) => (
            <FunctionHealthCard
              key={probe.name}
              probe={probe}
              isDeploying={deployingFunctions.has(probe.name)}
              onRequestDeploy={() => onRequestDeploy(probe.name)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
