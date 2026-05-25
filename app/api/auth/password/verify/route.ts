import { NextResponse } from "next/server"

import {
  getAuthCookie,
  PASSWORD_RESET_COOKIE,
  setPasswordResetAllowedCookie,
  verifyOtp,
} from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { code?: unknown }
    | null
  const code = typeof body?.code === "string" ? body.code.trim() : ""
  const passwordResetId = await getAuthCookie(PASSWORD_RESET_COOKIE)

  if (!passwordResetId) {
    return NextResponse.json(
      { message: "Solicite a recuperacao novamente." },
      { status: 400 }
    )
  }

  const passwordReset = await prisma.passwordReset.findUnique({
    where: {
      id: passwordResetId,
    },
  })

  if (
    !passwordReset ||
    passwordReset.usedAt ||
    passwordReset.expiresAt < new Date() ||
    passwordReset.attempts >= 5
  ) {
    return NextResponse.json(
      { message: "Codigo expirado. Solicite outro codigo." },
      { status: 400 }
    )
  }

  if (!verifyOtp(code, passwordReset.otpHash)) {
    await prisma.passwordReset.update({
      data: {
        attempts: {
          increment: 1,
        },
      },
      where: {
        id: passwordReset.id,
      },
    })

    return NextResponse.json({ message: "Codigo invalido." }, { status: 400 })
  }

  const response = NextResponse.json({ redirectTo: "/reset-password" })
  setPasswordResetAllowedCookie(response, passwordReset.id)

  return response
}
