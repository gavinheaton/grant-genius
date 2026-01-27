import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Plus, Search, Pencil } from "lucide-react";

export default function Grants() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

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
            created_at
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const filteredGrants = grants?.filter(
    (grant) =>
      grant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      grant.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getLatestVersion = (versions: any[]) => {
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
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Latest Version</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Loading grants...
                </TableCell>
              </TableRow>
            ) : filteredGrants?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  No grants found
                </TableCell>
              </TableRow>
            ) : (
              filteredGrants?.map((grant) => {
                const latestVersion = getLatestVersion(grant.grant_versions);
                return (
                  <TableRow key={grant.id}>
                    <TableCell className="font-medium">{grant.name}</TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {grant.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={grant.is_active ? "default" : "secondary"}>
                        {grant.is_active ? "Active" : "Inactive"}
                      </Badge>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/admin/grants/${grant.id}`)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
