import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Save, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function LoginNotifications() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [recipient, setRecipient] = useState("grantgenius@disruptorsco.com");
  const [rowId, setRowId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("api_settings")
        .select("id, login_notifications_enabled, login_notifications_recipient")
        .limit(1)
        .maybeSingle();
      if (!error && data) {
        setRowId(data.id);
        setEnabled(!!data.login_notifications_enabled);
        setRecipient(data.login_notifications_recipient || "grantgenius@disruptorsco.com");
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!rowId) return;
    setSaving(true);
    const { error } = await supabase
      .from("api_settings")
      .update({
        login_notifications_enabled: enabled,
        login_notifications_recipient: recipient.trim(),
      })
      .eq("id", rowId);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Settings saved" });
    }
  };

  const sendTest = async () => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("notify-user-login", {
      body: { test: true },
    });
    setTesting(false);
    if (error || (data && data.success === false)) {
      toast({
        title: "Test failed",
        description: error?.message || (data as { error?: string })?.error || "Unknown error",
        variant: "destructive",
      });
    } else {
      toast({ title: "Test email sent", description: `Delivered to ${recipient}` });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Login Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Receive an email whenever a user signs in to Grant Genius.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            When enabled, a notification email is sent (with the user's name and email address) to
            the recipient below on every sign-in. Repeat sign-ins by the same user within 5 minutes
            are deduplicated to avoid noise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label className="text-base">Email me when a user logs in</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Toggle notifications on or off.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient email</Label>
            <Input
              id="recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="admin@example.com"
            />
            <p className="text-xs text-muted-foreground">
              Notifications are sent to this address.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save settings
            </Button>
            <Button variant="outline" onClick={sendTest} disabled={testing || !recipient.trim()}>
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send test email
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
