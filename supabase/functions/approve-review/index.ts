import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Verify admin
    const { data: isAdmin } = await serviceClient.rpc("is_admin", { _user_id: user.id });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { review_id, edited_html, notes } = await req.json();
    if (!review_id) {
      return new Response(JSON.stringify({ error: "review_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the review
    const { data: review, error: reviewError } = await serviceClient
      .from("report_reviews")
      .select("*, workflow_step:grant_review_workflow_steps!inner(workflow_id, step_number)")
      .eq("id", review_id)
      .single();

    if (reviewError || !review) {
      return new Response(JSON.stringify({ error: "Review not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify reviewer is assigned
    if (review.reviewer_user_id !== user.id) {
      // Allow any admin to approve for flexibility
      console.log(`Admin ${user.id} approving review assigned to ${review.reviewer_user_id}`);
    }

    // Update review as approved
    await serviceClient
      .from("report_reviews")
      .update({
        status: "approved",
        edited_html: edited_html || null,
        notes: notes || null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", review_id);

    // If edited HTML provided, update the report
    if (edited_html) {
      await serviceClient
        .from("reports")
        .update({
          manual_report_html: edited_html,
          content_json: { report_html: edited_html },
        })
        .eq("id", review.report_id);
    }

    // Check if there are more workflow steps
    const workflowStep = review.workflow_step as any;
    const { data: workflow } = await serviceClient
      .from("grant_review_workflows")
      .select("step_count")
      .eq("id", workflowStep.workflow_id)
      .single();

    const currentStepNumber = review.step_number;
    const totalSteps = workflow?.step_count || 1;
    const isFinal = currentStepNumber >= totalSteps;

    if (isFinal) {
      // Final approval - set report as approved and send to user
      await serviceClient
        .from("reports")
        .update({ review_status: "approved", current_review_step: null })
        .eq("id", review.report_id);

      // Fetch report details for email
      const { data: report } = await serviceClient
        .from("reports")
        .select("id, report_run_id, application_id, user_id")
        .eq("id", review.report_id)
        .single();

      if (report) {
        // Trigger send-report-email
        try {
          await fetch(`${supabaseUrl}/functions/v1/send-report-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
              reportRunId: report.report_run_id,
              reportId: report.id,
              applicationId: report.application_id,
              userId: report.user_id,
            }),
          });
          console.log(`Final approval: email sent for report ${report.id}`);
        } catch (emailError) {
          console.error("Failed to send report email:", emailError);
        }
      }

      return new Response(
        JSON.stringify({ success: true, is_final: true, message: "Report approved and sent to user" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Not final - create next review step and email next reviewer
    const nextStepNumber = currentStepNumber + 1;

    // Find the next workflow step
    const { data: nextWorkflowStep } = await serviceClient
      .from("grant_review_workflow_steps")
      .select("id, reviewer_user_id")
      .eq("workflow_id", workflowStep.workflow_id)
      .eq("step_number", nextStepNumber)
      .single();

    if (!nextWorkflowStep) {
      // No more steps configured, treat as final
      await serviceClient
        .from("reports")
        .update({ review_status: "approved", current_review_step: null })
        .eq("id", review.report_id);

      return new Response(
        JSON.stringify({ success: true, is_final: true, message: "Report approved (no more steps)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create next review record
    await serviceClient
      .from("report_reviews")
      .insert({
        report_id: review.report_id,
        workflow_step_id: nextWorkflowStep.id,
        reviewer_user_id: nextWorkflowStep.reviewer_user_id,
        step_number: nextStepNumber,
        status: "pending",
      });

    // Update report current step
    await serviceClient
      .from("reports")
      .update({ current_review_step: nextStepNumber })
      .eq("id", review.report_id);

    // Email next reviewer
    await sendReviewEmail(serviceClient, nextWorkflowStep.reviewer_user_id, review.report_id, nextStepNumber, totalSteps);

    return new Response(
      JSON.stringify({ success: true, is_final: false, message: `Approved. Sent to reviewer for step ${nextStepNumber}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in approve-review:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function sendReviewEmail(serviceClient: any, reviewerUserId: string, reportId: string, stepNumber: number, totalSteps: number) {
  try {
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) { console.log("No BREVO_API_KEY, skipping email"); return; }

    // Get reviewer profile
    const { data: reviewer } = await serviceClient
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", reviewerUserId)
      .single();

    if (!reviewer) return;

    // Get report details
    const { data: report } = await serviceClient
      .from("reports")
      .select("application:applications!inner(title, grant_version:grant_versions!inner(grant:grants!inner(name)))")
      .eq("id", reportId)
      .single();

    const app = report?.application as any;
    const gv = app?.grant_version as any;
    const grant = Array.isArray(gv?.grant) ? gv.grant[0] : gv?.grant;

    const appUrl = Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com";
    
    // Find the review ID for the link
    const { data: reviewRecord } = await serviceClient
      .from("report_reviews")
      .select("id")
      .eq("report_id", reportId)
      .eq("step_number", stepNumber)
      .eq("reviewer_user_id", reviewerUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const reviewLink = reviewRecord 
      ? `${appUrl}/admin/reviews/${reviewRecord.id}`
      : `${appUrl}/admin/reviews`;

    const templateVariables: Record<string, string> = {
      reviewer_name: reviewer.full_name || reviewer.email.split("@")[0],
      grant_name: grant?.name || "Unknown Grant",
      application_title: app?.title || "Untitled",
      review_link: reviewLink,
      step_number: String(stepNumber),
      total_steps: String(totalSteps),
    };

    // Fetch REVIEW_REQUESTED template
    const { data: emailTemplate } = await serviceClient
      .from("email_templates")
      .select("html_content, subject, sender_name, sender_email")
      .eq("template_key", "REVIEW_REQUESTED")
      .maybeSingle();

    let htmlContent = emailTemplate?.html_content || 
      `<h2>Review Requested</h2><p>Hi {{reviewer_name}},</p><p>A report for <strong>{{grant_name}}</strong> ({{application_title}}) is ready for your review (Step {{step_number}} of {{total_steps}}).</p><p><a href="{{review_link}}">Click here to review the report</a></p>`;

    let subject = emailTemplate?.subject || "Report Review Required - {{grant_name}}";

    // Substitute variables
    for (const [key, value] of Object.entries(templateVariables)) {
      htmlContent = htmlContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      subject = subject.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }

    const senderName = emailTemplate?.sender_name || "Grant Genius";
    const senderEmail = emailTemplate?.sender_email || "grantgenius@disruptorsco.com";

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: reviewer.email, name: templateVariables.reviewer_name }],
        subject,
        htmlContent,
      }),
    });

    // Log to outbox
    await serviceClient.from("email_outbox").insert({
      user_id: reviewerUserId,
      to_email: reviewer.email,
      template_key: "REVIEW_REQUESTED",
      subject,
      status: "sent",
      sent_at: new Date().toISOString(),
      variables_json: templateVariables,
    });

    console.log(`Review email sent to ${reviewer.email} for step ${stepNumber}`);
  } catch (e) {
    console.error("Failed to send review email:", e);
  }
}
