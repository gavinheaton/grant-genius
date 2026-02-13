import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check admin
    const { data: isAdminResult } = await supabaseAdmin.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdminResult) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { emailOutboxId } = await req.json();
    if (!emailOutboxId) {
      return new Response(
        JSON.stringify({ error: "emailOutboxId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch original outbox entry
    const { data: original, error: fetchError } = await supabaseAdmin
      .from("email_outbox")
      .select("*")
      .eq("id", emailOutboxId)
      .maybeSingle();

    if (fetchError || !original) {
      return new Response(
        JSON.stringify({ error: "Email outbox entry not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this is a REPORT_READY email - if so, use send-report-email for full logic
    const variables = (original.variables_json || {}) as Record<string, string>;
    
    if (original.template_key === "REPORT_READY" && variables.report_id) {
      // Re-dispatch via send-report-email for full template resolution
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
      const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

      // Find the report run for this report
      const { data: report } = await supabaseAdmin
        .from("reports")
        .select("id, report_run_id, application_id, user_id")
        .eq("id", variables.report_id)
        .maybeSingle();

      if (report) {
        const sendResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-report-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            reportRunId: report.report_run_id,
            reportId: report.id,
            applicationId: report.application_id,
            userId: report.user_id,
          }),
        });

        if (sendResponse.ok) {
          return new Response(
            JSON.stringify({ success: true, method: "send-report-email" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error("send-report-email failed, falling back to generic resend");
      }
    }

    // Generic resend: Look up the email template to get Brevo template ID or use stored data
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to get the template for this template_key
    const { data: template } = await supabaseAdmin
      .from("email_templates")
      .select("brevo_template_id, subject, html_content, sender_name, sender_email")
      .eq("template_key", original.template_key)
      .maybeSingle();

    let emailSent = false;
    let brevoMessageId: string | null = null;

    // Priority 1: Custom HTML content from template
    if (template?.html_content) {
      let htmlContent = template.html_content;
      for (const [key, value] of Object.entries(variables)) {
        htmlContent = htmlContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }

      let subject = template.subject || original.subject || "Notification from Grant Genius";
      for (const [key, value] of Object.entries(variables)) {
        subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }

      const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: {
            name: template.sender_name || "Grant Genius",
            email: template.sender_email || "grantgenius@disruptorsco.com",
          },
          to: [{ email: original.to_email }],
          subject,
          htmlContent,
        }),
      });

      if (brevoResponse.ok) {
        const data = await brevoResponse.json();
        brevoMessageId = data.messageId;
        emailSent = true;
      }
    }

    // Priority 2: Brevo template ID
    if (!emailSent && template?.brevo_template_id && template.brevo_template_id > 0) {
      const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.brevo_template_id,
          to: [{ email: original.to_email }],
          params: variables,
        }),
      });

      if (brevoResponse.ok) {
        const data = await brevoResponse.json();
        brevoMessageId = data.messageId;
        emailSent = true;
      }
    }

    if (!emailSent) {
      return new Response(
        JSON.stringify({ error: "Failed to resend email - no valid template found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the resend in email_outbox
    await supabaseAdmin.from("email_outbox").insert({
      user_id: original.user_id,
      to_email: original.to_email,
      template_key: original.template_key,
      subject: original.subject,
      brevo_message_id: brevoMessageId,
      status: "sent",
      sent_at: new Date().toISOString(),
      variables_json: {
        ...variables,
        resent_from: emailOutboxId,
      },
    });

    console.log(`Resent email ${emailOutboxId} to ${original.to_email}`);

    return new Response(
      JSON.stringify({ success: true, messageId: brevoMessageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in resend-email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
