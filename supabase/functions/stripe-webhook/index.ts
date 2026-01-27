import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
        logStep("Webhook signature verified");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logStep("Webhook signature verification failed", { error: errorMessage });
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
    } else {
      // For development/testing without webhook secret
      event = JSON.parse(body);
      logStep("Processing webhook without signature verification (dev mode)");
    }

    logStep("Event received", { type: event.type, id: event.id });

    // Handle checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      logStep("Processing checkout.session.completed", { 
        sessionId: session.id,
        customerId: session.customer,
        customerEmail: session.customer_email,
        metadata: session.metadata
      });

      const userId = session.metadata?.user_id;
      const productKey = session.metadata?.product_key || "REPORT_ONE_OFF";

      if (!userId) {
        logStep("No user_id in metadata, attempting to find by email");
      }

      // Create Supabase admin client
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );

      // Get the product
      const { data: product, error: productError } = await supabaseAdmin
        .from("products")
        .select("id, price_cents")
        .eq("product_key", productKey)
        .single();

      if (productError || !product) {
        logStep("Product not found", { productKey, error: productError?.message });
        throw new Error(`Product not found: ${productKey}`);
      }
      logStep("Product found", { productId: product.id });

      // Find or create order
      let orderId: string;
      
      // Check if order already exists for this session
      const { data: existingOrder } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("stripe_checkout_session_id", session.id)
        .maybeSingle();

      if (existingOrder) {
        orderId = existingOrder.id;
        logStep("Existing order found", { orderId });

        // Update order status
        await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent as string,
          })
          .eq("id", orderId);
      } else if (userId) {
        // Create new order
        const { data: newOrder, error: orderError } = await supabaseAdmin
          .from("orders")
          .insert({
            user_id: userId,
            product_id: product.id,
            amount_cents: session.amount_total || product.price_cents,
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_checkout_session_id: session.id,
            stripe_payment_intent_id: session.payment_intent as string,
          })
          .select("id")
          .single();

        if (orderError) {
          logStep("Failed to create order", { error: orderError.message });
          throw new Error(`Failed to create order: ${orderError.message}`);
        }
        orderId = newOrder.id;
        logStep("Order created", { orderId });
      } else {
        throw new Error("No user_id available to create order");
      }

      // Check if entitlement already exists for this order
      const { data: existingEntitlement } = await supabaseAdmin
        .from("entitlements")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();

      if (existingEntitlement) {
        logStep("Entitlement already exists", { entitlementId: existingEntitlement.id });
      } else if (userId) {
        // Create entitlement
        const { data: entitlement, error: entitlementError } = await supabaseAdmin
          .from("entitlements")
          .insert({
            user_id: userId,
            entitlement_type: productKey,
            order_id: orderId,
            quantity: 1,
            used_quantity: 0,
            expires_at: null, // No expiry for one-off purchases
          })
          .select("id")
          .single();

        if (entitlementError) {
          logStep("Failed to create entitlement", { error: entitlementError.message });
          throw new Error(`Failed to create entitlement: ${entitlementError.message}`);
        }
        logStep("Entitlement created", { entitlementId: entitlement.id });
      }

      logStep("Checkout session processed successfully");
    }

    return new Response(JSON.stringify({ received: true }), {
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
