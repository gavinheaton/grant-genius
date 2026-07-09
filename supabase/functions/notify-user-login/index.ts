import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const log = (step: string, details?: Record<string, unknown>) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[NOTIFY-USER-LOGIN] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    if (!supabaseUrl || !serviceKey || !brevoApiKey) {
      log("Missing env");
      return jsonResponse({ success: false, error: "not_configured" }, 200);
    }

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return jsonResponse({ success: false, error: "unauthenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ success: false, error: "invalid_token" }, 401);
    }
    const user = userData.user;

    let isTest = false;
    try {
      const body = await req.json();
      isTest = !!body?.test;
    } catch (_) {
      // no body
    }

    // Read toggle settings
    const { data: settings } = await admin
      .from("api_settings")
      .select("login_notifications_enabled, login_notifications_recipient")
      .limit(1)
      .maybeSingle();

    const enabled = !!settings?.login_notifications_enabled;
    const recipient = settings?.login_notifications_recipient?.trim() || "grantgenius@disruptorsco.com";

    if (!enabled && !isTest) {
      log("Disabled, skipping");
      return jsonResponse({ success: true, skipped: true });
    }

    // Dedupe: skip if we've already notified this user in the past 5 minutes
    if (!isTest) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from("app_events")
        .select("id")
        .eq("user_id", user.id)
        .eq("event_name", "login_notified")
        .gte("created_at", fiveMinAgo)
        .limit(1);
      if (recent && recent.length > 0) {
        log("Deduped");
        return jsonResponse({ success: true, deduped: true });
      }
    }

    // Fetch profile for name
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    const name = profile?.full_name?.trim() || user.user_metadata?.full_name || "(no name on file)";
    const email = profile?.email || user.email || "(unknown)";
    const when = new Date().toISOString();

    const subject = isTest
      ? `[TEST] Grant Genius login notification`
      : `Grant Genius sign-in: ${name === "(no name on file)" ? email : name}`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="background: white; border-radius: 12px; padding: 28px;">
    <h2 style="margin-top:0; color:#4F46E5;">${isTest ? "Test: user login notification" : "A user signed in to Grant Genius"}</h2>
    <table style="width:100%; border-collapse:collapse; font-size:14px; color:#111827;">
      <tr><td style="padding:6px 0; color:#6B7280;">Name</td><td style="padding:6px 0;"><strong>${escapeHtml(name)}</strong></td></tr>
      <tr><td style="padding:6px 0; color:#6B7280;">Email</td><td style="padding:6px 0;"><strong>${escapeHtml(email)}</strong></td></tr>
      <tr><td style="padding:6px 0; color:#6B7280;">User ID</td><td style="padding:6px 0; font-family:monospace; font-size:12px;">${escapeHtml(user.id)}</td></tr>
      <tr><td style="padding:6px 0; color:#6B7280;">Signed in at</td><td style="padding:6px 0;">${when}</td></tr>
    </table>
    <p style="margin-top:24px; color:#6B7280; font-size:12px;">You can disable these notifications in Admin → Login Notifications.</p>
  </div>
</body>
</html>`;

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
        to: [{ email: recipient }],
        subject,
        htmlContent,
      }),
    });

    if (!brevoRes.ok) {
      const errText = await brevoRes.text();
      log("Brevo error", { status: brevoRes.status, error: errText });
      return jsonResponse({ success: false, error: "brevo_failed", status: brevoRes.status }, 200);
    }

    // Record the event (service role, bypasses RLS)
    if (!isTest) {
      await admin.from("app_events").insert({
        user_id: user.id,
        event_name: "login_notified",
        event_data_json: { email, recipient },
      });
    }

    log("Sent", { recipient, isTest });
    return jsonResponse({ success: true, sent: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return jsonResponse({ success: false, error: msg }, 200);
  }
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
