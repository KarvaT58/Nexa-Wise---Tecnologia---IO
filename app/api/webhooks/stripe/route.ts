import Stripe from "stripe"

import { getActivationDataFromCheckoutSession, getStripeClient } from "@/lib/billing"
import { prisma } from "@/lib/prisma"
import { activatePendingSignup } from "@/lib/signup-activation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const stripe = getStripeClient()

  if (!stripe) {
    return Response.json({ message: "Stripe nao configurado." }, { status: 500 })
  }

  const payload = await request.text()
  const signature = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  let event: Stripe.Event

  try {
    event =
      webhookSecret && signature
        ? stripe.webhooks.constructEvent(payload, signature, webhookSecret)
        : (JSON.parse(payload) as Stripe.Event)
  } catch {
    return Response.json({ message: "Webhook invalido." }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const activationData = await getActivationDataFromCheckoutSession(session.id)

    await activatePendingSignup(activationData)
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as Stripe.Subscription
    const subscriptionId = subscription.id
    const currentPeriodEnd = (
      subscription as unknown as { current_period_end?: number }
    ).current_period_end

    await prisma.subscription.updateMany({
      data: {
        currentPeriodEnd: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000)
          : null,
        status: subscription.status,
      },
      where: {
        stripeSubscriptionId: subscriptionId,
      },
    })
  }

  return Response.json({ received: true })
}
