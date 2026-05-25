import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

import {
  appPlanToPrismaPlan,
  generateOtp,
  getOtpExpiresAt,
  hashOtp,
  isValidEmail,
  normalizeEmail,
  setSignupCookies,
  validatePassword,
} from "@/lib/auth"
import { AuthProvider, PendingSignupStatus } from "@/lib/generated/prisma/enums"
import { getOtpEmailDeliveryMessage, sendOtpEmail } from "@/lib/email"
import { getAppPlan } from "@/lib/plans"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        acceptTerms?: unknown
        email?: unknown
        name?: unknown
        password?: unknown
        plan?: unknown
      }
    | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const email = normalizeEmail(body?.email)
  const password = typeof body?.password === "string" ? body.password : ""
  const plan = getAppPlan(body?.plan, "pro")

  if (!name || !isValidEmail(email) || !password) {
    return NextResponse.json(
      { message: "Preencha nome, e-mail e senha corretamente." },
      { status: 400 }
    )
  }

  if (body?.acceptTerms !== true) {
    return NextResponse.json(
      { message: "Aceite os termos para continuar." },
      { status: 400 }
    )
  }

  const passwordError = validatePassword(password)

  if (passwordError) {
    return NextResponse.json({ message: passwordError }, { status: 400 })
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  })

  if (existingUser) {
    return NextResponse.json(
      { message: "Ja existe uma conta com este e-mail." },
      { status: 409 }
    )
  }

  const code = generateOtp()
  const pending = await prisma.pendingSignup.upsert({
    create: {
      email,
      name,
      otpExpiresAt: getOtpExpiresAt(),
      otpHash: hashOtp(code),
      passwordHash: await bcrypt.hash(password, 12),
      plan: appPlanToPrismaPlan(plan),
      provider: AuthProvider.EMAIL,
      status: PendingSignupStatus.OTP_PENDING,
    },
    update: {
      emailVerifiedAt: null,
      googleId: null,
      image: null,
      name,
      otpAttempts: 0,
      otpExpiresAt: getOtpExpiresAt(),
      otpHash: hashOtp(code),
      passwordHash: await bcrypt.hash(password, 12),
      plan: appPlanToPrismaPlan(plan),
      provider: AuthProvider.EMAIL,
      status: PendingSignupStatus.OTP_PENDING,
      stripeCheckoutSessionId: null,
    },
    where: {
      email,
    },
  })

  try {
    await sendOtpEmail({ code, name, purpose: "signup", to: email })
  } catch (error) {
    return NextResponse.json(
      { message: getOtpEmailDeliveryMessage(error) },
      { status: 502 }
    )
  }

  const response = NextResponse.json({
    message: "Codigo enviado.",
    redirectTo: "/verify-code?flow=signup",
  })
  setSignupCookies(response, { email, pendingSignupId: pending.id })

  return response
}
