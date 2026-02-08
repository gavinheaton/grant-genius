import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Send email to user with attachments
    if (brevoApiKey && userProfile.email) {
      const appUrl = supabaseUrl.replace(".supabase.co", ".lovable.app");
      
      const emailHtml = `
        <h2>Your Report is Ready!</h2>
        <p>Hi ${userProfile.full_name || "there"},</p>
        <p>Great news! Your commercialisation research report for <strong>${application.title || "your application"}</strong> (${grant?.name}) is now complete.</p>
        <p>You can view your report in your dashboard:</p>
        <p>
          <a href="${appUrl}/applications/${application_id}" 
             style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Your Report
          </a>
        </p>
        <p>The PDF and DOCX versions are also attached to this email for your convenience.</p>
        <p>Best regards,<br/>The Grant Genius Team</p>
      `;

      const attachments = [];
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

      const emailPayload: any = {
        sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
        to: [{ email: userProfile.email, name: userProfile.full_name || undefined }],
        subject: `Your Report is Ready: ${application.title || grant?.name}`,
        htmlContent: emailHtml,
      };

      if (attachments.length > 0) {
        emailPayload.attachment = attachments;
      }

      const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(emailPayload),
      });

      if (!emailResponse.ok) {
        console.error("Failed to send user email:", await emailResponse.text());
      }

      // Log the email
      await serviceClient.from("email_outbox").insert({
        user_id: application.user_id,
        to_email: userProfile.email,
        template_key: "MANUAL_REPORT_READY",
        subject: `Your Report is Ready: ${application.title || grant?.name}`,
        status: emailResponse.ok ? "sent" : "failed",
        sent_at: emailResponse.ok ? new Date().toISOString() : null,
        variables_json: {
          grant_name: grant?.name,
          project_name: application.title,
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
