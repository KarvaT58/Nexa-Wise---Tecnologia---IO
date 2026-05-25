import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { VerifyCodeForm } from "@/components/verify-code-form"

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default async function VerifyCodePage({
  searchParams,
}: {
  searchParams: Promise<{ flow?: string }>
}) {
  const params = await searchParams
  const cookieStore = await cookies()
  const codeWasSent =
    cookieStore.get("verification_code_sent")?.value === "true"
  const verificationEmail = safeDecodeURIComponent(
    cookieStore.get("verification_email")?.value ?? ""
  )

  const flow = params.flow === "signup" ? "signup" : "password-reset"

  if (!codeWasSent) {
    redirect(flow === "signup" ? "/signup" : "/forgot-password")
  }

  return (
    <VerifyCodeForm
      flow={flow}
      verificationEmail={verificationEmail}
    />
  )
}
