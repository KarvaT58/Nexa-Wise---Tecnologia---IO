import { randomBytes, randomInt, timingSafeEqual, createHash } from "node:crypto"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { type NextResponse } from "next/server"

import { UserPlan } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { type AppPlanCode } from "@/lib/plans"

export const SESSION_COOKIE = "nw_session"
export const SIGNUP_COOKIE = "nw_pending_signup"
export const PASSWORD_RESET_COOKIE = "nw_password_reset"
export const PASSWORD_RESET_ALLOWED_COOKIE = "nw_password_reset_allowed"
export const VERIFICATION_EMAIL_COOKIE = "verification_email"
export const VERIFICATION_SENT_COOKIE = "verification_code_sent"

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const OTP_MAX_AGE_SECONDS = 60 * 10
const PASSWORD_RESET_MAX_AGE_SECONDS = 60 * 15

export type CurrentUser = {
  id: string
  name: string
  email: string
  image: string | null
  plan: AppPlanCode
  role: "USER" | "ADMIN"
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function validatePassword(value: string) {
  if (value.length < 8) {
    return "Use pelo menos 8 caracteres."
  }

  if (!/[A-Z]/.test(value)) {
    return "Use pelo menos uma letra maiuscula."
  }

  if (!/[^A-Za-z0-9]/.test(value)) {
    return "Use pelo menos um simbolo."
  }

  return null
}

export function generateOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export function getOtpExpiresAt() {
  return new Date(Date.now() + OTP_MAX_AGE_SECONDS * 1000)
}

export function hashOtp(code: string) {
  return hashSecret(`otp:${code}`)
}

export function verifyOtp(code: string, expectedHash: string | null) {
  if (!expectedHash || !/^\d{6}$/.test(code)) {
    return false
  }

  const receivedHash = hashOtp(code)
  const received = Buffer.from(receivedHash)
  const expected = Buffer.from(expectedHash)

  return received.length === expected.length && timingSafeEqual(received, expected)
}

export function appPlanToPrismaPlan(plan: AppPlanCode) {
  if (plan === "basic") {
    return UserPlan.BASIC
  }

  if (plan === "master") {
    return UserPlan.MASTER
  }

  return UserPlan.PRO
}

export function prismaPlanToAppPlan(plan: UserPlan): AppPlanCode {
  if (plan === UserPlan.BASIC) {
    return "basic"
  }

  if (plan === UserPlan.MASTER) {
    return "master"
  }

  return "pro"
}

export async function createUserSession(userId: string) {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)

  await prisma.session.create({
    data: {
      expiresAt,
      tokenHash: hashSessionToken(token),
      userId,
    },
  })

  return { expiresAt, token }
}

export function setSessionCookie(
  response: NextResponse,
  session: Awaited<ReturnType<typeof createUserSession>>
) {
  response.cookies.set(SESSION_COOKIE, session.token, {
    expires: session.expiresAt,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value

  if (!token) {
    return null
  }

  const session = await prisma.session.findFirst({
    include: {
      user: true,
    },
    where: {
      expiresAt: {
        gt: new Date(),
      },
      tokenHash: hashSessionToken(token),
    },
  })

  if (!session) {
    return null
  }

  return {
    email: session.user.email,
    id: session.user.id,
    image: session.user.image,
    name: session.user.name,
    plan: prismaPlanToAppPlan(session.user.plan),
    role: session.user.role,
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/login")
  }

  return user
}

export async function deleteCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value

  if (!token) {
    return
  }

  await prisma.session.deleteMany({
    where: {
      tokenHash: hashSessionToken(token),
    },
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export function setSignupCookies(
  response: NextResponse,
  input: { email: string; pendingSignupId: string }
) {
  setHttpOnlyCookie(response, SIGNUP_COOKIE, input.pendingSignupId, {
    maxAge: PASSWORD_RESET_MAX_AGE_SECONDS * 2,
  })
  setVerificationCookies(response, input.email)
}

export function setPasswordResetCookies(
  response: NextResponse,
  input: { email: string; passwordResetId?: string }
) {
  if (input.passwordResetId) {
    setHttpOnlyCookie(response, PASSWORD_RESET_COOKIE, input.passwordResetId, {
      maxAge: PASSWORD_RESET_MAX_AGE_SECONDS,
    })
  }

  setVerificationCookies(response, input.email)
}

export function setPasswordResetAllowedCookie(
  response: NextResponse,
  passwordResetId: string
) {
  setHttpOnlyCookie(response, PASSWORD_RESET_ALLOWED_COOKIE, passwordResetId, {
    maxAge: PASSWORD_RESET_MAX_AGE_SECONDS,
  })
}

export function clearVerificationCookies(response: NextResponse) {
  for (const name of [
    SIGNUP_COOKIE,
    PASSWORD_RESET_COOKIE,
    PASSWORD_RESET_ALLOWED_COOKIE,
    VERIFICATION_EMAIL_COOKIE,
    VERIFICATION_SENT_COOKIE,
  ]) {
    clearCookie(response, name)
  }
}

export function getAuthCookie(name: string) {
  return cookies().then((cookieStore) => cookieStore.get(name)?.value ?? null)
}

function setVerificationCookies(response: NextResponse, email: string) {
  setHttpOnlyCookie(response, VERIFICATION_SENT_COOKIE, "true", {
    maxAge: OTP_MAX_AGE_SECONDS,
  })
  setHttpOnlyCookie(response, VERIFICATION_EMAIL_COOKIE, email, {
    maxAge: OTP_MAX_AGE_SECONDS,
  })
}

function setHttpOnlyCookie(
  response: NextResponse,
  name: string,
  value: string,
  options: { maxAge: number }
) {
  response.cookies.set(name, value, {
    httpOnly: true,
    maxAge: options.maxAge,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

function randomToken() {
  return randomBytes(32).toString("base64url")
}

function hashSessionToken(token: string) {
  return hashSecret(`session:${token}`)
}

function hashSecret(value: string) {
  return createHash("sha256")
    .update(`${process.env.AUTH_SECRET || "dev-secret"}:${value}`)
    .digest("hex")
}
