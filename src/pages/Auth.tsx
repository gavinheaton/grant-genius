import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, ArrowLeft, Mail, Loader2, CheckCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Check for existing session and redirect if logged in
  useEffect(() => {
    let mounted = true;

    // Set up auth state change listener FIRST (important for magic link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && mounted) {
        navigate("/dashboard", { replace: true });
      }
    });

    // Then check for existing session
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && mounted) {
        navigate("/dashboard", { replace: true });
      } else if (mounted) {
        setIsCheckingSession(false);
      }
    };

    checkSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (error) {
        // Generic error to prevent account enumeration
        toast({
          title: "Unable to send link",
          description: "Please check your email address and try again.",
          variant: "destructive"
        });
      } else {
        setIsSuccess(true);
      }
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking session
  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>);

  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container flex h-16 items-center">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to home</span>
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-elevated animate-scale-in">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-xl gradient-hero">
              <GraduationCap className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Welcome to Grant Genius</CardTitle>
            <CardDescription>
              {isSuccess ?
              "Check your email for the magic link" :
              "Sign in with your email to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSuccess ?
            <div className="text-center py-6">
                <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Check your inbox</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  We've sent a magic link to <strong>{email}</strong>. Click the link to sign in.
                </p>
                <Button
                variant="outline"
                onClick={() => {
                  setIsSuccess(false);
                  setEmail("");
                }}>

                  Use a different email
                </Button>
              </div> :

            <form onSubmit={handleMagicLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                    id="email"
                    type="email"
                    placeholder="researcher@university.edu.au"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={isLoading} />

                  </div>
                </div>
                <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isLoading}>

                  {isLoading ?
                <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending magic link...
                    </> :

                "Continue with Email"
                }
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  By continuing, you agree to our{" "}
                  

                {" "}
                  and{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    Privacy Policy
                  </Link>
                </p>
              </form>
            }
          </CardContent>
        </Card>
      </main>
    </div>);

}