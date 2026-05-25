import { NextResponse } from "next/server"

import {
  generateOtp,
  getAuthCookie,
  getOtpExpiresAt,
  hashOtp,
  PASSWORD_RESET_COOKIE,
  setPasswordResetCookies,
} from "@/lib/auth"
import { getOtpEmailDeliveryMessage, sendOtpEmail } from "@/lib/email"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  const passwordResetId = await getAuthCookie(PASSWORD_RESET_COOKIE)

  if (!passwordResetId) {
    return NextResponse.json(
      { message: "Solicite a recuperacao novamente." },
      { status: 400 }
    )
  }

  const passwordReset = await prisma.passwordReset.findUnique({
    include: {
      user: true,
    },
    where: {
      id: passwordResetId,
    },
  })

  if (!passwordReset || passwordReset.usedAt) {
    return NextResponse.json(
      { message: "Solicite a recuperacao novamente." },
      { status: 400 }
    )
  }

  const code = generateOtp()
  const updated = await prisma.passwordReset.update({
    data: {
      attempts: 0,
      expiresAt: getOtpExpiresAt(),
      otpHash: hashOtp(code),
    },
    include: {
      user: true,
    },
    where: {
      id: passwordReset.id,
    },
  })

  try {
    await sendOtpEmail({
      code,
      name: updated.user.name,
      purpose: "password-reset",
      to: updated.user.email,
    })
  } catch (error) {
    return NextResponse.json(
      { message: getOtpEmailDeliveryMessage(error) },
      { status: 502 }
    )
  }

  const response = NextResponse.json({ message: "Codigo reenviado." })
  setPasswordResetCookies(response, {
    email: updated.user.email,
    passwordResetId: updated.id,
  })

  return response
}
