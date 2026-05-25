import { NextResponse } from "next/server"

import {
  generateOtp,
  getAuthCookie,
  getOtpExpiresAt,
  hashOtp,
  setSignupCookies,
  SIGNUP_COOKIE,
} from "@/lib/auth"
import { getOtpEmailDeliveryMessage, sendOtpEmail } from "@/lib/email"
import { PendingSignupStatus } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
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

  const code = generateOtp()
  const updated = await prisma.pendingSignup.update({
    data: {
      otpAttempts: 0,
      otpExpiresAt: getOtpExpiresAt(),
      otpHash: hashOtp(code),
      status: PendingSignupStatus.OTP_PENDING,
    },
    where: {
      id: pending.id,
    },
  })

  try {
    await sendOtpEmail({
      code,
      name: updated.name,
      purpose: "signup",
      to: updated.email,
    })
  } catch (error) {
    return NextResponse.json(
      { message: getOtpEmailDeliveryMessage(error) },
      { status: 502 }
    )
  }

  const response = NextResponse.json({ message: "Codigo reenviado." })
  setSignupCookies(response, {
    email: updated.email,
    pendingSignupId: updated.id,
  })

  return response
}
