import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-MAGIC-LINK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    const appUrl = Deno.env.get("APP_URL") || "https://grant-genius-dc.lovable.app";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("Missing required environment variables");
    }

    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      // Generic response to prevent account enumeration
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Generating magic link", { email: email.trim() });

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: email.trim(),
      options: {
        redirectTo: `${appUrl}/dashboard`,
      },
    });

    if (linkError) {
      logStep("Error generating link", { error: linkError.message });
      // Generic response
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const magicLinkUrl = linkData?.properties?.action_link;
    if (!magicLinkUrl) {
      logStep("No action_link returned");
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Magic link generated successfully");

    if (!brevoApiKey) {
      logStep("WARNING: BREVO_API_KEY not configured, cannot send email");
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
        to: [{ email: email.trim() }],
        subject: "Your Grant Genius Sign-In Link",
        htmlContent: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #4F46E5;">🎓 Grant Genius</h1>
  </div>
  
  <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
    <h2 style="color: white; margin: 0;">Sign In to Grant Genius</h2>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">
      Click the button below to securely sign in to your account.
    </p>
  </div>
  
  <div style="background: white; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
    <p style="color: #374151; margin-top: 0;">Hi there,</p>
    <p style="color: #374151;">You requested a sign-in link for Grant Genius. Click the button below to access your account:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLinkUrl}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
        Sign In to Grant Genius
      </a>
    </div>
    
    <p style="color: #6B7280; font-size: 14px;">
      This link expires in 24 hours. If the button doesn't work, copy and paste this URL into your browser:<br>
      <a href="${magicLinkUrl}" style="color: #4F46E5; word-break: break-all; font-size: 12px;">${magicLinkUrl}</a>
    </p>
  </div>
  
  <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
  
  <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
    If you didn't request this link, you can safely ignore this email.<br>
    &copy; Grant Genius by Disruptors Co.
  </p>
</body>
</html>
        `,
      }),
    });

    if (brevoResponse.ok) {
      const brevoResult = await brevoResponse.json();
      logStep("Email sent successfully", { messageId: brevoResult.messageId });
    } else {
      const errorText = await brevoResponse.text();
      logStep("Brevo API error", { status: brevoResponse.status, error: errorText });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    // Always return success to prevent account enumeration
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
