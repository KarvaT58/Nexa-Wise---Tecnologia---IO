import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

import {
  clearVerificationCookies,
  getAuthCookie,
  PASSWORD_RESET_ALLOWED_COOKIE,
  validatePassword,
} from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { password?: unknown }
    | null
  const password = typeof body?.password === "string" ? body.password : ""
  const passwordResetId = await getAuthCookie(PASSWORD_RESET_ALLOWED_COOKIE)
  const passwordError = validatePassword(password)

  if (passwordError) {
    return NextResponse.json({ message: passwordError }, { status: 400 })
  }

  if (!passwordResetId) {
    return NextResponse.json(
      { message: "Valide o codigo novamente." },
      { status: 400 }
    )
  }

  const passwordReset = await prisma.passwordReset.findUnique({
    where: {
      id: passwordResetId,
    },
  })

  if (!passwordReset || passwordReset.usedAt || passwordReset.expiresAt < new Date()) {
    return NextResponse.json(
      { message: "Valide o codigo novamente." },
      { status: 400 }
    )
  }

  await prisma.$transaction([
    prisma.user.update({
      data: {
        passwordHash: await bcrypt.hash(password, 12),
      },
      where: {
        id: passwordReset.userId,
      },
    }),
    prisma.passwordReset.update({
      data: {
        usedAt: new Date(),
      },
      where: {
        id: passwordReset.id,
      },
    }),
  ])

  const response = NextResponse.json({ redirectTo: "/login" })
  clearVerificationCookies(response)

  return response
}
