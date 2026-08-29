import Stripe from "stripe";

export function createBilling(config, store) {
  const configured = Boolean(
    config.secretKey && config.webhookSecret && config.publicUrl && config.proPriceId && config.serverPriceId
  );
  const stripe = config.secretKey ? new Stripe(config.secretKey) : null;

  async function createCheckout({ plan, userId, guildId }) {
    if (!configured) throw new Error("Pembayaran belum dikonfigurasi oleh pemilik bot.");
    const isServer = plan === "server";
    if (isServer && !guildId) throw new Error("Pelan Server hanya boleh dibeli dari dalam server Discord.");
    const metadata = {
      scope_type: isServer ? "server" : "user",
      scope_id: isServer ? guildId : userId,
      tier: isServer ? "server" : "pro"
    };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: userId,
      line_items: [{ price: isServer ? config.serverPriceId : config.proPriceId, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      success_url: `${config.publicUrl}/success`,
      cancel_url: `${config.publicUrl}/cancel`
    });
    return session.url;
  }

  function subscriptionRecord(subscription) {
    const metadata = subscription.metadata || {};
    const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
    const seconds = subscription.current_period_end || itemPeriodEnd;
    return {
      scopeType: metadata.scope_type,
      scopeId: metadata.scope_id,
      tier: metadata.tier,
      status: subscription.status,
      customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
      subscriptionId: subscription.id,
      periodEnd: seconds ? seconds * 1000 : null
    };
  }

  async function handleWebhook(rawBody, signature) {
    if (!configured) throw new Error("Stripe webhook belum dikonfigurasi.");
    const event = stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
    if (!store.markStripeEvent(event.id)) return { duplicate: true, type: event.type };

    if (event.type === "checkout.session.completed" && event.data.object.subscription) {
      const subscription = await stripe.subscriptions.retrieve(event.data.object.subscription);
      store.upsertSubscription(subscriptionRecord(subscription));
    }
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      store.upsertSubscription(subscriptionRecord(event.data.object));
    }
    return { duplicate: false, type: event.type };
  }

  return { configured, createCheckout, handleWebhook };
}
