import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { GraduationCap, ArrowLeft, Mail, Loader2, CheckCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && mounted) {
        navigate("/dashboard", { replace: true });
      }
    });

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
      const { error } = await supabase.functions.invoke("send-magic-link", {
        body: { email: email.trim() }
      });

      if (error) {
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

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 8) {
      toast({
        title: "Invalid code",
        description: "Please enter the full 8-digit code.",
        variant: "destructive"
      });
      return;
    }

    setIsVerifying(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode,
        type: "email",
      });

      if (error) {
        toast({
          title: "Invalid or expired code",
          description: "Please check the code and try again, or request a new one.",
          variant: "destructive"
        });
        setOtpCode("");
      }
      // If successful, onAuthStateChange will redirect to /dashboard
    } catch (error) {
      toast({
        title: "Something went wrong",
        description: "Please try again later.",
        variant: "destructive"
      });
    } finally {
      setIsVerifying(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-16 items-center">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to home</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-elevated animate-scale-in">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-xl gradient-hero">
              <GraduationCap className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl">Welcome to Grant Genius</CardTitle>
            <CardDescription>
              {isSuccess
                ? "Enter the 8-digit code from your email"
                : "Sign in with your email to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSuccess ? (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="mx-auto mb-4 flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
                    <CheckCircle className="h-8 w-8 text-success" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Check your inbox</h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    We sent an 8-digit code to <strong>{email}</strong>
                  </p>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <InputOTP
                    maxLength={8}
                    value={otpCode}
                    onChange={(value) => setOtpCode(value)}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                      <InputOTPSlot index={6} />
                      <InputOTPSlot index={7} />
                    </InputOTPGroup>
                  </InputOTP>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleVerifyOtp}
                    disabled={isVerifying || otpCode.length !== 8}
                  >
                    {isVerifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify Code"
                    )}
                  </Button>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  You can also click the sign-in link in the email.
                </p>

                <div className="flex justify-center gap-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsSuccess(false);
                      setOtpCode("");
                    }}
                  >
                    Use a different email
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMagicLink}
                    disabled={isLoading}
                  >
                    {isLoading ? "Sending..." : "Resend code"}
                  </Button>
                </div>
              </div>
            ) : (
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
                      disabled={isLoading}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending code...
                    </>
                  ) : (
                    "Continue with Email"
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  By continuing you agree to our{" "}
                  <a href="https://disruptorsco.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    Privacy Policy
                  </a>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
