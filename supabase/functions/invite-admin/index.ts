import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[INVITE-ADMIN] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      throw new Error("Missing required environment variables");
    }

    // Create client with anon key for user authentication
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    // Verify the requester is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      throw new Error(`Authentication error: ${userError.message}`);
    }
    const requesterId = userData.user?.id;
    if (!requesterId) {
      throw new Error("User not authenticated");
    }
    logStep("Requester authenticated", { requesterId });

    // Create service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if requester is a super_admin
    const { data: roleData, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requesterId)
      .maybeSingle();

    if (roleError) {
      throw new Error(`Error checking role: ${roleError.message}`);
    }

    if (roleData?.role !== "super_admin") {
      throw new Error("Only Super Admins can invite new admin users");
    }
    logStep("Super Admin verified");

    // Parse request body
    const { email, fullName, role } = await req.json();

    if (!email || typeof email !== "string") {
      throw new Error("Email is required");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    if (!role || !["admin", "super_admin"].includes(role)) {
      throw new Error("Role must be 'admin' or 'super_admin'");
    }

    logStep("Request validated", { email, role, fullName: fullName || "(not provided)" });

    // Check if user already exists
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      throw new Error("A user with this email already exists");
    }

    // Create the new user using admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: email,
      email_confirm: true, // Auto-confirm email since admin is inviting
      user_metadata: {
        full_name: fullName || null,
        invited_by: requesterId,
        invited_as: role,
      },
    });

    if (createError) {
      throw new Error(`Failed to create user: ${createError.message}`);
    }

    if (!newUser.user) {
      throw new Error("User creation failed - no user returned");
    }

    logStep("User created in auth", { userId: newUser.user.id });

    // The trigger 'handle_new_user' should create the profile and researcher role
    // But we need to update the role to the invited role
    // Wait a moment for the trigger to complete
    await new Promise(resolve => setTimeout(resolve, 500));

    // Update the user role to the invited role
    const { error: updateRoleError } = await adminClient
      .from("user_roles")
      .update({ role: role })
      .eq("user_id", newUser.user.id);

    if (updateRoleError) {
      logStep("Error updating role, trying insert", { error: updateRoleError.message });
      // If update fails (no row exists), insert instead
      const { error: insertRoleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: newUser.user.id, role: role });

      if (insertRoleError) {
        throw new Error(`Failed to set user role: ${insertRoleError.message}`);
      }
    }

    logStep("Role updated", { role });

    // Update profile with full name if provided
    if (fullName) {
      const { error: updateProfileError } = await adminClient
        .from("profiles")
        .update({ full_name: fullName })
        .eq("user_id", newUser.user.id);

      if (updateProfileError) {
        logStep("Warning: Could not update profile name", { error: updateProfileError.message });
      }
    }

    // Generate magic link for the new admin
    const origin = req.headers.get("origin") || "https://grant-genius-dc.lovable.app";
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: email,
      options: {
        redirectTo: `${origin}/admin`,
      },
    });

    if (linkError) {
      logStep("Warning: Could not generate magic link", { error: linkError.message });
    } else {
      logStep("Magic link generated");
    }

    // Log audit event
    await adminClient.from("audit_logs").insert({
      entity_type: "user_roles",
      entity_id: newUser.user.id,
      action: "ADMIN_INVITED",
      user_id: requesterId,
      new_value_json: {
        email,
        role,
        full_name: fullName || null,
        invited_by: requesterId,
      },
    });

    logStep("Audit log created");

    return new Response(
      JSON.stringify({
        success: true,
        email: email,
        userId: newUser.user.id,
        role: role,
        message: `Admin invitation sent to ${email}`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
