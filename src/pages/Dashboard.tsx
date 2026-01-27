import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  GraduationCap, 
  Plus, 
  Search, 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  LogOut,
  Loader2
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ApplicationStatus = "draft" | "in_progress" | "ready" | "failed";

interface Application {
  id: string;
  title: string | null;
  status: ApplicationStatus;
  updated_at: string;
  grant_version: {
    grant: {
      name: string;
    };
  };
}

const statusConfig: Record<ApplicationStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  draft: { label: "Draft", variant: "secondary", icon: FileText },
  in_progress: { label: "In Progress", variant: "default", icon: Clock },
  ready: { label: "Ready", variant: "outline", icon: CheckCircle },
  failed: { label: "Needs Attention", variant: "destructive", icon: AlertCircle },
};

export default function Dashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUser({ email: session.user.email });
      
      // Fetch applications
      const { data, error } = await supabase
        .from("applications")
        .select(`
          id,
          title,
          status,
          updated_at,
          grant_version:grant_versions!inner(
            grant:grants!inner(name)
          )
        `)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching applications:", error);
        toast({
          title: "Error loading applications",
          description: "Please try refreshing the page.",
          variant: "destructive",
        });
      } else if (data) {
        // Transform the data to match our interface
        const transformedData = data.map((app: any) => ({
          id: app.id,
          title: app.title,
          status: app.status as ApplicationStatus,
          updated_at: app.updated_at,
          grant_version: {
            grant: {
              name: app.grant_version?.grant?.name || "Unknown Grant"
            }
          }
        }));
        setApplications(transformedData);
      }
      setIsLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        navigate("/auth");
      }
    });

    checkAuthAndFetch();

    return () => subscription.unsubscribe();
  }, [navigate, toast]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Signed out",
      description: "You have been signed out successfully.",
    });
  };

  const filteredApplications = applications.filter((app) =>
    (app.grant_version?.grant?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (app.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg gradient-hero">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg hidden sm:inline-block">Grant Genius</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Applications</h1>
            <p className="text-muted-foreground">Manage your grant applications</p>
          </div>
          <Button asChild>
            <Link to="/applications/new">
              <Plus className="h-4 w-4 mr-2" />
              New Application
            </Link>
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search applications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 max-w-md"
          />
        </div>

        {/* Applications grid */}
        {filteredApplications.length === 0 ? (
          <Card className="shadow-card">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
              <p className="text-muted-foreground text-center mb-6 max-w-sm">
                Start your first grant application and let our AI assistant help you create a compelling proposal.
              </p>
              <Button asChild>
                <Link to="/applications/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Application
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApplications.map((app) => {
              const config = statusConfig[app.status];
              const StatusIcon = config.icon;
              return (
                <Card
                  key={app.id}
                  className="shadow-card hover:shadow-elevated transition-all duration-200 cursor-pointer"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{app.grant_version?.grant?.name || "Application"}</CardTitle>
                      <Badge variant={config.variant} className="flex items-center gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                    {app.title && (
                      <p className="text-sm text-muted-foreground truncate">{app.title}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <CardDescription>
                      Last updated: {new Date(app.updated_at).toLocaleDateString()}
                    </CardDescription>
                    <Button variant="ghost" size="sm" className="mt-4 w-full" asChild>
                      <Link to={`/applications/${app.id}`}>
                        Open Application
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}