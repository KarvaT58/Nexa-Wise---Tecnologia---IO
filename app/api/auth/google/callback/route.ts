import { NextRequest, NextResponse } from "next/server"

import {
  appPlanToPrismaPlan,
  createUserSession,
  setSessionCookie,
} from "@/lib/auth"
import { createSignupCheckoutSession } from "@/lib/billing"
import { AuthProvider, PendingSignupStatus } from "@/lib/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { activatePendingSignupInDevelopment } from "@/lib/signup-activation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const GOOGLE_STATE_COOKIE = "nw_google_oauth_state"

type GoogleState = {
  mode: "login" | "signup"
  nonce: string
  plan: "basic" | "pro" | "master"
}

type GoogleUserInfo = {
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  sub?: string
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const savedState = readGoogleState(
    request.cookies.get(GOOGLE_STATE_COOKIE)?.value
  )

  if (!code || !state || !savedState || savedState.nonce !== state) {
    return NextResponse.redirect(new URL("/login?google=invalid", request.url))
  }

  try {
    const profile = await getGoogleProfile(code)

    if (!profile.email || !profile.sub || profile.email_verified === false) {
      return NextResponse.redirect(
        new URL("/login?google=email_unverified", request.url)
      )
    }

    const email = profile.email.toLowerCase()
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: profile.sub }, { email }],
      },
    })

    if (existingUser) {
      const user = await prisma.user.update({
        data: {
          emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
          googleId: existingUser.googleId ?? profile.sub,
          image: existingUser.image ?? profile.picture ?? null,
        },
        where: {
          id: existingUser.id,
        },
      })
      const response = NextResponse.redirect(new URL("/dashboard", request.url))

      setSessionCookie(response, await createUserSession(user.id))
      clearGoogleState(response)

      return response
    }

    if (savedState.mode === "login") {
      const response = NextResponse.redirect(
        new URL("/signup?google=needs-plan", request.url)
      )
      clearGoogleState(response)

      return response
    }

    const pending = await prisma.pendingSignup.upsert({
      create: {
        email,
        emailVerifiedAt: new Date(),
        googleId: profile.sub,
        image: profile.picture ?? null,
        name: profile.name || email,
        plan: appPlanToPrismaPlan(savedState.plan),
        provider: AuthProvider.GOOGLE,
        status: PendingSignupStatus.CHECKOUT_PENDING,
      },
      update: {
        emailVerifiedAt: new Date(),
        googleId: profile.sub,
        image: profile.picture ?? null,
        name: profile.name || email,
        plan: appPlanToPrismaPlan(savedState.plan),
        provider: AuthProvider.GOOGLE,
        status: PendingSignupStatus.CHECKOUT_PENDING,
      },
      where: {
        email,
      },
    })
    const checkout = await createSignupCheckoutSession(pending)

    if (checkout.bypass) {
      const user = await activatePendingSignupInDevelopment(pending.id)
      const response = NextResponse.redirect(new URL("/dashboard", request.url))

      setSessionCookie(response, await createUserSession(user.id))
      clearGoogleState(response)

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
        id: pending.id,
      },
    })

    const response = NextResponse.redirect(checkout.url || new URL("/signup", request.url))
    clearGoogleState(response)

    return response
  } catch {
    const response = NextResponse.redirect(
      new URL("/login?google=failed", request.url)
    )
    clearGoogleState(response)

    return response
  }
}

async function getGoogleProfile(code: string): Promise<GoogleUserInfo> {
  const redirectUri = `${getAppUrl()}/api/auth/google/callback`
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  })

  if (!tokenResponse.ok) {
    throw new Error("Google token exchange failed.")
  }

  const token = (await tokenResponse.json()) as { access_token?: string }

  if (!token.access_token) {
    throw new Error("Google access token missing.")
  }

  const profileResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    }
  )

  if (!profileResponse.ok) {
    throw new Error("Google profile failed.")
  }

  return profileResponse.json() as Promise<GoogleUserInfo>
}

function readGoogleState(value?: string): GoogleState | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"))

    if (
      parsed &&
      typeof parsed.nonce === "string" &&
      (parsed.mode === "login" || parsed.mode === "signup") &&
      (parsed.plan === "basic" ||
        parsed.plan === "pro" ||
        parsed.plan === "master")
    ) {
      return parsed
    }
  } catch {
    return null
  }

  return null
}

function clearGoogleState(response: NextResponse) {
  response.cookies.set(GOOGLE_STATE_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

function getAppUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
}
