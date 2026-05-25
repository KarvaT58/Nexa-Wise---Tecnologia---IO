import { randomBytes } from "node:crypto"

import { NextRequest, NextResponse } from "next/server"

import { getAppPlan } from "@/lib/plans"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const GOOGLE_STATE_COOKIE = "nw_google_oauth_state"

export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/login?google=missing_config", request.url)
    )
  }

  const mode =
    request.nextUrl.searchParams.get("mode") === "login" ? "login" : "signup"
  const plan = getAppPlan(request.nextUrl.searchParams.get("plan"), "pro")
  const nonce = randomBytes(24).toString("base64url")
  const redirectUri = `${getAppUrl()}/api/auth/google/callback`
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")

  authUrl.searchParams.set("access_type", "offline")
  authUrl.searchParams.set("client_id", clientId)
  authUrl.searchParams.set("prompt", "select_account")
  authUrl.searchParams.set("redirect_uri", redirectUri)
  authUrl.searchParams.set("response_type", "code")
  authUrl.searchParams.set("scope", "openid email profile")
  authUrl.searchParams.set("state", nonce)

  const response = NextResponse.redirect(authUrl)
  response.cookies.set(
    GOOGLE_STATE_COOKIE,
    Buffer.from(JSON.stringify({ mode, nonce, plan })).toString("base64url"),
    {
      httpOnly: true,
      maxAge: 60 * 10,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    }
  )

  return response
}

function getAppUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
}
