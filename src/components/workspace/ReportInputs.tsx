import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ApplicationInputs {
  publicArticleUrl: string;
  summary: string;
  trl: string;
  ipStatus: string;
}

interface ReportInputsProps {
  inputs: ApplicationInputs;
  onInputChange: (field: keyof ApplicationInputs, value: string) => void;
  disabled?: boolean;
}

export function ReportInputs({ inputs, onInputChange, disabled }: ReportInputsProps) {
  const wordCount = inputs.summary.trim().split(/\s+/).filter(Boolean).length;

  return (
    <Card className="shadow-card">
      <CardHeader>
        <CardTitle>Research Details</CardTitle>
        <CardDescription>
          Provide your published article and a brief summary. The AI will generate a complete commercialization research report.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Public Article URL */}
        <div className="space-y-2">
          <Label htmlFor="publicArticleUrl">
            Public Article URL <span className="text-destructive">*</span>
          </Label>
          <Input
            id="publicArticleUrl"
            type="url"
            placeholder="https://doi.org/..."
            value={inputs.publicArticleUrl}
            onChange={(e) => onInputChange("publicArticleUrl", e.target.value)}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            Link to a published article or preprint describing your research
          </p>
        </div>

        {/* 100-word Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="summary">
              100-Word Summary <span className="text-destructive">*</span>
            </Label>
            <span className={`text-xs ${wordCount > 100 ? "text-destructive" : "text-muted-foreground"}`}>
              {wordCount}/100 words
            </span>
          </div>
          <Textarea
            id="summary"
            placeholder="Write a concise summary of your research and its commercialization potential..."
            value={inputs.summary}
            onChange={(e) => onInputChange("summary", e.target.value)}
            rows={4}
            className="resize-none"
            disabled={disabled}
          />
        </div>

        {/* Optional Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="trl">Technology Readiness Level (TRL)</Label>
            <Input
              id="trl"
              placeholder="e.g., TRL 4"
              value={inputs.trl}
              onChange={(e) => onInputChange("trl", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ipStatus">IP Status</Label>
            <Input
              id="ipStatus"
              placeholder="e.g., Patent pending"
              value={inputs.ipStatus}
              onChange={(e) => onInputChange("ipStatus", e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
