import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Validate request method
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's token for auth verification
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify JWT and get user claims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error("Claims verification failed:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminUserId = claimsData.claims.sub;

    // Use service role client for database operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is super_admin
    const { data: roleData, error: roleError } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .maybeSingle();

    if (roleError) {
      console.error("Role check error:", roleError);
      return new Response(
        JSON.stringify({ error: "Failed to verify permissions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (roleData?.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "Forbidden: Super Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { target_user_id, entitlement_type, quantity, reason } = body;

    // Validate required fields
    if (!target_user_id || !entitlement_type || !quantity) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: target_user_id, entitlement_type, quantity" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate quantity
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 10) {
      return new Response(
        JSON.stringify({ error: "Quantity must be between 1 and 10" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate entitlement type
    const validTypes = ["REPORT_ONE_OFF"];
    if (!validTypes.includes(entitlement_type)) {
      return new Response(
        JSON.stringify({ error: `Invalid entitlement type. Valid types: ${validTypes.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify target user exists
    const { data: targetUser, error: targetUserError } = await serviceClient
      .from("profiles")
      .select("user_id, email")
      .eq("user_id", target_user_id)
      .maybeSingle();

    if (targetUserError || !targetUser) {
      return new Response(
        JSON.stringify({ error: "Target user not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert entitlement
    const { data: entitlement, error: entitlementError } = await serviceClient
      .from("entitlements")
      .insert({
        user_id: target_user_id,
        entitlement_type: entitlement_type,
        quantity: qty,
        used_quantity: 0,
        // No order_id - this is a manual grant
      })
      .select()
      .single();

    if (entitlementError) {
      console.error("Entitlement insert error:", entitlementError);
      return new Response(
        JSON.stringify({ error: "Failed to create entitlement" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log to audit_logs
    const { error: auditError } = await serviceClient.from("audit_logs").insert({
      entity_type: "entitlements",
      entity_id: entitlement.id,
      action: "MANUAL_GRANT",
      user_id: adminUserId,
      new_value_json: {
        target_user_id,
        target_user_email: targetUser.email,
        entitlement_type,
        quantity: qty,
        reason: reason || null,
        granted_by: adminUserId,
      },
    });

    if (auditError) {
      console.error("Audit log insert error:", auditError);
      // Don't fail the request, just log the error
    }

    console.log(`Credit granted: ${qty}x ${entitlement_type} to user ${target_user_id} by admin ${adminUserId}`);

    return new Response(
      JSON.stringify({
        success: true,
        entitlement: {
          id: entitlement.id,
          user_id: entitlement.user_id,
          entitlement_type: entitlement.entitlement_type,
          quantity: entitlement.quantity,
          created_at: entitlement.created_at,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Grant credit error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
