import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"

import {
  createUserSession,
  isValidEmail,
  normalizeEmail,
  setSessionCookie,
} from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; password?: unknown }
    | null
  const email = normalizeEmail(body?.email)
  const password = typeof body?.password === "string" ? body.password : ""

  if (!isValidEmail(email) || !password) {
    return NextResponse.json(
      { message: "Informe e-mail e senha validos." },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  })

  if (!user?.passwordHash) {
    return NextResponse.json(
      { message: "E-mail ou senha incorretos." },
      { status: 401 }
    )
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash)

  if (!passwordMatches) {
    return NextResponse.json(
      { message: "E-mail ou senha incorretos." },
      { status: 401 }
    )
  }

  const response = NextResponse.json({ redirectTo: "/dashboard" })
  setSessionCookie(response, await createUserSession(user.id))

  return response
}
