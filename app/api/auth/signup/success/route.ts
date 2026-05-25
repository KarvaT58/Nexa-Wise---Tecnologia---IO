import { NextRequest, NextResponse } from "next/server"

import {
  clearVerificationCookies,
  createUserSession,
  setSessionCookie,
} from "@/lib/auth"
import { getActivationDataFromCheckoutSession } from "@/lib/billing"
import { activatePendingSignup } from "@/lib/signup-activation"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const checkoutSessionId = request.nextUrl.searchParams.get("session_id")

  if (!checkoutSessionId) {
    return NextResponse.redirect(new URL("/signup", request.url))
  }

  try {
    const activationData =
      await getActivationDataFromCheckoutSession(checkoutSessionId)
    const user = await activatePendingSignup(activationData)
    const response = NextResponse.redirect(new URL("/dashboard", request.url))

    setSessionCookie(response, await createUserSession(user.id))
    clearVerificationCookies(response)

    return response
  } catch {
    return NextResponse.redirect(
      new URL("/login?checkout=processing", request.url)
    )
  }
}
