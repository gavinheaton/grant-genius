import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { priceId, productKey, successUrl, cancelUrl } = await req.json();
    if (!priceId) throw new Error("Price ID is required");
    const resolvedProductKey = productKey || "REPORT_ONE_OFF";
    logStep("Request parsed", { priceId, productKey: resolvedProductKey });

    // Allowlist of valid redirect origins for successUrl/cancelUrl
    const ALLOWED_ORIGINS = [
      "https://grantgenius.com.au",
      "https://grantgenius.disruptorsco.com",
      "https://grant-genius-dc.lovable.app",
    ];
    const isAllowedRedirect = (url: string | undefined): url is string => {
      if (!url || typeof url !== "string" || url.length > 2000) return false;
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) return false;
        if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return true;
        if (parsed.hostname.endsWith(".lovable.app") || parsed.hostname.endsWith(".lovable.dev")) return true;
        return ALLOWED_ORIGINS.some((o) => url.startsWith(o + "/") || url === o);
      } catch {
        return false;
      }
    };
    const safeSuccessUrl = isAllowedRedirect(successUrl) ? successUrl : undefined;
    const safeCancelUrl = isAllowedRedirect(cancelUrl) ? cancelUrl : undefined;
    if (successUrl && !safeSuccessUrl) logStep("Rejected successUrl (not in allowlist)");
    if (cancelUrl && !safeCancelUrl) logStep("Rejected cancelUrl (not in allowlist)");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://grantgenius.com.au";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "payment",
      allow_promotion_codes: true,
      success_url: safeSuccessUrl || `${origin}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: safeCancelUrl || `${origin}/dashboard?payment=cancelled`,
      metadata: {
        user_id: user.id,
        product_key: resolvedProductKey,
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
