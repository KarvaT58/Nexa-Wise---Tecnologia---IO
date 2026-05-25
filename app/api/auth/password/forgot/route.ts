import { NextResponse } from "next/server"

import {
  generateOtp,
  getOtpExpiresAt,
  hashOtp,
  isValidEmail,
  normalizeEmail,
  setPasswordResetCookies,
} from "@/lib/auth"
import { getOtpEmailDeliveryMessage, sendOtpEmail } from "@/lib/email"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown }
    | null
  const email = normalizeEmail(body?.email)

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { message: "Informe um e-mail valido." },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  })
  let passwordResetId: string | undefined

  if (user) {
    const code = generateOtp()
    const passwordReset = await prisma.passwordReset.create({
      data: {
        expiresAt: getOtpExpiresAt(),
        otpHash: hashOtp(code),
        userId: user.id,
      },
    })

    passwordResetId = passwordReset.id
    try {
      await sendOtpEmail({
        code,
        name: user.name,
        purpose: "password-reset",
        to: user.email,
      })
    } catch (error) {
      return NextResponse.json(
        { message: getOtpEmailDeliveryMessage(error) },
        { status: 502 }
      )
    }
  }

  const response = NextResponse.json({
    message: "Se o e-mail existir, enviaremos um codigo.",
    redirectTo: "/verify-code?flow=password-reset",
  })
  setPasswordResetCookies(response, { email, passwordResetId })

  return response
}
