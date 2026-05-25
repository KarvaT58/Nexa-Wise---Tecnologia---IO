import { NextResponse } from "next/server"

import {
  clearVerificationCookies,
  createUserSession,
  getAuthCookie,
  setSessionCookie,
  SIGNUP_COOKIE,
  verifyOtp,
} from "@/lib/auth"
import { createSignupCheckoutSession } from "@/lib/billing"
import { PendingSignupStatus } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { activatePendingSignupInDevelopment } from "@/lib/signup-activation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { code?: unknown }
    | null
  const code = typeof body?.code === "string" ? body.code.trim() : ""
  const pendingSignupId = await getAuthCookie(SIGNUP_COOKIE)

  if (!pendingSignupId) {
    return NextResponse.json(
      { message: "Inicie o cadastro novamente." },
      { status: 400 }
    )
  }

  const pending = await prisma.pendingSignup.findUnique({
    where: {
      id: pendingSignupId,
    },
  })

  if (!pending || pending.status === PendingSignupStatus.COMPLETED) {
    return NextResponse.json(
      { message: "Inicie o cadastro novamente." },
      { status: 400 }
    )
  }

  if (
    !pending.otpExpiresAt ||
    pending.otpExpiresAt < new Date() ||
    pending.otpAttempts >= 5
  ) {
    return NextResponse.json(
      { message: "Codigo expirado. Solicite um novo codigo." },
      { status: 400 }
    )
  }

  if (!verifyOtp(code, pending.otpHash)) {
    await prisma.pendingSignup.update({
      data: {
        otpAttempts: {
          increment: 1,
        },
      },
      where: {
        id: pending.id,
      },
    })

    return NextResponse.json({ message: "Codigo invalido." }, { status: 400 })
  }

  const verifiedPending = await prisma.pendingSignup.update({
    data: {
      emailVerifiedAt: new Date(),
      otpHash: null,
      status: PendingSignupStatus.CHECKOUT_PENDING,
    },
    where: {
      id: pending.id,
    },
  })
  const checkout = await createSignupCheckoutSession(verifiedPending)

  if (checkout.bypass) {
    const user = await activatePendingSignupInDevelopment(verifiedPending.id)
    const response = NextResponse.json({ redirectTo: "/dashboard" })

    setSessionCookie(response, await createUserSession(user.id))
    clearVerificationCookies(response)

    return response
  }

  await prisma.pendingSignup.update({
    data: {
      checkoutExpiresAt: checkout.session.expires_at
        ? new Date(checkout.session.expires_at * 1000)
        : null,
      stripeCheckoutSessionId: checkout.session.id,
    },
    where: {
      id: verifiedPending.id,
    },
  })

  const response = NextResponse.json({ checkoutUrl: checkout.url })
  clearVerificationCookies(response)

  return response
}
