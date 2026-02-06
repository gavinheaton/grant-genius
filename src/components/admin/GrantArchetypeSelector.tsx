import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Lightbulb, 
  FlaskConical, 
  Building2, 
  Heart, 
  Globe, 
  Leaf, 
  Stethoscope, 
  Shield, 
  Palette, 
  GraduationCap,
  Sparkles,
  Info
} from "lucide-react";
import { 
  GRANT_ARCHETYPES, 
  GrantArchetype, 
  ARCHETYPE_KEYWORDS,
  selectModulesForArchetype 
} from "@/lib/bundleGeneratorSpec";

const ARCHETYPE_ICONS: Record<GrantArchetype, React.ComponentType<{ className?: string }>> = {
  "Commercialisation/Innovation": Lightbulb,
  "R&D/Research": FlaskConical,
  "Infrastructure/Capability": Building2,
  "Social Impact/Community": Heart,
  "Export/Trade": Globe,
  "Climate/Environment": Leaf,
  "Health/Clinical Translation": Stethoscope,
  "Defence/Sovereign Capability": Shield,
  "Arts/Culture": Palette,
  "Education/Workforce": GraduationCap,
};

const ARCHETYPE_DESCRIPTIONS: Record<GrantArchetype, string> = {
  "Commercialisation/Innovation": "Market-focused grants for startups, IP commercialisation, and scale-ups",
  "R&D/Research": "Scientific research, prototypes, and proof-of-concept projects",
  "Infrastructure/Capability": "Equipment, facilities, and capacity building grants",
  "Social Impact/Community": "Community welfare, inclusion, and non-profit initiatives",
  "Export/Trade": "International market entry and export development programs",
  "Climate/Environment": "Sustainability, emissions reduction, and environmental projects",
  "Health/Clinical Translation": "Medical devices, therapeutics, and clinical translation",
  "Defence/Sovereign Capability": "Defence industry and sovereign capability building",
  "Arts/Culture": "Creative industries, heritage, and cultural programs",
  "Education/Workforce": "Skills development, training, and workforce programs",
};

interface GrantArchetypeSelectorProps {
  value: GrantArchetype;
  confidence: "high" | "medium" | "low";
  onValueChange: (archetype: GrantArchetype) => void;
  disabled?: boolean;
  showModules?: boolean;
}

export function GrantArchetypeSelector({
  value,
  confidence,
  onValueChange,
  disabled = false,
  showModules = true,
}: GrantArchetypeSelectorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const Icon = ARCHETYPE_ICONS[value];
  const selectedModules = selectModulesForArchetype(value);

  const confidenceBadgeVariant = {
    high: "default" as const,
    medium: "secondary" as const,
    low: "outline" as const,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-lg">Grant Archetype</CardTitle>
          </div>
          <Badge variant={confidenceBadgeVariant[confidence]}>
            {confidence} confidence
          </Badge>
        </div>
        <CardDescription>
          AI-detected classification determines which research modules are included
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Select
            value={value}
            onValueChange={(v) => onValueChange(v as GrantArchetype)}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span>{value}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {GRANT_ARCHETYPES.map((archetype) => {
                const ArchetypeIcon = ARCHETYPE_ICONS[archetype];
                return (
                  <SelectItem key={archetype} value={archetype}>
                    <div className="flex items-center gap-2">
                      <ArchetypeIcon className="h-4 w-4" />
                      <span>{archetype}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDetails(!showDetails)}
              >
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Show archetype details</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <p className="text-sm text-muted-foreground">
          {ARCHETYPE_DESCRIPTIONS[value]}
        </p>

        {showDetails && (
          <div className="space-y-3 pt-2 border-t">
            <div>
              <h4 className="text-sm font-medium mb-2">Detection Keywords</h4>
              <div className="flex flex-wrap gap-1">
                {ARCHETYPE_KEYWORDS[value].map((keyword) => (
                  <Badge key={keyword} variant="outline" className="text-xs">
                    {keyword}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {showModules && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-medium">Included Research Modules</h4>
            <div className="flex flex-wrap gap-1.5">
              {selectedModules.map((module) => (
                <Tooltip key={module.module_name}>
                  <TooltipTrigger>
                    <Badge
                      variant={module.always_include ? "default" : "secondary"}
                      className="text-xs cursor-help"
                    >
                      {module.module_name.replace(/_/g, " ")}
                      {module.always_include && " *"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="font-medium">{module.step_template.role_goal}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Phase: {module.step_template.phase} | Model: {module.step_template.model_tier}
                    </p>
                    {module.always_include && (
                      <p className="text-xs text-primary mt-1">* Universal module (all archetypes)</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedModules.length} modules selected for this archetype
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact version for inline use
export function GrantArchetypeBadge({
  archetype,
  confidence,
}: {
  archetype: GrantArchetype;
  confidence: "high" | "medium" | "low";
}) {
  const Icon = ARCHETYPE_ICONS[archetype];

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="outline" className="gap-1.5 cursor-help">
          <Icon className="h-3 w-3" />
          <span className="text-xs">{archetype.split("/")[0]}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          <p className="font-medium">{archetype}</p>
          <p className="text-xs text-muted-foreground">
            Detection confidence: {confidence}
          </p>
          <p className="text-xs">{ARCHETYPE_DESCRIPTIONS[archetype]}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
