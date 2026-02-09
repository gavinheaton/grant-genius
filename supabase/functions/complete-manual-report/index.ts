import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Extract just the Executive Summary section from report HTML
function extractExecutiveSummary(html: string): string {
  if (!html) return "";

  const startIndex = html.search(/<h2[^>]*>[^<]*(?:Executive\s*)?Summary[^<]*<\/h2>/i);
  if (startIndex === -1) return "";

  const afterHeading = html.slice(startIndex);
  const headingMatch = afterHeading.match(/<h2[^>]*>/i);
  if (!headingMatch) return "";

  const afterContent = afterHeading.slice(headingMatch[0].length + (headingMatch.index || 0));
  const nextH2 = afterContent.search(/<h2[^>]*>/i);

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
  sanitized = sanitized.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  sanitized = sanitized.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  sanitized = sanitized.replace(/<img([^>]*)>/gi, '<img$1 style="max-width: 100%; height: auto; display: block;">');
  sanitized = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333;">${sanitized}</div>`;
  return sanitized;
}

// Replace template variables with actual values
function substituteVariables(content: string, variables: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

// Hardcoded fallback template
function getFallbackHtml(userName: string, grantName: string, reportLink: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;"><h1 style="color: #4F46E5;">🎓 Grant Genius</h1></div>
  <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px;">
    <h2 style="color: white; margin: 0 0 10px 0;">Your Report is Ready!</h2>
    <p style="color: rgba(255,255,255,0.9); margin: 0;">Hi ${userName},</p>
  </div>
  <p>Great news! Your commercialisation research report for <strong>${grantName}</strong> is now complete.</p>
  <div style="text-align: center; margin: 30px 0;">
    <a href="${reportLink}" style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">View Your Report</a>
  </div>
  <p style="color: #666; font-size: 14px;">Link: <a href="${reportLink}" style="color: #4F46E5;">${reportLink}</a></p>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");

    // Create user client to verify admin status
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Create service client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin status
    const { data: isAdmin } = await serviceClient.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      throw new Error("Admin access required");
    }

    const { application_id, report_html } = await req.json();

    if (!application_id || !report_html) {
      throw new Error("Missing application_id or report_html");
    }

    // Fetch application details
    const { data: application, error: appError } = await serviceClient
      .from("applications")
      .select(`
        id,
        title,
        inputs_json,
        user_id,
        grant_version_id,
        entitlement_consumption_id,
        grant_version:grant_versions!inner(
          id,
          grant:grants!inner(id, name)
        )
      `)
      .eq("id", application_id)
      .single();

    if (appError || !application) {
      throw new Error("Application not found");
    }

    const grantVersion = application.grant_version as any;
    const grant = Array.isArray(grantVersion?.grant) 
      ? grantVersion.grant[0] 
      : grantVersion?.grant;

    // Get user profile
    const { data: userProfile } = await serviceClient
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", application.user_id)
      .single();

    if (!userProfile) {
      throw new Error("User profile not found");
    }

    // Get a report template version (required for report creation)
    const { data: templateVersion } = await serviceClient
      .from("report_template_versions")
      .select("id")
      .eq("is_published", true)
      .limit(1)
      .single();

    if (!templateVersion) {
      throw new Error("No published report template version found");
    }

    // Check if report already exists (update draft) or create new
    const { data: existingReport } = await serviceClient
      .from("reports")
      .select("id")
      .eq("application_id", application_id)
      .eq("is_manual", true)
      .maybeSingle();

    let reportId: string;

    if (existingReport) {
      // Update existing report
      const { error: updateError } = await serviceClient
        .from("reports")
        .update({
          manual_report_html: report_html,
          content_json: { report_html: report_html },
        })
        .eq("id", existingReport.id);

      if (updateError) throw updateError;
      reportId = existingReport.id;
    } else {
      // Create a placeholder report_run for the manual report
      const { data: reportRun, error: runError } = await serviceClient
        .from("report_runs")
        .insert({
          application_id,
          report_template_version_id: templateVersion.id,
          status: "completed",
          current_step: 1,
          total_steps: 1,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          execution_engine: "manual",
        })
        .select()
        .single();

      if (runError) throw runError;

      // Create the report
      const { data: newReport, error: reportError } = await serviceClient
        .from("reports")
        .insert({
          application_id,
          user_id: application.user_id,
          grant_version_id: application.grant_version_id,
          report_template_version_id: templateVersion.id,
          report_run_id: reportRun.id,
          is_manual: true,
          manual_report_html: report_html,
          content_json: { report_html: report_html },
          inputs_snapshot_json: application.inputs_json || {},
          citations_json: [],
        })
        .select()
        .single();

      if (reportError) throw reportError;
      reportId = newReport.id;

      // Link the entitlement consumption record to the report
      if (application.entitlement_consumption_id) {
        await serviceClient
          .from("entitlement_consumptions")
          .update({ 
            report_id: reportId, 
            report_run_id: reportRun.id 
          })
          .eq("id", application.entitlement_consumption_id);
      }
    }

    // Update application status
    await serviceClient
      .from("applications")
      .update({
        manual_status: "completed",
        status: "ready",
      })
      .eq("id", application_id);

    // Generate PDF inline using PDFShift API (bypasses RLS issues)
    let pdfBase64: string | null = null;
    let pdfPath: string | null = null;
    const pdfshiftApiKey = Deno.env.get("PDFSHIFT_API_KEY");
    
    if (pdfshiftApiKey) {
      try {
        // Build full HTML document for PDF generation
        const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1, h2, h3 { color: #1f2937; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; }
    th { background-color: #f3f4f6; }
  </style>
</head>
<body>
${report_html}
</body>
</html>`;

        const pdfResponse = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`api:${pdfshiftApiKey}`)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: fullHtml,
            format: "A4",
            margin: "20mm",
          }),
        });

        if (pdfResponse.ok) {
          const pdfArrayBuffer = await pdfResponse.arrayBuffer();
          const pdfBytes = new Uint8Array(pdfArrayBuffer);
          pdfBase64 = btoa(String.fromCharCode(...pdfBytes));
          
          // Upload to storage using service role
          const fileName = `${application_id}/${reportId}.pdf`;
          const { error: uploadError } = await serviceClient.storage
            .from("reports")
            .upload(fileName, pdfBytes, {
              contentType: "application/pdf",
              upsert: true,
            });
          
          if (!uploadError) {
            pdfPath = fileName;
          } else {
            console.error("PDF upload failed:", uploadError);
          }
        } else {
          console.error("PDFShift API failed:", await pdfResponse.text());
        }
      } catch (e) {
        console.error("PDF generation failed:", e);
      }
    }

    // Generate DOCX using the generate-docx function with service role auth
    let docxBase64: string | null = null;
    let docxPath: string | null = null;
    try {
      const docxResponse = await fetch(`${supabaseUrl}/functions/v1/generate-docx`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          reportId,
          assembledReport: { report_html: report_html },
        }),
      });

      if (docxResponse.ok) {
        const docxData = await docxResponse.json();
        docxPath = docxData.path;
        
        // Download the DOCX for email attachment
        if (docxPath) {
          const { data: docxFile } = await serviceClient.storage
            .from("reports")
            .download(docxPath);
          if (docxFile) {
            const arrayBuffer = await docxFile.arrayBuffer();
            docxBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          }
        }
      } else {
        console.error("DOCX generation failed:", await docxResponse.text());
      }
    } catch (e) {
      console.error("DOCX generation failed:", e);
    }

    // Update report with file paths
    if (pdfPath || docxPath) {
      await serviceClient
        .from("reports")
        .update({
          pdf_path: pdfPath,
          docx_path: docxPath,
        })
        .eq("id", reportId);
    }

    // Send email to user with attachments using REPORT_READY template
    if (brevoApiKey && userProfile.email) {
      const appUrl = Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com";
      const reportLink = `${appUrl}/applications/${application_id}`;
      const userName = userProfile.full_name || userProfile.email.split("@")[0];
      const grantName = grant?.name || "Your Research";

      // Sanitize and extract report content for shortcodes
      const sanitizedReportHtml = sanitizeForEmail(report_html);
      const sanitizedSummary = sanitizeForEmail(extractExecutiveSummary(report_html));

      const templateVariables: Record<string, string> = {
        user_name: userName,
        grant_name: grantName,
        report_link: reportLink,
        report_html: sanitizedReportHtml,
        report_summary: sanitizedSummary,
      };

      // Fetch REPORT_READY template from database
      const { data: emailTemplate } = await serviceClient
        .from("email_templates")
        .select("brevo_template_id, subject, html_content, sender_name, sender_email")
        .eq("template_key", "REPORT_READY")
        .maybeSingle();

      const attachments: Array<{ content: string; name: string }> = [];
      if (pdfBase64) {
        attachments.push({
          content: pdfBase64,
          name: `${application.title || "Report"}.pdf`,
        });
      }
      if (docxBase64) {
        attachments.push({
          content: docxBase64,
          name: `${application.title || "Report"}.docx`,
        });
      }

      let emailSent = false;
      let brevoMessageId: string | null = null;
      let subjectUsed = `Your Report is Ready: ${application.title || grantName}`;

      // Priority 1: Custom html_content from DB
      if (emailTemplate?.html_content) {
        const htmlContent = substituteVariables(emailTemplate.html_content, templateVariables);
        const subject = emailTemplate.subject
          ? substituteVariables(emailTemplate.subject, templateVariables)
          : subjectUsed;
        subjectUsed = subject;

        const senderName = emailTemplate.sender_name || "Grant Genius";
        const senderEmail = emailTemplate.sender_email || "grantgenius@disruptorsco.com";

        console.log("Manual report: using custom HTML template from database");

        const emailPayload: Record<string, unknown> = {
          sender: { name: senderName, email: senderEmail },
          to: [{ email: userProfile.email, name: userName }],
          subject: subject,
          htmlContent: htmlContent,
        };
        if (attachments.length > 0) emailPayload.attachment = attachments;

        const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
          body: JSON.stringify(emailPayload),
        });

        if (emailResponse.ok) {
          const data = await emailResponse.json();
          brevoMessageId = data.messageId;
          emailSent = true;
        } else {
          console.error("Brevo custom template failed:", await emailResponse.text());
        }
      }

      // Priority 2: Brevo template ID
      if (!emailSent && emailTemplate?.brevo_template_id && emailTemplate.brevo_template_id > 0) {
        console.log("Manual report: using Brevo template ID:", emailTemplate.brevo_template_id);

        const emailPayload: Record<string, unknown> = {
          templateId: emailTemplate.brevo_template_id,
          to: [{ email: userProfile.email, name: userName }],
          params: templateVariables,
        };
        if (attachments.length > 0) emailPayload.attachment = attachments;

        const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
          body: JSON.stringify(emailPayload),
        });

        if (emailResponse.ok) {
          const data = await emailResponse.json();
          brevoMessageId = data.messageId;
          emailSent = true;
        } else {
          console.error("Brevo template email failed:", await emailResponse.text());
        }
      }

      // Priority 3: Hardcoded fallback
      if (!emailSent) {
        console.log("Manual report: using hardcoded fallback template");

        const fallbackHtml = getFallbackHtml(userName, grantName, reportLink);
        const emailPayload: Record<string, unknown> = {
          sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
          to: [{ email: userProfile.email, name: userName }],
          subject: subjectUsed,
          htmlContent: fallbackHtml,
        };
        if (attachments.length > 0) emailPayload.attachment = attachments;

        const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
          body: JSON.stringify(emailPayload),
        });

        if (emailResponse.ok) {
          const data = await emailResponse.json();
          brevoMessageId = data.messageId;
          emailSent = true;
        } else {
          console.error("Brevo fallback email failed:", await emailResponse.text());
        }
      }

      // Log the email
      await serviceClient.from("email_outbox").insert({
        user_id: application.user_id,
        to_email: userProfile.email,
        template_key: "REPORT_READY",
        subject: subjectUsed,
        brevo_message_id: brevoMessageId,
        status: emailSent ? "sent" : "failed",
        sent_at: emailSent ? new Date().toISOString() : null,
        variables_json: {
          ...templateVariables,
          report_id: reportId,
          has_pdf: !!pdfBase64,
          has_docx: !!docxBase64,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        report_id: reportId,
        pdf_generated: !!pdfPath,
        docx_generated: !!docxPath,
        email_sent: !!brevoApiKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in complete-manual-report:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
