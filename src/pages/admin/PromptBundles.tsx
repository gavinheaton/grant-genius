import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Edit, Copy, Trash2, CheckCircle, Circle, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  usePromptBundles,
  usePromptBundle,
  useCreatePromptBundle,
  useSetActiveBundle,
  useDeletePromptBundle,
  PromptBundle,
  PromptBundleWithSteps,
} from "@/hooks/usePromptBundles";
import { useAdminAuth } from "@/hooks/useAdminAuth";

const formatBundleForExport = (bundle: PromptBundleWithSteps): string => {
  let output = `# Bundle: ${bundle.name}\n\n`;
  output += `## System Prompt\n${bundle.system_prompt}\n\n`;
  
  const sortedSteps = [...bundle.steps].sort((a, b) => a.step_number - b.step_number);
  
  for (const step of sortedSteps) {
    output += `## Step ${step.step_number}: ${step.step_name}\n`;
    output += `Model: ${step.model_override || "Default"}\n`;
    output += `---\n${step.prompt_template}\n\n`;
  }
  
  return output;
};

export default function PromptBundles() {
  const { isSuperAdmin } = useAdminAuth();
  const { data: bundles, isLoading } = usePromptBundles();
  const createBundle = useCreatePromptBundle();
  const setActiveBundle = useSetActiveBundle();
  const deleteBundle = useDeletePromptBundle();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportBundleId, setExportBundleId] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<PromptBundle | null>(null);
  const [newBundleName, setNewBundleName] = useState("");
  const [newBundleDescription, setNewBundleDescription] = useState("");

  // Fetch full bundle data when export dialog is open
  const { data: exportBundle, isLoading: exportLoading } = usePromptBundle(
    exportDialogOpen ? exportBundleId ?? undefined : undefined
  );

  const activeBundle = bundles?.find((b) => b.is_active);

  const handleCreate = async () => {
    await createBundle.mutateAsync({
      name: newBundleName,
      description: newBundleDescription,
      system_prompt: "You are a research commercialization expert helping prepare grant applications. Provide detailed, well-researched responses. Always cite sources where possible. If data cannot be validated, clearly indicate this.",
    });
    setCreateDialogOpen(false);
    setNewBundleName("");
    setNewBundleDescription("");
  };

  const handleClone = async () => {
    if (!selectedBundle) return;
    await createBundle.mutateAsync({
      name: newBundleName || `${selectedBundle.name} (Copy)`,
      description: newBundleDescription || selectedBundle.description || undefined,
      system_prompt: selectedBundle.system_prompt,
      cloneFromId: selectedBundle.id,
    });
    setCloneDialogOpen(false);
    setSelectedBundle(null);
    setNewBundleName("");
    setNewBundleDescription("");
  };

  const handleSetActive = async () => {
    if (!selectedBundle) return;
    await setActiveBundle.mutateAsync(selectedBundle.id);
    setActivateDialogOpen(false);
    setSelectedBundle(null);
  };

  const handleDelete = async () => {
    if (!selectedBundle) return;
    await deleteBundle.mutateAsync(selectedBundle.id);
    setDeleteDialogOpen(false);
    setSelectedBundle(null);
  };

  const openCloneDialog = (bundle: PromptBundle) => {
    setSelectedBundle(bundle);
    setNewBundleName(`${bundle.name} (Copy)`);
    setNewBundleDescription(bundle.description || "");
    setCloneDialogOpen(true);
  };

  const openActivateDialog = (bundle: PromptBundle) => {
    setSelectedBundle(bundle);
    setActivateDialogOpen(true);
  };

  const openDeleteDialog = (bundle: PromptBundle) => {
    setSelectedBundle(bundle);
    setDeleteDialogOpen(true);
  };

  const openExportDialog = (bundle: PromptBundle) => {
    setExportBundleId(bundle.id);
    setExportDialogOpen(true);
  };

  const handleCopyToClipboard = async () => {
    if (!exportBundle) return;
    const text = formatBundleForExport(exportBundle);
    await navigator.clipboard.writeText(text);
    toast.success("Bundle copied to clipboard");
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72 mt-2" />
          </div>
        </div>
        <div className="grid gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Prompt Bundles</h1>
          <p className="text-muted-foreground">
            Manage the prompts used in the 10-step report generation pipeline.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Bundle
          </Button>
        )}
      </div>

      {activeBundle && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Active Bundle</CardTitle>
            </div>
            <CardDescription>
              This bundle is currently used for all new report generations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{activeBundle.name}</p>
                <p className="text-sm text-muted-foreground">
                  {activeBundle.description || "No description"}
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link to={`/admin/prompt-bundles/${activeBundle.id}`}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">All Bundles</h2>
        {bundles?.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No prompt bundles found. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {bundles?.map((bundle) => (
              <Card key={bundle.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{bundle.name}</CardTitle>
                      {bundle.is_active && (
                        <Badge variant="default" className="ml-2">Active</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isSuperAdmin && !bundle.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openActivateDialog(bundle)}
                        >
                          <Circle className="h-4 w-4 mr-1" />
                          Set Active
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/admin/prompt-bundles/${bundle.id}`}>
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openExportDialog(bundle)}
                      >
                        <FileDown className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                      {isSuperAdmin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openCloneDialog(bundle)}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Clone
                          </Button>
                          {!bundle.is_active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(bundle)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <CardDescription>
                    {bundle.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Last updated: {new Date(bundle.updated_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Bundle</DialogTitle>
            <DialogDescription>
              Create a new prompt bundle with default prompts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newBundleName}
                onChange={(e) => setNewBundleName(e.target.value)}
                placeholder="e.g., Australian Focus Bundle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newBundleDescription}
                onChange={(e) => setNewBundleDescription(e.target.value)}
                placeholder="Describe the purpose of this bundle..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newBundleName || createBundle.isPending}
            >
              Create Bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone Bundle</DialogTitle>
            <DialogDescription>
              Create a copy of "{selectedBundle?.name}" with all its prompts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="clone-name">Name</Label>
              <Input
                id="clone-name"
                value={newBundleName}
                onChange={(e) => setNewBundleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clone-description">Description (optional)</Label>
              <Textarea
                id="clone-description"
                value={newBundleDescription}
                onChange={(e) => setNewBundleDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleClone} disabled={createBundle.isPending}>
              Clone Bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate Confirmation */}
      <AlertDialog open={activateDialogOpen} onOpenChange={setActivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set Active Bundle</AlertDialogTitle>
            <AlertDialogDescription>
              This will set "{selectedBundle?.name}" as the active bundle. All new
              report generations will use the prompts from this bundle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSetActive}>
              Set Active
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bundle</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedBundle?.name}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Dialog */}
      <Dialog 
        open={exportDialogOpen} 
        onOpenChange={(open) => {
          setExportDialogOpen(open);
          if (!open) {
            setExportBundleId(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Export Bundle: "{exportBundle?.name || "Loading..."}"
            </DialogTitle>
            <DialogDescription>
              View and copy the full bundle configuration including all step prompts.
            </DialogDescription>
          </DialogHeader>
          
          {exportLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : exportBundle ? (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 py-4">
                {/* Bundle Name */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Bundle Name
                  </h3>
                  <p className="text-foreground font-medium">{exportBundle.name}</p>
                </div>

                <Separator />

                {/* System Prompt */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    System Prompt
                  </h3>
                  <pre className="bg-muted p-4 rounded-md text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                    {exportBundle.system_prompt}
                  </pre>
                </div>

                <Separator />

                {/* Step Prompts */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Step Prompts ({exportBundle.steps.length})
                  </h3>
                  <div className="space-y-4">
                    {[...exportBundle.steps]
                      .sort((a, b) => a.step_number - b.step_number)
                      .map((step) => (
                        <div key={step.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">
                              Step {step.step_number}: {step.step_name}
                            </h4>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                              Model: {step.model_override || "Default"}
                            </span>
                          </div>
                          <pre className="bg-muted p-3 rounded-md text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto">
                            {step.prompt_template}
                          </pre>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <p className="text-muted-foreground py-4">Bundle not found.</p>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={handleCopyToClipboard} disabled={!exportBundle}>
              <Copy className="h-4 w-4 mr-2" />
              Copy to Clipboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
