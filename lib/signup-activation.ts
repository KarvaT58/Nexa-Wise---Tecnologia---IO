import { PendingSignupStatus } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { type CheckoutActivationData } from "@/lib/billing"

export async function activatePendingSignup(input: CheckoutActivationData) {
  return prisma.$transaction(async (tx) => {
    const pending = await tx.pendingSignup.findUnique({
      where: {
        id: input.pendingSignupId,
      },
    })

    if (!pending) {
      throw new Error("Cadastro pendente nao encontrado.")
    }

    const existingUser = await tx.user.findUnique({
      where: {
        email: pending.email,
      },
    })

    const user = existingUser
      ? await tx.user.update({
          data: {
            emailVerifiedAt:
              existingUser.emailVerifiedAt ?? pending.emailVerifiedAt ?? new Date(),
            googleId: existingUser.googleId ?? pending.googleId,
            image: existingUser.image ?? pending.image,
            plan: input.plan,
          },
          where: {
            id: existingUser.id,
          },
        })
      : await tx.user.create({
          data: {
            email: pending.email,
            emailVerifiedAt: pending.emailVerifiedAt ?? new Date(),
            googleId: pending.googleId,
            image: pending.image,
            name: pending.name,
            passwordHash: pending.passwordHash,
            plan: input.plan,
          },
        })

    const subscriptionData = {
      currentPeriodEnd: input.currentPeriodEnd,
      pendingSignupId: pending.id,
      plan: input.plan,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId,
      stripePriceId: input.stripePriceId,
      userId: user.id,
    }

    if (input.stripeSubscriptionId) {
      await tx.subscription.upsert({
        create: {
          ...subscriptionData,
          stripeSubscriptionId: input.stripeSubscriptionId,
        },
        update: subscriptionData,
        where: {
          stripeSubscriptionId: input.stripeSubscriptionId,
        },
      })
    } else {
      await tx.subscription.create({
        data: subscriptionData,
      })
    }

    await tx.pendingSignup.update({
      data: {
        checkoutExpiresAt: null,
        emailVerifiedAt: pending.emailVerifiedAt ?? new Date(),
        status: PendingSignupStatus.COMPLETED,
        stripeCheckoutSessionId: pending.stripeCheckoutSessionId,
        stripeCustomerId: input.stripeCustomerId,
      },
      where: {
        id: pending.id,
      },
    })

    return user
  })
}

export async function activatePendingSignupInDevelopment(pendingSignupId: string) {
  const pending = await prisma.pendingSignup.findUnique({
    where: {
      id: pendingSignupId,
    },
  })

  if (!pending) {
    throw new Error("Cadastro pendente nao encontrado.")
  }

  return activatePendingSignup({
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    pendingSignupId: pending.id,
    plan: pending.plan,
    status: "active_dev",
    stripeCustomerId: `dev_customer_${pending.id}`,
    stripePriceId: null,
    stripeSubscriptionId: `dev_subscription_${pending.id}`,
  })
}
