import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GraduationCap, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Grant {
  id: string;
  name: string;
  description: string | null;
  latest_version_id: string;
}

export default function NewApplication() {
  const [selectedGrant, setSelectedGrant] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGrants, setIsLoadingGrants] = useState(true);
  const [grants, setGrants] = useState<Grant[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuthAndFetchGrants = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();

      const isAdmin = !!roleData;

      // Fetch grants with their latest published version
      const query = supabase
        .from("grants")
        .select(`
          id,
          name,
          description,
          is_testing,
          grant_versions!inner(id)
        `)
        .eq("is_active", true)
        .eq("grant_versions.is_published", true)
        .order("name");

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching grants:", error);
        toast({
          title: "Error loading grants",
          description: "Please try refreshing the page.",
          variant: "destructive",
        });
      } else if (data) {
        // Filter out testing grants for non-admin users
        const filtered = isAdmin ? data : data.filter((g: any) => !g.is_testing);
        const transformedGrants = filtered.map((grant: any) => ({
          id: grant.id,
          name: grant.name,
          description: grant.description,
          latest_version_id: grant.grant_versions[0]?.id
        }));
        setGrants(transformedGrants);
      }
      setIsLoadingGrants(false);
    };

    checkAuthAndFetchGrants();
  }, [navigate, toast]);

  const handleCreateApplication = async () => {
    if (!selectedGrant) {
      toast({
        title: "Select a grant",
        description: "Please select a grant program to continue.",
        variant: "destructive",
      });
      return;
    }

    const grant = grants.find((g) => g.id === selectedGrant);
    if (!grant?.latest_version_id) {
      toast({
        title: "Error",
        description: "No published version available for this grant.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("applications")
        .insert({
          user_id: user.id,
          grant_version_id: grant.latest_version_id,
          title: `${grant.name} Application`,
          status: "draft",
          inputs_json: {}
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating application:", error);
        toast({
          title: "Error creating application",
          description: error.message,
          variant: "destructive",
        });
      } else if (data) {
        toast({
          title: "Application created",
          description: "Your new application has been created successfully.",
        });
        navigate(`/applications/${data.id}`);
      }
    } catch (error) {
      console.error("Error:", error);
      toast({
        title: "Something went wrong",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedGrantDetails = grants.find((g) => g.id === selectedGrant);

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to dashboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-hero">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container py-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">New Application</h1>
          <p className="text-muted-foreground">
            Select a grant program to start your application
          </p>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Select Grant Program</CardTitle>
            <CardDescription>
              Choose the commercialisation grant you're applying for. Your application will be tailored to the specific requirements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="grant">Grant Program</Label>
              <Select value={selectedGrant} onValueChange={setSelectedGrant} disabled={isLoadingGrants}>
                <SelectTrigger id="grant" className="bg-background">
                  <SelectValue placeholder={isLoadingGrants ? "Loading grants..." : "Select a grant program"} />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {grants.map((grant) => (
                    <SelectItem key={grant.id} value={grant.id}>
                      {grant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedGrantDetails && (
              <div className="p-4 rounded-lg bg-muted/50 border animate-fade-in">
                <h4 className="font-medium mb-1">{selectedGrantDetails.name}</h4>
                <p className="text-sm text-muted-foreground">
                  {selectedGrantDetails.description || "No description available"}
                </p>
              </div>
            )}

            <Button
              onClick={handleCreateApplication}
              disabled={!selectedGrant || isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating application...
                </>
              ) : (
                <>
                  Continue to Application
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}