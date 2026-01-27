import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  GraduationCap, 
  ArrowLeft, 
  FileText, 
  Library, 
  Download,
  Loader2,
  CheckCircle,
  Sparkles
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ApplicationInputs {
  technicalDescription: string;
  publicArticleUrl: string;
  summary: string;
  trl: string;
  ipStatus: string;
}

interface ApplicationData {
  id: string;
  title: string | null;
  status: string;
  inputs_json: ApplicationInputs;
  grant_version: {
    grant: {
      name: string;
    };
  };
}

export default function ApplicationWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("inputs");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [inputs, setInputs] = useState<ApplicationInputs>({
    technicalDescription: "",
    publicArticleUrl: "",
    summary: "",
    trl: "",
    ipStatus: "",
  });

  useEffect(() => {
    const fetchApplication = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }

      if (!id) {
        navigate("/dashboard");
        return;
      }

      const { data, error } = await supabase
        .from("applications")
        .select(`
          id,
          title,
          status,
          inputs_json,
          grant_version:grant_versions!inner(
            grant:grants!inner(name)
          )
        `)
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching application:", error);
        toast({
          title: "Error loading application",
          description: "Please try again.",
          variant: "destructive",
        });
        navigate("/dashboard");
      } else if (data) {
        const inputsData = data.inputs_json as Record<string, unknown> || {};
        const appData = {
          id: data.id,
          title: data.title,
          status: data.status,
          inputs_json: {
            technicalDescription: (inputsData.technicalDescription as string) || "",
            publicArticleUrl: (inputsData.publicArticleUrl as string) || "",
            summary: (inputsData.summary as string) || "",
            trl: (inputsData.trl as string) || "",
            ipStatus: (inputsData.ipStatus as string) || "",
          },
          grant_version: {
            grant: {
              name: (data.grant_version as any)?.grant?.name || "Unknown Grant"
            }
          }
        };
        setApplication(appData);
        setInputs(appData.inputs_json);
      } else {
        toast({
          title: "Application not found",
          description: "The application you're looking for doesn't exist.",
          variant: "destructive",
        });
        navigate("/dashboard");
      }
      setIsLoading(false);
    };

    fetchApplication();
  }, [id, navigate, toast]);

  // Save inputs to database
  const saveInputs = useCallback(async () => {
    if (!id) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from("applications")
      .update({ inputs_json: JSON.parse(JSON.stringify(inputs)) })
      .eq("id", id);

    if (error) {
      console.error("Error saving:", error);
    } else {
      setLastSaved(new Date());
    }
    setIsSaving(false);
  }, [id, inputs]);

  // Debounced autosave
  useEffect(() => {
    if (!application) return;
    
    const timer = setTimeout(() => {
      if (inputs.technicalDescription || inputs.summary || inputs.publicArticleUrl) {
        saveInputs();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [inputs, saveInputs, application]);

  const handleInputChange = (field: keyof ApplicationInputs, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const wordCount = inputs.summary.trim().split(/\s+/).filter(Boolean).length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!application) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-hero">
                <GraduationCap className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-sm font-semibold">{application.grant_version.grant.name}</h1>
                <p className="text-xs text-muted-foreground">Application #{id?.slice(0, 8)}</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle className="h-3 w-3 text-success" />
                  <span>Saved {lastSaved.toLocaleTimeString()}</span>
                </>
              ) : null}
            </div>
            <Badge variant="secondary" className="capitalize">{application.status.replace("_", " ")}</Badge>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-4">
            <TabsTrigger value="inputs" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Inputs</span>
            </TabsTrigger>
            <TabsTrigger value="sections" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Sections</span>
            </TabsTrigger>
            <TabsTrigger value="evidence" className="flex items-center gap-2">
              <Library className="h-4 w-4" />
              <span className="hidden sm:inline">Evidence</span>
            </TabsTrigger>
            <TabsTrigger value="finalize" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Finalize</span>
            </TabsTrigger>
          </TabsList>

          {/* Inputs Tab */}
          <TabsContent value="inputs" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Application Inputs</CardTitle>
                <CardDescription>
                  Provide the core information for your grant application. Changes are saved automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Technical Description */}
                <div className="space-y-2">
                  <Label htmlFor="technicalDescription">
                    Research Technical Description <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="technicalDescription"
                    placeholder="Describe your research innovation, methodology, and technical approach..."
                    value={inputs.technicalDescription}
                    onChange={(e) => handleInputChange("technicalDescription", e.target.value)}
                    rows={6}
                    className="resize-none"
                  />
                </div>

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
                    onChange={(e) => handleInputChange("publicArticleUrl", e.target.value)}
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
                    placeholder="Write a concise summary of your research commercialisation potential..."
                    value={inputs.summary}
                    onChange={(e) => handleInputChange("summary", e.target.value)}
                    rows={4}
                    className="resize-none"
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
                      onChange={(e) => handleInputChange("trl", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ipStatus">IP Status</Label>
                    <Input
                      id="ipStatus"
                      placeholder="e.g., Patent pending"
                      value={inputs.ipStatus}
                      onChange={(e) => handleInputChange("ipStatus", e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sections Tab */}
          <TabsContent value="sections" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Generated Sections</CardTitle>
                <CardDescription>
                  AI-generated content sections based on your inputs. Review and regenerate as needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-16 text-center">
                <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                  <Sparkles className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Complete your inputs first</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  Fill in the required inputs to generate AI-powered sections for your application.
                </p>
                <Button variant="outline" onClick={() => setActiveTab("inputs")}>
                  Go to Inputs
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Evidence Tab */}
          <TabsContent value="evidence" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Evidence Library</CardTitle>
                <CardDescription>
                  Upload and manage supporting documents, references, and citations.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-16 text-center">
                <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                  <Library className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No evidence items yet</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  Add URLs, documents, and references to support your application.
                </p>
                <Button variant="outline">
                  Add Evidence
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Finalize Tab */}
          <TabsContent value="finalize" className="space-y-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Finalize & Export</CardTitle>
                <CardDescription>
                  Generate your final report and download in PDF or DOCX format.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-16 text-center">
                <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                  <Download className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Complete all sections first</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  Generate and review all sections before finalizing your application report.
                </p>
                <Button variant="outline" onClick={() => setActiveTab("sections")}>
                  Go to Sections
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}