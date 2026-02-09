import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Search, Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface GrantVersion {
  id: string;
  version_number: number;
  is_published: boolean;
  created_at: string;
  applications: { count: number }[];
}

interface Grant {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  grant_versions: GrantVersion[];
}

export default function Grants() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [grantToArchive, setGrantToArchive] = useState<Grant | null>(null);
  const [grantToDelete, setGrantToDelete] = useState<Grant | null>(null);

  const { data: grants, isLoading } = useQuery({
    queryKey: ["admin-grants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grants")
        .select(`
          *,
          grant_versions (
            id,
            version_number,
            is_published,
            created_at,
            applications:applications(count)
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Grant[];
    },
  });

  const toggleArchiveMutation = useMutation({
    mutationFn: async (grant: Grant) => {
      const { error } = await supabase
        .from("grants")
        .update({ is_active: !grant.is_active })
        .eq("id", grant.id);
      if (error) throw error;
      return grant;
    },
    onSuccess: (grant) => {
      queryClient.invalidateQueries({ queryKey: ["admin-grants"] });
      toast({
        title: grant.is_active ? "Grant archived" : "Grant activated",
        description: grant.is_active
          ? "The grant is now hidden from researchers."
          : "The grant is now visible to researchers.",
      });
      setGrantToArchive(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update grant status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteGrantMutation = useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await supabase
        .from("grants")
        .delete()
        .eq("id", grantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-grants"] });
      toast({
        title: "Grant deleted",
        description: "The grant has been permanently deleted.",
      });
      setGrantToDelete(null);
    },
    onError: () => {
      toast({
        title: "Cannot delete grant",
        description: "This grant has existing applications and cannot be deleted. Consider archiving instead.",
        variant: "destructive",
      });
      setGrantToDelete(null);
    },
  });

  const hasApplications = (grant: Grant): boolean => {
    if (!grant.grant_versions || grant.grant_versions.length === 0) return false;
    return grant.grant_versions.some(
      (version) => version.applications && version.applications.length > 0 && version.applications[0].count > 0
    );
  };

  const getTotalApplications = (grant: Grant): number => {
    if (!grant.grant_versions || grant.grant_versions.length === 0) return 0;
    return grant.grant_versions.reduce((total, version) => {
      if (version.applications && version.applications.length > 0) {
        return total + version.applications[0].count;
      }
      return total;
    }, 0);
  };

  const filteredGrants = grants?.filter((grant) => {
    const matchesSearch =
      grant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      grant.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && grant.is_active) ||
      (statusFilter === "archived" && !grant.is_active);

    return matchesSearch && matchesStatus;
  });

  const getLatestVersion = (versions: GrantVersion[]) => {
    if (!versions || versions.length === 0) return null;
    return versions.reduce((latest, current) =>
      current.version_number > (latest?.version_number || 0) ? current : latest
    , versions[0]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Grants</h1>
          <p className="text-muted-foreground mt-1">
            Manage grant programs and their configurations
          </p>
        </div>
        <Button onClick={() => navigate("/admin/grants/new")}>
          <Plus className="h-4 w-4 mr-2" />
          New Grant
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search grants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(value: "all" | "active" | "archived") => setStatusFilter(value)}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grants</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latest Version</TableHead>
              <TableHead>Applications</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading grants...
                </TableCell>
              </TableRow>
            ) : filteredGrants?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  No grants found
                </TableCell>
              </TableRow>
            ) : (
              filteredGrants?.map((grant) => {
                const latestVersion = getLatestVersion(grant.grant_versions);
                const totalApps = getTotalApplications(grant);
                const canDelete = !hasApplications(grant);
                
                return (
                  <TableRow key={grant.id}>
                    <TableCell className="font-medium">{grant.name}</TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {grant.description || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={grant.is_active ? "default" : "secondary"}>
                          {grant.is_active ? "Active" : "Archived"}
                        </Badge>
                        {(grant as any).is_testing && (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                            Testing
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {latestVersion ? (
                        <div className="flex items-center gap-2">
                          <span>v{latestVersion.version_number}</span>
                          <Badge
                            variant={latestVersion.is_published ? "default" : "outline"}
                            className="text-xs"
                          >
                            {latestVersion.is_published ? "Published" : "Draft"}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No versions</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{totalApps}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/admin/grants/${grant.id}`)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit grant</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setGrantToArchive(grant)}
                              >
                                {grant.is_active ? (
                                  <Archive className="h-4 w-4" />
                                ) : (
                                  <ArchiveRestore className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {grant.is_active ? "Archive grant" : "Restore grant"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setGrantToDelete(grant)}
                                disabled={!canDelete}
                                className={!canDelete ? "opacity-50 cursor-not-allowed" : ""}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {canDelete
                                ? "Delete grant"
                                : "Cannot delete - has applications"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={!!grantToArchive} onOpenChange={() => setGrantToArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {grantToArchive?.is_active ? "Archive" : "Restore"} "{grantToArchive?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {grantToArchive?.is_active
                ? "This grant will be hidden from researchers but existing applications will remain accessible."
                : "This grant will become visible to researchers again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => grantToArchive && toggleArchiveMutation.mutate(grantToArchive)}
              disabled={toggleArchiveMutation.isPending}
            >
              {grantToArchive?.is_active ? "Archive Grant" : "Restore Grant"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!grantToDelete} onOpenChange={() => setGrantToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{grantToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the grant and all its versions.
              <br />
              <strong>This action cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => grantToDelete && deleteGrantMutation.mutate(grantToDelete.id)}
              disabled={deleteGrantMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Grant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
