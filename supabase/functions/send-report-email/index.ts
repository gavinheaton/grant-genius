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

interface EmailTemplate {
  brevo_template_id: number;
  subject: string | null;
  html_content: string | null;
  sender_name: string | null;
  sender_email: string | null;
}

// deno-lint-ignore no-explicit-any
interface ReportContentJson {
  manual_report_html?: string;
  report_html?: string;
  assembledReport?: {
    report_html?: string;
  };
  [key: string]: any;
}

// Extract the full report HTML from content_json
function extractReportHtml(contentJson: ReportContentJson | null, manualReportHtml: string | null): string {
  // Priority 1: Manual report HTML
  if (manualReportHtml) {
    return manualReportHtml;
  }

  if (!contentJson) return "";

  // Priority 2: Check for report_html at root
  if (typeof contentJson.report_html === "string") {
    return contentJson.report_html;
  }

  // Priority 3: Check assembledReport.report_html
  if (contentJson.assembledReport?.report_html) {
    return contentJson.assembledReport.report_html;
  }

  // Priority 4: Check step-based keys
  const stepKeys = ["finalize_report_html", "assemble_sections_html", "finalize_citations"];
  for (const key of stepKeys) {
    const stepData = contentJson[key];
    if (stepData) {
      // Handle string or object with report_html
      if (typeof stepData === "string") {
        try {
          const parsed = JSON.parse(stepData);
          if (parsed.report_html) return parsed.report_html;
        } catch {
          // Not JSON, could be raw HTML
          if (stepData.includes("<")) return stepData;
        }
      } else if (typeof stepData === "object" && stepData.report_html) {
        return stepData.report_html;
      }
    }
  }

  return "";
}

// Extract just the Executive Summary section from the report HTML
function extractExecutiveSummary(html: string): string {
  if (!html) return "";

  // Find the Executive Summary section (case-insensitive)
  const summaryMatch = html.match(/<h2[^>]*>([^<]*Executive\s*Summary[^<]*)<\/h2>/i);
  if (!summaryMatch) {
    // Try alternative patterns
    const altMatch = html.match(/<h2[^>]*>([^<]*Summary[^<]*)<\/h2>/i);
    if (!altMatch) return "";
  }

  // Get the position of the Executive Summary heading
  const startIndex = html.search(/<h2[^>]*>[^<]*(?:Executive\s*)?Summary[^<]*<\/h2>/i);
  if (startIndex === -1) return "";

  // Find the next h2 after the summary section
  const afterHeading = html.slice(startIndex);
  const headingMatch = afterHeading.match(/<h2[^>]*>/i);
  if (!headingMatch) return "";

  const afterContent = afterHeading.slice(headingMatch[0].length + (headingMatch.index || 0));
  const nextH2 = afterContent.search(/<h2[^>]*>/i);

  // Extract content from start of heading to next h2 (or end)
  let summaryContent: string;
  if (nextH2 === -1) {
    summaryContent = afterHeading;
  } else {
    summaryContent = afterHeading.slice(0, nextH2 + headingMatch[0].length + (headingMatch.index || 0));
  }

  return summaryContent.trim();
}

// Sanitize HTML for email compatibility
function sanitizeForEmail(html: string): string {
  if (!html) return "";

  let sanitized = html;

  // Remove <style> blocks
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

  // Remove <script> blocks
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Add inline styles to images for email compatibility
  sanitized = sanitized.replace(
    /<img([^>]*)>/gi,
    '<img$1 style="max-width: 100%; height: auto; display: block;">'
  );

  // Wrap in a container with safe email styles
  sanitized = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333;">${sanitized}</div>`;

  return sanitized;
}

// Replace template variables with actual values
function substituteVariables(
  content: string,
  variables: Record<string, string>
): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

// Hardcoded fallback template (legacy support)
function getFallbackHtml(
  userName: string,
  grantName: string,
  reportLink: string
): string {
  return `
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
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { reportRunId, reportId, applicationId, userId } =
      (await req.json()) as SendReportEmailRequest;

    if (!reportRunId || !reportId || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get application details for grant name
    const { data: application } = await supabase
      .from("applications")
      .select(
        `
        title,
        grant_version:grant_versions!inner(
          grant:grants!inner(name)
        )
      `
      )
      .eq("id", applicationId)
      .maybeSingle();

    // deno-lint-ignore no-explicit-any
    const grantName =
      (application?.grant_version as any)?.grant?.name || "Your Research";
    const userName = profile.full_name || profile.email.split("@")[0];

    // Get the app URL from environment or construct it
    const appUrl =
      Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com";
    const reportLink = `${appUrl}/applications/${applicationId}`;

    // Fetch the report to extract HTML content for shortcodes
    let reportHtml = "";
    let reportSummary = "";
    
    if (reportId) {
      const { data: report } = await supabase
        .from("reports")
        .select("content_json, manual_report_html")
        .eq("id", reportId)
        .maybeSingle();

      if (report) {
        const fullHtml = extractReportHtml(
          report.content_json as ReportContentJson,
          report.manual_report_html
        );
        reportHtml = sanitizeForEmail(fullHtml);
        reportSummary = sanitizeForEmail(extractExecutiveSummary(fullHtml));
      }
    }

    // Template variables for substitution
    const templateVariables = {
      user_name: userName,
      grant_name: grantName,
      report_link: reportLink,
      report_html: reportHtml,
      report_summary: reportSummary,
    };

    // Get the template from email_templates table
    const { data: template } = await supabase
      .from("email_templates")
      .select("brevo_template_id, subject, html_content, sender_name, sender_email")
      .eq("template_key", "REPORT_READY")
      .maybeSingle();

    // Cast to our interface
    const emailTemplate = template as EmailTemplate | null;

    // Get Brevo API key
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

    if (!BREVO_API_KEY) {
      console.error("BREVO_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let emailSent = false;
    let brevoMessageId = null;
    let subjectUsed = "Your Grant Genius Report is Ready! 🎉";

    // Priority 1: Use custom html_content from database if available
    if (emailTemplate?.html_content) {
      const htmlContent = substituteVariables(
        emailTemplate.html_content,
        templateVariables
      );
      const subject = emailTemplate.subject
        ? substituteVariables(emailTemplate.subject, templateVariables)
        : subjectUsed;
      subjectUsed = subject;

      const senderName = emailTemplate.sender_name || "Grant Genius";
      const senderEmail =
        emailTemplate.sender_email || "grantgenius@disruptorsco.com";

      console.log("Using custom HTML template from database");

      const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: profile.email, name: userName }],
          subject: subject,
          htmlContent: htmlContent,
        }),
      });

      if (brevoResponse.ok) {
        const brevoData = await brevoResponse.json();
        brevoMessageId = brevoData.messageId;
        emailSent = true;
      } else {
        console.error(
          "Brevo custom template email failed:",
          await brevoResponse.text()
        );
      }
    }

    // Priority 2: Use Brevo template if configured and custom content not available/failed
    if (!emailSent && emailTemplate?.brevo_template_id && emailTemplate.brevo_template_id > 0) {
      console.log(
        "Using Brevo template ID:",
        emailTemplate.brevo_template_id
      );

      const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateId: emailTemplate.brevo_template_id,
          to: [{ email: profile.email, name: userName }],
          params: templateVariables,
        }),
      });

      if (brevoResponse.ok) {
        const brevoData = await brevoResponse.json();
        brevoMessageId = brevoData.messageId;
        emailSent = true;
      } else {
        console.error(
          "Brevo template email failed:",
          await brevoResponse.text()
        );
      }
    }

    // Priority 3: Fallback to hardcoded template (legacy support)
    if (!emailSent) {
      console.log("Using hardcoded fallback template");

      const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
          to: [{ email: profile.email, name: userName }],
          subject: subjectUsed,
          htmlContent: getFallbackHtml(userName, grantName, reportLink),
        }),
      });

      if (brevoResponse.ok) {
        const brevoData = await brevoResponse.json();
        brevoMessageId = brevoData.messageId;
        emailSent = true;
      } else {
        const errorText = await brevoResponse.text();
        console.error("Brevo fallback email failed:", errorText);
        return new Response(
          JSON.stringify({ error: "Failed to send email", details: errorText }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Log to email_outbox
    await supabase.from("email_outbox").insert({
      user_id: userId,
      to_email: profile.email,
      template_key: "REPORT_READY",
      subject: subjectUsed,
      brevo_message_id: brevoMessageId,
      status: emailSent ? "sent" : "failed",
      sent_at: emailSent ? new Date().toISOString() : null,
      variables_json: {
        ...templateVariables,
        report_id: reportId,
      },
    });

    console.log(
      `Report ready email sent to ${profile.email} for report ${reportId}`
    );

    return new Response(
      JSON.stringify({ success: true, messageId: brevoMessageId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-report-email:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
