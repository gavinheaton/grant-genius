import { useState, useEffect } from "react";
import { Sparkles, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RequiredInput {
  key: string;
  label: string;
  type: string;
  required: boolean;
  help_text?: string;
  max_length?: number;
  source_section?: string;
}

interface RubricSection {
  key: string;
  title: string;
  description?: string;
  criteria: string[];
  weight?: number;
}

interface Suggestions {
  required_inputs: RequiredInput[];
  rubric: { sections: RubricSection[] };
  grant_summary: string;
}

interface AIAnalysisPanelProps {
  versionId: string;
  guidelinesText: string | null;
  analysisStatus: string;
  suggestions: Suggestions | null;
  onAnalysisComplete: () => void;
  onApplySuggestions: (inputs: RequiredInput[], rubric: { sections: RubricSection[] }) => void;
}

export function AIAnalysisPanel({
  versionId,
  guidelinesText,
  analysisStatus,
  suggestions,
  onAnalysisComplete,
  onApplySuggestions,
}: AIAnalysisPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedInputs, setSelectedInputs] = useState<Set<string>>(new Set());
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Initialize selections when suggestions change
  useEffect(() => {
    if (suggestions?.required_inputs && Array.isArray(suggestions.required_inputs)) {
      setSelectedInputs(new Set(suggestions.required_inputs.map((i) => i.key)));
    }
    if (suggestions?.rubric?.sections && Array.isArray(suggestions.rubric.sections)) {
      setSelectedSections(new Set(suggestions.rubric.sections.map((s) => s.key)));
    }
  }, [suggestions]);

  const handleAnalyze = async () => {
    if (!guidelinesText) {
      toast({
        title: "No guidelines",
        description: "Please upload a guidelines PDF first",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-grant-guidelines`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            grant_version_id: versionId,
            guidelines_text: guidelinesText,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed");
      }

      // Initialize selections with all items
      if (data.suggestions) {
        setSelectedInputs(new Set(data.suggestions.required_inputs.map((i: RequiredInput) => i.key)));
        setSelectedSections(new Set(data.suggestions.rubric.sections.map((s: RubricSection) => s.key)));
      }

      toast({
        title: "Analysis complete",
        description: "Review the suggested inputs and rubric below",
      });

      onAnalysisComplete();
    } catch (error) {
      console.error("Analysis error:", error);
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApply = () => {
    if (!suggestions) return;

    const filteredInputs = suggestions.required_inputs.filter((i) =>
      selectedInputs.has(i.key)
    );
    const filteredRubric = {
      sections: suggestions.rubric.sections.filter((s) =>
        selectedSections.has(s.key)
      ),
    };

    onApplySuggestions(filteredInputs, filteredRubric);
  };

  const toggleInput = (key: string) => {
    const newSet = new Set(selectedInputs);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedInputs(newSet);
  };

  const toggleSection = (key: string) => {
    const newSet = new Set(selectedSections);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedSections(newSet);
  };

  const statusIcon = {
    pending: <AlertCircle className="h-4 w-4 text-muted-foreground" />,
    analyzing: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
    completed: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Analysis
              </CardTitle>
              <CardDescription>
                Extract required inputs and rubric from guidelines
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="flex items-center gap-1">
                {statusIcon[analysisStatus as keyof typeof statusIcon] || statusIcon.pending}
                {analysisStatus || "pending"}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !guidelinesText}
            className="w-full"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing Guidelines...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Analyze with AI
              </>
            )}
          </Button>
          {!guidelinesText && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Upload guidelines PDF first
            </p>
          )}
        </CardContent>
      </Card>

      {suggestions && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Grant Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">{suggestions.grant_summary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Suggested Required Inputs
                <Badge variant="secondary" className="ml-2">
                  {selectedInputs.size} / {suggestions.required_inputs?.length ?? 0}
                </Badge>
              </CardTitle>
              <CardDescription>
                Select which inputs to include in the grant version
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-4">
                  {(suggestions.required_inputs ?? []).map((input) => (
                    <div
                      key={input.key}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                    >
                      <Checkbox
                        id={input.key}
                        checked={selectedInputs.has(input.key)}
                        onCheckedChange={() => toggleInput(input.key)}
                      />
                      <div className="flex-1">
                        <Label htmlFor={input.key} className="font-medium cursor-pointer">
                          {input.label}
                        </Label>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {input.type}
                          </Badge>
                          {input.required && (
                            <Badge variant="secondary" className="text-xs">
                              Required
                            </Badge>
                          )}
                          {input.source_section && (
                            <Badge variant="outline" className="text-xs">
                              {input.source_section}
                            </Badge>
                          )}
                        </div>
                        {input.help_text && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {input.help_text}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Suggested Rubric Sections
                <Badge variant="secondary" className="ml-2">
                  {selectedSections.size} / {suggestions.rubric?.sections?.length ?? 0}
                </Badge>
              </CardTitle>
              <CardDescription>
                Select which assessment criteria to include
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-4">
                  {(suggestions.rubric?.sections ?? []).map((section) => (
                    <div
                      key={section.key}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                    >
                      <Checkbox
                        id={section.key}
                        checked={selectedSections.has(section.key)}
                        onCheckedChange={() => toggleSection(section.key)}
                      />
                      <div className="flex-1">
                        <Label htmlFor={section.key} className="font-medium cursor-pointer">
                          {section.title}
                          {section.weight && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {section.weight}%
                            </Badge>
                          )}
                        </Label>
                        {section.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {section.description}
                          </p>
                        )}
                        <ul className="mt-2 space-y-1">
                          {section.criteria.map((criterion, idx) => (
                            <li
                              key={idx}
                              className="text-sm text-muted-foreground flex items-center gap-2"
                            >
                              <span className="w-1 h-1 rounded-full bg-primary" />
                              {criterion}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Separator />

          <div className="flex justify-end">
            <Button onClick={handleApply} size="lg">
              <CheckCircle className="h-4 w-4 mr-2" />
              Apply Selected Suggestions
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
