import Stripe from "stripe"

import { type PendingSignup } from "@/lib/generated/prisma/client"
import { UserPlan } from "@/lib/generated/prisma/enums"
import { type AppPlanCode } from "@/lib/plans"

export type CheckoutActivationData = {
  currentPeriodEnd: Date | null
  pendingSignupId: string
  plan: UserPlan
  status: string
  stripeCustomerId: string | null
  stripePriceId: string | null
  stripeSubscriptionId: string | null
}

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()

  if (!secretKey) {
    return null
  }

  return new Stripe(secretKey)
}

export function canBypassBillingInDevelopment() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.BILLING_ALLOW_DEV_BYPASS === "true"
  )
}

export function getStripePriceId(plan: UserPlan) {
  if (plan === UserPlan.BASIC) {
    return process.env.STRIPE_PRICE_BASIC?.trim() || null
  }

  if (plan === UserPlan.MASTER) {
    return process.env.STRIPE_PRICE_MASTER?.trim() || null
  }

  return process.env.STRIPE_PRICE_PRO?.trim() || null
}

export function planFromStripePriceId(priceId: string | null | undefined) {
  if (!priceId) {
    return null
  }

  const pairs: Array<[UserPlan, string | undefined]> = [
    [UserPlan.BASIC, process.env.STRIPE_PRICE_BASIC],
    [UserPlan.PRO, process.env.STRIPE_PRICE_PRO],
    [UserPlan.MASTER, process.env.STRIPE_PRICE_MASTER],
  ]

  return pairs.find(([, value]) => value === priceId)?.[0] ?? null
}

export async function createSignupCheckoutSession(pending: PendingSignup) {
  const stripe = getStripeClient()
  const priceId = getStripePriceId(pending.plan)

  if (!stripe || !priceId) {
    if (canBypassBillingInDevelopment()) {
      return { bypass: true as const, url: null }
    }

    throw new Error(
      "Stripe ainda nao esta configurado. Configure as chaves e os Price IDs para liberar o checkout."
    )
  }

  const session = await stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    cancel_url: `${getAppUrl()}/signup?plan=${planToCode(
      pending.plan
    )}&checkout=cancelled`,
    customer_email: pending.email,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      pendingSignupId: pending.id,
      plan: planToCode(pending.plan),
    },
    mode: "subscription",
    subscription_data: {
      metadata: {
        pendingSignupId: pending.id,
        plan: planToCode(pending.plan),
      },
    },
    success_url: `${getAppUrl()}/api/auth/signup/success?session_id={CHECKOUT_SESSION_ID}`,
  })

  return { bypass: false as const, session, url: session.url }
}

export async function getActivationDataFromCheckoutSession(
  checkoutSessionId: string
): Promise<CheckoutActivationData> {
  const stripe = getStripeClient()

  if (!stripe) {
    throw new Error("Stripe nao configurado.")
  }

  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId)
  const pendingSignupId = session.metadata?.pendingSignupId

  if (!pendingSignupId) {
    throw new Error("Checkout sem cadastro pendente vinculado.")
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null
  const subscription = subscriptionId
    ? await stripe.subscriptions.retrieve(subscriptionId)
    : null
  const firstItem = subscription?.items.data[0]
  const priceId = firstItem?.price.id ?? null
  const plan = planFromStripePriceId(priceId)

  if (!plan) {
    throw new Error("Plano do checkout nao reconhecido.")
  }

  return {
    currentPeriodEnd: readCurrentPeriodEnd(subscription),
    pendingSignupId,
    plan,
    status: subscription?.status ?? session.status ?? "active",
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : null,
    stripePriceId: priceId,
    stripeSubscriptionId: subscriptionId,
  }
}

export function getActivationDataFromCompletedSession(
  session: Stripe.Checkout.Session
): CheckoutActivationData | null {
  const pendingSignupId = session.metadata?.pendingSignupId

  if (!pendingSignupId) {
    return null
  }

  const priceId = session.metadata?.stripePriceId ?? null

  return {
    currentPeriodEnd: null,
    pendingSignupId,
    plan:
      planFromStripePriceId(priceId) ??
      codeToPlan(session.metadata?.plan) ??
      UserPlan.PRO,
    status: "active",
    stripeCustomerId:
      typeof session.customer === "string" ? session.customer : null,
    stripePriceId: priceId,
    stripeSubscriptionId:
      typeof session.subscription === "string" ? session.subscription : null,
  }
}

export function planToCode(plan: UserPlan): AppPlanCode {
  if (plan === UserPlan.BASIC) {
    return "basic"
  }

  if (plan === UserPlan.MASTER) {
    return "master"
  }

  return "pro"
}

export function codeToPlan(value: unknown) {
  if (value === "basic") {
    return UserPlan.BASIC
  }

  if (value === "master") {
    return UserPlan.MASTER
  }

  if (value === "pro") {
    return UserPlan.PRO
  }

  return null
}

function getAppUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
}

function readCurrentPeriodEnd(subscription: Stripe.Subscription | null) {
  const timestamp = (subscription as unknown as { current_period_end?: number })
    ?.current_period_end

  return timestamp ? new Date(timestamp * 1000) : null
}
