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

    // Create user client to verify auth
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Create service client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { application_id } = await req.json();

    if (!application_id) {
      throw new Error("Missing application_id");
    }

    // Fetch application with grant details
    const { data: application, error: appError } = await serviceClient
      .from("applications")
      .select(`
        id,
        title,
        inputs_json,
        user_id,
        grant_version:grant_versions!inner(
          id,
          grant:grants!inner(id, name, admin_notification_email)
        )
      `)
      .eq("id", application_id)
      .eq("user_id", user.id)
      .single();

    if (appError || !application) {
      throw new Error("Application not found or access denied");
    }

    const grantVersion = application.grant_version as any;
    const grant = Array.isArray(grantVersion?.grant) 
      ? grantVersion.grant[0] 
      : grantVersion?.grant;
    
    const adminEmail = grant?.admin_notification_email;

    if (!adminEmail) {
      throw new Error("No admin notification email configured for this grant");
    }

    // Update application status
    const { error: updateError } = await serviceClient
      .from("applications")
      .update({
        manual_status: "pending_review",
        manual_submitted_at: new Date().toISOString(),
        status: "in_progress",
      })
      .eq("id", application_id);

    if (updateError) {
      throw new Error("Failed to update application status");
    }

    // Get user profile for email
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", user.id)
      .single();

    // Send notification email to admin
    if (brevoApiKey) {
      const inputs = application.inputs_json as Record<string, string>;
      
      const emailHtml = `
        <h2>New Manual Report Request</h2>
        <p><strong>Grant:</strong> ${grant?.name || "Unknown"}</p>
        <p><strong>Project Name:</strong> ${application.title || "Untitled"}</p>
        <p><strong>User:</strong> ${profile?.full_name || "Unknown"} (${profile?.email})</p>
        <hr />
        <h3>Submitted Details</h3>
        <p><strong>Article URL:</strong> <a href="${inputs?.publicArticleUrl}">${inputs?.publicArticleUrl || "Not provided"}</a></p>
        <p><strong>Summary/Bio:</strong></p>
        <blockquote style="background: #f5f5f5; padding: 10px; border-left: 3px solid #ccc;">
          ${inputs?.summary || "Not provided"}
        </blockquote>
        <p><strong>TRL Level:</strong> ${inputs?.trl || "Not specified"}</p>
        <p><strong>IP Status:</strong> ${inputs?.ipStatus || "Not specified"}</p>
        <hr />
        <p>
          <a href="${Deno.env.get("APP_URL") || "https://grantgenius.disruptorsco.com"}/admin/manual-queue" 
             style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Open Manual Queue
          </a>
        </p>
      `;

      const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Grant Genius", email: "grantgenius@disruptorsco.com" },
          to: [{ email: adminEmail }],
          subject: `New Manual Report Request: ${application.title || "Untitled"} from ${profile?.email}`,
          htmlContent: emailHtml,
        }),
      });

      if (!emailResponse.ok) {
        console.error("Failed to send admin notification email:", await emailResponse.text());
        // Don't throw - submission was successful even if email failed
      }

      // Log the email
      await serviceClient.from("email_outbox").insert({
        user_id: user.id,
        to_email: adminEmail,
        template_key: "MANUAL_SUBMISSION_ADMIN",
        subject: `New Manual Report Request from ${profile?.email}`,
        status: emailResponse.ok ? "sent" : "failed",
        sent_at: emailResponse.ok ? new Date().toISOString() : null,
        variables_json: {
          grant_name: grant?.name,
          project_name: application.title,
          user_email: profile?.email,
        },
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Request submitted successfully",
        admin_notified: !!brevoApiKey,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in submit-manual-request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
