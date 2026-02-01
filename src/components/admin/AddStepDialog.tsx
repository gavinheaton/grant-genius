import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PromptBundleStep } from "@/hooks/usePromptBundles";

interface AddStepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSteps: PromptBundleStep[];
  onAdd: (data: {
    step_name: string;
    step_description: string;
    prompt_template: string;
    insert_position: number;
  }) => void;
  isLoading?: boolean;
}

const DEFAULT_TEMPLATE = `You are a research analyst. Analyze the following information and provide insights.

## Context
{{researchContext}}

## Instructions
[Add specific instructions for this step here]

## Output Format
Respond with a structured analysis including:
- Key findings
- Supporting evidence
- Recommendations`;

export function AddStepDialog({
  open,
  onOpenChange,
  existingSteps,
  onAdd,
  isLoading,
}: AddStepDialogProps) {
  const [stepName, setStepName] = useState("");
  const [stepDescription, setStepDescription] = useState("");
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_TEMPLATE);
  const [insertPosition, setInsertPosition] = useState("end");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let position: number;
    if (insertPosition === "start") {
      position = 0;
    } else if (insertPosition === "end") {
      position = existingSteps.length;
    } else {
      position = parseInt(insertPosition) + 1;
    }

    onAdd({
      step_name: stepName,
      step_description: stepDescription,
      prompt_template: promptTemplate,
      insert_position: position,
    });

    // Reset form
    setStepName("");
    setStepDescription("");
    setPromptTemplate(DEFAULT_TEMPLATE);
    setInsertPosition("end");
  };

  const isValid = stepName.trim() && stepDescription.trim() && promptTemplate.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Step</DialogTitle>
          <DialogDescription>
            Create a new step for this pipeline. The step will be inserted at the specified position.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="step-name">Step Name</Label>
              <Input
                id="step-name"
                value={stepName}
                onChange={(e) => setStepName(e.target.value)}
                placeholder="e.g., market_analysis"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Use snake_case for the step identifier
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="insert-position">Insert Position</Label>
              <Select value={insertPosition} onValueChange={setInsertPosition}>
                <SelectTrigger>
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">At beginning (before step 0)</SelectItem>
                  {existingSteps.map((step) => (
                    <SelectItem key={step.id} value={step.step_number.toString()}>
                      After step {step.step_number}: {step.step_name}
                    </SelectItem>
                  ))}
                  <SelectItem value="end">At end (after step {existingSteps.length - 1})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="step-description">Step Description</Label>
            <Input
              id="step-description"
              value={stepDescription}
              onChange={(e) => setStepDescription(e.target.value)}
              placeholder="e.g., Analyze target market segments and opportunities"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt-template">Prompt Template</Label>
            <Textarea
              id="prompt-template"
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              rows={12}
              className="font-mono text-sm"
              placeholder="Enter the prompt template for this step..."
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{variable}}"} placeholders for dynamic values. See the Available Variables reference.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isLoading}>
              {isLoading ? "Adding..." : "Add Step"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
