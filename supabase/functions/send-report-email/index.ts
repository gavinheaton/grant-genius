import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface SendReportEmailRequest {
  reportRunId: string;
  reportId: string;
  applicationId: string;
  userId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { reportRunId, reportId, applicationId, userId } = await req.json() as SendReportEmailRequest;

    if (!reportRunId || !reportId || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get user profile for email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Failed to fetch user profile:", profileError);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get application details for grant name
    const { data: application } = await supabase
      .from("applications")
      .select(`
        title,
        grant_version:grant_versions!inner(
          grant:grants!inner(name)
        )
      `)
      .eq("id", applicationId)
      .maybeSingle();

    // deno-lint-ignore no-explicit-any
    const grantName = (application?.grant_version as any)?.grant?.name || "Your Research";
    const userName = profile.full_name || profile.email.split("@")[0];

    // Get the app URL from environment or construct it
    const appUrl = Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com";
    const reportLink = `${appUrl}/applications/${applicationId}`;

    // Get the Brevo template ID from email_templates table
    const { data: template } = await supabase
      .from("email_templates")
      .select("brevo_template_id")
      .eq("template_key", "REPORT_READY")
      .maybeSingle();

    // Send email via Brevo API
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    
    if (!BREVO_API_KEY) {
      console.error("BREVO_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let emailSent = false;
    let brevoMessageId = null;

    // If we have a Brevo template, use it
    if (template?.brevo_template_id) {
      const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: template.brevo_template_id,
          to: [{ email: profile.email, name: userName }],
          params: {
            user_name: userName,
            grant_name: grantName,
            report_link: reportLink,
          },
        }),
      });

      if (brevoResponse.ok) {
        const brevoData = await brevoResponse.json();
        brevoMessageId = brevoData.messageId;
        emailSent = true;
      } else {
        console.error("Brevo template email failed:", await brevoResponse.text());
      }
    }

    // Fallback: send raw email if template not configured or failed
    if (!emailSent) {
      const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
          to: [{ email: profile.email, name: userName }],
          subject: "Your Grant Genius Report is Ready! 🎉",
          htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #4F46E5; margin-bottom: 10px;">🎓 Grant Genius</h1>
  </div>
  
  <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
    <h2 style="color: white; margin: 0 0 10px 0;">Your Report is Ready!</h2>
    <p style="color: rgba(255,255,255,0.9); margin: 0;">Hi ${userName},</p>
  </div>
  
  <p>Great news! Your commercialisation research report for <strong>${grantName}</strong> has been generated and is ready for download.</p>
  
  <p>The report includes:</p>
  <ul style="padding-left: 20px;">
    <li>Competitor analysis and research landscape</li>
    <li>Market segmentation and sizing (TAM/SAM/SOM)</li>
    <li>Australian economic impact assessment</li>
    <li>Potential partner businesses</li>
    <li>And more...</li>
  </ul>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="${reportLink}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
      View Your Report
    </a>
  </div>
  
  <p style="color: #666; font-size: 14px;">
    If the button above doesn't work, copy and paste this link into your browser:<br>
    <a href="${reportLink}" style="color: #4F46E5;">${reportLink}</a>
  </p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="color: #999; font-size: 12px; text-align: center;">
    This email was sent by Grant Genius because you requested to be notified when your report was ready.
  </p>
</body>
</html>
          `,
        }),
      });

      if (brevoResponse.ok) {
        const brevoData = await brevoResponse.json();
        brevoMessageId = brevoData.messageId;
        emailSent = true;
      } else {
        const errorText = await brevoResponse.text();
        console.error("Brevo raw email failed:", errorText);
        return new Response(
          JSON.stringify({ error: "Failed to send email", details: errorText }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Log to email_outbox
    await supabase.from("email_outbox").insert({
      user_id: userId,
      to_email: profile.email,
      template_key: "REPORT_READY",
      subject: "Your Grant Genius Report is Ready!",
      brevo_message_id: brevoMessageId,
      status: emailSent ? "sent" : "failed",
      sent_at: emailSent ? new Date().toISOString() : null,
      variables_json: {
        user_name: userName,
        grant_name: grantName,
        report_link: reportLink,
        report_id: reportId,
      },
    });

    console.log(`Report ready email sent to ${profile.email} for report ${reportId}`);

    return new Response(
      JSON.stringify({ success: true, messageId: brevoMessageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-report-email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
