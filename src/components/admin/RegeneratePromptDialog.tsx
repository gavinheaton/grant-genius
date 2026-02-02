import { useState } from "react";
import { Sparkles, ArrowRight, Check, X, Edit3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface QualityScore {
  total: number;
  level: 'good' | 'warning' | 'poor';
}

interface RegeneratePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalPrompt: string;
  regeneratedPrompt: string;
  originalScore: QualityScore;
  newScore: QualityScore;
  onApply: () => void;
  onEditFirst: () => void;
}

function QualityBadge({ score }: { score: QualityScore }) {
  const colorClass =
    score.level === "good"
      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
      : score.level === "warning"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100"
      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100";

  return (
    <Badge variant="outline" className={`${colorClass} font-mono`}>
      {score.total}/100
    </Badge>
  );
}

export function RegeneratePromptDialog({
  open,
  onOpenChange,
  originalPrompt,
  regeneratedPrompt,
  originalScore,
  newScore,
  onApply,
  onEditFirst,
}: RegeneratePromptDialogProps) {
  const [originalOpen, setOriginalOpen] = useState(false);

  const scoreImproved = newScore.total > originalScore.total;
  const scoreDiff = newScore.total - originalScore.total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Regenerated Prompt Preview
          </DialogTitle>
          <DialogDescription>
            Review the AI-generated prompt improvement before applying.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden">
          {/* Score Comparison */}
          <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Quality Score:</span>
              <QualityBadge score={originalScore} />
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <QualityBadge score={newScore} />
              {scoreImproved && (
                <Badge variant="default" className="bg-green-600 text-white">
                  +{scoreDiff}
                </Badge>
              )}
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {regeneratedPrompt.length.toLocaleString()} characters
            </div>
          </div>

          {/* Original Prompt (Collapsible) */}
          <Collapsible open={originalOpen} onOpenChange={setOriginalOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                <span className="text-sm font-medium">Original Prompt</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {originalPrompt.length.toLocaleString()} chars
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${originalOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-32 rounded-md border bg-muted/30 p-3">
                <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                  {originalPrompt}
                </pre>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>

          {/* New Prompt */}
          <div className="flex-1 min-h-0">
            <div className="text-sm font-medium mb-2">Regenerated Prompt</div>
            <ScrollArea className="h-[300px] rounded-md border bg-background p-3">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {regeneratedPrompt}
              </pre>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button variant="secondary" onClick={onEditFirst}>
            <Edit3 className="h-4 w-4 mr-2" />
            Edit First
          </Button>
          <Button onClick={onApply}>
            <Check className="h-4 w-4 mr-2" />
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
